// 浏览器版里用不到、只需要能加载的模块: zlib / crypto / dns / child_process / Anthropic SDK
const { Buffer } = require("buffer");

const randomBytes = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return Buffer.from(b); };
// 只用于静态文件 etag(浏览器版不走); 简单的非加密哈希即可
function createHash() {
  let h = 2166136261 >>> 0, parts = [];
  const api = {
    update(d) { parts.push(typeof d === "string" ? d : Buffer.from(d).toString("latin1")); return api; },
    digest(enc) {
      for (const ch of parts.join("")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
      const b = Buffer.alloc(32); for (let i = 0; i < 8; i++) b.writeUInt32BE((h ^ (i * 2654435761)) >>> 0, i * 4);
      return enc === "base64url" ? b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : enc ? b.toString(enc) : b;
    },
  };
  return api;
}
const nodeCrypto = {
  randomBytes,
  randomUUID: () => crypto.randomUUID(),
  createHash,
  scryptSync: () => { throw new Error("浏览器版不需要登录"); },
  timingSafeEqual: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
};

const zlib = { gzipSync: (b) => b, gunzipSync: (b) => b, constants: { Z_BEST_SPEED: 1 } };
const dns = { lookup: (host, opts, cb) => (cb || opts)(null, host, 4) };

// AI 只能用体验版(真实模型需要服务器保管 API Key)
class Anthropic { constructor() { throw new Error("浏览器版不支持直连模型, 请部署完整版"); } }
Anthropic.APIError = class APIError extends Error {};

module.exports = { nodeCrypto, zlib, dns, Anthropic };
