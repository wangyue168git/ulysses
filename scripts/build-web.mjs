// 生成浏览器版(纯静态, 可放 GitHub Pages): node scripts/build-web.mjs [输出目录, 默认 site/]
// 页面和前端脚本原样复制, 只把绝对路径改成相对路径(可以放在子路径下), 并在 <head> 最前面加载 ulysses-web.js;
// ulysses-web.js = web/entry.js + 原样的 server.js + web/shims/(把 Node 的文件、网络、WebSocket 换成浏览器实现)。
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, process.argv[2] || "site");
const shim = (f) => path.join(root, "web/shims", f);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(root, "web/entry.js")],
  outfile: path.join(out, "ulysses-web.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "none",
  logLevel: "warning",
  inject: [shim("globals.js")],
  define: { __dirname: '"/app"', __filename: '"/app/server.js"', "process.env.NODE_ENV": '"production"' },
  alias: {
    fs: shim("fs.js"), path: shim("path.js"), http: shim("http.js"), https: shim("net.js"), ws: shim("ws.js"),
    zlib: shim("zlib.js"), crypto: shim("crypto.js"), dns: shim("dns.js"),
    "@anthropic-ai/sdk": shim("anthropic.js"), longport: shim("unsupported.js"),
  },
});

const STATIC = ["tailwind.css", "chart.umd.min.js", "classify.js", "csv-import.js", "ai-panel.js", "onboard.js", "i18n.js", "report.js", "share.js", "card.html",
  "favicon.ico", "apple-touch-icon.png", "icon-192.png", "icon-512.png"];
STATIC.forEach((f) => fs.copyFileSync(path.join(root, f), path.join(out, f)));

const v = String(fs.statSync(path.join(out, "ulysses-web.js")).mtimeMs | 0).slice(-8);
for (const page of ["index.html", "m.html"]) {
  let html = fs.readFileSync(path.join(root, page), "utf8");
  html = html.replace(/(\s(?:src|href))="\/(?!\/)/g, '$1="./');
  html = html.replace(/<head>/i, `<head>\n<script src="./ulysses-web.js?v=${v}"></script>`);
  fs.writeFileSync(path.join(out, page), html);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
manifest.start_url = "./m.html";
manifest.scope = "./";
manifest.icons.forEach((i) => { i.src = "." + i.src; });
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(out, ".nojekyll"), "");

const kb = (f) => (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + " KB";
console.log(`浏览器版已生成: ${path.relative(root, out)}/  (ulysses-web.js ${kb("ulysses-web.js")})`);
