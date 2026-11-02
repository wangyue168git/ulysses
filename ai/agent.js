"use strict";
// AI 顾问的 agent 循环: 模型可以多次调用工具(读数据 / 提建议), 直到给出最终回答。
//   anthropic: 官方 SDK 流式手动循环 —— 每轮把完整 content(含思考块)原样追加; 工具输入先校验再执行; 截断/拒答时不执行工具
//   openai:    /chat/completions 的 function calling(流式拼接 tool_calls)
//   mock:      测试用, 按 AI_MOCK_SCRIPT 回放
const { withTimeout, TIMEOUT_MS } = require("./timeout");
const MAX_STEPS = 8;

function joiner(onText) {
  let last = "";
  return {
    text(t) { if (!t) return; onText(t); last = t[t.length - 1]; },
    // 新一轮的文字前补一个空行, 避免"我先查一下。根据……"粘在一起
    gap() { if (last && last !== "\n") { onText("\n\n"); last = "\n"; } },
  };
}

async function anthropicLoop(cfg, { system, messages, toolset, onText, onTool, signal }) {
  const Anthropic = require("@anthropic-ai/sdk").default;
  const client = new Anthropic({ apiKey: cfg.apiKey, timeout: TIMEOUT_MS, maxRetries: 1, ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}) });
  // 流式 + 自定义工具: 打开 eager_input_streaming; 服务端因此不再校验输入, 我们在 toolset.run 里校验
  const tools = toolset.defs.map((d) => ({ name: d.name, description: d.description, input_schema: d.schema, eager_input_streaming: true }));
  const msgs = messages.map((m) => ({ role: m.role, content: m.content }));
  const out = joiner(onText);
  let jsonRetries = 0, stopReason = null;
  for (let step = 0; step < MAX_STEPS; step++) {
    const params = { model: cfg.model, max_tokens: cfg.maxTokens, system, messages: msgs, tools, ...(cfg.effort ? { output_config: { effort: cfg.effort } } : {}) };
    // 直连 Anthropic 时开启服务端兜底(拒答时由服务端换推荐模型重试)
    const stream = cfg.baseUrl
      ? client.messages.stream(params, { signal })
      : client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, { signal });
    let final;
    if (step > 0) out.gap();
    try {
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") out.text(ev.delta.text);
      }
      final = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // 只有"工具输入完全解析不了"才重试本轮; API 错误(鉴权/限流/网络)直接抛出
      if (err instanceof Anthropic.APIError || (signal && signal.aborted) || jsonRetries++ >= 2) throw err;
      step--; continue;
    }
    stopReason = final.stop_reason;
    if (stopReason === "refusal") { out.gap(); out.text("（模型拒绝回答这个问题，换个问法试试。）"); break; }
    const uses = final.content.filter((b) => b.type === "tool_use");
    if (!uses.length) { if (stopReason === "max_tokens") { out.gap(); out.text("（回答太长被截断了。）"); } break; }
    if (stopReason === "max_tokens") { out.gap(); out.text("（回答太长被截断了。）"); break; }   // 截断的工具输入不执行
    msgs.push({ role: "assistant", content: final.content });   // 原样追加(含思考块/兜底块)
    const results = uses.map((u) => {
      onTool(u.name, u.input);
      const r = toolset.run(u.name, u.input);
      return { type: "tool_result", tool_use_id: u.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
    });
    msgs.push({ role: "user", content: results });
    if (step === MAX_STEPS - 1) { out.gap(); out.text("（这次查的资料比较多，先回答到这里；可以接着问。）"); }
  }
  return { stopReason };
}

async function openaiLoop(cfg, { system, messages, toolset, onText, onTool, signal }) {
  const base = cfg.baseUrl || "https://api.openai.com/v1";
  const tools = toolset.defs.map((d) => ({ type: "function", function: { name: d.name, description: d.description, parameters: d.schema } }));
  const msgs = [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
  const out = joiner(onText);
  let useTools = tools.length > 0, stopReason = null;
  for (let step = 0; step < MAX_STEPS; step++) {
    const tm = withTimeout(signal);
    let res;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST", signal: tm.signal,
        headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ model: cfg.model, stream: true, max_tokens: cfg.maxTokens, messages: msgs, ...(useTools ? { tools } : {}) }),
      });
    } catch (e) { tm.done(); throw (tm.signal.reason instanceof Error && !(signal && signal.aborted)) ? tm.signal.reason : e; }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      tm.done();
      // 有些模型不支持工具调用: 第一轮失败时去掉工具重试一次(建议仍可从文字里的 calm-proposals 代码块提取)
      if (useTools && step === 0 && res.status === 400 && /tool|function/i.test(t)) { useTools = false; step--; continue; }
      throw new Error(`模型接口 HTTP ${res.status}${t ? ": " + t.slice(0, 200) : ""}`);
    }
    if (step > 0) out.gap();
    let buf = "", text = "";
    const calls = [];
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        const c = j.choices && j.choices[0];
        if (!c) continue;
        if (c.delta && c.delta.content) { text += c.delta.content; out.text(c.delta.content); }
        ((c.delta && c.delta.tool_calls) || []).forEach((tc) => {
          // 有 index 按 index 拼; 有的服务只给 id 不给 index, 按 id 找; 都没有就接在最后一个上
          let i = Number.isInteger(tc.index) ? tc.index : (tc.id ? calls.findIndex((x) => x && x.id === tc.id) : calls.length - 1);
          if (i < 0) i = calls.length;
          const x = calls[i] || (calls[i] = { id: "", name: "", args: "" });
          if (tc.id) x.id = tc.id;
          if (tc.function && tc.function.name && !x.name) x.name = tc.function.name;   // 有的服务每片都带完整名字, 只取一次
          if (tc.function && tc.function.arguments) x.args += tc.function.arguments;
        });
        if (c.finish_reason) stopReason = c.finish_reason;
      }
    }
    tm.done();
    const real = calls.filter(Boolean).filter((x) => x.name);
    if (!real.length) { if (stopReason === "length") { out.gap(); out.text("（回答太长被截断了。）"); } break; }
    if (stopReason === "length") { out.gap(); out.text("（回答太长被截断了。）"); break; }
    real.forEach((x, i) => { if (!x.id) x.id = `call_${step}_${i}`; });
    msgs.push({ role: "assistant", content: text || null, tool_calls: real.map((x) => ({ id: x.id, type: "function", function: { name: x.name, arguments: x.args || "{}" } })) });
    real.forEach((x) => {
      let args;
      try { args = JSON.parse(x.args || "{}"); } catch { args = undefined; }
      onTool(x.name, args || {});
      const r = args === undefined ? { content: JSON.stringify({ INVALID_JSON: x.args }), isError: true } : toolset.run(x.name, args);
      msgs.push({ role: "tool", tool_call_id: x.id, content: r.isError ? `错误: ${r.content}` : r.content });
    });
    if (step === MAX_STEPS - 1) { out.gap(); out.text("（这次查的资料比较多，先回答到这里；可以接着问。）"); }
  }
  return { stopReason };
}

// 测试用: AI_MOCK_SCRIPT = [{ "text": "...", "calls": [{ "name": "...", "args": {...} }] }, ...]
async function mockLoop(cfg, { toolset, onText, onTool }) {
  let script;
  try { script = JSON.parse(cfg.mockScript || "null"); } catch { script = null; }
  if (!Array.isArray(script)) script = [{ text: cfg.mockReply || "（测试回复）" }];
  const out = joiner(onText);
  const results = [];
  script.forEach((turn, i) => {
    if (i > 0) out.gap();
    const t = String(turn.text || "");
    for (let k = 0; k < t.length; k += 20) out.text(t.slice(k, k + 20));
    (turn.calls || []).forEach((c) => { onTool(c.name, c.args); results.push(toolset.run(c.name, c.args)); });
  });
  return { stopReason: "end_turn", toolResults: results };
}

function runAgent(cfg, args) {
  if (cfg.provider === "anthropic") return anthropicLoop(cfg, args);
  if (cfg.provider === "openai") return openaiLoop(cfg, args);
  if (cfg.provider === "mock") return mockLoop(cfg, args);
  return Promise.reject(new Error("未配置 AI_PROVIDER"));
}

module.exports = { runAgent, MAX_STEPS };
