// 浏览器版的 path(只需要 POSIX 的几个函数)
function normalize(p) {
  const abs = p.startsWith("/");
  const out = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop(); else out.push(part);
  }
  return (abs ? "/" : "") + out.join("/") || (abs ? "/" : ".");
}
const join = (...a) => normalize(a.filter((x) => x !== "").join("/"));
function resolve(...a) {
  let p = "";
  for (let i = a.length - 1; i >= 0 && !p.startsWith("/"); i--) p = a[i] + (p ? "/" + p : "");
  if (!p.startsWith("/")) p = "/" + p;
  return normalize(p);
}
const basename = (p, ext) => { const b = normalize(p).split("/").pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; };
const dirname = (p) => { const n = normalize(p); const i = n.lastIndexOf("/"); return i <= 0 ? (n.startsWith("/") ? "/" : ".") : n.slice(0, i); };
const extname = (p) => { const b = basename(p); const i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; };
const path = { sep: "/", delimiter: ":", normalize, join, resolve, basename, dirname, extname, isAbsolute: (p) => p.startsWith("/") };
path.posix = path;
module.exports = path;
