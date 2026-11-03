// 纪律成绩单 + 年度回顾的计算(前后端共用, 纯函数)。页面以 <script> 引入(挂 window.CalmReport), 测试里 require。
// 只算比例、次数、等级, 不输出任何金额: 结果可以直接拿去分享。
(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./classify") : root;

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, "0");
  const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const mulOf = (cur, rate) => (cur === "USD" ? rate : cur === "HKD" ? rate / 7.8 : 1);
  const rateOf = (state) => (state && state.exchangeRate && Number(state.exchangeRate.USD_CNY)) || 7.2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 每笔「买入 / 卖出」: buy/sell 记录, 以及 sync(券商同步)里股数的增减。
  // 每只持仓的第一条 sync 是建账时的底数, 不算一次决定。
  function tradeEvents(state) {
    const rate = rateOf(state), out = [];
    ((state && state.accounts) || []).forEach((acc) => {
      const m = mulOf(acc.currency || "CNY", rate);
      (acc.holdings || []).forEach((h) => {
        const tx = (Array.isArray(h.transactions) ? h.transactions : []).filter((t) => t && t.date && !isNaN(new Date(t.date)))
          .slice().sort((a, b) => new Date(a.date) - new Date(b.date));
        let prev = null;
        tx.forEach((t) => {
          const sh = Number(t.shares) || 0, px = Number(t.price) || 0;
          let d = 0;
          if (t.type === "sync") { if (prev !== null) d = sh - prev; prev = sh; }
          else if (t.type === "buy") { d = sh; prev = (prev || 0) + sh; }
          else if (t.type === "sell") { d = -sh; prev = (prev || 0) - sh; }
          if (Math.abs(d) < 1e-9) return;
          out.push({ date: new Date(t.date), symbol: String(h.symbol || ""), side: d > 0 ? "buy" : "sell", cny: Math.abs(d) * px * m });
        });
      });
    });
    return out.sort((a, b) => a.date - b.date);
  }

  // 「先写规则再买」: 买入的标的在规则表里有一条(任意类型), 或者是定投计划里的指数
  function hasRule(plan, symbol) {
    const ch = (plan && plan.channels) || {};
    return !!((ch.symbols && ch.symbols[symbol]) || (ch.indexPlan && Array.isArray(ch.indexPlan.symbols) && ch.indexPlan.symbols.includes(symbol)));
  }

  // 定投: 区间内每个月指数定投买了多少(元), 是否达标(≥ passCNY)
  function dcaMonths(events, plan, from, to, now) {
    const ip = plan && plan.channels && plan.channels.indexPlan;
    if (!ip || !Array.isArray(ip.symbols) || !ip.symbols.length) return null;
    const pass = Number(ip.passCNY) || Number(ip.monthlyCNY) || 0;
    const byYm = {};
    events.forEach((e) => { if (e.side === "buy" && ip.symbols.includes(e.symbol)) byYm[ymOf(e.date)] = (byYm[ymOf(e.date)] || 0) + e.cny; });
    const months = [];
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const ym = ymOf(d), cny = byYm[ym] || 0;
      months.push({ ym, done: pass > 0 ? cny >= pass : cny > 0 });
    }
    // 当月还没过完: 没完成就先不算进分母
    const cur = ymOf(now || new Date());
    if (months.length && months[months.length - 1].ym === cur && !months[months.length - 1].done) months.pop();
    let best = 0, run = 0;
    months.forEach((x) => { run = x.done ? run + 1 : 0; best = Math.max(best, run); });
    return { months, done: months.filter((x) => x.done).length, total: months.length, bestStreak: best };
  }

  // 结构: 指数合计、个股合计占比, 和目标比
  function structure(state, plan) {
    if (C.configureGroups && plan) C.configureGroups(plan.groups);
    const rate = rateOf(state);
    let idx = 0, stock = 0, tot = 0;
    ((state && state.accounts) || []).forEach((acc) => {
      const m = mulOf(acc.currency || "CNY", rate);
      tot += (Number(acc.cash) || 0) * m;
      (acc.holdings || []).forEach((h) => {
        const v = ((Number(h.marketValue) || (Number(h.shares) || 0) * (Number(h.currentPrice) || Number(h.costPrice) || 0)) + (Number(h.pendingAmount) || 0)) * m;
        if (!(v > 0)) return;
        tot += v;
        const b = C.classifyAllocationBucket(h);
        if (b === "纳指指数类" || b === "标普") idx += v;
        else if ((h.market === "nasdaq" || h.market === "nyse") && !C.isOtherHolding(h)) stock += v;
      });
    });
    const ta = (plan && plan.targetAllocation) || {};
    return {
      indexPct: tot > 0 ? idx / tot * 100 : 0, stockPct: tot > 0 ? stock / tot * 100 : 0,
      indexTarget: ta.indexTargetPct != null ? Number(ta.indexTargetPct) : null,
      stockCap: ta.stockCapPct != null ? Number(ta.stockCapPct) : null,
    };
  }

  // 规则修改: plan.changelog 里带日期的记录(建账时的初始规则没有日期, 不算)
  function ruleChanges(plan, from, to) {
    return ((plan && plan.changelog) || []).filter((c) => c && c.date && new Date(c.date) >= from && new Date(c.date) <= to)
      .map((c) => ({ date: new Date(c.date), reason: String(c.reason || "").trim(), changes: Array.isArray(c.changes) ? c.changes : [], ai: c.source === "ai" }));
  }

  const GRADES = [[95, "A+"], [85, "A"], [70, "B"], [55, "C"], [40, "D"], [-1, "F"]];
  const gradeOf = (s) => (s == null ? null : GRADES.find(([t]) => s >= t)[1]);

  // 成绩单: 过去 12 个月(不足就从第一笔记录算起)。每项能算才计入, 按权重合成总分。
  function scorecard(state, plan, opts) {
    const now = (opts && opts.now) || new Date();
    const events = tradeEvents(state);
    const start = (opts && opts.from) || (() => {
      const yearAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return events.length && events[0].date > yearAgo ? new Date(events[0].date.getFullYear(), events[0].date.getMonth(), 1) : yearAgo;
    })();
    const end = (opts && opts.to) || now;
    const inWin = events.filter((e) => e.date >= start && e.date <= end);
    const parts = [];

    const dca = dcaMonths(events, plan, start, end, now);
    if (dca && dca.total > 0) parts.push({ key: "dca", weight: 40, score: dca.done / dca.total * 100, label: "定投完成", value: `${dca.done}/${dca.total} 个月` });

    const buys = inWin.filter((e) => e.side === "buy");
    const ruled = buys.filter((e) => hasRule(plan, e.symbol));
    if (buys.length) parts.push({ key: "rules", weight: 30, score: ruled.length / buys.length * 100, label: "买入有规则", value: `${Math.round(ruled.length / buys.length * 100)}%` });

    const st = structure(state, plan);
    if (st.indexTarget != null || st.stockCap != null) {
      const a = st.indexTarget != null ? clamp(st.indexPct / Math.max(st.indexTarget, 1), 0, 1) * 100 : null;
      const b = st.stockCap != null ? (st.stockPct <= st.stockCap ? 100 : clamp(st.stockCap / Math.max(st.stockPct, 0.1), 0, 1) * 100) : null;
      const xs = [a, b].filter((x) => x != null);
      parts.push({ key: "structure", weight: 20, score: xs.reduce((s, x) => s + x, 0) / xs.length, label: "指数占比",
        value: `${Math.round(st.indexPct)}%${st.indexTarget != null ? `（目标 ≥${st.indexTarget}%）` : ""}` });
    }

    // 改规则的频率: 按每 90 天几次打分(年度回顾看全年)
    const calmDays = (opts && opts.calmDays) || 90;
    const recent = ruleChanges(plan, new Date(end - calmDays * DAY), end).length;
    const rate = recent * 90 / calmDays;
    parts.push({ key: "calm", weight: 10, score: rate <= 1 ? 100 : rate <= 2 ? 80 : rate <= 3 ? 60 : 40,
      label: calmDays >= 365 ? "全年改规则" : `近 ${calmDays} 天改规则`, value: `${recent} 次` });

    const used = parts.reduce((s, p) => s + p.weight, 0);
    const score = used ? Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / used) : null;
    const lastOff = buys.filter((e) => !hasRule(plan, e.symbol)).pop();
    const since = lastOff ? lastOff.date : (events[0] ? events[0].date : null);
    const streakDays = since ? Math.max(0, Math.floor((end - since) / DAY)) : null;
    return { score, grade: gradeOf(score), parts, streakDays, streakFromStart: !lastOff, from: dayOf(start), to: dayOf(end) };
  }

  // 用历史快照算时间加权收益(扣掉期间投入)和最大回撤; 快照 { t, v(市值), c(成本), r(已实现) }
  function yearCurve(history, from, to) {
    const pts = (history || []).filter((s) => s && s.t && new Date(s.t) >= from && new Date(s.t) <= to && s.v > 0)
      .sort((a, b) => new Date(a.t) - new Date(b.t));
    if (pts.length < 2) return null;
    let idx = 1, peak = 1, maxDD = 0, trough = null;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i];
      const pnl0 = p0.v - p0.c + (p0.r || 0), pnl1 = p1.v - p1.c + (p1.r || 0);
      idx *= 1 + (pnl1 - pnl0) / p0.v;
      if (idx > peak) peak = idx;
      const dd = idx / peak - 1;
      if (dd < maxDD) { maxDD = dd; trough = new Date(p1.t); }
    }
    return { returnPct: (idx - 1) * 100, maxDrawdownPct: maxDD * 100, trough };
  }

  // 年度回顾: 某一年(今年就是「今年至今」)的定投、收益和回撤、最深那天做了什么、交易、规则修改
  function yearReview(state, plan, history, year, opts) {
    const now = (opts && opts.now) || new Date();
    const from = new Date(year, 0, 1), to = new Date(Math.min(new Date(year + 1, 0, 1) - 1, now));
    const events = tradeEvents(state).filter((e) => e.date >= from && e.date <= to);
    const dca = dcaMonths(tradeEvents(state), plan, from, to, now);
    const curve = yearCurve(history, from, to);
    let troughAction = null;
    if (curve && curve.trough && curve.maxDrawdownPct < -3) {
      const near = events.filter((e) => Math.abs(e.date - curve.trough) <= 3 * DAY);
      troughAction = near.some((e) => e.side === "sell") ? "sold" : near.some((e) => e.side === "buy") ? "bought" : "nothing";
    }
    const buys = events.filter((e) => e.side === "buy"), sells = events.filter((e) => e.side === "sell");
    const count = {};
    buys.forEach((e) => { count[e.symbol] = (count[e.symbol] || 0) + 1; });
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    const changes = ruleChanges(plan, from, to);
    const card = scorecard(state, plan, { now, from, to, calmDays: Math.max(90, Math.round((to - from) / DAY)) });
    return {
      year, partial: to < new Date(year + 1, 0, 1) - 1, from: dayOf(from), to: dayOf(to),
      dca: dca && { done: dca.done, total: dca.total, bestStreak: dca.bestStreak },
      curve: curve && { returnPct: curve.returnPct, maxDrawdownPct: curve.maxDrawdownPct, trough: curve.trough ? dayOf(curve.trough) : null },
      troughAction,
      trades: { buys: buys.length, sells: sells.length, ruledPct: buys.length ? Math.round(buys.filter((e) => hasRule(plan, e.symbol)).length / buys.length * 100) : null, topSymbol: top ? top[0] : null, topCount: top ? top[1] : 0 },
      rules: { count: changes.length, reasons: changes.filter((c) => c.reason).slice(-3).map((c) => ({ date: dayOf(c.date), reason: c.reason.slice(0, 60) })) },
      grade: card.grade, score: card.score, parts: card.parts,
    };
  }

  // 分享: 只放等级和比例, 编成 URL 的 # 部分(不会发给任何服务器)
  const b64u = (s) => {
    const bin = unescape(encodeURIComponent(s));
    const b = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const unb64u = (s) => {
    const b = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = typeof atob === "function" ? atob(b) : Buffer.from(b, "base64").toString("binary");
    return decodeURIComponent(escape(bin));
  };
  function encodeShare(p) {
    return b64u(JSON.stringify({ v: 1, k: p.kind, g: p.grade, y: p.year, t: p.title, s: p.streakDays, i: (p.items || []).slice(0, 6).map((x) => [String(x[0]).slice(0, 20), String(x[1]).slice(0, 30)]) }));
  }
  function decodeShare(frag) {
    try {
      if (typeof frag !== "string" || frag.length > 3000 || !/^[\w-]+$/.test(frag)) return null;
      const j = JSON.parse(unb64u(frag));
      if (!j || j.v !== 1 || !/^(card|year)$/.test(j.k) || !(j.g == null || /^(A\+|A|B|C|D|F)$/.test(j.g)) || !Array.isArray(j.i)) return null;
      return { kind: j.k, grade: j.g || null, year: Number.isInteger(j.y) ? j.y : null, title: typeof j.t === "string" ? j.t.slice(0, 40) : "",
        streakDays: Number.isInteger(j.s) ? j.s : null, items: j.i.filter((x) => Array.isArray(x) && x.length === 2).slice(0, 6).map((x) => [String(x[0]).slice(0, 20), String(x[1]).slice(0, 30)]) };
    } catch (e) { return null; }
  }

  // ---------- 本月该买什么: 按自己的规则, 把这个月要投的钱分到「可加」的标的上 ----------
  // 顺序: ① 指数定投补到本月目标 ② 指数占比低于下限就继续补指数 ③ 可加的个股补到封仓线下(不超目标股数、个股合计上限)
  //       ④ 剩下的回到指数; 没有可加的就留作现金。只是建议, 不会下单。
  // opts: { now, store(迟滞记忆, 页面传 localStorage 包装), iopvOf(symbol) → { iopv, time }(场内 ETF 溢价规则用) }
  function buyAdvice(state, plan, budgetCNY, opts) {
    opts = opts || {};
    const now = opts.now || new Date();
    const rate = rateOf(state), ch = (plan && plan.channels) || {}, ta = (plan && plan.targetAllocation) || {};
    if (C.configureGroups && plan) C.configureGroups(plan.groups);
    const offAcc = new Set(ch.offshoreAccounts || []);
    let total = 0, stockV = 0, idxV = 0, offshore = 0;
    const bySym = {};
    ((state && state.accounts) || []).forEach((acc) => {
      const cur = acc.currency || "CNY", m = mulOf(cur, rate);
      total += (Number(acc.cash) || 0) * m;
      (acc.holdings || []).forEach((h) => {
        const v = ((Number(h.marketValue) || 0) + (Number(h.pendingAmount) || 0)) * m;
        if (!(v > 0)) return;
        total += v;
        const b = C.classifyAllocationBucket(h);
        const kind = b === "纳指指数类" || b === "标普" ? "index" : (h.market === "nasdaq" || h.market === "nyse") && !C.isOtherHolding(h) ? "stock" : "other";
        if (kind === "index") idxV += v;
        if (kind === "stock") stockV += v;
        if (offAcc.has(acc.name) && h.market !== "crypto") offshore += v;
        const s = bySym[h.symbol] || (bySym[h.symbol] = { symbol: h.symbol, name: h.name || h.symbol, market: h.market, cur, m, price: Number(h.currentPrice) || 0, shares: 0, v: 0, kind });
        s.shares += Number(h.shares) || 0; s.v += v;
        if (!s.price) s.price = Number(h.currentPrice) || 0;
      });
    });
    const B = Math.max(0, Number(budgetCNY) || 0), T = total + B;
    const stockPct = total > 0 ? stockV / total * 100 : 0;
    const rows = Object.values(bySym).filter((s) => s.price > 0).map((s) => {
      const io = opts.iopvOf ? opts.iopvOf(s.symbol) || {} : {};
      const ev = C.evaluateChannel(ch, s.symbol, { weightPct: total > 0 ? s.v / total * 100 : 0, stockPct, offshoreCNY: offshore, usdCny: rate,
        price: s.price, iopv: io.iopv || 0, iopvTime: io.time || "", shares: s.shares }, opts.store);
      return Object.assign(s, { st: ev.st, rule: (ch.symbols || {})[s.symbol] || null });
    });
    const open = rows.filter((s) => s.st === "open");
    const alloc = new Map(), why = {};   // Map 保留分配顺序(定投 → 结构 → 个股 → 余额), 列表照这个顺序显示
    let left = B;
    const give = (list, amount, reason) => {
      amount = Math.min(amount, left);
      if (!(amount > 0) || !list.length) return 0;
      const each = amount / list.length;
      list.forEach((s) => { alloc.set(s.symbol, (alloc.get(s.symbol) || 0) + each); why[s.symbol] = why[s.symbol] || []; if (!why[s.symbol].includes(reason)) why[s.symbol].push(reason); });
      left -= amount;
      return amount;
    };
    const fmt = (n) => "¥" + Math.round(n).toLocaleString("en-US");
    const notes = [];

    // ① 指数定投
    const ip = ch.indexPlan;
    const hasIp = !!(ip && Array.isArray(ip.symbols) && ip.symbols.length);
    const ipOpen = hasIp ? open.filter((s) => ip.symbols.includes(s.symbol)) : [];
    if (hasIp) {
      const ym = ymOf(now);
      const bought = tradeEvents(state).filter((e) => e.side === "buy" && ip.symbols.includes(e.symbol) && ymOf(e.date) === ym).reduce((a, e) => a + e.cny, 0);
      const need = Math.max(0, (Number(ip.monthlyCNY) || 0) - bought);
      if (need > 0 && ipOpen.length) give(ipOpen, need, `每月指数定投（目标 ${fmt(Number(ip.monthlyCNY) || 0)}，本月已买 ${fmt(bought)}）`);
      else if (need > 0) notes.push("定投计划里的指数现在都不是「可加」，这部分先不分配。");
      else notes.push(`本月指数定投已买 ${fmt(bought)}，达到目标。`);
    }
    // ② 指数占比低于下限
    const idxOpen = open.filter((s) => s.kind === "index");
    if (ta.indexTargetPct != null && idxOpen.length) {
      const added = idxOpen.reduce((a, s) => a + (alloc.get(s.symbol) || 0), 0);
      const gap = Number(ta.indexTargetPct) / 100 * T - idxV - added;
      if (gap > 0) give(idxOpen, gap, `指数占比低于目标 ≥${ta.indexTargetPct}%`);
    }
    // ③ 可加的个股: 补到封仓线以下 0.5 个百分点, 不超过目标股数和个股合计上限
    const capPct = ta.stockCapPct != null ? Number(ta.stockCapPct) : ch.stockBucketCapPct != null ? Number(ch.stockBucketCapPct) : null;
    let stockRoom = capPct != null ? capPct / 100 * T - stockV : Infinity;
    open.filter((s) => s.kind === "stock").sort((a, b) => a.v - b.v).forEach((s) => {
      const r = s.rule || {};
      const sealPct = r.type === "band" ? Number(r.sealAtPct) : Number(ta.singleCapPct) || null;
      let room = sealPct ? (sealPct - 0.5) / 100 * T - s.v : 0;
      if (r.targetShares > 0) room = Math.min(room, Math.max(0, r.targetShares - s.shares) * s.price * s.m);
      room = Math.min(room, stockRoom);
      if (room > s.price * s.m * 0.2) {
        const got = give([s], room, sealPct ? `占比 ${(s.v / Math.max(total, 1) * 100).toFixed(1)}%，加到封仓线 ${sealPct}% 以下${r.targetShares > 0 ? `，目标 ${r.targetShares} 股` : ""}` : "可加");
        stockRoom -= got;
      }
    });
    // ④ 剩下的回到指数(没有可加的指数, 就给其他「可加」的非个股标的)
    if (left > 0) {
      const pool = ipOpen.length ? ipOpen : idxOpen.length ? idxOpen : open.filter((s) => s.kind !== "stock");
      if (pool.length) give(pool, left, "剩下的钱回到指数");
      else notes.push("现在没有「可加」的标的，剩下的钱先留作现金。");
    }

    // 金额 → 股数: A 股 / 港股按 100 股一手向下取整, 其他保留两位小数(美股多数券商可买碎股)
    let unspent = left;
    const out = [...alloc.keys()].map((sym) => {
      const s = bySym[sym], unit = s.price * s.m;
      const lot = s.market === "sh" || s.market === "sz" || s.market === "hk" ? 100 : 0;
      const shares = lot ? Math.floor(alloc.get(sym) / unit / lot) * lot : Math.floor(alloc.get(sym) / unit * 100) / 100;
      const amount = shares * unit;
      unspent += alloc.get(sym) - amount;
      return { symbol: sym, name: s.name, market: s.market, cur: s.cur, price: s.price, shares, amountCNY: amount, lot, reasons: why[sym] };
    }).filter((r) => r.shares > 0);
    if (unspent > 1 && [...alloc.keys()].some((sym) => ["sh", "sz", "hk"].includes(bySym[sym].market))) notes.push("A 股 / 港股按 100 股一手取整，零头没有分配。");
    return { budgetCNY: B, rows: out, leftoverCNY: Math.max(0, unspent), notes, openCount: open.length };
  }

  const api = { tradeEvents, hasRule, dcaMonths, structure, ruleChanges, scorecard, yearCurve, yearReview, gradeOf, encodeShare, decodeShare, buyAdvice };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CalmReport = api;
})(typeof window !== "undefined" ? window : globalThis);
