// 纪律成绩单 / 年度回顾的界面(手机版、电脑版、分享查看页 card.html 共用)。依赖 report.js(window.CalmReport)。
// 卡片画在 canvas 上: 页面里预览、保存图片、分享查看页用的是同一张图; 卡片只有等级和比例, 没有金额。
(function () {
  "use strict";
  const R = window.CalmReport;
  const SHARE_BASE = "https://wangyue168git.github.io/ulysses/card.html";
  const REPO = "github.com/wangyue168git/ulysses";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const GRADE_COLOR = { "A+": "#2dd4bf", A: "#2dd4bf", B: "#60a5fa", C: "#fbbf24", D: "#fb923c", F: "#f87171" };
  const pct = (x, d = 1) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}%`;

  // ---------- 卡片(canvas, 1080×1440, 3:4 适合朋友圈/小红书) ----------
  function drawCard(p) {
    const W = 1080, H = 1440, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const F = (w, s) => `${w} ${s}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0f2a2e"); bg.addColorStop(1, "#0b1220");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 桅杆与帆的线条装饰
    g.strokeStyle = "rgba(45,212,191,.18)"; g.lineWidth = 6;
    g.beginPath(); g.moveTo(880, 140); g.lineTo(880, 520); g.stroke();
    g.beginPath(); g.moveTo(880, 170); g.quadraticCurveTo(1010, 300, 880, 470); g.stroke();
    g.textBaseline = "alphabetic";
    g.fillStyle = "#99f6e4"; g.font = F(600, 40); g.fillText("ULYSSES · 尤利西斯", 90, 150);
    g.fillStyle = "#e5e7eb"; g.font = F(700, 64); g.fillText(p.title || (p.kind === "year" ? `${p.year} 年度回顾` : "纪律成绩单"), 90, 240);
    const grade = p.grade || "–";
    g.fillStyle = GRADE_COLOR[grade] || "#9ca3af"; g.font = F(800, 300); g.fillText(grade, 80, 560);
    g.fillStyle = "#9ca3af"; g.font = F(500, 38);
    g.fillText(p.streakDays != null ? `连续 ${p.streakDays} 天，买入都事先写了规则` : "按自己写下的规则行事", 90, 640);
    let y = 760;
    (p.items || []).slice(0, 6).forEach(([k, v]) => {
      g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(90, y - 62); g.lineTo(W - 90, y - 62); g.stroke();
      g.fillStyle = "#9ca3af"; g.font = F(500, 40); g.fillText(k, 90, y);
      g.fillStyle = "#f3f4f6"; g.font = F(700, 46); g.textAlign = "right"; g.fillText(v, W - 90, y); g.textAlign = "left";
      y += 110;
    });
    g.fillStyle = "#6b7280"; g.font = F(500, 32);
    g.fillText("把自己绑在桅杆上：冷静时写规则，冲动时守规则", 90, H - 130);
    g.fillStyle = "#5eead4"; g.font = F(600, 32); g.fillText(REPO, 90, H - 80);
    return cv;
  }
  const linkOf = (p) => `${SHARE_BASE}#${R.encodeShare(p)}`;

  // ---------- 弹层 ----------
  function css() {
    if (document.getElementById("cs-style")) return;
    const st = document.createElement("style"); st.id = "cs-style";
    st.textContent = `
.cs-mask{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
.cs-box{width:100%;max-width:400px;max-height:100%;overflow:auto;background:#111827;color:#e5e7eb;border-radius:20px;padding:16px}
.cs-box img{width:100%;border-radius:14px;display:block}
.cs-row{display:flex;gap:8px;margin-top:12px}.cs-row>*{flex:1}
.cs-btn{border:0;border-radius:12px;padding:10px 8px;font:600 14px/1.2 inherit;background:#1f2937;color:#e5e7eb;cursor:pointer;text-align:center;text-decoration:none}
.cs-btn.pri{background:#14b8a6;color:#fff}
.cs-note{color:#9ca3af;font-size:12px;margin-top:10px}
.cs-x{float:right;border:0;background:none;color:#9ca3af;font-size:22px;line-height:1;cursor:pointer;margin:-4px -2px 4px 0}
.cs-story{position:fixed;inset:0;z-index:10000;background:linear-gradient(160deg,#0f2a2e,#0b1220);color:#f3f4f6;display:flex;flex-direction:column;font:16px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;user-select:none}
.cs-bars{display:flex;gap:4px;padding:calc(12px + env(safe-area-inset-top)) 16px 0}.cs-bars i{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.2)}.cs-bars i.on{background:#5eead4}
.cs-slide{flex:1;display:flex;flex-direction:column;justify-content:center;padding:24px 28px;max-width:560px;margin:0 auto;width:100%;box-sizing:border-box}
.cs-k{color:#99f6e4;font-size:14px;font-weight:600;letter-spacing:.08em}
.cs-big{font-size:44px;font-weight:800;line-height:1.15;margin:10px 0}
.cs-mid{font-size:20px;font-weight:600;margin:6px 0}
.cs-dim{color:#9ca3af;font-size:15px}
.cs-quote{border-left:3px solid #2dd4bf;padding:4px 0 4px 12px;margin:10px 0;color:#d1d5db;font-size:15px}
.cs-nav{display:flex;justify-content:space-between;padding:0 20px calc(18px + env(safe-area-inset-bottom));color:#9ca3af;font-size:13px}
.cs-close{position:absolute;top:calc(18px + env(safe-area-inset-top));right:16px;border:0;background:none;color:#e5e7eb;font-size:26px;cursor:pointer}`;
    document.head.appendChild(st);
  }

  function shareBox(p, note) {
    css();
    const cv = drawCard(p), url = cv.toDataURL("image/png"), link = linkOf(p);
    const mask = document.createElement("div");
    mask.className = "cs-mask";
    mask.innerHTML = `<div class="cs-box" role="dialog" aria-label="分享">
      <button class="cs-x" data-a="close" aria-label="关闭">×</button>
      <img src="${url}" alt="${esc(p.title || "纪律成绩单")}">
      <div class="cs-row"><button class="cs-btn pri" data-a="img">保存图片</button><button class="cs-btn" data-a="link">复制链接</button></div>
      <div class="cs-note">${esc(note || "卡片和链接里只有等级和比例，没有金额。链接的内容放在 # 后面，不会经过任何服务器。")}</div>
    </div>`;
    document.body.appendChild(mask);
    mask.onclick = async (e) => {
      if (e.target === mask) return mask.remove();
      const b = e.target.closest("[data-a]"); if (!b) return;
      if (b.dataset.a === "close") return mask.remove();
      if (b.dataset.a === "img") {
        const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
        const file = new File([blob], `ulysses-${p.kind === "year" ? p.year : "card"}.png`, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (x) { if (x && x.name === "AbortError") return; } }
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      if (b.dataset.a === "link") {
        try { await navigator.clipboard.writeText(link); b.textContent = "已复制 ✓"; }
        catch (x) { window.prompt("复制这个链接：", link); }
      }
    };
  }

  // ---------- 成绩单 ----------
  function cardPayload(c) {
    return { kind: "card", grade: c.grade, title: "纪律成绩单", streakDays: c.streakDays, items: c.parts.map((x) => [x.label, x.value]) };
  }
  function openCard(state, plan) {
    const c = R.scorecard(state, plan, { now: new Date() });
    if (!c.parts.length || c.score == null) { alert("还没有足够的记录生成成绩单：先录入持仓、写下规则。"); return; }
    shareBox(cardPayload(c), `统计区间 ${c.from} 至 ${c.to}。卡片和链接里只有等级和比例，没有金额；链接内容在 # 后面，不经过任何服务器。`);
  }

  // ---------- 年度回顾(一页一页翻) ----------
  function slidesOf(y) {
    const S = [];
    S.push(`<div class="cs-k">ULYSSES · 尤利西斯</div><div class="cs-big">你的 ${y.year}</div><div class="cs-dim">${y.partial ? `今年至今（${y.from.slice(5)} – ${y.to.slice(5)}）` : `${y.from} – ${y.to}`}<br>看看这一年，你是怎么守住自己写下的规则的。</div>`);
    if (y.dca && y.dca.total) S.push(`<div class="cs-k">定投</div><div class="cs-big">${y.dca.done} / ${y.dca.total} 个月</div><div class="cs-mid">按计划完成了定投</div><div class="cs-dim">最长连续 ${y.dca.bestStreak} 个月没断过。${y.dca.done === y.dca.total ? "一个月都没落下。" : "落下的月份不用补，下个月照常就好。"}</div>`);
    if (y.curve) {
      const act = { nothing: "那几天你什么都没做。<br>这就是纪律。👍", bought: "那几天你按计划买入了。<br>别人恐慌的时候，你在执行。", sold: "那几天你卖出了。<br>回头看看当时写下的理由，还成立吗？" }[y.troughAction];
      S.push(`<div class="cs-k">收益与回撤</div><div class="cs-big">${pct(y.curve.returnPct)}</div><div class="cs-dim">${y.partial ? "今年至今" : "全年"}的收益，已扣除期间新投入的钱</div>
        ${y.curve.maxDrawdownPct < -3 ? `<div class="cs-mid" style="margin-top:22px">最大回撤 ${pct(y.curve.maxDrawdownPct)}</div><div class="cs-dim">最低点在 ${y.curve.trough}。${act ? "<br>" + act : ""}</div>` : `<div class="cs-dim" style="margin-top:22px">这一年没有像样的回撤。</div>`}`);
    }
    const t = y.trades;
    S.push(`<div class="cs-k">交易</div><div class="cs-big">买入 ${t.buys} 次</div><div class="cs-mid">卖出 ${t.sells} 次</div>
      <div class="cs-dim">${t.ruledPct != null ? `${t.ruledPct}% 的买入，事先写好了规则。` : "这一年没有新的买入。"}${t.topSymbol ? `<br>买得最多的是 ${esc(t.topSymbol)}（${t.topCount} 次）。` : ""}</div>`);
    const r = y.rules;
    S.push(`<div class="cs-k">规则</div>${r.count === 0 ? `<div class="cs-big">一次都没改</div><div class="cs-dim">一整年，你都按年初写下的规则走。</div>`
      : `<div class="cs-big">改了 ${r.count} 次规则</div><div class="cs-dim">每次都写了理由：</div>${r.reasons.map((x) => `<div class="cs-quote">“${esc(x.reason)}”<br><span class="cs-dim">${x.date}</span></div>`).join("")}`}`);
    S.push(`<div class="cs-k">${y.year} 纪律成绩</div><div class="cs-big" style="font-size:96px;color:${GRADE_COLOR[y.grade] || "#9ca3af"}">${y.grade || "–"}</div>
      ${y.parts.map((p) => `<div style="display:flex;justify-content:space-between;padding:9px 0;border-top:1px solid rgba(255,255,255,.08)"><span class="cs-dim">${esc(p.label)}</span><b>${esc(p.value)}</b></div>`).join("")}
      <div class="cs-row" style="margin-top:22px"><button class="cs-btn pri" data-a="share">分享年度成绩</button></div>`);
    return S;
  }
  function yearPayload(y) {
    const items = [];
    if (y.dca && y.dca.total) items.push(["定投完成", `${y.dca.done}/${y.dca.total} 个月`]);
    if (y.trades.ruledPct != null) items.push(["买入有规则", `${y.trades.ruledPct}%`]);
    items.push(["改规则", `${y.rules.count} 次`]);
    items.push(["买入 / 卖出", `${y.trades.buys} / ${y.trades.sells} 次`]);
    if (y.troughAction === "nothing") items.push(["最大回撤那几天", "什么都没做"]);
    return { kind: "year", year: y.year, grade: y.grade, title: `${y.year} 年度回顾`, streakDays: null, items };
  }
  function openYear(state, plan, history, year) {
    css();
    const y = R.yearReview(state, plan, history, year, { now: new Date() });
    const slides = slidesOf(y);
    let i = 0;
    const el = document.createElement("div");
    el.className = "cs-story";
    const draw = () => {
      el.innerHTML = `<div class="cs-bars">${slides.map((_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div>
        <button class="cs-close" data-a="close" aria-label="关闭">×</button>
        <div class="cs-slide">${slides[i]}</div>
        <div class="cs-nav"><span>${i > 0 ? "‹ 上一页" : ""}</span><span>${i < slides.length - 1 ? "点一下继续 ›" : ""}</span></div>`;
    };
    draw();
    document.body.appendChild(el);
    el.onclick = (e) => {
      const b = e.target.closest("[data-a]");
      if (b && b.dataset.a === "close") return el.remove();
      if (b && b.dataset.a === "share") return shareBox(yearPayload(y));
      const back = e.clientX < window.innerWidth * 0.3;
      if (back && i > 0) i--; else if (!back && i < slides.length - 1) i++; else return;
      draw();
    };
  }

  // ---------- 本月该买什么(只在自己页面里看, 有金额, 不分享) ----------
  function openAdvice(state, plan, opts) {
    css();
    const ip = plan && plan.channels && plan.channels.indexPlan;
    let budget = 0;
    try { budget = Number(localStorage.getItem("ulyssesAdviceBudget")) || 0; } catch (e) {}
    if (!budget) budget = (ip && Number(ip.monthlyCNY)) || 3000;
    const money = (n) => "¥" + Math.round(n).toLocaleString("en-US");
    const native = (r) => (r.cur === "USD" ? "$" : r.cur === "HKD" ? "HK$" : "¥") + (r.price >= 100 ? r.price.toFixed(2) : r.price.toFixed(3));
    const mask = document.createElement("div");
    mask.className = "cs-mask";
    mask.innerHTML = `<div class="cs-box" role="dialog" aria-label="本月该买什么">
      <button class="cs-x" data-a="close" aria-label="关闭">×</button>
      <div style="font-size:17px;font-weight:700">本月该买什么</div>
      <div class="cs-note" style="margin-top:4px">按你写下的规则，把这个月要投的钱分到「可加」的标的上：先补指数定投，再补结构，然后才是个股。</div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:14px;background:#1f2937;border-radius:12px;padding:10px 12px">
        <span style="color:#9ca3af;white-space:nowrap">这个月投入 ¥</span>
        <input id="csBudget" type="number" inputmode="decimal" min="0" step="100" value="${budget}" style="flex:1;min-width:0;border:0;outline:0;background:none;color:#f3f4f6;font:700 20px/1.2 inherit">
      </label>
      <div id="csAdv" style="margin-top:12px"></div>
      <div class="cs-note">只是按规则算出来的建议，不会下单，也不构成投资建议。股价是看板里的最新价，实际成交会有出入；美股按碎股算到 0.01 股。</div>
    </div>`;
    document.body.appendChild(mask);
    const inp = mask.querySelector("#csBudget"), box = mask.querySelector("#csAdv");
    const draw = () => {
      const b = Math.max(0, Number(inp.value) || 0);
      try { localStorage.setItem("ulyssesAdviceBudget", String(b)); } catch (e) {}
      const r = R.buyAdvice(state, plan, b, opts || {});
      box.innerHTML = (r.rows.length ? r.rows.map((x) => `<div style="padding:10px 0;border-top:1px solid rgba(255,255,255,.08)">
          <div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(x.symbol)} <span style="color:#9ca3af;font-weight:500;font-size:12px">${esc(x.name !== x.symbol ? x.name : "")}</span></b><b>${money(x.amountCNY)}</b></div>
          <div style="display:flex;justify-content:space-between;gap:8px;color:#9ca3af;font-size:12px;margin-top:2px"><span>${esc(x.reasons.join("；"))}</span><span style="white-space:nowrap">${x.lot ? x.shares : x.shares.toFixed(2)} 股 × ${native(x)}</span></div>
        </div>`).join("") : `<div class="cs-note">没有可分配的标的。</div>`)
        + (r.leftoverCNY >= 1 ? `<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid rgba(255,255,255,.08);color:#9ca3af"><span>留作现金</span><span>${money(r.leftoverCNY)}</span></div>` : "")
        + r.notes.map((n) => `<div class="cs-note">· ${esc(n)}</div>`).join("");
    };
    inp.oninput = draw;
    draw();
    mask.onclick = (e) => {
      if (e.target === mask) return mask.remove();
      const b = e.target.closest("[data-a]");
      if (b && b.dataset.a === "close") mask.remove();
    };
  }

  // ---------- 首页入口: 12 月 1 日到次年 1 月 15 日出现「年度回顾」卡片, 可关掉 ----------
  // 页面定时调用: yearEntry(容器, { hasData, open(year) }); 不在时间窗或关掉过就清空
  function yearEntry(el, ctx) {
    if (!el) return;
    const now = new Date(), m = now.getMonth(), dd = now.getDate();
    const year = m === 11 ? now.getFullYear() : m === 0 && dd <= 15 ? now.getFullYear() - 1 : null;
    const key = "ulyssesYearCard-" + year;
    let off = false; try { off = localStorage.getItem(key) === "off"; } catch (e) {}
    const show = !!(year && ctx.hasData && !off);
    const sig = show ? String(year) : "";
    if (el.dataset.ycKey === sig) return;
    el.dataset.ycKey = sig;
    if (!show) { el.innerHTML = ""; return; }
    css();
    el.innerHTML = `<div style="display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#0f766e,#134e4a);color:#fff;border-radius:20px;padding:14px 16px;margin:0 0 14px;cursor:pointer" data-yc="open">
      <div style="font-size:28px">🧭</div>
      <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:15px">${year} 年度回顾</div><div style="font-size:12px;opacity:.8">这一年，你守住了几次自己写下的规则？</div></div>
      <button data-yc="off" aria-label="不再显示" style="border:0;background:none;color:#fff;opacity:.7;font-size:20px;cursor:pointer">×</button></div>`;
    el.onclick = (e) => {
      const b = e.target.closest("[data-yc]"); if (!b) return;
      if (b.dataset.yc === "off") { try { localStorage.setItem(key, "off"); } catch (x) {} el.dataset.ycKey = ""; el.innerHTML = ""; return; }
      ctx.open(year);
    };
  }

  window.CalmShare = { drawCard, openCard, openYear, openAdvice, yearEntry, linkOf, cardPayload, yearPayload };
})();
