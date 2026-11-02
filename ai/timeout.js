"use strict";
// 给外部模型请求加超时: 和"页面断开"的信号合并, 任一触发就中止(兼容 Node 18, 不用 AbortSignal.any)
const TIMEOUT_MS = 120 * 1000;
function withTimeout(signal, ms = TIMEOUT_MS) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`模型接口超过 ${Math.round(ms / 1000)} 秒没有响应`)), ms);
  if (t.unref) t.unref();
  const onAbort = () => ac.abort(signal.reason);
  if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true }); }
  return { signal: ac.signal, done: () => { clearTimeout(t); if (signal) signal.removeEventListener("abort", onAbort); } };
}
module.exports = { withTimeout, TIMEOUT_MS };
