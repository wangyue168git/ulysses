// ===== 新手引导卡片(手机版、电脑版共用) =====
// 三步: 录入持仓 → 写规则 → 装到手机桌面。做完的打勾, 全部做完或点「不再提示」后不再出现。
// 页面调用: CalmOnboard.render(容器元素, { mobile, hasHoldings, hasRules, aiEnabled, actions: { addHolding, importCsv?, aiDraft } })
(function () {
  "use strict";
  const LS = "ulyssesOnboardDone";
  const RULES_DOC = "https://github.com/wangyue168git/ulysses/blob/main/docs/rules.md";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const dismissed = () => { try { return localStorage.getItem(LS) === "1"; } catch (e) { return false; } };
  const standalone = () => { try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; } };
  let showHow = false;

  function css() {
    if (document.getElementById("cob-style")) return;
    const st = document.createElement("style");
    st.id = "cob-style";
    st.textContent = `
.cob{--bg:#fff;--fg:#1f2937;--mut:#9ca3af;--line:#eef0f3;--soft:#f3f4f6;--acc:#14b8a6;background:var(--bg);color:var(--fg);border-radius:20px;padding:16px 16px 12px;margin:0 0 14px;box-shadow:0 1px 3px rgba(0,0,0,.06);font-size:14px;line-height:1.5}
.cob.dark{--bg:#161b22;--fg:#e5e7eb;--mut:#7d8590;--line:#262c36;--soft:#21262d;--acc:#2dd4bf}
.cob-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}.cob-h b{font-size:16px}
.cob-x{border:0;background:none;color:var(--mut);font-size:12px;cursor:pointer;padding:2px 4px}
.cob-s{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--line)}
.cob-n{flex:0 0 22px;height:22px;border-radius:50%;background:var(--soft);color:var(--mut);font-size:12px;font-weight:700;display:grid;place-items:center}
.cob-s.done .cob-n{background:var(--acc);color:#fff}.cob-s.done .cob-t{color:var(--mut);text-decoration:line-through}
.cob-t{font-weight:600}.cob-d{color:var(--mut);font-size:12px;margin-top:1px}
.cob-b{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.cob-btn{border:0;border-radius:10px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;background:var(--soft);color:var(--fg);text-decoration:none}
.cob-btn.pri{background:var(--acc);color:#fff}
.cob-how{background:var(--soft);border-radius:10px;padding:8px 10px;font-size:12px;margin-top:6px}`;
    document.head.appendChild(st);
  }

  function render(el, ctx) {
    if (!el) return;
    const mobile = !!ctx.mobile;
    const steps = [
      { done: !!ctx.hasHoldings, t: "录入持仓", d: "手动添加，或者导入券商导出的表格 / 截图",
        b: [["添加持仓", "add", true], ...(ctx.actions.importCsv ? [["导入 CSV", "csv"]] : [])] },
      { done: !!ctx.hasRules, t: "写下买入规则", d: "决定每只持仓旁边显示「可加」还是「封仓」。没写之前，所有持仓默认封仓",
        b: [...(ctx.aiEnabled ? [["AI 帮我起草", "ai", true]] : []), ["怎么写规则", "doc"]] },
      ...(mobile ? [{ done: standalone(), t: "装到手机桌面", d: "以后像 App 一样打开", b: [["怎么装", "how"]] }] : []),
    ];
    const allDone = steps.every((s) => s.done);
    const dark = document.body.classList.contains("dark") || document.documentElement.classList.contains("dark");
    // 页面会定时调用; 状态没变就不重画(免得按钮闪)
    const key = JSON.stringify([steps.map((s) => s.done), dismissed(), allDone, showHow, dark, !!ctx.aiEnabled]);
    if (el.dataset.obKey === key) return;
    el.dataset.obKey = key;
    if (dismissed() || allDone) { el.innerHTML = ""; return; }
    css();
    el.innerHTML = `<div class="cob${dark ? " dark" : ""}">
      <div class="cob-h"><b>开始使用</b><button class="cob-x" data-ob="dismiss">不再提示</button></div>
      ${steps.map((s, i) => `<div class="cob-s${s.done ? " done" : ""}"><div class="cob-n">${s.done ? "✓" : i + 1}</div><div style="flex:1;min-width:0">
        <div class="cob-t">${esc(s.t)}</div>${s.done ? "" : `<div class="cob-d">${esc(s.d)}</div>
        <div class="cob-b">${s.b.map(([label, act, pri]) => act === "doc"
          ? `<a class="cob-btn" href="${RULES_DOC}" target="_blank" rel="noopener">${esc(label)}</a>`
          : `<button class="cob-btn${pri ? " pri" : ""}" data-ob="${act}">${esc(label)}</button>`).join("")}</div>
        ${act3(s, showHow)}`}</div></div>`).join("")}
    </div>`;
    el.onclick = (e) => {
      const a = e.target.closest("[data-ob]");
      if (!a) return;
      const act = a.dataset.ob;
      if (act === "dismiss") { try { localStorage.setItem(LS, "1"); } catch (x) {} el.innerHTML = ""; }
      else if (act === "add") ctx.actions.addHolding();
      else if (act === "csv") ctx.actions.importCsv();
      else if (act === "ai") ctx.actions.aiDraft();
      else if (act === "how") { showHow = !showHow; el.dataset.obKey = ""; render(el, ctx); }
    };
  }
  function act3(s, open) {
    if (!open || s.t !== "装到手机桌面") return "";
    return `<div class="cob-how"><b>iPhone</b>：用 Safari 打开 → 底部「分享」→「添加到主屏幕」。<br><b>安卓</b>：浏览器右上角菜单 →「添加到主屏幕」或「安装应用」。</div>`;
  }

  window.CalmOnboard = { render };
})();
