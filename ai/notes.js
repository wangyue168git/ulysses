"use strict";
// 顾问笔记: 用户确认过的偏好、每只股票的持有理由、卖出红灯……每次对话都会带给 AI, 让它"记得你"。
// 存在数据目录的 advisor-notes.md, 页面上可以直接查看和编辑; AI 只能"提议"追加, 用户确认才写入。
const fs = require("fs");
const MAX = 6000;

function createNotesStore(file) {
  const read = () => { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } };
  const write = (text) => {
    const t = String(text || "").replace(/\r\n/g, "\n").slice(0, MAX);
    const tmp = file + ".tmp"; fs.writeFileSync(tmp, t); fs.renameSync(tmp, file);
    return t;
  };
  return {
    read, write, MAX,
    append(line) {
      const cur = read().trimEnd();
      const item = String(line || "").trim().replace(/\n+/g, " ").slice(0, 300);
      if (!item) return cur;
      const dated = `- ${item}（${new Date().toISOString().slice(0, 10)}）`;
      return write(cur ? `${cur}\n${dated}\n` : `${dated}\n`);
    },
  };
}

module.exports = { createNotesStore };
