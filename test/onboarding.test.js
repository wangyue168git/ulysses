"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { login, request, startServer } = require("./helpers/server-harness");

test("还没写规则: /plan.json 是空规则(不带示例的定投和个股规则); 第一次在页面上设规则后变成真正的规则", async (t) => {
  const server = await startServer();
  t.after(() => server.stop());
  const token = await login(server.baseUrl);
  const p = (await request(server.baseUrl, "/plan.json", { token })).json;
  assert.equal(p._empty, true);
  assert.equal(p.channels.indexPlan, undefined);
  assert.deepEqual(p.channels.symbols, {});
  assert.equal(p.targetAllocation, undefined);
  assert.equal((await request(server.baseUrl, "/api/plan/symbol", { method: "PUT", token, body: { symbol: "TSLA", rule: { type: "seal" } } })).status, 200);
  const saved = JSON.parse(fs.readFileSync(path.join(server.dir, "plan.json"), "utf8"));
  assert.equal(saved._empty, undefined);
  assert.equal((await request(server.baseUrl, "/plan.json", { token })).json._empty, undefined);
});
