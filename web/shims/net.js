// 浏览器版的 https.get / http.get: 用 fetch 直接请求行情接口(东方财富、腾讯、汇率、加密货币都允许跨域)。
// 不允许跨域的接口(新浪、天天基金、上交所、IB)直接失败, 后端本来就会退回别的源或沿用缓存。
const { EventEmitter } = require("events");
const { Buffer } = require("buffer");

const BLOCKED = /(^|\.)(sinajs\.cn|1234567\.com\.cn|fund\.eastmoney\.com|sse\.com\.cn|interactivebrokers\.com)$/;

function get(url, opts, cb) {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  const req = new EventEmitter();
  const ac = new AbortController();
  let finished = false;
  const close = () => { if (!finished) { finished = true; req.emit("close"); } };
  req.destroyed = false;
  req.destroy = (err) => {
    if (req.destroyed) return;
    req.destroyed = true;
    ac.abort();
    if (err) req.emit("error", err);
    close();
  };
  req.setTimeout = () => req;
  req.end = () => req;

  const u = new URL(String(url));
  setTimeout(async () => {
    if (BLOCKED.test(u.hostname)) { req.emit("error", new Error("浏览器版不支持这个数据源(不允许跨域)")); close(); return; }
    let resp;
    // 不带自定义请求头: 浏览器不允许改 User-Agent/Referer, 带了还会触发跨域预检
    try { resp = await fetch(u.href, { signal: ac.signal, referrerPolicy: "no-referrer", credentials: "omit" }); }
    catch (e) { if (!req.destroyed) req.emit("error", e); close(); return; }
    const res = new EventEmitter();
    res.statusCode = resp.status;
    res.headers = Object.fromEntries(resp.headers.entries());
    res.resume = () => {};
    res.setEncoding = () => {};
    cb && cb(res);
    try {
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length) res.emit("data", buf);
      res.emit("end");
    } catch (e) { if (!req.destroyed) req.emit("error", e); }
    close();
  }, 0);
  return req;
}

module.exports = { get, request: get, Agent: function Agent() {}, globalAgent: {} };
