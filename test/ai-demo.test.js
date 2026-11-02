"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { login, request, startServer } = require("./helpers/server-harness");

async function sse(server, token, body) {
  const res = await fetch(`${server.baseUrl}/api/ai/chat`, { method: "POST", headers: { "Content-Type": "application/json", "X-Auth-Token": token }, body: JSON.stringify(body) });
  const text = await res.text();
  const ev = [...text.matchAll(/event: (\w+)\ndata: (.*)\n/g)].map((m) => [m[1], JSON.parse(m[2])]);
  return { text: ev.filter(([e]) => e === "delta").map(([, d]) => d.t).join(""), tools: ev.filter(([e]) => e === "tool").map(([, d]) => d.name), done: (ev.find(([e]) => e === "done") || [])[1] };
}

test("体验版: DEMO=1 且没配模型时自动开启; 体检/起草规则/截图导入都能走通, 数字来自当前持仓", async (t) => {
  const server = await startServer({ extraEnv: { DEMO: "1" } });
  t.after(() => server.stop());
  const token = await login(server.baseUrl);
  const cfg = (await request(server.baseUrl, "/api/ai/config", { token })).json;
  assert.deepEqual([cfg.enabled, cfg.demo, cfg.model], [true, true, "体验版"]);

  const c = await sse(server, token, { messages: [{ role: "user", content: cfg.checkupPrompt }] });
  assert.match(c.text, /指数合计 \d+\.\d%/);
  assert.match(c.text, /TSLA/);                       // 测试持仓里最大的个股
  assert.ok(c.tools.includes("get_transactions"));
  assert.ok(c.done.proposals.length >= 1, "没写规则的个股会建议写成一直封仓");

  const o1 = await sse(server, token, { mode: "onboard", messages: [{ role: "user", content: cfg.onboardPrompt }] });
  assert.match(o1.text, /投多久/);
  const o2 = await sse(server, token, { mode: "onboard", messages: [{ role: "user", content: cfg.onboardPrompt }, { role: "assistant", content: o1.text }, { role: "user", content: "十年以上, 不动" }] });
  const kinds = o2.done.proposals.map((p) => p.kind);
  assert.ok(["allocation", "creed", "motto"].every((k) => kinds.includes(k)), kinds.join(","));
  const ap = (await request(server.baseUrl, "/api/ai/apply", { method: "POST", token, body: { proposals: o2.done.proposals } })).json;
  assert.equal(ap.ok, true);

  const free = await sse(server, token, { messages: [{ role: "user", content: "你好" }] });
  assert.match(free.text, /体验版/);

  const v = (await request(server.baseUrl, "/api/ai/vision-import", { method: "POST", token, body: { images: [{ mediaType: "image/jpeg", data: "AAAA" }] } })).json;
  assert.equal(v.ok, true);
  assert.equal(v.rows[0].symbol, "TSLA");
  assert.equal(v.rows.length, 3);
});

test("体验版: 配了真实模型时不会被体验版覆盖", async (t) => {
  const server = await startServer({ extraEnv: { DEMO: "1", AI_PROVIDER: "mock", AI_MOCK_REPLY: "真实" } });
  t.after(() => server.stop());
  const token = await login(server.baseUrl);
  assert.equal((await request(server.baseUrl, "/api/ai/config", { token })).json.demo, false);
});
