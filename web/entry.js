// 尤利西斯浏览器版: 把后端 server.js 原样跑在页面里。
// - 数据存在这个浏览器的 IndexedDB, 不上传任何地方
// - 页面里的 fetch('/api/...')、fetch('/plan.json')、new WebSocket(...) 都转给页面内的后端
// - 行情直接从浏览器请求(东方财富 / 腾讯 / 汇率 / 加密货币接口都允许跨域)
// 不支持: 券商自动同步、真实 AI 模型(需要服务器保管密钥); 场外基金净值、上交所 IOPV 取不到(接口不允许跨域)
import { Buffer } from "buffer";
import { EventEmitter } from "events";
import * as store from "./store.js";
import { mountBadge } from "./badge.js";
import portfolioExample from "../examples/portfolio.example.json";
import planDemo from "../examples/plan.demo.json";
import planExample from "../plan.example.json";

const fs = require("fs");
const http = require("http");
const wsMod = require("ws");

const MODE_KEY = "ulyssesWebMode";   // "demo"(默认, 首次打开载入演示数据) | "mine"(从空白开始)
const mode = (() => { try { return localStorage.getItem(MODE_KEY) || "demo"; } catch (e) { return "demo"; } })();

// 手机打开电脑版首页时换到手机页(服务器版是按 UA 分流, 静态托管只能在这里做)
(function routeByDevice() {
  const mobile = /iPhone|iPod|Android.*Mobile|Mobile Safari|Windows Phone/i.test(navigator.userAgent);
  const p = location.pathname;
  if (mobile && (p.endsWith("/") || p.endsWith("/index.html")) && !/[?&]desktop=1/.test(location.search)) {
    location.replace(p.replace(/(index\.html)?$/, "m.html") + location.search + location.hash);
  }
})();

// 单人本地使用, 不需要登录: 预置一个令牌, 页面就不会弹登录框
try { if (!localStorage.getItem("authToken")) localStorage.setItem("authToken", "local"); } catch (e) {}
// 静态托管不用 Service Worker(避免缓存旧版打包)
try { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve(); } catch (e) {}

// ---- 启动页面内的后端 ----
let resolveReady;
const ready = new Promise((r) => { resolveReady = r; });

async function boot() {
  const saved = await store.loadAll().catch((e) => { console.error("[ulysses] 读取本地数据失败:", e); return {}; });
  Object.entries(saved).forEach(([p, data]) => fs.__seed(p, data));
  fs.__seed("/app/examples/portfolio.example.json", JSON.stringify(portfolioExample));
  fs.__seed("/app/examples/plan.demo.json", JSON.stringify(planDemo));
  fs.__seed("/app/plan.example.json", JSON.stringify(planExample));
  fs.__onWrite((p, data) => { if (p.startsWith("/data/")) store.schedule(p, data); });

  Object.assign(process.env, {
    ULYSSES_LOCAL: "1",
    DATA_DIR: "/data",
    PUBLIC_READ: "1",
    AI_PROVIDER: "demo",
    ...(mode === "demo" ? { DEMO: "1" } : {}),
  });
  require("../server.js");
  const server = http.__server();
  if (!server.listening) await new Promise((r) => server.once("listening", r));
  // 等第一轮行情算完再放行页面的请求(最多 8 秒): 页面一打开就是最新数字, 演示模式的历史曲线也已补好
  await new Promise((r) => {
    const wss = wsMod.__wss();
    const probe = new EventEmitter();
    const done = () => { probe.readyState = 3; wss.clients.delete(probe); r(); };
    probe.readyState = 1;
    probe.send = done;
    wss.clients.add(probe);
    setTimeout(done, 8000);
  });
  resolveReady();
}
boot().catch((e) => { console.error("[ulysses] 浏览器版启动失败:", e); });

// ---- fetch: /api/*、/plan.json、/healthz 交给页面内后端 ----
const BACKEND = /^\/(?:.*\/)?(api\/.*|plan\.json|healthz)$/;
const realFetch = window.fetch.bind(window);

function backendPath(input) {
  const url = new URL(typeof input === "string" ? input : input.url, location.href);
  if (url.origin !== location.origin) return null;
  const m = BACKEND.exec(url.pathname);
  return m ? "/" + m[1] + url.search : null;
}

async function bodyToBuffer(body) {
  if (body == null) return null;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return Buffer.from(body.buffer ? body.buffer : body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  return Buffer.from(String(body));
}

window.fetch = async function (input, init = {}) {
  const pathAndQuery = backendPath(input);
  if (!pathAndQuery) return realFetch(input, init);
  await ready;
  const method = (init.method || (input && input.method) || "GET").toUpperCase();
  const headers = {};
  new Headers(init.headers || (typeof input === "object" && input.headers) || {}).forEach((v, k) => { headers[k] = v; });
  headers["user-agent"] = navigator.userAgent;
  headers.host = location.host;
  const body = await bodyToBuffer(init.body);
  return dispatch({ method, url: pathAndQuery, headers, body, signal: init.signal });
};

function dispatch({ method, url, headers, body, signal }) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    Object.assign(req, { method, url, headers, socket: { remoteAddress: "127.0.0.1" }, connection: {}, destroyed: false, httpVersion: "1.1" });
    req.destroy = () => { req.destroyed = true; };
    req.setEncoding = () => {};

    const res = new EventEmitter();
    let controller = null, responded = false;
    const out = {};
    Object.assign(res, { statusCode: 200, headersSent: false, writableEnded: false, finished: false });
    res.setHeader = (k, v) => { out[k.toLowerCase()] = v; };
    res.getHeader = (k) => out[k.toLowerCase()];
    res.removeHeader = (k) => { delete out[k.toLowerCase()]; };
    res.hasHeader = (k) => k.toLowerCase() in out;
    res.writeHead = (code, a, b) => {
      res.statusCode = code;
      const h = typeof a === "object" && a ? a : b;
      if (h) Object.entries(h).forEach(([k, v]) => res.setHeader(k, v));
      return res;
    };
    const respond = () => {
      if (responded) return;
      responded = true;
      res.headersSent = true;
      const nobody = method === "HEAD" || res.statusCode === 204 || res.statusCode === 304;
      const stream = nobody ? null : new ReadableStream({ start(c) { controller = c; }, cancel() { req.emit("close"); res.emit("close"); } });
      const h = new Headers();
      Object.entries(out).forEach(([k, v]) => { try { h.set(k, String(v)); } catch (e) {} });
      resolve(new Response(stream, { status: res.statusCode, headers: h }));
    };
    const enc = (c) => (typeof c === "string" ? new TextEncoder().encode(c) : new Uint8Array(c));
    res.flushHeaders = respond;
    res.write = (chunk) => { respond(); if (controller && chunk != null && chunk.length) controller.enqueue(enc(chunk)); return true; };
    res.end = (chunk) => {
      if (res.writableEnded) return res;
      if (chunk != null && typeof chunk !== "function") res.write(chunk); else respond();
      res.writableEnded = res.finished = true;
      if (controller) { try { controller.close(); } catch (e) {} }
      res.emit("finish"); res.emit("close"); req.emit("close");
      return res;
    };
    if (signal) signal.addEventListener("abort", () => {
      req.emit("close"); res.emit("close");
      if (controller) { try { controller.error(new DOMException("Aborted", "AbortError")); } catch (e) {} }
      if (!responded) reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });

    try { http.__server().handler(req, res); } catch (e) { reject(e); return; }
    setTimeout(() => {
      if (body && body.length) req.emit("data", body);
      req.emit("end");
    }, 0);
  });
}

// ---- WebSocket: 连本页地址的, 直接接到页面内后端 ----
const RealWebSocket = window.WebSocket;
class LocalSocket extends EventTarget {
  constructor(url) {
    super();
    this.url = url; this.readyState = 0; this.protocol = ""; this.extensions = ""; this.binaryType = "blob";
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    ready.then(() => this._open());
  }
  _fire(type, init) {
    const ev = type === "message" ? new MessageEvent("message", init) : type === "close" ? new CloseEvent("close", init) : new Event(type);
    this.dispatchEvent(ev);
    const h = this["on" + type]; if (typeof h === "function") h.call(this, ev);
  }
  _open() {
    if (this.readyState !== 0) return;
    const wss = wsMod.__wss();
    const self = this;
    const peer = new EventEmitter();
    peer.readyState = 1;
    peer.send = (msg) => { if (peer.readyState === 1) setTimeout(() => { if (self.readyState === 1) self._fire("message", { data: String(msg) }); }, 0); };
    peer.close = (code = 1000, reason = "") => { if (peer.readyState === 3) return; peer.readyState = 3; wss.clients.delete(peer); peer.emit("close"); setTimeout(() => self._closed(code, reason), 0); };
    peer.terminate = () => peer.close(1006);
    peer.ping = () => {};
    this._peer = peer;
    this.readyState = 1;
    this._fire("open");
    wss.clients.add(peer);
    const u = new URL(this.url, location.href);
    wss.emit("connection", peer, { url: u.pathname + u.search, headers: { "user-agent": navigator.userAgent }, socket: { remoteAddress: "127.0.0.1" } });
  }
  _closed(code, reason) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this._fire("close", { code, reason, wasClean: true });
  }
  send() {}
  close(code = 1000, reason = "") {
    if (this.readyState === 3) return;
    if (this._peer && this._peer.readyState !== 3) { this._peer.readyState = 3; wsMod.__wss().clients.delete(this._peer); this._peer.emit("close"); }
    this._closed(code, reason);
  }
}
Object.assign(LocalSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
window.WebSocket = function (url, protocols) {
  try { if (new URL(url, location.href).host === location.host) return new LocalSocket(url); } catch (e) {}
  return new RealWebSocket(url, protocols);
};
Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });

// ---- 右下角「浏览器版」小标签: 说明 / 换成自己的数据 / 导出导入 ----
mountBadge({
  mode,
  exportData: async () => { await store.flush(); return store.loadAll(); },
  importData: async (files) => { await store.replaceAll(files); setMode("mine"); location.reload(); },
  reset: async (next) => { await store.replaceAll({}); setMode(next); location.reload(); },
});
function setMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (e) {} }
