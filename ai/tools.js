"use strict";
// AI 顾问的工具: 只有两类 —— 读数据, 和"提议"(收集起来等用户确认, 本身不改任何东西)。没有任何交易/写持仓的工具。
// 定义与供应商无关: agent.js 把它们翻译成 Claude 的 tools 或 OpenAI 的 functions。
const { computeRows, scrubAmounts } = require("./context");
const { validateProposals } = require("./prompts");
const { applySymbolRule, applyAllocation } = require("../plan-edit");

const S = (type, description, extra = {}) => ({ type, description, ...extra });
const RULE_SCHEMA = {
  type: "object",
  description: "新规则",
  properties: {
    type: S("string", "open=一直可加, seal=一直封仓, band=看占比, none=删除这只的规则(按默认处理)", { enum: ["open", "seal", "band", "none"] }),
    openBelowPct: S("number", "band: 占比低于这个百分比时可加"),
    sealAtPct: S("number", "band: 占比到这个百分比时封仓"),
    targetShares: S("number", "band 可选: 目标股数, 买够即封"),
  },
  required: ["type"],
};
const ALLOC_PROPS = {
  indexTargetPct: S("number", "指数合计下限 %"),
  stockCapPct: S("number", "个股合计上限 %"),
  singleCapPct: S("number", "单只个股默认上限 %"),
  observationCapPct: S("number", "观察仓合计上限 %"),
};

const DEFS = [
  { name: "get_transactions", kind: "read", label: (a) => `查看 ${a.symbol || ""} 的交易记录`,
    description: "查某只标的的买卖记录(日期、方向、价格; 用户选了只发比例时不含股数), 用来回答买入时间、加仓节奏、是否追涨之类的问题。",
    schema: { type: "object", properties: { symbol: S("string", "代码, 如 AAPL / 00700 / 600519"), limit: S("integer", "最多返回几条, 默认 20") }, required: ["symbol"] } },
  { name: "get_journal", kind: "read", label: (a) => `翻持仓日记${a.symbol ? `（${a.symbol}）` : ""}`,
    description: "读用户写的持仓日记(买入理由、持有思考、卖出计划、市场感悟)。可按代码筛选。",
    schema: { type: "object", properties: { symbol: S("string", "可选, 只看这只"), limit: S("integer", "最多几条, 默认 10") } } },
  { name: "get_rule_history", kind: "read", label: () => "查看规则修改记录",
    description: "读规则修改记录(changelog): 什么时候改了什么、理由是什么。用来看用户是否频繁改规则、改规则是否在大涨大跌之后。",
    schema: { type: "object", properties: { limit: S("integer", "最近几条, 默认 10") } } },
  { name: "get_performance", kind: "read", label: (a) => `查看${{ "1m": "近一月", "3m": "近三月", "6m": "近半年", "1y": "近一年", all: "全部" }[a.range] || ""}收益曲线`,
    description: "看一段时间的资产曲线: 扣除新增投入后的收益率、期间最大回撤。",
    schema: { type: "object", properties: { range: S("string", "时间范围", { enum: ["1m", "3m", "6m", "1y", "all"] }) }, required: ["range"] } },
  { name: "simulate_rules", kind: "read", label: () => "推演规则改动的影响",
    description: "假设推演: 如果按给定改动修改规则, 每只持仓的「可加/封仓」会怎么变。建议改规则前先用它看后果。不会真的修改。",
    schema: { type: "object", properties: {
      rules: { type: "array", description: "要假设修改的单只规则", items: { type: "object", properties: { symbol: S("string", "代码"), rule: RULE_SCHEMA }, required: ["symbol", "rule"] } },
      allocation: { type: "object", description: "要假设修改的结构目标", properties: ALLOC_PROPS },
    } } },
  { name: "propose_rule_change", kind: "propose", label: (a) => `提出 ${a.symbol || ""} 的规则建议`,
    description: "提议修改一只标的的买入规则。只是提议: 会显示给用户, 用户确认后才生效。溢价、境外这类特殊规则不能改。",
    schema: { type: "object", properties: { symbol: S("string", "代码"), rule: RULE_SCHEMA, why: S("string", "一句话理由") }, required: ["symbol", "rule", "why"] } },
  { name: "propose_allocation_change", kind: "propose", label: () => "提出结构目标建议",
    description: "提议修改结构目标(只写要改的字段)。用户确认后才生效。",
    schema: { type: "object", properties: { ...ALLOC_PROPS, why: S("string", "一句话理由") }, required: ["why"] } },
  { name: "propose_creed", kind: "propose", label: () => "起草投资信条",
    description: "提议用户的投资信条(3–5 句, 用用户自己的话, 每句不超过 30 字)。用户确认后替换原来的信条。",
    schema: { type: "object", properties: { lines: { type: "array", items: S("string", "一句信条"), description: "信条" }, why: S("string", "一句话理由") }, required: ["lines", "why"] } },
  { name: "propose_motto", kind: "propose", label: () => "起草纪律页的一句话",
    description: "提议纪律页底部那句话(不超过 20 字)。",
    schema: { type: "object", properties: { text: S("string", "一句话"), why: S("string", "一句话理由") }, required: ["text", "why"] } },
  { name: "propose_index_plan", kind: "propose", label: () => "起草每月定投计划",
    description: "提议每月指数定投: 从哪几只指数里任选、每月目标金额、买够多少算完成(元)。",
    schema: { type: "object", properties: {
      symbols: { type: "array", items: S("string", "指数代码"), description: "定投候选" },
      monthlyCNY: S("number", "每月目标金额(元)"), passCNY: S("number", "买够多少算完成(元), 不填等于目标金额"), why: S("string", "一句话理由"),
    }, required: ["symbols", "monthlyCNY", "why"] } },
  { name: "propose_note", kind: "propose", label: () => "提议记一条顾问笔记",
    description: "提议把一条值得长期记住的信息写进顾问笔记(用户的偏好、某只股票的持有理由或卖出红灯等), 以后每次对话都会带上。一句话, 用户确认后才写入。",
    schema: { type: "object", properties: { text: S("string", "要记住的内容, 一句话"), why: S("string", "为什么值得记") }, required: ["text", "why"] } },
];

// 极简校验(只覆盖上面用到的 schema 写法): 模型给的参数先过这里, 不合法就作为错误结果还给模型
function check(schema, v, path = "参数") {
  const types = [].concat(schema.type || []);
  const typeOf = (x) => (x === null ? "null" : Array.isArray(x) ? "array" : Number.isInteger(x) ? "integer" : typeof x);
  const t = typeOf(v);
  if (types.length && !types.some((x) => x === t || (x === "number" && t === "integer"))) return `${path} 应为 ${types.join("/")}`;
  if (schema.enum && !schema.enum.includes(v)) return `${path} 只能是 ${schema.enum.join("/")}`;
  if (t === "object") {
    for (const k of schema.required || []) if (v[k] === undefined) return `缺少 ${path}.${k}`;
    for (const [k, sub] of Object.entries(schema.properties || {})) if (v[k] !== undefined) { const e = check(sub, v[k], `${path}.${k}`); if (e) return e; }
  }
  if (t === "array" && schema.items) for (let i = 0; i < v.length; i++) { const e = check(schema.items, v[i], `${path}[${i}]`); if (e) return e; }
  return null;
}

const day = (d) => String(d || "").slice(0, 10);
const ruleOrNull = (r) => (!r || r.type === "none" ? null : r);
const RANGE_DAYS = { "1m": 30, "3m": 91, "6m": 182, "1y": 365, all: Infinity };

// deps: { getData, getPlan, getJournal, getHistory, notes, anonymize }
function createToolset(deps, { allowPropose = true } = {}) {
  const proposals = [];
  const anon = deps.anonymize !== false;
  const handlers = {
    get_transactions({ symbol, limit = 20 }) {
      const sym = String(symbol).trim().toUpperCase();
      const tx = [];
      ((deps.getData() || {}).accounts || []).forEach((a) => (a.holdings || []).forEach((h) => {
        if (String(h.symbol).toUpperCase() !== sym) return;
        (h.transactions || []).forEach((t) => tx.push({ date: day(t.date), type: { buy: "买入", sell: "卖出", sync: "校准" }[t.type] || t.type, ...(anon ? {} : { shares: t.shares }), price: t.price, ...(t.note ? { note: anon ? scrubAmounts(t.note) : t.note } : {}) }));
      }));
      if (!tx.length) return `没有 ${sym} 的交易记录(可能没持有, 或代码写法不同)`;
      tx.sort((a, b) => (a.date < b.date ? -1 : 1));
      return JSON.stringify(tx.slice(-Math.min(50, Math.max(1, limit))));
    },
    get_journal({ symbol, limit = 10 }) {
      const sym = symbol ? String(symbol).trim().toUpperCase() : "";
      const TYPE = { buy: "买入理由", hold: "持有思考", sell: "卖出计划", note: "市场感悟" };
      const scrub = (s) => (anon ? String(s).replace(/[¥$￥]\s?[\d,.]+|[\d,.]+\s?(万|元|股|美元|港币)/g, "[已隐去]") : String(s));
      const list = (deps.getJournal() || []).filter((e) => !sym || String(e.stock || "").toUpperCase() === sym)
        .slice(0, Math.min(30, Math.max(1, limit))).map((e) => ({ date: day(e.date), type: TYPE[e.type] || e.type, stock: e.stock || "", content: scrub(e.content || "").slice(0, 600) }));
      return list.length ? JSON.stringify(list) : "没有日记";
    },
    get_rule_history({ limit = 10 }) {
      const log = ((deps.getPlan() || {}).changelog || []).slice(-Math.min(30, Math.max(1, limit)));
      return log.length ? JSON.stringify(log.map((e) => ({ version: e.version, date: day(e.date), changes: e.changes, reason: e.reason || "", ...(e.source ? { source: e.source } : {}) }))) : "还没有修改记录";
    },
    get_performance({ range }) {
      const snaps = ((deps.getHistory() || {}).snapshots || []).filter((x) => x && x.t && x.v > 0);
      if (snaps.length < 2) return "资产曲线数据还不够";
      const end = new Date(snaps[snaps.length - 1].t).getTime();
      const from = end - RANGE_DAYS[range] * 864e5;
      const seg = snaps.filter((x) => new Date(x.t).getTime() >= from);
      if (seg.length < 2) return "这段时间的数据不够";
      const a = seg[0], b = seg[seg.length - 1];
      const inflow = (Number(b.c) || 0) - (Number(a.c) || 0);
      let peak = 0, mdd = 0;
      seg.forEach((x) => { peak = Math.max(peak, x.v); mdd = Math.max(mdd, (peak - x.v) / peak); });
      const out = { from: day(a.t), to: day(b.t), returnPctExInflow: +(((b.v - a.v - inflow) / a.v) * 100).toFixed(2), maxDrawdownPct: +(mdd * 100).toFixed(2), note: "收益率已扣除期间新增投入; 回撤按资产曲线计算, 期间有大额投入/取出时会有偏差" };
      if (!anon) Object.assign(out, { startValue: Math.round(a.v), endValue: Math.round(b.v), netInflow: Math.round(inflow) });
      return JSON.stringify(out);
    },
    simulate_rules({ rules = [], allocation }) {
      const plan0 = deps.getPlan() || {};
      const plan1 = JSON.parse(JSON.stringify(plan0));
      const errs = [];
      rules.forEach((r) => { const x = applySymbolRule(plan1, r.symbol, ruleOrNull(r.rule), { source: "sim" }); if (x.error) errs.push(`${r.symbol}: ${x.error}`); });
      if (allocation && Object.keys(allocation).length) { const x = applyAllocation(plan1, allocation, { source: "sim" }); if (x.error) errs.push(x.error); }
      const before = computeRows(deps.getData(), plan0, { anonymize: anon }).rows;
      const after = new Map(computeRows(deps.getData(), plan1, { anonymize: anon }).rows.map((x) => [x.symbol, x]));
      const changes = before.map((x) => ({ symbol: x.symbol, before: x.channel, after: (after.get(x.symbol) || {}).channel }))
        .filter((x) => x.before !== x.after);
      return JSON.stringify({ errors: errs, changed: changes, unchanged: before.length - changes.length });
    },
  };
  const proposeKind = {
    propose_rule_change: (a) => ({ kind: "symbol", symbol: a.symbol, rule: ruleOrNull(a.rule), why: a.why }),
    propose_allocation_change: (a) => ({ kind: "allocation", change: a, why: a.why }),
    propose_creed: (a) => ({ kind: "creed", lines: a.lines, why: a.why }),
    propose_motto: (a) => ({ kind: "motto", text: a.text, why: a.why }),
    propose_index_plan: (a) => ({ kind: "indexPlan", indexPlan: a, why: a.why }),
    propose_note: (a) => ({ kind: "note", text: a.text, why: a.why }),
  };

  const defs = DEFS.filter((d) => allowPropose || d.kind === "read");
  return {
    defs,
    proposals,
    label(name, args) { const d = DEFS.find((x) => x.name === name); return d ? d.label(args || {}) : name; },
    // 返回 { content, isError }; 任何异常都变成错误结果交还给模型, 不中断对话
    run(name, args) {
      const d = defs.find((x) => x.name === name);
      if (!d) return { content: `没有这个工具: ${name}`, isError: true };
      if (args === null || typeof args !== "object" || Array.isArray(args)) return { content: JSON.stringify({ INVALID_JSON: String(args) }), isError: true };
      const err = check(d.schema, args);
      if (err) return { content: `参数不合法: ${err}`, isError: true };
      try {
        if (d.kind === "read") return { content: handlers[name](args) };
        const [p] = validateProposals([proposeKind[name](args)], deps.getPlan() || {});
        if (!p) return { content: "这条建议无效或和现在一样, 没有记录。", isError: true };
        if (proposals.some((x) => x.summary === p.summary)) return { content: "这条建议已经提过了。" };
        if (proposals.length >= 12) return { content: "建议已经够多了, 先让用户确认这些。", isError: true };
        proposals.push(p);
        return { content: `已记下这条建议(等用户确认): ${p.summary}` };
      } catch (e) { return { content: `工具出错: ${e.message}`, isError: true }; }
    },
  };
}

module.exports = { createToolset, DEFS, check };
