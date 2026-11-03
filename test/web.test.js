// 浏览器版(web/): 打包产物 + 文件/路径替身的行为
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.join(__dirname, "..");

test("build-web: 生成静态站, 页面先加载 ulysses-web.js, 资源用相对路径(可放子路径)", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ulysses-web-"));
  try {
    execFileSync(process.execPath, [path.join(root, "scripts/build-web.mjs"), out], { stdio: "pipe" });
    for (const f of ["index.html", "m.html", "ulysses-web.js", "classify.js", "tailwind.css", "manifest.json", ".nojekyll"]) {
      assert.ok(fs.existsSync(path.join(out, f)), f);
    }
    for (const page of ["index.html", "m.html"]) {
      const html = fs.readFileSync(path.join(out, page), "utf8");
      const head = html.slice(html.search(/<head>/i));
      assert.match(head.split("\n")[1], /<script src="\.\/ulysses-web\.js\?v=\d+"><\/script>/, page);
      assert.doesNotMatch(html, /\s(?:src|href)="\/(?!\/)/, page + " 不能有根路径资源");
    }
    const mf = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    assert.equal(mf.start_url, "./m.html");
    assert.ok(mf.icons.every((i) => i.src.startsWith("./")));
    const bundle = fs.readFileSync(path.join(out, "ulysses-web.js"), "utf8");
    assert.ok(bundle.length < 600 * 1024, "打包体积异常: " + bundle.length);
    assert.doesNotMatch(bundle, /require\("(fs|http|https|ws|zlib|crypto)"\)/, "Node 模块必须换成浏览器替身");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("web path 替身: join / resolve / dirname / basename / extname", () => {
  const p = require("../web/shims/path.js");
  assert.equal(p.join("/data", "a", "..", "plan.json"), "/data/plan.json");
  assert.equal(p.resolve("/app", "data"), "/app/data");
  assert.equal(p.resolve("/app", "/data"), "/data");
  assert.equal(p.dirname("/data/plan.json"), "/data");
  assert.equal(p.basename("/data/plan.json", ".json"), "plan");
  assert.equal(p.extname("/a/b.tar.gz"), ".gz");
});

test("web fs 替身: 读写/追加/改名/复制/目录判断, 写入会通知存盘", async () => {
  delete require.cache[require.resolve("../web/shims/fs.js")];
  const f = require("../web/shims/fs.js");
  const writes = [];
  f.__onWrite((p, d) => writes.push([p, d]));
  f.writeFileSync("/data/a.json.tmp", "{}");
  f.renameSync("/data/a.json.tmp", "/data/a.json");
  assert.equal(f.readFileSync("/data/a.json", "utf8"), "{}");
  assert.equal(f.existsSync("/data/a.json.tmp"), false);
  assert.equal(f.existsSync("/data"), true);
  await f.promises.appendFile("/data/j.log", "1\n");
  await f.promises.appendFile("/data/j.log", "2\n");
  assert.equal(f.readFileSync("/data/j.log", "utf8"), "1\n2\n");
  f.copyFileSync("/data/a.json", "/data/b.json");
  assert.deepEqual(f.readdirSync("/data").sort(), ["a.json", "b.json", "j.log"]);
  assert.ok(f.statSync("/data/a.json").mtimeMs > 0);
  assert.throws(() => f.readFileSync("/data/none.json", "utf8"), { code: "ENOENT" });
  assert.deepEqual(writes.findLast(([p]) => p === "/data/a.json.tmp"), ["/data/a.json.tmp", null], "改名后旧文件要从存盘里删掉");
});
