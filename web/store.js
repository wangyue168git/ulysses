// 浏览器版的数据: 每个数据文件(/data/portfolio.json 等)是 IndexedDB 里的一条记录。
// 后端写文件时先改内存, 这里攒 400ms 再批量存盘; 关页面前再存一次。
const DB = "ulysses-web", STORE = "files";
let dbp = null;
const pending = new Map();   // path -> data(null 表示删除)
let timer = null;
let frozen = false;   // 换数据后到页面刷新前, 不再把内存里的旧数据写回去

function open() {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error); });

export async function loadAll() {
  const db = await open();
  const tx = db.transaction(STORE, "readonly");
  const st = tx.objectStore(STORE);
  const [keys, vals] = await Promise.all([st.getAllKeys(), st.getAll()].map((r) => new Promise((ok, bad) => { r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); })));
  const out = {};
  keys.forEach((k, i) => { out[k] = vals[i]; });
  return out;
}

export function schedule(path, data) {
  if (frozen) return;
  pending.set(path, data);
  clearTimeout(timer);
  timer = setTimeout(() => { flush().catch((e) => console.error("[ulysses] 本地保存失败:", e)); }, 400);
}

export async function flush() {
  clearTimeout(timer);
  if (frozen || !pending.size) return;
  const batch = [...pending]; pending.clear();
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  const st = tx.objectStore(STORE);
  batch.forEach(([p, d]) => (d == null ? st.delete(p) : st.put(d, p)));
  await done(tx);
}

export async function replaceAll(files) {
  frozen = true; pending.clear(); clearTimeout(timer);
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  const st = tx.objectStore(STORE);
  st.clear();
  Object.entries(files).forEach(([p, d]) => { if (typeof d === "string" && p.startsWith("/data/")) st.put(d, p); });
  await done(tx);
}

addEventListener("pagehide", () => { flush().catch(() => {}); });
addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush().catch(() => {}); });
