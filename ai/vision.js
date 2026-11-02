"use strict";
// 截图识别持仓: 把券商 App 的持仓截图交给能看图的模型, 只要一个 JSON 数组; 识别结果先给用户核对、改正, 再走 CSV 导入的预览 → 确认流程。
const VISION_PROMPT = `这是券商 App 或网页的持仓截图（可能有好几张）。请把里面每一只持仓识别出来，只输出一个 JSON 数组，不要任何其他文字：
[{"symbol":"代码","name":"名称","qty":持仓数量,"cost":每股成本价}]
- symbol：证券代码。美股如 AAPL，港股如 00700，A 股如 600519。截图里只有名称没有代码时，只填你非常确定的代码，不确定就填空字符串 ""。
- qty：持仓数量（股/份），不是可用数量、不是市值。
- cost：每股成本价（摊薄成本 / 持仓成本 / 买入均价），不是现价。看不到就填 null。
- 同一只出现在多张图里只写一次。不要编造截图里没有的持仓；看不清的数字填 null。`;

function parseRows(text) {
  let s = String(text || "").replace(/```(?:json)?/g, "");
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a < 0 || b <= a) throw new Error("模型没有返回可识别的表格, 换一张更清晰的截图试试");
  let arr;
  try { arr = JSON.parse(s.slice(a, b + 1)); } catch { throw new Error("模型返回的格式不对, 再试一次"); }
  if (!Array.isArray(arr)) throw new Error("模型返回的格式不对");
  const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[,，\s$¥￥]/g, "")); return Number.isFinite(n) ? n : null; };
  return arr.slice(0, 200).map((r) => ({
    symbol: String((r && r.symbol) || "").trim().toUpperCase().replace(/\.(US|HK|SH|SZ|SS)$/, "").replace(/^(SH|SZ|HK)(?=\d)/, ""),
    name: String((r && r.name) || "").replace(/[<>"'`]/g, "").trim().slice(0, 40),
    qty: num(r && r.qty), cost: num(r && r.cost),
  })).filter((r) => r.symbol || r.name);
}

const { withTimeout, TIMEOUT_MS } = require("./timeout");
// images: [{ mediaType: "image/jpeg", data: "<base64>" }]
async function extractHoldings(cfg0, images, { signal, demoRows } = {}) {
  if (cfg0.provider === "demo") return demoRows || [];   // 体验版: 不看图, 用按现有持仓编的结果
  const other = !!(cfg0.visionProvider || cfg0.visionBaseUrl);
  // 视觉模型在另一家平台时必须单独配 Key, 不能把主模型的 Key 发给别家
  if (other && !cfg0.visionApiKey && (cfg0.visionProvider || cfg0.provider) !== "mock") throw new Error("视觉模型在另一家平台, 请设置 AI_VISION_API_KEY");
  const cfg = other ? { ...cfg0, provider: cfg0.visionProvider || cfg0.provider, baseUrl: cfg0.visionBaseUrl, apiKey: cfg0.visionApiKey || cfg0.apiKey } : cfg0;
  const model = cfg.visionModel || cfg.model;
  let text = "";
  if (cfg.provider === "anthropic") {
    const Anthropic = require("@anthropic-ai/sdk").default;
    const client = new Anthropic({ apiKey: cfg.apiKey, timeout: TIMEOUT_MS, maxRetries: 1, ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}) });
    const params = {
      model, max_tokens: 8000,
      messages: [{ role: "user", content: [
        ...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.data } })),
        { type: "text", text: VISION_PROMPT },
      ] }],
    };
    const resp = cfg.baseUrl
      ? await client.messages.create(params, { signal })
      : await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, { signal });
    if (resp.stop_reason === "refusal") throw new Error("模型拒绝处理这张图片");
    text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  } else if (cfg.provider === "openai") {
    const base = cfg.baseUrl || "https://api.openai.com/v1";
    const tm = withTimeout(signal);
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST", signal: tm.signal,
      headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: "user", content: [
        { type: "text", text: VISION_PROMPT },
        ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mediaType};base64,${i.data}` } })),
      ] }] }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      tm.done();
      throw new Error(/image|vision|multimodal|content type|image_url/i.test(t)
        ? `模型 ${model} 看不了图片, 请在 .env 设置 AI_VISION_MODEL 为支持图片的模型`
        : `模型接口 HTTP ${res.status}${t ? ": " + t.slice(0, 200) : ""}`);
    }
    const j = await res.json().finally(tm.done);
    text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
    if (Array.isArray(text)) text = text.map((p) => p.text || "").join("");
  } else if (cfg.provider === "mock") {
    text = cfg.mockVisionReply || cfg.mockReply || "[]";
  } else throw new Error("未配置 AI_PROVIDER");
  return parseRows(text);
}

module.exports = { extractHoldings, parseRows, VISION_PROMPT };
