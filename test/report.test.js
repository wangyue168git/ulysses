// 纪律成绩单 / 年度回顾的计算
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../report");

const d = (s) => new Date(s + "T12:00:00Z");
const tx = (type, shares, price, date) => ({ type, shares, price, date: d(date).toISOString() });
// 美元账户: VOO 每月定投(第一条 sync 是建账底数), 1 月和 3 月漏投; AAPL 有规则, TSLA 没写规则就买了
function fixture() {
  const vooTx = [tx("sync", 10, 400, "2026-01-02")];
  let sh = 10;
  ["2026-02-10", "2026-04-10", "2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10", "2026-10-10"].forEach((dt) => { sh += 1; vooTx.push(tx("sync", sh, 500, dt)); });
  return {
    state: {
      exchangeRate: { USD_CNY: 7 },
      accounts: [{ name: "IB", currency: "USD", cash: 0, holdings: [
        { symbol: "VOO", market: "nyse", shares: sh, currentPrice: 600, marketValue: sh * 600, transactions: vooTx },
        { symbol: "AAPL", market: "nasdaq", shares: 3, currentPrice: 200, marketValue: 600, transactions: [tx("buy", 3, 180, "2026-03-05")] },
        { symbol: "TSLA", market: "nasdaq", shares: 1, currentPrice: 300, marketValue: 300, transactions: [tx("buy", 1, 250, "2026-06-20")] },
      ] }],
    },
    plan: {
      targetAllocation: { indexTargetPct: 60, stockCapPct: 40 },
      channels: { indexPlan: { symbols: ["VOO", "QQQM"], monthlyCNY: 3000, passCNY: 3000 }, symbols: { AAPL: { type: "band", openBelowPct: 5, sealAtPct: 8 } } },
      changelog: [
        { version: "v1", changes: ["初始规则"] },
        { version: "页面-2026-05-01", date: "2026-05-01T08:00:00Z", changes: ["AAPL 看占比"], reason: "想长期持有苹果" },
        { version: "页面-2026-09-15", date: "2026-09-15T08:00:00Z", changes: ["AAPL 上限 8%"], reason: "收紧个股" },
      ],
    },
  };
}

test("tradeEvents: 第一条 sync 是底数不算买入; sync 增量、buy/sell 都算; 金额按汇率折人民币", () => {
  const { state } = fixture();
  const ev = R.tradeEvents(state);
  assert.equal(ev.filter((e) => e.symbol === "VOO").length, 8);
  const feb = ev.find((e) => e.symbol === "VOO");
  assert.equal(feb.side, "buy");
  assert.equal(Math.round(feb.cny), 1 * 500 * 7);
});

test("dcaMonths: 当月未完成不计入; 漏投的月份不算完成; 最长连续", () => {
  const { state, plan } = fixture();
  const r = R.dcaMonths(R.tradeEvents(state), plan, d("2026-01-01"), d("2026-11-03"), d("2026-11-03"));
  assert.equal(r.total, 10);                // 1–10 月, 11 月还没过完且没投
  assert.equal(r.done, 8);                  // 1 月、3 月漏了
  assert.equal(r.bestStreak, 7);            // 4–10 月
  assert.equal(R.dcaMonths([], {}, d("2026-01-01"), d("2026-02-01")), null, "没写定投计划就不算这一项");
});

test("scorecard: 各项分数、总等级、距上次没写规则就买入的天数; 不含任何金额", () => {
  const { state, plan } = fixture();
  const c = R.scorecard(state, plan, { now: d("2026-11-03") });
  const by = Object.fromEntries(c.parts.map((p) => [p.key, p]));
  assert.equal(by.dca.value, "8/9 个月");      // 从第一笔真实买入(2 月)算起, 3 月漏投
  assert.equal(by.rules.value, "90%");      // 10 次买入里 TSLA 那次没写规则
  assert.match(by.structure.value, /^\d+%（目标 ≥60%）$/);
  assert.equal(by.calm.value, "1 次");      // 近 90 天只有 9/15 一次
  assert.ok(c.score >= 0 && c.score <= 100);
  assert.ok(["A+", "A", "B", "C", "D", "F"].includes(c.grade));
  assert.equal(c.streakDays, 136);          // 6/20 → 11/03
  assert.doesNotMatch(JSON.stringify(c), /¥|\$|cny/i, "成绩单里不能有金额");
});

test("yearCurve: 时间加权收益扣掉期间投入, 最大回撤和最低点日期", () => {
  const h = [
    { t: "2026-01-01T00:00:00Z", v: 100, c: 100, r: 0 },
    { t: "2026-02-01T00:00:00Z", v: 220, c: 200, r: 0 },   // 投入 100, 涨 20
    { t: "2026-03-01T00:00:00Z", v: 198, c: 200, r: 0 },   // 跌 22
    { t: "2026-04-01T00:00:00Z", v: 230, c: 200, r: 0 },
  ];
  const c = R.yearCurve(h, new Date("2026-01-01T00:00:00Z"), d("2026-12-31"));
  assert.equal(c.trough.toISOString().slice(0, 10), "2026-03-01");
  assert.ok(c.maxDrawdownPct < -9 && c.maxDrawdownPct > -11, String(c.maxDrawdownPct));
  assert.ok(Math.abs(c.returnPct - 25.45) < 0.1, "投入的 100 不能算成收益: " + c.returnPct);   // 1.2 × 0.9 × 1.1616
});

test("yearReview: 回撤最深那几天做了什么、交易次数、规则修改理由", () => {
  const { state, plan } = fixture();
  const history = [
    { t: "2026-01-02T00:00:00Z", v: 28000, c: 28000, r: 0 },
    { t: "2026-06-19T00:00:00Z", v: 30000, c: 40000, r: 0 },   // 6 月深跌, 6/20 买了 TSLA
    { t: "2026-10-30T00:00:00Z", v: 70000, c: 60000, r: 0 },
  ];
  const y = R.yearReview(state, plan, history, 2026, { now: d("2026-11-03") });
  assert.equal(y.partial, true);
  assert.equal(y.troughAction, "bought");
  assert.equal(y.trades.buys, 10);
  assert.equal(y.trades.topSymbol, "VOO");
  assert.equal(y.rules.count, 2);
  assert.deepEqual(y.rules.reasons.map((r) => r.reason), ["想长期持有苹果", "收紧个股"]);
  assert.equal(y.dca.done, 8);
});

test("分享编码: 往返一致; 篡改或超长的链接一律拒绝", () => {
  const p = { kind: "card", grade: "A", title: "纪律成绩", streakDays: 120, items: [["定投完成", "11/12 个月"], ["买入有规则", "96%"]] };
  const back = R.decodeShare(R.encodeShare(p));
  assert.deepEqual(back, { kind: "card", grade: "A", year: null, title: "纪律成绩", streakDays: 120, items: p.items });
  assert.equal(R.decodeShare("not base64!"), null);
  assert.equal(R.decodeShare(Buffer.from(JSON.stringify({ v: 1, k: "card", g: "S", i: [] })).toString("base64url")), null);
  assert.equal(R.decodeShare("a".repeat(4000)), null);
});

test("buyAdvice: 先补指数定投, 再补可加的个股(到封仓线下、不超目标股数), 剩下回到指数; 封仓的一分不给", () => {
  const state = {
    exchangeRate: { USD_CNY: 7 },
    accounts: [
      { name: "IB", currency: "USD", cash: 0, holdings: [
        { symbol: "VOO", market: "nyse", shares: 20, currentPrice: 500, marketValue: 10000, transactions: [] },
        { symbol: "AAPL", market: "nasdaq", shares: 5, currentPrice: 200, marketValue: 1000, transactions: [] },
        { symbol: "TSLA", market: "nasdaq", shares: 4, currentPrice: 250, marketValue: 1000, transactions: [] },
      ] },
      { name: "A股", currency: "CNY", cash: 0, holdings: [{ symbol: "510300", market: "sh", shares: 1000, currentPrice: 4, marketValue: 4000, transactions: [] }] },
    ],
  };
  const plan = {
    targetAllocation: { indexTargetPct: 60, stockCapPct: 30 },
    channels: { indexPlan: { symbols: ["VOO", "510300"], monthlyCNY: 3000 }, symbols: {
      VOO: { type: "open" }, AAPL: { type: "band", openBelowPct: 13, sealAtPct: 15, targetShares: 8 }, TSLA: { type: "seal" }, "510300": { type: "open" } } },
  };
  const r = R.buyAdvice(state, plan, 10000, { now: d("2026-11-03") });
  const by = Object.fromEntries(r.rows.map((x) => [x.symbol, x]));
  assert.equal(by.TSLA, undefined, "封仓的不给");
  assert.match(by.VOO.reasons[0], /每月指数定投/);
  assert.equal(by.AAPL.shares, 3, "目标 8 股, 已有 5 股 → 最多 3 股");
  assert.equal(by["510300"].shares % 100, 0, "A 股按手取整");
  const spent = r.rows.reduce((a, x) => a + x.amountCNY, 0);
  assert.ok(Math.abs(spent + r.leftoverCNY - 10000) < 1, "分出去的 + 剩下的 = 预算");

  plan.channels.symbols = { VOO: { type: "seal" }, AAPL: { type: "seal" }, TSLA: { type: "seal" }, "510300": { type: "seal" } };
  const none = R.buyAdvice(state, plan, 5000, { now: d("2026-11-03") });
  assert.equal(none.rows.length, 0);
  assert.equal(Math.round(none.leftoverCNY), 5000);
  assert.ok(none.notes.some((n) => /留作现金/.test(n)));
});
