// 浏览器版右下角的小标签: 说明数据存在哪里, 切换演示/自己的数据, 导出导入备份, 指向完整版部署
const DEPLOY_DOC = "https://github.com/wangyue168git/ulysses/blob/main/docs/deploy.md";

const CSS = `
.uw-pill{position:fixed;right:12px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:9998;border:0;border-radius:999px;padding:6px 11px;font:600 12px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:rgba(20,184,166,.92);color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.15);cursor:pointer}
.uw-pill.m{right:auto;left:10px;bottom:calc(34px + env(safe-area-inset-bottom));padding:5px 9px;font-size:11px}
.uw-mask{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:center}
.uw-card{--bg:#fff;--fg:#1f2937;--mut:#6b7280;--soft:#f3f4f6;background:var(--bg);color:var(--fg);width:100%;max-width:440px;border-radius:20px 20px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));font:14px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;max-height:85vh;overflow:auto}
@media (min-width:700px){.uw-mask{align-items:center}.uw-card{border-radius:20px}}
@media (prefers-color-scheme:dark){.uw-card{--bg:#161b22;--fg:#e5e7eb;--mut:#8b949e;--soft:#21262d}}
.uw-card h3{margin:0 0 6px;font-size:17px}.uw-card p{margin:6px 0;color:var(--mut);font-size:13px}
.uw-row{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px}
.uw-btn{border:0;border-radius:12px;padding:8px 12px;font:600 13px/1.2 inherit;background:var(--soft);color:var(--fg);cursor:pointer;text-decoration:none}
.uw-btn.pri{background:#14b8a6;color:#fff}.uw-btn.warn{background:#ef4444;color:#fff}
.uw-list{margin:8px 0 0;padding-left:18px;color:var(--mut);font-size:12px}
.uw-x{float:right;border:0;background:none;color:var(--mut);font-size:20px;line-height:1;cursor:pointer}`;

export function mountBadge({ mode, exportData, importData, reset }) {
  const go = () => {
    if (document.getElementById("uw-pill")) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    const pill = document.createElement("button");
    pill.id = "uw-pill";
    pill.className = "uw-pill" + (/m\.html$/.test(location.pathname) ? " m" : "");
    const m = /m\.html$/.test(location.pathname);
    pill.textContent = mode === "demo" ? (m ? "演示数据" : "演示数据 · 浏览器版") : "浏览器版";
    pill.onclick = () => open();
    document.body.appendChild(pill);
  };
  if (document.body) go(); else addEventListener("DOMContentLoaded", go);

  function open() {
    const mask = document.createElement("div");
    mask.className = "uw-mask";
    mask.innerHTML = `<div class="uw-card" role="dialog" aria-label="浏览器版">
      <button class="uw-x" data-a="close" aria-label="关闭">×</button>
      <h3>浏览器版</h3>
      <p>数据只存在<b>这个浏览器</b>里，不会上传到任何地方。换浏览器、换手机或清除网站数据都会丢失，记得定期导出备份。</p>
      ${mode === "demo"
        ? `<p>现在看到的是<b>虚构的演示持仓</b>，可以随便点、随便改。</p>
           <div class="uw-row"><button class="uw-btn pri" data-a="mine">清空，录入我自己的</button></div>`
        : `<div class="uw-row"><button class="uw-btn" data-a="demo">换回演示数据</button></div>`}
      <div class="uw-row"><button class="uw-btn" data-a="export">导出备份</button><button class="uw-btn" data-a="import">导入备份</button></div>
      <p style="margin-top:14px">浏览器版暂不支持：</p>
      <ul class="uw-list"><li>券商自动同步（IB、长桥等需要服务器保管密钥）</li><li>真实 AI 顾问（这里是体验版，回答是预置的）</li><li>场外基金净值、上交所 ETF 参考净值（数据源不允许浏览器直接访问）</li><li>多台设备共用一份数据</li></ul>
      <div class="uw-row"><a class="uw-btn pri" href="${DEPLOY_DOC}" target="_blank" rel="noopener">部署完整版</a></div>
      <p>导出的备份可以直接放进完整版的数据目录（data/）继续用。</p>
    </div>`;
    document.body.appendChild(mask);
    const close = () => mask.remove();
    let armed = null;   // 清空类操作要点两次, 第一次只改按钮文字
    mask.onclick = async (e) => {
      if (e.target === mask) return close();
      const b = e.target.closest("[data-a]"); if (!b) return;
      const a = b.dataset.a;
      if (a === "close") return close();
      if (a === "export") return download(await exportData());
      if (a === "import") return pickFile(importData);
      if (a === "mine" || a === "demo") {
        if (armed !== a) { armed = a; b.classList.add("warn"); b.textContent = a === "mine" ? "会清空演示数据，再点一次确认" : "会清空你现在的数据，先导出备份；再点一次确认"; return; }
        b.disabled = true; b.textContent = "正在切换…";
        await reset(a);
      }
    };
  }
}

function download(files) {
  const data = {};
  Object.entries(files).forEach(([p, d]) => { if (p.startsWith("/data/")) data[p.slice(6)] = d; });
  const blob = new Blob([JSON.stringify({ app: "ulysses", v: 1, exportedAt: new Date().toISOString(), files: data }, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ulysses-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function pickFile(importData) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "application/json,.json";
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    let j;
    try { j = JSON.parse(await f.text()); } catch (e) { alert("这不是有效的备份文件"); return; }
    if (!j || j.app !== "ulysses" || !j.files || typeof j.files !== "object") { alert("这不是尤利西斯的备份文件"); return; }
    const files = {};
    Object.entries(j.files).forEach(([name, d]) => { if (typeof d === "string" && /^[\w.-]+$/.test(name)) files["/data/" + name] = d; });
    await importData(files);
  };
  inp.click();
}
