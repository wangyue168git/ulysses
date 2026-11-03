// 浏览器版不支持的可选依赖(如长桥 SDK)
module.exports = new Proxy({}, { get() { throw new Error("浏览器版不支持"); } });
