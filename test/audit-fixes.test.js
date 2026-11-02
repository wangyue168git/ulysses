"use strict";
// 2026-11 独立审查发现的问题的回归测试
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { applyConfirms, applyPositions } = require("../brokers/core");
const { createLongbridgeAdapter } = require("../brokers/longbridge");
const { validateProposals } = require("../ai/prompts");
const { createNotesStore } = require("../ai/notes");
const { createPendingStore } = require("../ai/pending");
const { applyAllocation, validateAllocation } = require("../plan-edit");
const { buildAiContext } = require("../ai/context");
const { login, request, startServer } = require("./helpers/server-harness");

const appendTrade = (h, t) => {
  const tx = [...(h.transactions || []), t];
  let shares = h.shares || 0, cost = h.costPrice || 0;
  if (t.type === "sync") { shares = t.shares; cost = t.price; } else if (t.type === "buy") { cost = (shares * cost + t.shares * t.price) / (shares + t.shares); shares += t.shares; } else shares -= t.shares;
  return { ...h, shares, costPrice: cost, transactions: tx };
};

test("券商成交: 页面手记(只有日期, 落在当天 0 点)的同方向同数量交易不会被重复记", () => {
  const pf = { accounts: [{ name: "IB", holdings: [{ symbol: "AAPL", shares: 15, costPrice: 180, transactions: [{ type: "buy", shares: 5, price: 190, date: "2026-10-30T00:00:00.000Z" }] }] }] };
  const r = applyConfirms(pf, { confirmsBaseline: true, seen: [] }, [{ id: "t1", symbol: "AAPL", side: "buy", qty: 5, price: 190.2, date: new Date("2026-10-30T15:30:00Z") }], { accountName: "IB", appendTrade });
  assert.equal(r.actions[0].kind, "skip-manual");
  assert.equal(r.portfolio.accounts[0].holdings[0].shares, 15);
});

test("券商同步: 账户还没建时不吞数据, 建好后下次能补上; 状态里能看到原因", () => {
  const pf0 = { accounts: [{ name: "长桥", holdings: [] }] };
  const c = [{ id: "t9", symbol: "00700", side: "buy", qty: 100, price: 380, date: new Date(), account: "长桥港股" }];
  const r1 = applyConfirms(pf0, { confirmsBaseline: true, seen: [] }, c, { accountName: "长桥", appendTrade });
  assert.equal(r1.actions[0].kind, "error");
  assert.equal(r1.state.seen.includes("t9"), false);
  const pf1 = { accounts: [...pf0.accounts, { name: "长桥港股", holdings: [] }] };
  const r2 = applyConfirms(pf1, r1.state, c, { accountName: "长桥", appendTrade });
  assert.equal(r2.portfolio.accounts[1].holdings[0].shares, 100);
  const pos = [{ key: "k", symbol: "00700", qty: 100, cost: 380, account: "长桥港股" }];
  const p1 = applyPositions(pf0, { positions: {} }, pos, { accountName: "长桥", appendTrade });
  assert.equal(p1.state.positions.k, undefined, "没写进去的不进快照");
  assert.equal(applyPositions(pf0, { positions: {} }, [{ symbol: "<img>", qty: 1, cost: 1 }], { accountName: "长桥", appendTrade }).actions[0].msg, "代码不合规, 已跳过");
});

test("长桥: 同一只股票在两个子账户里, 合并数量、加权成本", async () => {
  const D = (n) => ({ toString: () => String(n) });
  const sdk = { Config: { fromApikey: () => ({}) }, TradeContext: { new: async () => ({ stockPositions: async () => ({ channels: [
    { accountChannel: "a", positions: [{ symbol: "AAPL.US", quantity: D(12), costPrice: D(100) }] },
    { accountChannel: "b", positions: [{ symbol: "AAPL.US", quantity: D(5), costPrice: D(117) }] },
  ] }) }) } };
  const { positions } = await createLongbridgeAdapter({ appKey: "k", appSecret: "s", accessToken: "t", loadSdk: () => sdk }).fetchPositions();
  assert.equal(positions.length, 1);
  assert.equal(positions[0].qty, 17);
  assert.equal(positions[0].cost, 105);
});

test("AI 建议: 超过 5 条也能全部确认(先过滤再计数, 上限 12)", () => {
  const plan = { channels: { symbols: {} } };
  const list = Array.from({ length: 9 }, (_, i) => ({ kind: "symbol", symbol: `S${i}`, rule: { type: "seal" } }));
  assert.equal(validateProposals(list, plan).length, 9);
});

test("顾问笔记: 满了删最旧的, 新确认的一定写进去", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "notes-")), "n.md");
  const store = createNotesStore(f);
  store.write(Array.from({ length: 300 }, (_, i) => `- 第 ${i} 条笔记内容, 写得长一点凑满上限`).join("\n"));
  const t = store.append("最新的一条");
  assert.match(t, /最新的一条/);
  assert.ok(t.length <= store.MAX);
  assert.doesNotMatch(t, /第 0 条/);
});

test("冷静期: 写入失败的留在队列里并记下原因", () => {
  const store = createPendingStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pend-")), "p.json"));
  store.add({ proposals: [{ kind: "symbol" }], reason: "", hours: 0, now: new Date(Date.now() - 1000) });
  const r = store.processDue(() => { throw new Error("磁盘满"); });
  assert.equal(r[0].error, "磁盘满");
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].lastError, "磁盘满");
  store.processDue(() => []);
  assert.equal(store.list().length, 0);
});

test("结构目标: 0 不再接受; 两个个股上限字段不一致时会同步", () => {
  assert.match(validateAllocation({ stockCapPct: 0 }).error, /1–100/);
  const plan = { targetAllocation: { stockCapPct: 30 }, channels: { stockBucketCapPct: 40 } };
  applyAllocation(plan, { stockCapPct: 30 });
  assert.equal(plan.channels.stockBucketCapPct, 30);
});

test("只发比例: 自动生成的规则说明、修改记录、定投金额里的数字都隐去", () => {
  const data = { rateInfo: { USD_CNY: 7 }, accounts: [{ name: "IB", currency: "USD", cash: 0, holdings: [{ symbol: "GOOGL", name: "谷歌", market: "nasdaq", shares: 20, costPrice: 150, currentPrice: 200, marketValue: 4000 }] }] };
  const plan = { channels: { symbols: { GOOGL: { type: "band", openBelowPct: 13, sealAtPct: 15, targetShares: 50, why: "13% 以下可加，15% 封仓；目标 50 股" } } },
    changelog: [{ version: "v", changes: ["GOOGL：… → 13% 以下可加、15% 封仓、目标 50 股", "每月指数定投：QQQM 每月 ¥5000（买够 ¥3000 算完成）"], reason: "想买够 50 股，成本 150" }] };
  const t = buildAiContext(data, plan).text;
  assert.doesNotMatch(t, /50 股|¥5000|¥3000/);
});

test("接口: 请求体不是对象时返回 400 而不是让进程退出; accountIndex 不合法拒绝; 账户名对不上拒绝", async (t) => {
  const server = await startServer({ extraEnv: { AI_PROVIDER: "mock", AI_MOCK_REPLY: "好" } });
  t.after(() => server.stop());
  const token = await login(server.baseUrl);
  const raw = (p, body) => fetch(server.baseUrl + p, { method: p === "/api/plan/symbol" ? "PUT" : "POST", headers: { "Content-Type": "application/json", "X-Auth-Token": token }, body });
  for (const p of ["/api/ai/apply", "/api/ai/context", "/api/ai/vision-import", "/api/plan/symbol"]) assert.equal((await raw(p, "null")).status, 400, p);
  assert.equal((await request(server.baseUrl, "/api/ai/config", { token })).status, 200, "进程还活着");
  assert.equal((await request(server.baseUrl, "/api/import/positions", { method: "POST", token, body: { accountIndex: "__proto__", rows: [{ symbol: "A", qty: 1, cost: 1 }] } })).status, 400);
  assert.equal([].holdings, undefined);
  assert.equal((await request(server.baseUrl, "/api/import/positions", { method: "POST", token, body: { accountIndex: 0, accountName: "别的账户", rows: [{ symbol: "A", qty: 1, cost: 1 }] } })).status, 409);
  const ok = await request(server.baseUrl, "/api/import/positions", { method: "POST", token, body: { accountIndex: 0, rows: [{ symbol: "NEW1", name: "<img src=x onerror=alert(1)>", qty: 1, cost: 1 }], apply: true } });
  assert.equal(ok.status, 200);
  const pf = (await request(server.baseUrl, "/api/portfolio", { token })).json;
  assert.equal(pf.accounts[0].holdings.find((h) => h.symbol === "NEW1").name, "img src=x onerror=alert(1)", "名称里的尖括号被去掉");
});
