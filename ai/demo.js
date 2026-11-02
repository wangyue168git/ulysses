"use strict";
// AI 顾问体验版: 不调用任何模型, 回答是按模板生成的, 但数字都来自当前持仓, 工具也是真的在执行
// (查交易记录、推演规则改动、提建议), 所以建议卡片能真实确认写入。用于 DEMO=1 或 AI_PROVIDER=demo。
const { computeRows } = require("./context");
const { describeRule, currentAllocation } = require("../plan-edit");

// 纳指 / 标普的大权重成分股: 单独持有时有"重复暴露"
const MEGA = new Set(["AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "AVGO", "BRK.B"]);
const pct = (n) => `${(+n).toFixed(1)}%`;

function sleep(ms, signal) {
  return new Promise((ok, bad) => {
    const t = setTimeout(ok, ms);
    if (signal) signal.addEventListener("abort", () => { clearTimeout(t); bad(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
  });
}

function demoLoop(cfg, { system, messages, toolset, onText, onTool, signal }) {
  const deps = toolset.deps;
  const plan = deps.getPlan() || {};
  const { rows, stock, nasdaq, sp, observation } = computeRows(deps.getData(), plan, { anonymize: deps.anonymize !== false });
  const alloc = currentAllocation(plan);
  const last = String((messages[messages.length - 1] || {}).content || "");
  const userTurns = messages.filter((m) => m.role === "user").length;
  const onboarding = /# 当前任务/.test(system);
  const stocks = rows.filter((x) => x.isStock).sort((a, b) => b.weight - a.weight);
  const index = rows.filter((x) => x.bucket === "纳指指数类" || x.bucket === "标普");

  // 输出: 逐段打字(像真的模型一样流式), 能被页面中途停止
  const out = [];
  const say = (t) => out.push({ t });
  const call = (name, args) => out.push({ name, args });

  if (onboarding && userTurns <= 1) {
    say("好的，我们开始。先问两个问题：\n1. 这笔钱打算投多久？（3 年以内 / 3–10 年 / 10 年以上）\n2. 如果组合一度跌 25%，你会怎么做？（加仓 / 不动 / 想卖）\n\n（体验版：随便回答一句，我就会根据你现在的持仓起草一版规则。）");
  } else if (onboarding) {
    say("明白了。我按「长期、以指数为主、个股只做配角」的思路，结合你现在的持仓起草一版规则：");
    call("propose_allocation_change", { indexTargetPct: 70, stockCapPct: 25, singleCapPct: 8, observationCapPct: 5, why: "以指数为主，个股合计不超过四分之一" });
    index.slice(0, 3).forEach((x) => call("propose_rule_change", { symbol: x.symbol, rule: { type: "open" }, why: "宽基指数，长期定投" }));
    stocks.slice(0, 4).forEach((x) => call("propose_rule_change", x.weight < 5 && !(x.rule && x.rule.type === "band")
      ? { symbol: x.symbol, rule: { type: "seal" }, why: "小仓位观察，先不加" }
      : { symbol: x.symbol, rule: { type: "band", openBelowPct: 6, sealAtPct: 8 }, why: "单只个股不超过 8%" }));
    const idxSyms = index.map((x) => x.symbol).filter((s) => /^[A-Z]+$/.test(s)).slice(0, 2);
    if (idxSyms.length) call("propose_index_plan", { symbols: idxSyms, monthlyCNY: 3000, passCNY: 2000, why: "每月固定投入，买够 2000 就算完成" });
    call("propose_creed", { lines: ["指数是主角，个股是配角", "只按写下的规则买", "跌的时候不改规则"], why: "把这次的回答写成三句话" });
    call("propose_motto", { text: "慢慢来，比较快", why: "提醒自己别急" });
    say("以上是完整草案，每一条都可以单独取消勾选，确认后才会写入；以后也能随时改。");
  } else if (/体检/.test(last) || userTurns === 1 && /结构|集中|规则.*遗漏/.test(last)) {
    const top = stocks[0];
    if (top) call("get_transactions", { symbol: top.symbol });
    const idxPct = nasdaq + sp;
    const noRule = rows.filter((x) => !x.rule && x.isStock).map((x) => x.symbol);
    const lines = [`**结论：${idxPct >= (alloc.indexTargetPct || 0) ? "结构健康" : "指数占比偏低"}${top && MEGA.has(top.symbol) ? "，有一处重复暴露值得留意" : ""}。**`, "",
      "**1. 结构**",
      `- 指数合计 ${pct(idxPct)}（纳指 ${pct(nasdaq)} + 标普 ${pct(sp)}），目标下限 ${alloc.indexTargetPct ?? "未设"}%。`,
      `- 个股合计 ${pct(stock)}，上限 ${alloc.stockCapPct ?? "未设"}%。`];
    if (top) {
      lines.push("", "**2. 集中度和重复暴露**", `- 最大的个股是 **${top.symbol}**，占 ${pct(top.weight)}，规则是「${describeRule(top.rule)}」。`);
      if (MEGA.has(top.symbol) && index.length) lines.push(`- ${top.symbol} 本身也是纳指 / 标普的大权重成分股，你通过 ${index.map((x) => x.symbol).slice(0, 2).join("、")} 已经间接持有，实际暴露比 ${pct(top.weight)} 更高。`);
    }
    lines.push("", "**3. 规则**", noRule.length ? `- ${noRule.join("、")} 持有但没写规则，目前按默认封仓。只是观察的话可以明确写成「一直封仓」。` : "- 每只个股都写了规则。",
      `- 观察仓合计 ${pct(observation)}${alloc.observationCapPct ? `，上限 ${alloc.observationCapPct}%` : ""}。`);
    say(lines.join("\n"));
    if (top && top.rule && top.rule.type === "band" && MEGA.has(top.symbol) && top.rule.sealAtPct > 4) {
      const hi = top.rule.sealAtPct - 2, lo = Math.min(top.rule.openBelowPct, hi - 2);
      call("simulate_rules", { rules: [{ symbol: top.symbol, rule: { type: "band", openBelowPct: lo, sealAtPct: hi } }] });
      call("propose_rule_change", { symbol: top.symbol, rule: { type: "band", openBelowPct: lo, sealAtPct: hi, ...(top.rule.targetShares ? { targetShares: top.rule.targetShares } : {}) }, why: "已通过指数间接持有，单独仓位上限收紧一点" });
    }
    noRule.slice(0, 2).forEach((s) => call("propose_rule_change", { symbol: s, rule: { type: "seal" }, why: "目前只是观察，明确写成一直封仓" }));
  } else if (/收益|回撤|赚|亏/.test(last)) {
    call("get_performance", { range: "all" });
    say("（上面是看板按资产曲线算出来的：收益率已扣除期间新增的投入，回撤是曲线从高点回落的最大幅度。）\n\n体验版只演示到这里；配置真实模型后，它会结合这些数字和你的规则给出解读。");
  } else if (/规则|改|几次/.test(last)) {
    call("get_rule_history", { limit: 5 });
    say("这是最近的规则修改记录。配置真实模型后，它可以帮你看：是不是在大涨大跌之后改的、改得是否太频繁。");
  } else if (/为什么买|理由|日记/.test(last)) {
    const sym = (last.match(/[A-Z]{2,5}/) || [])[0] || (stocks[0] && stocks[0].symbol);
    if (sym) call("get_journal", { symbol: sym });
    say(`翻了 ${sym || ""} 的持仓日记。配置真实模型后，它会对照当初的理由，帮你看现在还成不成立。`);
  } else {
    say("这是**体验版**，回答是预置的，没有调用任何模型。可以试试：\n- 点「一键体检」\n- 点「起草规则」\n- 点「截图导入」随便选一张图\n- 问「今年收益和回撤怎么样」「我改过几次规则」「我为什么买 AAPL」\n\n配置真实模型（Claude、DeepSeek、通义、本地 Ollama 等）后就能自由提问，见文档 docs/ai.md。");
  }

  return (async () => {
    for (const step of out) {
      if (step.t) {
        for (let i = 0; i < step.t.length; i += 6) { onText(step.t.slice(i, i + 6)); await sleep(12, signal); }
        onText("\n\n");
      } else {
        onTool(step.name, step.args);
        const r = toolset.run(step.name, step.args);
        // 读数据的结果直接展示给体验者看(真实模型会自己读、再用文字解读)
        if (!step.name.startsWith("propose_") && !r.isError && step.name !== "get_transactions" && step.name !== "simulate_rules") {
          onText("```\n" + JSON.stringify(JSON.parse(r.content), null, 1).slice(0, 800) + "\n```\n\n");
        }
        await sleep(150, signal);
      }
    }
    return { stopReason: "end_turn" };
  })();
}

// 截图导入的体验: 不看图, 按现有持仓编一份"识别结果"(一只更新 + 一只新增 + 一行看不清的)
function demoVisionRows(data) {
  const hs = ((data && data.accounts) || []).flatMap((a) => a.holdings || []);
  const top = hs.filter((h) => /^[A-Z]{1,5}$/.test(h.symbol || "")).sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))[0];
  const rows = [];
  if (top) rows.push({ symbol: top.symbol, name: top.name || top.symbol, qty: +(top.shares + 3).toFixed(4), cost: +((top.costPrice || 100) * 1.02).toFixed(2) });
  const fresh = ["NVDA", "META", "AMZN"].find((s) => !hs.some((h) => h.symbol === s)) || "NVDA";
  rows.push({ symbol: fresh, name: { NVDA: "英伟达", META: "Meta", AMZN: "亚马逊" }[fresh], qty: 3, cost: 120 });
  rows.push({ symbol: "", name: "（体验版：这一行模拟「看不清」，可以删掉）", qty: null, cost: null });
  return rows;
}

module.exports = { demoLoop, demoVisionRows };
