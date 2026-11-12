"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateHome, applyHome } = require("../plan-edit");

test("validateHome: defaults, normalisation and rejects", () => {
  assert.deepEqual(validateHome({}).home, { hero: "auto", symbols: [], caption: "", blocks: [] });
  assert.deepEqual(validateHome({ hero: "shares", symbols: [" voo "], caption: " 一小块 ", blocks: ["dca", "dca", "nope", "targets"] }).home,
    { hero: "shares", symbols: ["VOO"], caption: "一小块", blocks: ["dca", "targets"] });
  assert.deepEqual(validateHome({ hero: "total", symbols: ["VOO"] }).home.symbols, []);   // 只有 shares 才带代码
  assert.ok(validateHome({ hero: "bad" }).error);
  assert.ok(validateHome({ hero: "shares" }).error);
  assert.ok(validateHome({ hero: "shares", symbols: ["<script>"] }).error);
  assert.ok(validateHome(null).error);
});

test("applyHome: writes home + creed, logs changes, allows clearing the creed, no-op when unchanged", () => {
  const plan = { creed: { lines: ["甲", "乙"] }, changelog: [] };
  const r = applyHome(plan, { hero: "none" }, ["买股票就是买公司", "", "慢就是快"]);
  assert.equal(r.changed, true);
  assert.equal(plan.home.hero, "none");
  assert.deepEqual(plan.creed.lines, ["买股票就是买公司", "慢就是快"]);
  const n = plan.changelog.length;
  assert.ok(n >= 2);
  assert.equal(applyHome(plan, { hero: "none" }, ["买股票就是买公司", "慢就是快"]).changed, false);
  assert.equal(plan.changelog.length, n);
  applyHome(plan, { hero: "none" }, []);
  assert.deepEqual(plan.creed.lines, []);
  assert.equal(applyHome(plan, { hero: "auto" }, undefined).changed, true);   // 不传信条 = 不动信条
  assert.deepEqual(plan.creed.lines, []);
});

const fs = require("node:fs");
const path = require("node:path");
const { login, request, startServer } = require("./helpers/server-harness");

test("首页设置接口: 需登录; 校验参数; 写入 data/plan.json 的 home 和 creed", async (t) => {
  const server = await startServer();
  t.after(() => server.stop());
  const put = (body, token) => request(server.baseUrl, "/api/plan/home", { method: "PUT", body, token });

  assert.equal((await put({ home: { hero: "none" } })).status, 401);
  const token = await login(server.baseUrl);
  assert.equal((await put({ home: { hero: "bad" } }, token)).status, 400);
  assert.equal((await put({ home: { hero: "shares" } }, token)).status, 400);

  const ok = await put({ home: { hero: "shares", symbols: ["voo"], caption: "五百家公司的一小块", blocks: ["structure"] }, creed: ["买股票就是买公司", "不预测市场", "慢就是快"] }, token);
  assert.equal(ok.status, 200);
  const saved = JSON.parse(fs.readFileSync(path.join(server.dir, "plan.json"), "utf8"));
  assert.deepEqual(saved.home, { hero: "shares", symbols: ["VOO"], caption: "五百家公司的一小块", blocks: ["structure"] });
  assert.deepEqual(saved.creed.lines, ["买股票就是买公司", "不预测市场", "慢就是快"]);
  assert.equal(saved._empty, undefined);

  const plan = await request(server.baseUrl, "/plan.json", { token });
  assert.equal(plan.json.home.hero, "shares");
});
