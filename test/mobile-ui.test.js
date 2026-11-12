"use strict";

// 安静版(quiet 分支)的页面约定: 首页没有价格和金额, 金额默认隐藏, 修改入口收在手机端「⋯」里, 电脑端只看不改。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mobile = fs.readFileSync(path.join(__dirname, "..", "m.html"), "utf8");
const desktop = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("mobile: add-holding and other rare actions live in the holdings more-menu, no floating button", () => {
  const start = mobile.indexOf('<section id="pageHoldings"');
  const end = mobile.indexOf("</section>", start);
  const btn = mobile.indexOf('id="moreBtn"');
  assert.ok(start >= 0 && btn > start && btn < end);
  assert.ok(!mobile.includes("addHoldingFab"));
  for (const a of ["add", "advice", "score", "year", "home", "theme"]) assert.ok(mobile.includes(`data-a="${a}"`), `menu item ${a}`);
});

test("mobile: two tabs only, home is the default page and holds no price or amount markup", () => {
  assert.match(mobile, /<section id="pageDiscipline" class="page active/);
  assert.ok(!mobile.includes('id="tabAssetsBtn"'));
  const start = mobile.indexOf('<section id="pageDiscipline"');
  const home = mobile.slice(start, mobile.indexOf("</section>", start));
  assert.ok(!/blur-amt|totalBig|pnl/i.test(home));
});

test("mobile: amounts start hidden on every load and the P&L peek is blocked while hidden", () => {
  assert.match(mobile, /let masked = true;/);
  assert.ok(!mobile.includes("localStorage.setItem('mMask'"));
  const peek = mobile.slice(mobile.indexOf("function peekPnl()"), mobile.indexOf("function unpeekPnl()"));
  assert.match(peek, /if \(masked\) return;/);
});

test("mobile: home hero and creed come from plan.json (home / creed.lines), nothing is hard-coded", () => {
  assert.match(mobile, /const home = planDoc\.home \|\| \{\};/);
  assert.match(mobile, /planDoc\.creed\.lines/);
  assert.match(mobile, /fetch\('\/api\/plan\/home', \{ method: 'PUT'/);
});

test("desktop: read-only — no write requests, no edit entry points", () => {
  assert.ok(!/method:\s*'(PUT|DELETE)'/.test(desktop));
  const posts = desktop.match(/fetch\('[^']+', \{ method: 'POST'/g) || [];
  assert.deepEqual(posts, ["fetch('/api/auth', { method: 'POST'"]);   // 只有登录
  for (const gone of ["showAddHolding", "submitEdit", "deleteHolding", "showEditCash"]) assert.ok(!desktop.includes(gone), gone);
  assert.match(desktop, /const home = planDoc\.home \|\| \{\};/);
});
