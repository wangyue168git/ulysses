// 浏览器版的 fs: 文件放在内存里, 改动后自动存进 IndexedDB(见 web/store.js)。
// 只实现后端用到的同步/Promise 接口; 路径都是绝对路径(DATA_DIR=/data, 仓库文件在 /app)。
const files = new Map();     // path -> { data: string, mtimeMs }
let onWrite = () => {};

const norm = (p) => String(p).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
const enoent = (p) => Object.assign(new Error(`ENOENT: no such file or directory, '${p}'`), { code: "ENOENT" });
const toStr = (d) => (typeof d === "string" ? d : d && d.buffer ? new TextDecoder().decode(d) : String(d));

function put(p, data) {
  p = norm(p);
  files.set(p, { data, mtimeMs: Date.now() });
  onWrite(p, data);
}
function del(p) {
  p = norm(p);
  if (files.delete(p)) onWrite(p, null);
}

const fs = {
  // 供 web/entry.js 使用
  __seed(p, data) { files.set(norm(p), { data, mtimeMs: Date.now() }); },
  __onWrite(fn) { onWrite = fn; },
  __files: files,

  existsSync: (p) => files.has(norm(p)) || [...files.keys()].some((k) => k.startsWith(norm(p) + "/")),
  mkdirSync() {},
  readFileSync(p, enc) {
    const f = files.get(norm(p));
    if (!f) throw enoent(p);
    return enc ? f.data : new TextEncoder().encode(f.data);
  },
  writeFileSync(p, data) { put(p, toStr(data)); },
  appendFileSync(p, data) { const f = files.get(norm(p)); put(p, (f ? f.data : "") + toStr(data)); },
  renameSync(a, b) {
    const f = files.get(norm(a));
    if (!f) throw enoent(a);
    files.delete(norm(a)); onWrite(norm(a), null);
    put(b, f.data);
  },
  copyFileSync(a, b) {
    const f = files.get(norm(a));
    if (!f) throw enoent(a);
    put(b, f.data);
  },
  unlinkSync(p) { if (!files.has(norm(p))) throw enoent(p); del(p); },
  statSync(p) {
    const f = files.get(norm(p));
    if (!f) throw enoent(p);
    return { mtimeMs: f.mtimeMs, size: f.data.length, isFile: () => true, isDirectory: () => false };
  },
  readdirSync(dir) {
    const d = norm(dir) + "/";
    return [...new Set([...files.keys()].filter((k) => k.startsWith(d)).map((k) => k.slice(d.length).split("/")[0]))];
  },
};
fs.promises = {
  writeFile: async (p, d) => fs.writeFileSync(p, d),
  appendFile: async (p, d) => fs.appendFileSync(p, d),
  rename: async (a, b) => fs.renameSync(a, b),
  readFile: async (p, enc) => fs.readFileSync(p, enc),
  unlink: async (p) => fs.unlinkSync(p),
  mkdir: async () => {},
};

module.exports = fs;
