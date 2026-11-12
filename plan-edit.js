"use strict";
// 改 plan.json 的公共逻辑(页面改规则、AI 建议都走这里): 校验 → 修改 → 有变化就记一条 changelog。纯函数, 不做 IO。

const SYMBOL_RE = /^[A-Z0-9.\-]{1,15}$/;

// 单只标的规则: 只允许 open / seal / band(溢价、境外这类特殊规则只能手改文件); null = 删除
function validateRule(r) {
  if (r === null || r === undefined) return { rule: null };
  const type = String(r.type || "");
  if (!["open", "seal", "band"].includes(type)) return { error: "规则类型只能是 open / seal / band" };
  const rule = { type };
  if (type === "band") {
    const lo = Number(r.openBelowPct), hi = Number(r.sealAtPct);
    if (!(lo >= 0 && lo <= 100 && hi > 0 && hi <= 100 && lo <= hi)) return { error: "占比需在 0–100 之间, 且「可加」不高于「封仓」" };
    rule.openBelowPct = lo; rule.sealAtPct = hi;
    if (r.targetShares !== undefined && r.targetShares !== null && r.targetShares !== "") {
      const t = Number(r.targetShares);
      if (!(t > 0)) return { error: "目标股数需大于 0" };
      rule.targetShares = t;
    }
  }
  if (r.why) rule.why = String(r.why).slice(0, 200);
  return { rule };
}

function describeRule(x) {
  if (!x) return "未设（按默认）";
  if (x.type === "open") return "一直可加";
  if (x.type === "seal") return "一直封仓";
  if (x.type === "band") return `${x.openBelowPct}% 以下可加、${x.sealAtPct}% 封仓${x.targetShares ? `、目标 ${x.targetShares} 股` : ""}`;
  if (x.type === "premium") return "看场内溢价";
  if (x.type === "offshore") return "境外账户到目标额后封仓";
  return x.type;
}

function pushChangelog(plan, change, reason, source) {
  plan.changelog = Array.isArray(plan.changelog) ? plan.changelog : [];
  const now = new Date();
  plan.changelog.push({
    version: `${source === "ai" ? "AI" : "页面"}-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, date: now.toISOString(),
    changes: [change], reason: String(reason || "").trim().slice(0, 200), ...(source === "ai" ? { source: "ai" } : {}), objections: [],
  });
}

// 改单只标的规则; 返回 { changed, before, after } 或 { error }。plan 会被就地修改
function applySymbolRule(plan, symbol, rawRule, { reason = "", source = "page" } = {}) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!SYMBOL_RE.test(sym)) return { error: "标的代码不合法" };
  const v = validateRule(rawRule);
  if (v.error) return { error: v.error };
  plan.channels = plan.channels || {};
  plan.channels.symbols = plan.channels.symbols || {};
  const prev = plan.channels.symbols[sym] || null;
  if (prev && !["open", "seal", "band"].includes(prev.type)) return { error: `${sym} 用的是「${prev.type}」规则, 只能在 plan.json 里改` };
  if (v.rule) plan.channels.symbols[sym] = v.rule; else delete plan.channels.symbols[sym];
  const before = describeRule(prev), after = describeRule(v.rule);
  if (before !== after) pushChangelog(plan, `${sym}：${before} → ${after}`, reason, source);
  return { changed: before !== after, symbol: sym, rule: v.rule, before, after };
}

// 结构目标: 指数下限 / 个股合计上限 / 单只默认上限 / 观察仓合计上限(都是百分比)
const ALLOC_FIELDS = {
  indexTargetPct: "指数下限",
  stockCapPct: "个股合计上限",
  singleCapPct: "单只个股默认上限",
  observationCapPct: "观察仓合计上限",
};
function currentAllocation(plan) {
  const ta = plan.targetAllocation || {}, ch = plan.channels || {};
  return {
    indexTargetPct: ta.indexTargetPct ?? ta.indexTarget ?? null,
    stockCapPct: ta.stockCapPct ?? ch.stockBucketCapPct ?? null,
    singleCapPct: ta.singleCapPct ?? null,
    observationCapPct: ch.observationCapPct ?? null,
  };
}
function validateAllocation(change) {
  const out = {};
  for (const k of Object.keys(ALLOC_FIELDS)) {
    if (change[k] === undefined || change[k] === null || change[k] === "") continue;
    const n = Number(change[k]);
    // 必须大于 0: 页面和判断逻辑把 0 当成"没设"而用默认值, 允许 0 会出现"写着 0、实际按 40 判断"
    if (!(n > 0 && n <= 100)) return { error: `${ALLOC_FIELDS[k]}需在 1–100 之间` };
    out[k] = n;
  }
  if (!Object.keys(out).length) return { error: "没有要改的结构目标" };
  return { change: out };
}
function applyAllocation(plan, rawChange, { reason = "", source = "page" } = {}) {
  const v = validateAllocation(rawChange || {});
  if (v.error) return { error: v.error };
  const cur = currentAllocation(plan);
  plan.targetAllocation = plan.targetAllocation || {};
  plan.channels = plan.channels || {};
  const parts = [];
  Object.entries(v.change).forEach(([k, n]) => {
    // 个股上限在两个字段里各存一份(纪律页读 targetAllocation, 可加/封仓读 channels): 任一不一致都要写
    const drift = k === "stockCapPct" && (plan.targetAllocation.stockCapPct !== n || plan.channels.stockBucketCapPct !== n);
    if (cur[k] === n && !drift) return;
    if (cur[k] === n && drift) { plan.targetAllocation.stockCapPct = n; plan.channels.stockBucketCapPct = n; return; }
    if (k === "observationCapPct") plan.channels.observationCapPct = n;
    else plan.targetAllocation[k] = n;
    if (k === "stockCapPct") plan.channels.stockBucketCapPct = n;   // 纪律页和「可加/封仓」签用同一个上限
    if (k === "indexTargetPct" && plan.targetAllocation.indexTarget !== undefined) plan.targetAllocation.indexTarget = n;
    parts.push(`${ALLOC_FIELDS[k]} ${cur[k] ?? "未设"}% → ${n}%`);
  });
  if (parts.length) pushChangelog(plan, parts.join("；"), reason, source);
  return { changed: parts.length > 0, summary: parts.join("；") };
}

// ---- 信条 / 页尾一句话 / 每月指数定投(新手起草规则时会用到) ----
function validateCreed(lines) {
  const arr = (Array.isArray(lines) ? lines : []).map((x) => String(x || "").trim()).filter(Boolean).slice(0, 8).map((x) => x.slice(0, 80));
  return arr.length ? { lines: arr } : { error: "信条不能为空" };
}
function applyCreed(plan, lines, { reason = "", source = "page" } = {}) {
  const v = validateCreed(lines);
  if (v.error) return { error: v.error };
  const before = ((plan.creed && plan.creed.lines) || []).join(" / ");
  const after = v.lines.join(" / ");
  if (before === after) return { changed: false };
  plan.creed = { ...(plan.creed || {}), lines: v.lines };
  pushChangelog(plan, `信条：${before || "未写"} → ${after}`, reason, source);
  return { changed: true };
}
function applyMotto(plan, text, { reason = "", source = "page" } = {}) {
  const t = String(text || "").trim().slice(0, 40);
  if (!t) return { error: "一句话不能为空" };
  if (plan.motto === t) return { changed: false };
  pushChangelog(plan, `页尾一句话：${plan.motto || "未写"} → ${t}`, reason, source);
  plan.motto = t;
  return { changed: true };
}
function validateIndexPlan(x) {
  const symbols = (Array.isArray(x && x.symbols) ? x.symbols : []).map((s) => String(s || "").trim().toUpperCase()).filter((s) => SYMBOL_RE.test(s)).slice(0, 6);
  const monthly = Number(x && x.monthlyCNY), pass = x && x.passCNY !== undefined && x.passCNY !== null && x.passCNY !== "" ? Number(x.passCNY) : monthly;
  if (!symbols.length) return { error: "至少要有一只定投标的" };
  if (!(monthly > 0 && monthly < 1e8) || !(pass > 0 && pass <= monthly)) return { error: "每月金额需大于 0, 达标金额不高于目标金额" };
  return { indexPlan: { symbols, monthlyCNY: monthly, passCNY: pass } };
}
const describeIndexPlan = (p) => (p && p.symbols ? `${p.symbols.join("/")} 每月 ¥${p.monthlyCNY}（买够 ¥${p.passCNY} 算完成）` : "未设");
function applyIndexPlan(plan, x, { reason = "", source = "page" } = {}) {
  const v = validateIndexPlan(x);
  if (v.error) return { error: v.error };
  plan.channels = plan.channels || {};
  const before = describeIndexPlan(plan.channels.indexPlan), after = describeIndexPlan(v.indexPlan);
  if (before === after) return { changed: false };
  plan.channels.indexPlan = { ...(plan.channels.indexPlan || {}), ...v.indexPlan };
  pushChangelog(plan, `每月指数定投：${before} → ${after}`, reason, source);
  return { changed: true };
}

// 首页设置(安静版): 首页最上面放什么 + 还要显示哪些块。写进 plan.home; 三句话仍然是 plan.creed.lines(可以清空)。
const HOME_HEROES = ["auto", "shares", "total", "none"];
const HOME_BLOCKS = ["dca", "structure", "targets"];
function validateHome(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { error: "首页设置格式错误" };
  const hero = x.hero === undefined ? "auto" : String(x.hero);
  if (!HOME_HEROES.includes(hero)) return { error: "首页显示方式只能是 auto / shares / total / none" };
  const symbols = (Array.isArray(x.symbols) ? x.symbols : []).map((v) => String(v || "").trim().toUpperCase()).filter(Boolean).slice(0, 5);
  if (symbols.some((v) => !SYMBOL_RE.test(v))) return { error: "代码格式不对" };
  if (hero === "shares" && !symbols.length) return { error: "请选一只持仓" };
  const caption = String(x.caption || "").trim().slice(0, 40);
  const blocks = [...new Set((Array.isArray(x.blocks) ? x.blocks : []).map(String).filter((b) => HOME_BLOCKS.includes(b)))];
  return { home: { hero, symbols: hero === "shares" ? symbols : [], caption, blocks } };
}
function applyHome(plan, rawHome, creedLines, { reason = "", source = "page" } = {}) {
  const v = validateHome(rawHome);
  if (v.error) return { error: v.error };
  let changed = false;
  if (JSON.stringify(plan.home || null) !== JSON.stringify(v.home)) {
    plan.home = v.home;
    pushChangelog(plan, `首页设置：显示 ${v.home.hero}${v.home.symbols.length ? " " + v.home.symbols.join("/") : ""}${v.home.blocks.length ? "，另显示 " + v.home.blocks.join("/") : ""}`, reason, source);
    changed = true;
  }
  if (creedLines !== undefined) {
    const lines = (Array.isArray(creedLines) ? creedLines : []).map((t) => String(t || "").trim()).filter(Boolean).slice(0, 8).map((t) => t.slice(0, 80));
    const before = ((plan.creed && plan.creed.lines) || []).join(" / ");
    if (before !== lines.join(" / ")) {
      plan.creed = { ...(plan.creed || {}), lines };
      pushChangelog(plan, `信条：${before || "未写"} → ${lines.join(" / ") || "清空"}`, reason, source);
      changed = true;
    }
  }
  return { changed, home: v.home };
}

module.exports = {
  validateHome, applyHome, HOME_HEROES, HOME_BLOCKS,
  validateRule, describeRule, applySymbolRule, validateAllocation, applyAllocation, currentAllocation, ALLOC_FIELDS, SYMBOL_RE,
  validateCreed, applyCreed, applyMotto, validateIndexPlan, applyIndexPlan, describeIndexPlan,
};
