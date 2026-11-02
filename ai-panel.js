// ===== AI 顾问面板(手机版、电脑版共用) =====
// 页面调用: CalmAI.init({ getToken, ensureAuth(cb), onPlanChanged(), getAccounts(), onPortfolioChanged() }); 有入口按钮时 CalmAI.open()
// 四个视图: 对话(含「起草规则」模式) / 顾问笔记 / 截图导入(识别 → 核对 → 预览 → 确认)
// 手机上是底部弹层, 电脑上是右侧抽屉; 样式自带(不依赖 tailwind 预编译), 跟随页面深色模式。
(function () {
  "use strict";
  const LS_ANON = "calmAiAnon", SS_CHAT = "calmAiChat", SS_MODE = "calmAiMode";
  let hooks = { getToken: () => "", ensureAuth: (cb) => cb(), onPlanChanged: () => {}, getAccounts: () => [], onPortfolioChanged: () => {} };
  let cfg = null, root = null, msgs = [], busy = null, applied = {};
  let view = "chat", mode = "chat", notesText = null, imp = null;
  try { mode = sessionStorage.getItem(SS_MODE) === "onboard" ? "onboard" : "chat"; } catch (e) {}

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const $ = (sel) => root.querySelector(sel);
  const anon = () => {   // 用户勾过就按用户的; 没勾过按服务端默认(默认只发比例)
    let v = null; try { v = localStorage.getItem(LS_ANON); } catch (e) {}
    return v === null ? !(cfg && cfg.anonymizeDefault === false) : v !== "0";
  };
  const saveChat = () => { try { sessionStorage.setItem(SS_CHAT, JSON.stringify(msgs.slice(-30))); } catch (e) {} };
  try { msgs = JSON.parse(sessionStorage.getItem(SS_CHAT) || "[]") || []; } catch (e) { msgs = []; }

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", "X-Auth-Token": hooks.getToken() || "", ...(opts.headers || {}) } });
    if (res.status === 401) throw Object.assign(new Error("登录已过期，请刷新页面重新登录"), { status: 401 });
    return res;
  }

  // ---- 极简 Markdown: 标题、列表、粗体、行内代码、段落; 先转义再替换, 不插入任何外部 HTML ----
  function md(text) {
    const lines = esc(String(text || "").replace(/```calm-proposals[\s\S]*?(```|$)/g, "").trim()).split("\n");
    let html = "", list = null;
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    lines.forEach((l) => {
      let m;
      if ((m = /^\s*#{1,4}\s+(.*)$/.exec(l))) { close(); html += `<div class="cai-h">${inline(m[1])}</div>`; }
      else if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = /^\s*\d+[.)、]\s+(.*)$/.exec(l))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
      else if (!l.trim()) { close(); }
      else { close(); html += `<p>${inline(l)}</p>`; }
    });
    close();
    return html;
  }

  function css() {
    if (document.getElementById("cai-style")) return;
    const st = document.createElement("style");
    st.id = "cai-style";
    st.textContent = `
.cai-mask{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.35);display:flex;justify-content:flex-end;align-items:flex-end}
.cai{--bg:#fff;--fg:#1f2937;--mut:#9ca3af;--line:#eef0f3;--soft:#f3f4f6;--acc:#14b8a6;--acc2:#0f766e;--warn:#d97706;
  background:var(--bg);color:var(--fg);display:flex;flex-direction:column;font-size:14px;line-height:1.6;box-shadow:0 10px 40px rgba(0,0,0,.18)}
.cai.dark{--bg:#161b22;--fg:#e5e7eb;--mut:#7d8590;--line:#262c36;--soft:#21262d;--acc:#2dd4bf;--acc2:#5eead4;--warn:#f59e0b}
@media (max-width:767px){.cai{width:100%;height:92vh;border-radius:22px 22px 0 0;font-size:15px}}
@media (min-width:768px){.cai-mask{align-items:stretch}.cai{width:480px;max-width:94vw;height:100%}}
.cai-hd{display:flex;align-items:center;gap:8px;padding:16px 18px 10px;border-bottom:1px solid var(--line)}
.cai-hd b{font-size:17px}.cai-hd .cai-model{color:var(--mut);font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cai-x{border:0;background:var(--soft);color:var(--fg);border-radius:10px;padding:5px 10px;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0}
.cai-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 18px;border-bottom:1px solid var(--line);font-size:13px}
.cai-btn{border:0;border-radius:12px;padding:7px 12px;font-weight:600;cursor:pointer;background:var(--soft);color:var(--fg);font-size:13px}
.cai-btn.pri{background:var(--acc);color:#fff}.cai-btn:disabled{opacity:.45;cursor:default}
.cai-chk{display:flex;align-items:center;gap:5px;color:var(--mut);margin-left:auto;cursor:pointer}
.cai-body{flex:1;overflow-y:auto;padding:14px 18px}
.cai-empty{color:var(--mut);font-size:13px;padding:24px 4px}
.cai-m{margin:0 0 14px}.cai-u{background:var(--soft);border-radius:14px;padding:8px 12px;margin-left:15%;white-space:pre-wrap}
.cai-a p{margin:0 0 6px}.cai-a ul,.cai-a ol{margin:0 0 6px;padding-left:20px}.cai-a ul{list-style:disc}.cai-a ol{list-style:decimal}.cai-a li{margin:2px 0}.cai-a .cai-h{font-weight:700;margin:10px 0 4px}
.cai-a code{background:var(--soft);border-radius:5px;padding:0 4px;font-size:.92em}
.cai-err{color:var(--warn);font-size:13px}
.cai-props{border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin:6px 0 4px;background:var(--bg)}
.cai-props .t{font-size:12px;color:var(--mut);margin-bottom:6px}
.cai-p{display:flex;gap:8px;padding:6px 0;border-top:1px dashed var(--line)}.cai-p:first-of-type{border-top:0}
.cai-p .s{font-weight:600}.cai-p .w{color:var(--mut);font-size:12px}
.cai-props input[type=text]{width:100%;box-sizing:border-box;border:1px solid var(--line);background:var(--soft);color:var(--fg);border-radius:10px;padding:7px 10px;margin:8px 0;font-size:13px}
.cai-done{color:var(--acc2);font-size:13px;margin-top:6px}
.cai-pend{margin:10px 18px 0;padding:8px 12px;border-radius:12px;background:var(--soft);font-size:12px}
.cai-pend .row{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:3px 0}
.cai-pre{white-space:pre-wrap;font-size:12px;background:var(--soft);border-radius:12px;padding:10px 12px;margin:0 0 14px;max-height:45vh;overflow:auto}
.cai-ft{border-top:1px solid var(--line);padding:10px 14px calc(10px + env(safe-area-inset-bottom))}
.cai-in{display:flex;gap:8px;align-items:flex-end}
.cai-in textarea{flex:1;resize:none;border:1px solid var(--line);background:var(--soft);color:var(--fg);border-radius:14px;padding:9px 12px;font-size:15px;line-height:1.4;max-height:120px;outline:none}
.cai-note{color:var(--mut);font-size:11px;text-align:center;margin-top:6px}
.cai-tool{color:var(--mut);font-size:12px;margin:0 0 4px}
.cai-modebar{display:none;padding:7px 18px;font-size:12px;background:var(--soft);color:var(--acc2);align-items:center;justify-content:space-between}
.cai-modebar.on{display:flex}
.cai-sub{font-weight:700;margin:0 0 8px}.cai-hint{color:var(--mut);font-size:12px;margin:0 0 10px}
.cai-notes{width:100%;box-sizing:border-box;min-height:46vh;border:1px solid var(--line);background:var(--soft);color:var(--fg);border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.6;outline:none;resize:vertical}
.cai-row{display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap}
.cai-sel{border:1px solid var(--line);background:var(--soft);color:var(--fg);border-radius:10px;padding:6px 8px;font-size:13px}
.cai-tbl{width:100%;border-collapse:collapse;font-size:13px}.cai-tbl th{color:var(--mut);font-weight:500;text-align:left;padding:4px 3px}
.cai-tbl td{padding:3px}.cai-tbl input{width:100%;box-sizing:border-box;border:1px solid var(--line);background:var(--soft);color:var(--fg);border-radius:8px;padding:5px 6px;font-size:13px}
.cai-tbl input.bad{border-color:var(--warn)}.cai-tag{font-size:11px;padding:1px 6px;border-radius:6px;background:var(--soft);white-space:nowrap}
.cai-tag.new{color:var(--acc2)}.cai-tag.update{color:#6366f1}.cai-tag.missing{color:var(--warn)}
.cai-demo{margin:8px 18px 0;padding:7px 12px;border-radius:12px;background:#fef3c7;color:#92400e;font-size:12px}
.cai.dark .cai-demo{background:#3b2f13;color:#fcd34d}
.cai-dots::after{content:"…";animation:caiDot 1s steps(3,end) infinite}@keyframes caiDot{0%{content:"."}50%{content:".."}100%{content:"..."}}`;
    document.head.appendChild(st);
  }

  function build() {
    css();
    const mask = document.createElement("div");
    mask.className = "cai-mask";
    mask.innerHTML = `<div class="cai" role="dialog" aria-label="AI 顾问">
      <div class="cai-hd"><b>AI 顾问</b><span class="cai-model"></span><button class="cai-x" data-act="clear">清空</button><button class="cai-x" data-act="close">关闭</button></div>
      <div class="cai-tools">
        <button class="cai-btn pri" data-act="checkup">一键体检</button>
        <button class="cai-btn" data-act="onboard">起草规则</button>
        <button class="cai-btn" data-act="shot">截图导入</button>
        <button class="cai-btn" data-act="notes">顾问笔记</button>
        <button class="cai-btn" data-act="preview">看看会发什么</button>
        <label class="cai-chk"><input type="checkbox" data-act="anon"> 只发比例</label>
        <input type="file" accept="image/*" multiple hidden data-file>
      </div>
      <div class="cai-modebar"><span>正在起草规则：回答几个问题，最后给出完整草案，逐条确认</span><button class="cai-x" data-act="endonboard">结束</button></div>
      <div class="cai-demo" hidden>体验版：回答是预置的，没有调用任何模型；数字来自当前持仓，建议可以真实确认。配置真实模型见文档 docs/ai.md。</div>
      <div class="cai-pendbox"></div>
      <div class="cai-body"></div>
      <div class="cai-ft">
        <div class="cai-in"><textarea rows="1" placeholder="问问你的持仓和规则…"></textarea><button class="cai-btn pri" data-act="send">发送</button></div>
        <div class="cai-note">AI 的分析仅供参考，不构成投资建议；规则修改都要你确认。</div>
      </div></div>`;
    mask.addEventListener("click", (e) => { if (e.target === mask) close(); });
    mask.addEventListener("click", onClick);
    mask.addEventListener("change", (e) => {
      if (e.target.dataset.act === "anon") { try { localStorage.setItem(LS_ANON, e.target.checked ? "1" : "0"); } catch (x) {} }
      if (e.target.hasAttribute("data-file")) { recognize([...e.target.files]); e.target.value = ""; }
      if (e.target.hasAttribute("data-acc") && imp) { imp.accountIndex = +e.target.value; imp.plan = null; renderImportPlan(); }
    });
    mask.addEventListener("input", (e) => {   // 截图导入表格里的修改实时写回
      const t = e.target;
      if (t.dataset.r !== undefined && imp) { imp.rows[+t.dataset.r][t.dataset.k] = t.value; imp.plan = null; renderImportPlan(); }
      if (t.dataset.notes !== undefined) notesText = t.value;
    });
    const ta = mask.querySelector("textarea");
    ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.innerWidth >= 768) { e.preventDefault(); send(); } });
    return mask;
  }

  function onClick(e) {
    const act = e.target.closest("[data-act]") && e.target.closest("[data-act]").dataset.act;
    if (!act) return;
    if (act === "close") close();
    else if (act === "clear") { if (busy) busy.abort(); msgs = []; applied = {}; saveChat(); render(); }
    else if (act === "checkup") { view = "chat"; if (mode !== "chat") setMode("chat"); send(cfg && cfg.checkupPrompt, "一键体检"); }
    else if (act === "onboard") startOnboard();
    else if (act === "endonboard") { setMode("chat"); render(); }
    else if (act === "shot") root.querySelector("[data-file]").click();
    else if (act === "notes") openNotes();
    else if (act === "notes-save") saveNotes();
    else if (act === "back") { view = "chat"; render(); }
    else if (act === "imp-preview") previewImport();
    else if (act === "imp-apply") applyImport();
    else if (act === "imp-del") { imp.rows.splice(+e.target.dataset.r, 1); imp.plan = null; render(); }
    else if (act === "send") busy ? busy.abort() : send();
    else if (act === "preview") { view = "chat"; preview(); }
    else if (act === "apply") apply(+e.target.dataset.i);
    else if (act === "cancel") cancelPending(e.target.dataset.id);
  }

  function render() {
    const dark = document.body.classList.contains("dark") || document.documentElement.classList.contains("dark");
    $(".cai").classList.toggle("dark", dark);
    $(".cai-model").textContent = cfg && cfg.model ? cfg.model : "";
    $(".cai-demo").hidden = !(cfg && cfg.demo);
    $("[data-act=anon]").checked = anon();
    $(".cai-modebar").classList.toggle("on", mode === "onboard" && view === "chat");
    $(".cai-ft").style.display = view === "chat" ? "" : "none";
    const body = $(".cai-body");
    if (view === "notes") { body.innerHTML = notesHtml(); return; }
    if (view === "import") { body.innerHTML = importHtml(); renderImportPlan(); return; }
    if (!msgs.length) {
      body.innerHTML = `<div class="cai-empty">AI 会读取你现在的持仓占比和规则（看板已经把数字算好），帮你检查结构、集中度和规则有没有遗漏。<br><br>它不会预测涨跌，也不会替你下单；想改规则时会给出建议，你确认后才生效。<br><br>默认「只发比例」：不发金额、股数和成本价。点「看看会发什么」可以先确认内容。</div>`;
    } else {
      body.innerHTML = msgs.map((m, i) => {
        if (m.role === "user") return `<div class="cai-m cai-u">${esc(m.shown || m.content)}</div>`;
        if (m.role === "preview") return `<div class="cai-pre">${esc(m.content)}</div>`;
        let h = `<div class="cai-m cai-a">${(m.tools || []).map((t) => `<div class="cai-tool">· ${esc(t)}</div>`).join("")}${md(m.content) || (m.streaming ? '<span class="cai-dots">思考中</span>' : "")}`;
        if (m.error) h += `<div class="cai-err">${esc(m.error)}</div>`;
        if (m.proposals && m.proposals.length) h += proposalsHtml(m, i);
        return h + "</div>";
      }).join("");
    }
    $("[data-act=send]").textContent = busy ? "停止" : "发送";
    $("[data-act=checkup]").disabled = !!busy;
    body.scrollTop = body.scrollHeight;
  }

  function proposalsHtml(m, i) {
    const done = applied[i] || m.applied;
    const cd = cfg && cfg.cooldownHours > 0;
    return `<div class="cai-props"><div class="t">AI 的修改建议 · 勾选后确认才会改规则${cd ? `（冷静期 ${cfg.cooldownHours} 小时后生效）` : ""}</div>
      ${m.proposals.map((p, j) => `<label class="cai-p"><input type="checkbox" data-i="${i}" data-j="${j}" ${done ? "disabled" : p.kind === "note" ? "" : "checked"}><span><div class="s">${esc(p.summary)}</div>${p.why ? `<div class="w">${esc(p.why)}</div>` : ""}${p.kind === "note" ? `<div class="w">（记进笔记后，以后每次对话都会发给 AI；默认不勾选）</div>` : ""}</span></label>`).join("")}
      ${done ? `<div class="cai-done">${esc(done)}</div>` : `<input type="text" data-reason="${i}" maxlength="200" placeholder="你的理由（可选，会记进修改记录）">
      <button class="cai-btn pri" data-act="apply" data-i="${i}">${cd ? "确认，加入待生效" : "确认修改"}</button>`}</div>`;
  }

  async function send(preset, shown) {
    if (busy) return;
    const ta = $("textarea");
    const text = String(preset || ta.value || "").trim();
    if (!text) return;
    if (!preset) { ta.value = ""; ta.style.height = "auto"; }
    msgs.push({ role: "user", content: text, shown: shown || text });
    const a = { role: "assistant", content: "", streaming: true };
    msgs.push(a);
    render();
    busy = new AbortController();
    render();
    try {
      // 只发比例时, 不把「发金额模式」下得到的回答再发出去(里面可能有金额和股数)
      const an = anon();
      a.anon = an;
      const history = msgs.filter((m) => (m.role === "user" || m.role === "assistant") && m !== a && m.content && !(an && m.role === "assistant" && m.anon === false)).map((m) => ({ role: m.role, content: m.content }));
      const res = await api("/api/ai/chat", { method: "POST", body: JSON.stringify({ messages: history, anonymize: an, mode }), signal: busy.signal });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `请求失败（${res.status}）`); }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", last = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, k); buf = buf.slice(k + 2);
          const ev = (/^event: (.*)$/m.exec(block) || [])[1], data = (/^data: (.*)$/m.exec(block) || [])[1];
          if (!ev || !data) continue;
          const d = JSON.parse(data);
          if (ev === "delta") a.content += d.t;
          else if (ev === "done") a.proposals = d.proposals || [];
          else if (ev === "tool") (a.tools = a.tools || []).push(d.label);
          else if (ev === "error") a.error = d.msg;
        }
        if (Date.now() - last > 80) { last = Date.now(); render(); }
      }
    } catch (e) {
      if (e.name !== "AbortError") a.error = e.message;
      else a.error = a.content ? "（已停止）" : "已停止";
    }
    a.streaming = false;
    busy = null;
    saveChat();
    render();
  }

  async function preview() {
    try {
      const res = await api("/api/ai/context", { method: "POST", body: JSON.stringify({ anonymize: anon() }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "获取失败");
      msgs.push({ role: "preview", content: "下面是这次会和你的问题一起发给 AI 的数据：\n\n" + j.text });
    } catch (e) { msgs.push({ role: "assistant", content: "", error: e.message }); }
    render();
  }

  let _applying = false;
  async function apply(i) {
    const m = msgs[i];
    if (!m || !m.proposals || m.applied || _applying) return;
    const picked = [...root.querySelectorAll(`input[type=checkbox][data-i="${i}"]`)].filter((x) => x.checked).map((x) => m.proposals[+x.dataset.j]);
    if (!picked.length) return;
    const reason = (root.querySelector(`input[data-reason="${i}"]`) || {}).value || "";
    _applying = true;
    try {
      const res = await api("/api/ai/apply", { method: "POST", body: JSON.stringify({ proposals: picked, reason }) });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "修改失败");
      const okN = j.results.filter((r) => r.ok).length;
      const skipped = j.results.filter((r) => !r.ok).length;
      applied[i] = (j.pending ? `已加入待生效，${new Date(j.dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 自动生效，之前可以撤销。` : `已修改 ${okN} 条，记进了规则修改记录。`) + (skipped ? `另有 ${skipped} 条没写入（已失效或和现状相同）。` : "");
      m.applied = applied[i]; saveChat();
      if (!j.pending) hooks.onPlanChanged();
      loadPending();
    } catch (e) { applied[i] = null; alert(e.message); }
    _applying = false;
    render();
  }

  async function loadPending() {
    const box = $(".cai-pendbox");
    if (!cfg || !cfg.enabled) { box.innerHTML = ""; return; }
    try {
      const j = await (await api("/api/ai/pending")).json();
      const items = (j && j.items) || [];
      box.innerHTML = items.length ? `<div class="cai-pend"><b>待生效的修改</b>${items.map((it) => `<div class="row"><span>${esc(it.proposals.map((p) => p.summary).join("；"))} · ${new Date(it.dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 生效</span><button class="cai-x" data-act="cancel" data-id="${esc(it.id)}">撤销</button></div>`).join("")}</div>` : "";
    } catch (e) { box.innerHTML = ""; }
  }
  async function cancelPending(id) {
    try { await api(`/api/ai/pending?id=${encodeURIComponent(id)}`, { method: "DELETE" }); } catch (e) {}
    loadPending();
  }

  function setMode(m) { mode = m; try { sessionStorage.setItem(SS_MODE, m); } catch (e) {} }
  function startOnboard() {
    if (busy) return;
    if (msgs.length && !confirm("起草规则会开始一段新对话，清空现在的对话吗？")) return;
    msgs = []; applied = {}; view = "chat"; setMode("onboard"); saveChat();
    send(cfg && cfg.onboardPrompt, "开始起草规则");
  }

  // ---- 顾问笔记 ----
  function notesHtml() {
    if (notesText === null) return `<div class="cai-empty">加载中…</div>`;
    return `<div class="cai-sub">顾问笔记</div>
      <div class="cai-hint">AI 每次对话都会读这里：你的偏好、每只股票的持有理由、卖出红灯……可以直接改。AI 想记什么会先问你。</div>
      <textarea class="cai-notes" data-notes maxlength="${(cfg && cfg.notesMax) || 6000}" placeholder="比如：\n- 我能承受 20% 的回撤\n- AAPL 的持有理由：生态和回购；红灯：连续两季营收下滑">${esc(notesText)}</textarea>
      <div class="cai-row"><button class="cai-btn pri" data-act="notes-save">保存</button><button class="cai-btn" data-act="back">返回对话</button><span class="cai-hint" data-saved style="margin:0"></span></div>`;
  }
  async function openNotes() {
    view = "notes"; notesText = null; render();
    try { notesText = (await (await api("/api/ai/notes")).json()).text || ""; } catch (e) { notesText = ""; }
    render();
  }
  async function saveNotes() {
    try {
      const j = await (await api("/api/ai/notes", { method: "PUT", body: JSON.stringify({ text: notesText || "" }) })).json();
      notesText = j.text; render();
      const el = root.querySelector("[data-saved]"); if (el) el.textContent = "已保存";
    } catch (e) { alert(e.message); }
  }

  // ---- 截图导入: 缩小图片 → AI 识别 → 用户核对改正 → 预览变化 → 确认 ----
  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return { mediaType: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] };
    } finally { URL.revokeObjectURL(url); }
  }
  async function recognize(files) {
    files = files.filter((f) => /^image\//.test(f.type)).slice(0, 4);
    if (!files.length) return;
    const accounts = hooks.getAccounts() || [];
    imp = { loading: true, rows: [], accountIndex: 0, plan: null, msg: "" };
    view = "import"; render();
    try {
      const images = await Promise.all(files.map(shrink));
      const res = await api("/api/ai/vision-import", { method: "POST", body: JSON.stringify({ images }) });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "识别失败");
      imp.rows = j.rows.map((r) => ({ symbol: r.symbol || "", name: r.name || "", qty: r.qty ?? "", cost: r.cost ?? "" }));
      imp.accountIndex = Math.max(0, accounts.findIndex((a) => a && a.holdings && a.holdings.length));
    } catch (e) { imp.msg = e.message; }
    imp.loading = false; render();
  }
  const validRows = () => (imp ? imp.rows.filter((r) => String(r.symbol).trim() && Number(r.qty) > 0 && r.cost !== "" && Number(r.cost) >= 0) : []);
  function importHtml() {
    if (!imp) return "";
    if (imp.loading) return `<div class="cai-empty"><span class="cai-dots">正在识别截图</span></div>`;
    const accounts = hooks.getAccounts() || [];
    if (imp.msg && !imp.rows.length) return `<div class="cai-err">${esc(imp.msg)}</div><div class="cai-row"><button class="cai-btn" data-act="back">返回</button></div>`;
    const bad = (v, kind) => (kind === "symbol" ? !String(v).trim() : kind === "qty" ? !(Number(v) > 0) : kind === "cost" ? v === "" || !(Number(v) >= 0) : false);
    return `<div class="cai-sub">核对识别结果</div>
      <div class="cai-hint">AI 识别可能出错，请对照截图检查。代码、数量、成本价都要有；看不清的可以直接改或删掉这一行。</div>
      <div class="cai-row" style="margin:0 0 8px">导入到 <select class="cai-sel" data-acc>${accounts.map((a, i) => `<option value="${i}" ${i === imp.accountIndex ? "selected" : ""}>${esc(a.name)}（${esc(a.currency || "CNY")}）</option>`).join("")}</select></div>
      <table class="cai-tbl"><tr><th>代码</th><th>名称</th><th>数量</th><th>成本价</th><th></th></tr>
      ${imp.rows.map((r, i) => `<tr>${["symbol", "name", "qty", "cost"].map((k) => `<td><input data-r="${i}" data-k="${k}" value="${esc(r[k])}" class="${bad(r[k], k) ? "bad" : ""}" ${k === "qty" || k === "cost" ? 'inputmode="decimal"' : ""}></td>`).join("")}<td><button class="cai-x" data-act="imp-del" data-r="${i}">删</button></td></tr>`).join("")}</table>
      <div data-impplan style="margin-top:10px"></div>
      <div class="cai-row"><button class="cai-btn" data-act="imp-preview">预览变化</button><button class="cai-btn pri" data-act="imp-apply" disabled>确认导入</button><button class="cai-btn" data-act="back">取消</button></div>`;
  }
  function renderImportPlan() {
    const box = root && root.querySelector("[data-impplan]");
    if (!box || !imp) return;
    const btn = root.querySelector("[data-act=imp-apply]");
    if (!imp.plan) { box.innerHTML = imp.msg ? `<div class="cai-err">${esc(imp.msg)}</div>` : ""; if (btn) btn.disabled = true; return; }
    const TAG = { new: "新增", update: "更新", same: "不变", missing: "截图里没有（不删）" };
    const n = (k) => imp.plan.filter((x) => x.status === k).length;
    box.innerHTML = `<div class="cai-hint" style="margin:0 0 4px">新增 ${n("new")} · 更新 ${n("update")} · 不变 ${n("same")}${n("missing") ? ` · 截图里没有 ${n("missing")}` : ""}</div>
      ${imp.plan.map((x) => `<div class="cai-row" style="margin:2px 0;justify-content:space-between"><span>${esc(x.symbol)} ${esc(x.name || "")}</span><span class="cai-tag ${x.status}">${TAG[x.status]}</span></div>`).join("")}`;
    if (btn) btn.disabled = !(n("new") + n("update"));
  }
  async function importCall(apply) {
    const sel = root.querySelector("[data-acc]");
    imp.accountIndex = sel ? +sel.value : 0;
    const rows = validRows().map((r) => ({ symbol: String(r.symbol).trim().toUpperCase(), name: String(r.name || "").trim(), qty: Number(r.qty), cost: Number(r.cost) }));
    if (!rows.length) { imp.msg = "没有完整的行（代码、数量、成本价都要有）"; imp.plan = null; renderImportPlan(); return null; }
    const acc = (hooks.getAccounts() || [])[imp.accountIndex];
    const res = await api("/api/import/positions", { method: "POST", body: JSON.stringify({ accountIndex: imp.accountIndex, accountName: acc ? acc.name : undefined, rows, apply }) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async function previewImport() {
    try { const j = await importCall(false); if (j) { imp.msg = ""; imp.plan = j.plan; } } catch (e) { imp.msg = e.message; imp.plan = null; }
    renderImportPlan();
  }
  async function applyImport() {
    if (imp.applying) return;
    imp.applying = true;
    try {
      const j = await importCall(true);
      if (!j) return;
      const n = (k) => j.plan.filter((x) => x.status === k).length;
      hooks.onPortfolioChanged();
      msgs.push({ role: "assistant", content: `已从截图导入：新增 ${n("new")} 只，更新 ${n("update")} 只。截图里没有的持仓没有改动。` });
      saveChat(); imp = null; view = "chat"; render();
    } catch (e) { imp.msg = e.message; renderImportPlan(); }
    if (imp) imp.applying = false;
  }

  function close() { if (root) root.style.display = "none"; document.body.style.overflow = ""; }
  function open(after) {
    hooks.ensureAuth(async () => {
      if (!root) { root = build(); document.body.appendChild(root); }
      root.style.display = "";
      document.body.style.overflow = "hidden";
      if (!cfg || !cfg.enabled) {
        try { cfg = await (await api("/api/ai/config")).json(); } catch (e) { cfg = { enabled: false, error: e.message }; }
      }
      if (!cfg.enabled) { $(".cai-body").innerHTML = `<div class="cai-empty">${esc(cfg.error || "服务器还没有配置 AI。在 .env 里设置 AI_PROVIDER / AI_API_KEY（见 README「AI 顾问」）后重启。")}</div>`; return; }
      render();
      loadPending();
      if (typeof after === "function") after();
    });
  }
  // 页面加载时问一次服务端是否启用了 AI, 用来决定显示不显示入口按钮
  async function available() {
    try { const r = await api("/api/ai/config"); if (!r.ok) return false; cfg = await r.json(); return !!cfg.enabled; } catch (e) { return false; }
  }
  window.CalmAI = { init(h) { hooks = { ...hooks, ...h }; }, open: () => open(), close, available, draft: () => open(() => startOnboard()) };
})();
