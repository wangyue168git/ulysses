"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createToolset, check } = require("../ai/tools");
const { runAgent } = require("../ai/agent");
const { aiConfigFromEnv } = require("../ai/providers");
const { login, request, startServer } = require("./helpers/server-harness");

const data = {
  rateInfo: { USD_CNY: 7 },
  accounts: [{ name: "IB", currency: "USD", cash: 0, holdings: [
    { symbol: "QQQM", name: "纳指100", market: "nasdaq", shares: 50, costPrice: 180, currentPrice: 200, marketValue: 10000, transactions: [{ type: "buy", shares: 50, price: 180, date: "2026-01-05T00:00:00Z" }] },
    { symbol: "AAPL", name: "苹果", market: "nasdaq", shares: 10, costPrice: 150, currentPrice: 200, marketValue: 2000, transactions: [
      { type: "buy", shares: 6, price: 140, date: "2026-02-01T00:00:00Z" }, { type: "buy", shares: 4, price: 165, date: "2026-06-01T00:00:00Z", note: "追加 4 股" }] },
  ] }],
};
const plan = { targetAllocation: { indexTargetPct: 60, stockCapPct: 40, singleCapPct: 10 }, channels: { default: "seal", stockBucketCapPct: 40, symbols: {
  QQQM: { type: "open" }, AAPL: { type: "band", openBelowPct: 20, sealAtPct: 25 } } },
  changelog: [{ version: "v1", date: "2026-01-01T00:00:00Z", changes: ["初始"], reason: "" }] };
const journal = [{ date: "2026-02-01T00:00:00Z", type: "buy", stock: "AAPL", content: "买了 6 股，花了 ¥5,880，看好生态" }];
const history = { snapshots: [
  { t: "2026-01-01T00:00:00Z", v: 100000, c: 100000 }, { t: "2026-03-01T00:00:00Z", v: 90000, c: 100000 },
  { t: "2026-06-01T00:00:00Z", v: 130000, c: 110000 } ] };
const deps = (anonymize = true) => ({ getData: () => data, getPlan: () => plan, getJournal: () => journal, getHistory: () => history, anonymize });

test("读数据工具: 只发比例时不含股数/金额; 收益扣除新增投入; 回撤按曲线算", () => {
  const t = createToolset(deps());
  const tx = JSON.parse(t.run("get_transactions", { symbol: "aapl" }).content);
  assert.deepEqual(tx.map((x) => [x.date, x.type, x.price, x.shares, x.note, x.priceVsNowPct]), [["2026-02-01", "买入", undefined, undefined, undefined, -30], ["2026-06-01", "买入", undefined, undefined, undefined, -17.5]],
    "只发比例: 不发价格/股数/备注, 只给成交价相对现价的百分比");
  assert.equal(JSON.parse(createToolset(deps(false)).run("get_transactions", { symbol: "AAPL" }).content)[0].shares, 6);
  assert.match(t.run("get_journal", { symbol: "AAPL" }).content, /买了 \[股数\]，花了 \[金额\]，看好生态/);
  assert.match(t.run("get_rule_history", {}).content, /初始/);
  const perf = JSON.parse(t.run("get_performance", { range: "all" }).content);
  assert.equal(perf.returnPctExInflow, 20);   // (130000-100000-10000)/100000
  assert.equal(perf.maxDrawdownPct, 10);
  assert.equal(perf.startValue, undefined);
  assert.equal(JSON.parse(createToolset(deps(false)).run("get_performance", { range: "all" }).content).netInflow, 10000);
});

test("假设推演: 只报告会变的签, 不改真实规则", () => {
  const t = createToolset(deps());
  const r = JSON.parse(t.run("simulate_rules", { rules: [{ symbol: "AAPL", rule: { type: "band", openBelowPct: 10, sealAtPct: 12 } }] }).content);
  assert.equal(r.changed.length, 1);
  assert.equal(r.changed[0].symbol, "AAPL");
  assert.match(r.changed[0].before, /^可加/);
  assert.match(r.changed[0].after, /^封仓/);
  assert.equal(plan.channels.symbols.AAPL.sealAtPct, 25, "原规则不变");
});

test("提议工具: 校验参数、去重、无效和与现状相同的不记; type none = 删除", () => {
  const t = createToolset(deps());
  assert.match(t.run("propose_rule_change", { symbol: "AAPL" }).content, /缺少/);
  assert.equal(t.run("propose_rule_change", { symbol: "AAPL", rule: { type: "magic" }, why: "x" }).isError, true);
  assert.equal(t.run("propose_rule_change", { symbol: "QQQM", rule: { type: "open" }, why: "一样" }).isError, true);
  assert.match(t.run("propose_rule_change", { symbol: "AAPL", rule: { type: "band", openBelowPct: 8, sealAtPct: 10 }, why: "收紧" }).content, /已记下/);
  assert.match(t.run("propose_rule_change", { symbol: "AAPL", rule: { type: "band", openBelowPct: 8, sealAtPct: 10 }, why: "又一次" }).content, /已经提过/);
  t.run("propose_rule_change", { symbol: "QQQM", rule: { type: "none" }, why: "删掉" });
  t.run("propose_note", { text: "用户偏好指数，个股只做小仓位", why: "长期偏好" });
  t.run("propose_index_plan", { symbols: ["QQQM"], monthlyCNY: 3000, why: "定投" });
  assert.deepEqual(t.proposals.map((p) => p.kind), ["symbol", "symbol", "note", "indexPlan"]);
  assert.equal(t.proposals[1].rule, null);
  assert.match(t.proposals[1].summary, /QQQM：一直可加 → 未设/);
  assert.equal(t.run("no_such_tool", {}).isError, true);
  assert.equal(t.run("get_journal", "not-an-object").isError, true);
  assert.equal(createToolset(deps(), { allowPropose: false }).defs.some((d) => d.name.startsWith("propose_")), false);
});

test("参数校验器", () => {
  const sch = { type: "object", properties: { a: { type: "integer" }, b: { type: "array", items: { type: "string" } }, c: { type: "string", enum: ["x"] } }, required: ["a"] };
  assert.equal(check(sch, { a: 1, b: ["s"], c: "x" }), null);
  assert.match(check(sch, {}), /缺少/);
  assert.match(check(sch, { a: "1" }), /integer/);
  assert.match(check(sch, { a: 1, b: [1] }), /b\[0\]/);
  assert.match(check(sch, { a: 1, c: "y" }), /只能是/);
});

function fakeServer(handler) {
  const reqs = [];
  const srv = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c));
    req.on("end", () => { const body = JSON.parse(b); reqs.push(body); handler(reqs.length, body, res); });
  });
  return new Promise((r) => srv.listen(0, () => r({ srv, reqs, url: `http://127.0.0.1:${srv.address().port}` })));
}
const sseA = (res, events) => { res.writeHead(200, { "Content-Type": "text/event-stream" }); events.forEach(([type, d]) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...d })}\n\n`)); res.end(); };
const msgStart = { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } };

test("Claude 工具循环: 工具结果回传、思考/工具块原样追加、两轮文字之间加空行", async (t) => {
  const f = await fakeServer((n, body, res) => {
    if (n === 1) return sseA(res, [["message_start", msgStart],
      ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }], ["content_block_delta", { index: 0, delta: { type: "text_delta", text: "我先看看修改记录。" } }], ["content_block_stop", { index: 0 }],
      ["content_block_start", { index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "get_rule_history", input: {} } }],
      ["content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: "{\"limit\":" } }], ["content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: "3}" } }],
      ["content_block_stop", { index: 1 }], ["message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 5 } }], ["message_stop", {}]]);
    sseA(res, [["message_start", msgStart], ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
      ["content_block_delta", { index: 0, delta: { type: "text_delta", text: "只改过一次。" } }], ["content_block_stop", { index: 0 }],
      ["message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 3 } }], ["message_stop", {}]]);
  });
  t.after(() => f.srv.close());
  const cfg = aiConfigFromEnv({ AI_PROVIDER: "anthropic", AI_API_KEY: "k", AI_BASE_URL: f.url });
  let text = ""; const tools = [];
  await runAgent(cfg, { system: "S", messages: [{ role: "user", content: "我改过几次规则" }], toolset: createToolset(deps()), onText: (x) => (text += x), onTool: (n, a) => tools.push([n, a]) });
  assert.equal(text, "我先看看修改记录。\n\n只改过一次。");
  assert.deepEqual(tools, [["get_rule_history", { limit: 3 }]]);
  assert.equal(f.reqs[0].tools.every((x) => x.eager_input_streaming === true && x.input_schema.type === "object"), true);
  const second = f.reqs[1].messages;
  assert.equal(second[1].role, "assistant");
  assert.deepEqual(second[1].content.map((b) => b.type), ["text", "tool_use"]);
  assert.equal(second[2].content[0].type, "tool_result");
  assert.equal(second[2].content[0].tool_use_id, "toolu_1");
  assert.match(second[2].content[0].content, /初始/);
});

const sseO = (res, chunks) => { res.writeHead(200, { "Content-Type": "text/event-stream" }); chunks.forEach((c) => res.write(`data: ${JSON.stringify({ choices: [c] })}\n\n`)); res.write("data: [DONE]\n\n"); res.end(); };
test("OpenAI 兼容工具循环: 分片拼接 tool_calls, 结果用 tool 消息回传", async (t) => {
  const f = await fakeServer((n, body, res) => {
    if (n === 1) return sseO(res, [
      { delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "propose_note", arguments: "{\"text\":\"偏好" } }] } },
      { delta: { tool_calls: [{ index: 0, function: { arguments: "指数\",\"why\":\"长期\"}" } }] }, finish_reason: "tool_calls" }]);
    sseO(res, [{ delta: { content: "已经提议记下。" }, finish_reason: "stop" }]);
  });
  t.after(() => f.srv.close());
  const cfg = aiConfigFromEnv({ AI_PROVIDER: "openai", AI_API_KEY: "k", AI_BASE_URL: f.url });
  const ts = createToolset(deps());
  let text = "";
  await runAgent(cfg, { system: "S", messages: [{ role: "user", content: "记住我偏好指数" }], toolset: ts, onText: (x) => (text += x), onTool: () => {} });
  assert.equal(text, "已经提议记下。");
  assert.equal(ts.proposals[0].kind, "note");
  assert.equal(f.reqs[0].tools[0].type, "function");
  const m = f.reqs[1].messages;
  assert.equal(m[2].tool_calls[0].function.name, "propose_note");
  assert.equal(m[3].role, "tool");
  assert.equal(m[3].tool_call_id, "c1");
});

test("OpenAI 兼容: 模型不支持工具时去掉工具重试一次", async (t) => {
  const f = await fakeServer((n, body, res) => {
    if (n === 1) { res.writeHead(400); res.end('{"error":"tools is not supported for this model"}'); return; }
    sseO(res, [{ delta: { content: "好的" }, finish_reason: "stop" }]);
  });
  t.after(() => f.srv.close());
  let text = "";
  await runAgent(aiConfigFromEnv({ AI_PROVIDER: "openai", AI_BASE_URL: f.url }), { system: "S", messages: [{ role: "user", content: "hi" }], toolset: createToolset(deps()), onText: (x) => (text += x), onTool: () => {} });
  assert.equal(text, "好的");
  assert.equal(f.reqs[1].tools, undefined);
});

async function sse(server, token, body) {
  const res = await fetch(`${server.baseUrl}/api/ai/chat`, { method: "POST", headers: { "Content-Type": "application/json", "X-Auth-Token": token }, body: JSON.stringify(body) });
  const text = await res.text();
  return [...text.matchAll(/event: (\w+)\ndata: (.*)\n/g)].map((m) => [m[1], JSON.parse(m[2])]);
}

test("接口: 工具调用事件、起草规则模式、顾问笔记、多种建议一起确认", async (t) => {
  const script = [
    { text: "我先看看 TSLA 的交易记录。", calls: [{ name: "get_transactions", args: { symbol: "TSLA" } }] },
    { text: "草案如下。", calls: [
      { name: "propose_rule_change", args: { symbol: "TSLA", rule: { type: "band", openBelowPct: 5, sealAtPct: 8 }, why: "建仓" } },
      { name: "propose_creed", args: { lines: ["长期持有指数", "个股小仓位"], why: "你的偏好" } },
      { name: "propose_index_plan", args: { symbols: ["QQQM"], monthlyCNY: 2000, why: "定投" } },
      { name: "propose_note", args: { text: "用户能承受 20% 回撤", why: "访谈" } }] },
  ];
  const server = await startServer({ extraEnv: { AI_PROVIDER: "mock", AI_MOCK_SCRIPT: JSON.stringify(script) } });
  t.after(() => server.stop());
  const token = await login(server.baseUrl);
  const cfg = (await request(server.baseUrl, "/api/ai/config", { token })).json;
  assert.ok(cfg.onboardPrompt);
  const ev = await sse(server, token, { mode: "onboard", messages: [{ role: "user", content: cfg.onboardPrompt }] });
  assert.deepEqual(ev.filter(([e]) => e === "tool").map(([, d]) => d.label).slice(0, 2), ["查看 TSLA 的交易记录", "提出 TSLA 的规则建议"]);
  const text = ev.filter(([e]) => e === "delta").map(([, d]) => d.t).join("");
  assert.equal(text, "我先看看 TSLA 的交易记录。\n\n草案如下。");
  const proposals = ev.find(([e]) => e === "done")[1].proposals;
  assert.deepEqual(proposals.map((p) => p.kind), ["symbol", "creed", "indexPlan", "note"]);

  assert.equal((await request(server.baseUrl, "/api/ai/notes", { token })).json.text, "");
  const ap = (await request(server.baseUrl, "/api/ai/apply", { method: "POST", token, body: { proposals } })).json;
  assert.equal(ap.results.every((r) => r.ok), true);
  const saved = JSON.parse(fs.readFileSync(path.join(server.dir, "plan.json"), "utf8"));
  assert.deepEqual(saved.creed.lines, ["长期持有指数", "个股小仓位"]);
  assert.equal(saved.channels.indexPlan.monthlyCNY, 2000);
  assert.equal(saved.channels.symbols.TSLA.sealAtPct, 8);
  const notes = (await request(server.baseUrl, "/api/ai/notes", { token })).json.text;
  assert.match(notes, /^- 用户能承受 20% 回撤（\d{4}-\d{2}-\d{2}）\n$/);
  assert.equal((await request(server.baseUrl, "/api/ai/notes", { method: "PUT", token, body: { text: "- 我自己改的" } })).json.text, "- 我自己改的");
  const ev2 = await sse(server, token, { messages: [{ role: "user", content: "hi" }] });
  assert.ok(ev2.find(([e]) => e === "done"), "带着笔记也能正常对话");
});

test("接口: 截图识别返回待核对的行; 不是图片/没有图片会被拒绝", async (t) => {
  const server = await startServer({ extraEnv: { AI_PROVIDER: "mock", AI_MOCK_VISION: '[{"symbol":"aapl.us","name":"苹果","qty":"10","cost":"180.5"},{"symbol":"","name":"某基金","qty":200,"cost":null}]' } });
  t.after(() => server.stop());
  const token = await login(server.baseUrl);
  const bad = await request(server.baseUrl, "/api/ai/vision-import", { method: "POST", token, body: { images: [{ mediaType: "text/plain", data: "x" }] } });
  assert.equal(bad.status, 400);
  const ok = await request(server.baseUrl, "/api/ai/vision-import", { method: "POST", token, body: { images: [{ mediaType: "image/jpeg", data: "AAAA" }] } });
  assert.deepEqual(ok.json.rows, [{ symbol: "AAPL", name: "苹果", qty: 10, cost: 180.5 }, { symbol: "", name: "某基金", qty: 200, cost: null }]);
});

test("截图识别可以用另一家平台的视觉模型(接口地址/Key 单独配)", async (t) => {
  let got;
  const srv = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    got = { auth: req.headers.authorization, body: JSON.parse(b) };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: '[{"symbol":"00700","name":"腾讯","qty":100,"cost":380}]' } }] }));
  }); });
  await new Promise((r) => srv.listen(0, r));
  t.after(() => srv.close());
  const { extractHoldings } = require("../ai/vision");
  const cfg = aiConfigFromEnv({ AI_PROVIDER: "openai", AI_BASE_URL: "http://127.0.0.1:1/never", AI_API_KEY: "deepseek-key", AI_MODEL: "deepseek-chat",
    AI_VISION_BASE_URL: `http://127.0.0.1:${srv.address().port}/v4`, AI_VISION_API_KEY: "zhipu-key", AI_VISION_MODEL: "glm-4v-flash" });
  const rows = await extractHoldings(cfg, [{ mediaType: "image/jpeg", data: "AAAA" }]);
  assert.deepEqual(rows, [{ symbol: "00700", name: "腾讯", qty: 100, cost: 380 }]);
  assert.equal(got.auth, "Bearer zhipu-key");
  assert.equal(got.body.model, "glm-4v-flash");
  assert.equal(got.body.messages[0].content[1].image_url.url, "data:image/jpeg;base64,AAAA");
});
