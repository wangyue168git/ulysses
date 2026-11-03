// 浏览器版的 ws(WebSocketServer): 页面里 new WebSocket(...) 由 web/entry.js 换成假的连接,
// 服务端这边收到的是同一页面里的对象, 推送直接调用页面的 onmessage。
const { EventEmitter } = require("events");

let current = null;
class WebSocketServer extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
    current = this;
  }
  close(cb) { cb && cb(); }
}

module.exports = { WebSocketServer, WebSocket: { OPEN: 1 }, __wss: () => current };
