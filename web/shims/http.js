// 浏览器版的 http: createServer 不监听端口, 只把请求处理函数交给 web/entry.js,
// 页面里的 fetch('/api/...') 由 entry.js 转成假的 req/res 调用它。
const { EventEmitter } = require("events");
const net = require("./net");

let current = null;
function createServer(handler) {
  const server = new EventEmitter();
  server.handler = handler;
  server.listening = false;
  server.listen = (port, cb) => {
    server.listening = true;
    setTimeout(() => { server.emit("listening"); cb && cb(); }, 0);
    return server;
  };
  server.address = () => ({ port: 0, address: "browser" });
  server.close = (cb) => { cb && cb(); return server; };
  server.setTimeout = () => server;
  current = server;
  return server;
}

module.exports = { createServer, get: net.get, request: net.get, STATUS_CODES: {}, __server: () => current };
