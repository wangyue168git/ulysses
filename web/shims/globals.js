// 后端用到的 Node 全局(Buffer / process), 由 esbuild inject 注入
import { Buffer } from "buffer";
const listeners = {};
export const process = globalThis.process || {
  env: {}, argv: [], platform: "browser", versions: {}, version: "v20.0.0",
  cwd: () => "/app", uptime: () => performance.now() / 1000,
  on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return this; },
  once(ev, fn) { return this.on(ev, fn); },
  exit(code) { console.warn("[ulysses] 后端请求退出(浏览器版忽略), code=", code); },
  nextTick: (fn, ...a) => queueMicrotask(() => fn(...a)),
  memoryUsage: () => ({ rss: 0, heapUsed: 0, heapTotal: 0 }),
  hrtime: Object.assign(() => [0, 0], { bigint: () => BigInt(Math.round(performance.now() * 1e6)) }),
};
globalThis.process = process;
globalThis.Buffer = globalThis.Buffer || Buffer;
export { Buffer };
globalThis.setImmediate = globalThis.setImmediate || ((fn, ...a) => setTimeout(fn, 0, ...a));
globalThis.clearImmediate = globalThis.clearImmediate || ((t) => clearTimeout(t));
