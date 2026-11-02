"use strict";
// 顾问笔记: 用户确认过的偏好、每只股票的持有理由、卖出红灯……每次对话都会带给 AI, 让它"记得你"。
// 存在数据目录的 advisor-notes.md, 页面上可以直接查看和编辑; AI 只能"提议"追加, 用户确认才写入。
const fs = require("fs");
const MAX = 6000;
// 服务器本地日期(用 TZ 环境变量控制时区, 比如 TZ=Asia/Shanghai); 不用 UTC 日期, 免得凌晨的修改记成前一天
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function createNotesStore(file) {
  const read = () => { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } };
  const write = (text) => {
    const t = String(text || "").replace(/\r\n/g, "\n").slice(0, MAX);
    const tmp = file + ".tmp"; fs.writeFileSync(tmp, t); fs.renameSync(tmp, file);
    return t;
  };
  return {
    read, write, MAX,
    // 追加一条; 满了就从最旧的行开始删, 保证新确认的这条一定写得进去
    append(line) {
      const item = String(line || "").trim().replace(/\n+/g, " ").slice(0, 300);
      if (!item) return read();
      const dated = `- ${item}（${localDay()}）`;
      const lines = read().trimEnd().split("\n").filter((l) => l.trim());
      lines.push(dated);
      while (lines.length > 1 && lines.join("\n").length + 1 > MAX) lines.shift();
      return write(lines.join("\n") + "\n");
    },
  };
}

module.exports = { createNotesStore, localDay };
