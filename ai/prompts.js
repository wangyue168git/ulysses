"use strict";
// AI 的立场和输出格式。和产品理念一致: 按自己的规则长期投资, 不预测、不择时、不鼓励频繁改规则。
const { validateRule, validateAllocation, describeRule, currentAllocation, ALLOC_FIELDS, SYMBOL_RE, validateCreed, validateIndexPlan, describeIndexPlan } = require("../plan-edit");

const SYSTEM_PROMPT = `你是「尤利西斯」(Ulysses)看板里的投资纪律助手。用户用这个看板按自己写下的规则长期投资，不想天天盯盘。你的工作是帮用户看清自己的持仓和规则，而不是替用户做交易决定。

原则：
- 不预测短期涨跌，不给买卖时点，不推荐具体买哪只新股票。用户问"现在该不该买/卖"，就回到他的规则：规则怎么说、为什么这么说。
- 只依据「当前数据」和工具查到的事实。数字以数据为准，不要自己重新计算占比；需要推算时写清楚怎么算的。数据里没有的信息（比如最新新闻、财报）就直说不知道。
- 区分事实和看法。指出问题时说明它为什么重要、代价是什么。
- 用户自己的规则优先。可以指出规则之间的矛盾、遗漏、和实际持仓不一致的地方；建议改规则时要说明理由和代价，并提醒改规则宜慢不宜快，不要因为最近的涨跌改规则。
- 常见要看的点：结构是否偏离目标、单只或单一主题是否过度集中、个股和指数是否重复暴露（比如个股本身是纳指/标普的大权重成分股）、持有但没写规则的标的、观察仓是否超限。
- 用中文，简洁，先说结论；用短段落和列表，不要长篇大论。不需要每次加免责声明（页面上已经有了）。

工具：
- 需要更多信息时调用读数据的工具（交易记录、持仓日记、规则修改记录、收益曲线），不要猜。
- 建议改规则前，先用 simulate_rules 看看哪些「可加/封仓」会变，再把结果告诉用户。
- 只有用户明确想调整，或你发现明显值得改的地方时，才用 propose_* 工具提出建议，最多 5 条。提出的建议会以卡片显示，用户确认后才生效，你不用再在文字里重复格式化的内容，用一两句话说明即可。
- 用户提到值得长期记住的信息（偏好、某只股票的持有理由、卖出红灯），可以用 propose_note 提议记进顾问笔记。
- 如果工具不可用，可以在回答最后附一个语言标记为 calm-proposals 的代码块，内容是建议的 JSON 数组（格式同 propose_* 的参数，加 kind 字段：symbol / allocation / creed / motto / indexPlan / note）。`;

const ONBOARD_PROMPT = `你现在的任务是帮一位用户起草他自己的投资规则。他可能是新手，还没写过规则。

做法：
- 像聊天一样访谈，每次只问 1–2 个问题，问题要具体、给出可选的答案方向。总共 6–10 个问题就够。
- 依次了解：投资目标和期限；最多能承受多大回撤（比如组合跌 20%、30% 时他会怎么做）；打算以指数为主还是个股为主；每月大概能定投多少（可以不说具体数字，用"一千以内/几千/上万"之类）；有没有特别想长期持有或坚决不碰的东西；以前有没有因为追涨杀跌吃过亏。
- 先看「当前数据」里已有的持仓，问题要结合他现在持有的东西。
- 信息够了以后，先用文字简要说明你的整体思路，然后用工具提出完整的规则草案：
  1. propose_allocation_change：指数下限、个股合计上限、单只个股默认上限、观察仓合计上限
  2. propose_rule_change：给他现在持有的每只标的各一条规则（指数类一般 open；个股用 band 并给出可加线和封仓线；想清仓或不再加的用 seal）
  3. propose_index_plan：每月定投（从他持有或提到的宽基指数里选）
  4. propose_creed：3–5 句信条，用他自己的话
  5. propose_motto：纪律页底部一句话
- 规则要保守、简单、能长期坚持。说明这是草案，他可以逐条勾选，以后也能随时改。
- 不推荐具体新股票，不预测涨跌。`;

const CHECKUP_PROMPT = "请给我的持仓做一次体检，按这几部分简要说：1) 结构：和目标比偏离多少；2) 集中度和重复暴露；3) 规则：有没有遗漏、矛盾、或和实际持仓对不上的；4) 最值得注意的 1–3 件事。需要的话可以查交易记录、日记或规则修改记录；有明显值得改的规则就提出建议。";
const ONBOARD_START = "我想请你帮我起草投资规则，我们开始吧。";

function buildSystem(contextText, { notes = "", mode = "chat" } = {}) {
  const parts = [SYSTEM_PROMPT];
  if (mode === "onboard") parts.push(`# 当前任务\n${ONBOARD_PROMPT}`);
  if (String(notes || "").trim()) parts.push(`# 顾问笔记（用户确认过、需要长期记住的信息）\n${String(notes).trim()}`);
  parts.push(`# 当前数据\n${contextText}`);
  return parts.join("\n\n");
}

// 从回答里取出 calm-proposals 代码块, 逐条校验, 附上「改前 → 改后」描述; 无效的丢掉
function extractProposals(text, plan) {
  const m = [...String(text || "").matchAll(/```calm-proposals\s*([\s\S]*?)```/g)].pop();
  if (!m) return [];
  let arr;
  try { arr = JSON.parse(m[1]); } catch { return []; }
  return validateProposals(Array.isArray(arr) ? arr : [arr], plan);
}

// 校验一组建议(模型给的、或页面回传要应用的), 附上「改前 → 改后」描述; 无效的、和现状一样的丢掉
function validateProposals(arr, plan) {
  const out = [];
  const rules = ((plan && plan.channels) || {}).symbols || {};
  for (const p of arr.slice(0, 50)) {
    if (out.length >= 12) break;   // 先过滤再计数: 无效的不占名额
    if (!p || typeof p !== "object") continue;
    const why = String(p.why || "").slice(0, 200);
    if (p.kind === "symbol") {
      const sym = String(p.symbol || "").trim().toUpperCase();
      if (!SYMBOL_RE.test(sym)) continue;
      const prev = rules[sym] || null;
      if (prev && !["open", "seal", "band"].includes(prev.type)) continue;
      const v = validateRule(p.rule === undefined ? null : p.rule);
      if (v.error) continue;
      const before = describeRule(prev), after = describeRule(v.rule);
      if (before === after) continue;
      out.push({ kind: "symbol", symbol: sym, rule: v.rule, why, summary: `${sym}：${before} → ${after}` });
    } else if (p.kind === "allocation") {
      const v = validateAllocation(p.change || p);
      if (v.error) continue;
      const cur = currentAllocation(plan || {});
      const parts = Object.entries(v.change).filter(([k, n]) => cur[k] !== n).map(([k, n]) => `${ALLOC_FIELDS[k]} ${cur[k] ?? "未设"}% → ${n}%`);
      if (!parts.length) continue;
      out.push({ kind: "allocation", change: v.change, why, summary: parts.join("；") });
    } else if (p.kind === "creed") {
      const v = validateCreed(p.lines);
      if (v.error) continue;
      const before = ((plan && plan.creed && plan.creed.lines) || []).join(" / ");
      if (before === v.lines.join(" / ")) continue;
      out.push({ kind: "creed", lines: v.lines, why, summary: `信条：${v.lines.join(" / ")}` });
    } else if (p.kind === "motto") {
      const t = String(p.text || "").trim().slice(0, 40);
      if (!t || (plan && plan.motto === t)) continue;
      out.push({ kind: "motto", text: t, why, summary: `页尾一句话：${t}` });
    } else if (p.kind === "indexPlan") {
      const v = validateIndexPlan(p.indexPlan || p);
      if (v.error) continue;
      const after = describeIndexPlan(v.indexPlan);
      if (describeIndexPlan(plan && plan.channels && plan.channels.indexPlan) === after) continue;
      out.push({ kind: "indexPlan", indexPlan: v.indexPlan, why, summary: `每月指数定投：${after}` });
    } else if (p.kind === "note") {
      const t = String(p.text || "").trim().replace(/\n+/g, " ").slice(0, 300);
      if (!t) continue;
      out.push({ kind: "note", text: t, why, summary: `记进顾问笔记：${t}` });
    }
  }
  return out;
}

module.exports = { SYSTEM_PROMPT, ONBOARD_PROMPT, CHECKUP_PROMPT, ONBOARD_START, buildSystem, extractProposals, validateProposals };
