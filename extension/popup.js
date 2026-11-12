// Ulysses 浏览器插件(舰桥读数)。只读: 打开弹窗时向你自己的看板要一次数据, 不在后台抓行情, 不发任何修改请求。
// 显示: 你拥有多少股(与首页设置一致) / 指数占比 / 你的公司和指数(股数 + 占比) / 三句话。
// 金额默认上锁, 按住 2 秒解锁, 关掉弹窗就重新上锁。看板地址和登录状态存在浏览器本地(chrome.storage.local)。
const HOLD_MS = 2000, MAX_ROWS = 4;
const ZH = /^zh\b/i.test(navigator.language || 'zh');
const T = ZH ? {
  title: 'ULYSSES // 航向', own: 'YOU OWN', shares: 'SHARES', index: 'INDEX', companies: '你的公司', idx: '指数',
  locked: 'ASSETS · LOCKED', hold: '按住 2 秒解锁', assets: 'ASSETS', none: '还没有持仓', lost: '连不上看板',
  suHint: '填你自己部署的 Ulysses 看板地址和登录密码。插件只读取数据，不会修改任何东西。', suUrl: '看板地址', suPwd: '密码（看板开了免登录只读就留空）',
  badUrl: '地址要以 http:// 或 https:// 开头', denied: '需要允许插件访问这个地址', badPwd: '密码不对', unreachable: '连不上这个地址', tooMany: '尝试太多次，请稍后再试',
  unit: { 股: '股', 份: '份', 枚: '枚' },
} : {
  title: 'ULYSSES // HEADING', own: 'YOU OWN', shares: 'SHARES', index: 'INDEX', companies: 'YOUR COMPANIES', idx: 'INDEX',
  locked: 'ASSETS · LOCKED', hold: 'hold 2s to unlock', assets: 'ASSETS', none: 'NO HOLDINGS', lost: 'CANNOT REACH YOUR DASHBOARD',
  suHint: 'Enter the address and password of your own Ulysses dashboard. The extension only reads data; it never changes anything.', suUrl: 'Dashboard address', suPwd: 'Password (leave empty if public read is on)',
  badUrl: 'The address must start with http:// or https://', denied: 'The extension needs permission to reach this address', badPwd: 'Wrong password', unreachable: 'Cannot reach this address', tooMany: 'Too many attempts, try again later',
  unit: { 股: 'sh', 份: 'units', 枚: 'coins' },
};
const COMPANY = { GOOGL: 'Alphabet', GOOG: 'Alphabet', TSLA: 'Tesla', 'BRK.B': 'Berkshire', MU: 'Micron', AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'NVIDIA', AMZN: 'Amazon', META: 'Meta', KO: 'Coca-Cola', COST: 'Costco', JNJ: 'J&J' };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const shortName = n => String(n).replace(/[（(]QDII[)）]/gi, '').replace(/发起式?/g, '').replace(/指数ETF$/, '').replace(/(指数|主题|混合|股票)[ACI]$/, '$1').replace(/纳斯达克100(指数)?/, '纳指').trim() || String(n);
const unitOf = h => T.unit[h.market === 'crypto' ? '枚' : (h.market === 'fund' || ((h.market === 'sh' || h.market === 'sz') && /^(5|15|16|18)/.test(String(h.symbol || '')))) ? '份' : '股'];
const shTxt = v => v >= 1000 ? Math.round(v).toLocaleString('en-US') : (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

let cfg = { server: '', token: '' }, totalCNY = 0, unlocked = false, holdTimer = null;

function render(data, plan) {
  plan = plan || {};
  if (typeof configureGroups === 'function') { try { configureGroups(plan.groups); } catch (e) {} }   // 警戒 / 其他分组跟着规则走
  const rate = (data.rateInfo && data.rateInfo.USD_CNY) || (data.exchangeRate && data.exchangeRate.USD_CNY) || 7;
  const mulOf = c => c === 'USD' ? rate : c === 'HKD' ? rate / 7.8 : 1;
  const symCfg = (plan.channels && plan.channels.symbols) || {};
  const idxSyms = (plan.channels && plan.channels.indexPlan && plan.channels.indexPlan.symbols) || [];
  const all = []; let total = 0;
  (data.accounts || []).forEach(acc => {
    const m = mulOf(acc.currency || 'CNY');
    total += (acc.cash || 0) * m;
    (acc.holdings || []).forEach(h => {
      const v = Math.max(0, ((h.marketValue || 0) + (h.pendingAmount || 0)) * m), sh = Number(h.shares) || 0;
      if (v <= 0 && sh <= 0) return;
      total += v; all.push({ h, v, sh });
    });
  });
  totalCNY = total;
  const pct = v => total > 0 ? v / total * 100 : 0;
  // 分组与看板同口径: 指数 / 你的公司(个股, 且不是没设规则的小仓) / 其他(不在这里列)
  const idx = [], cos = [];
  all.forEach(it => {
    const b = classifyAllocationBucket(it.h), rule = symCfg[String(it.h.symbol || '').toUpperCase()];
    const watch = pct(it.v) < 5 && !(rule && rule.type === 'band');
    if (b === '纳指指数类' || b === '标普') idx.push(it); else if (isIndividualStock(it.h) && !watch) cos.push(it);
  });
  const sum = a => a.reduce((s, x) => s + x.v, 0), bySize = a => a.slice().sort((x, y) => y.v - x.v);
  const idxPct = pct(sum(idx));
  // 环里的主角跟首页设置(plan.home)走: auto / shares 显示股数; total / none 时显示指数占比
  const home = plan.home || {}, mode = home.hero || 'auto';
  let hero = [];
  if (mode === 'shares') hero = all.filter(x => (home.symbols || []).includes(x.h.symbol));
  else if (mode === 'auto') { const held = bySize(all.filter(x => idxSyms.includes(x.h.symbol))); hero = held.length ? [held[0]] : bySize(all).slice(0, 1); }
  if (hero.length) {
    $('ownLab').textContent = T.own;
    $('ownN').textContent = shTxt(hero.reduce((s, x) => s + x.sh, 0));
    $('ownSub').textContent = T.shares + ' · ' + hero.map(x => x.h.symbol).join('/');
  } else {
    $('ownLab').textContent = T.index;
    $('ownN').textContent = Math.round(idxPct) + '%';
    $('ownSub').textContent = '';
  }
  $('idxLab').textContent = T.index;
  $('idxPct').textContent = Math.round(idxPct) + '%';
  $('arc').setAttribute('stroke-dasharray', `${(idxPct / 100 * 440).toFixed(1)} 440`);
  const maxW = Math.max(1, ...cos.concat(idx).map(x => pct(x.v)));
  const row = (x, color, name) => `<div class="row"><span class="nm">${esc(name)}</span><div class="track"><i style="width:${(pct(x.v) / maxW * 92).toFixed(1)}%;background:${color};box-shadow:0 0 8px ${color}"></i></div><span class="sh mono" style="color:${color}">${shTxt(x.sh)} ${unitOf(x.h)}</span></div>`;
  const top = a => bySize(a).slice(0, MAX_ROWS);
  const usOrName = x => (x.h.market === 'nasdaq' || x.h.market === 'nyse') ? x.h.symbol : shortName(x.h.name || x.h.symbol);
  $('lists').innerHTML =
    (cos.length ? `<div class="sec mono" style="color:var(--amber)">▸ ${T.companies} ${pct(sum(cos)).toFixed(1)}%</div>` + top(cos).map(x => { const s = String(x.h.symbol || '').toUpperCase(); return row(x, '#fbbf24', (symCfg[s] && symCfg[s].company) || COMPANY[s] || shortName(x.h.name || s)); }).join('') : '') +
    (idx.length ? `<div class="sec mono" style="color:var(--c)">▸ ${T.idx} ${idxPct.toFixed(1)}%</div>` + top(idx).map(x => row(x, '#5eead4', usOrName(x))).join('') : '');
  const lines = ((plan.creed && (plan.creed.lines || plan.creed.threeLines)) || []).filter(Boolean).slice(0, 3);
  $('creed').innerHTML = lines.map(t => `<div><span>&gt;</span> ${esc(t)}</div>`).join('');
  $('msg').textContent = all.length ? '' : T.none;
  paintLock();
}

function paintLock() {
  $('lockTxt').innerHTML = unlocked
    ? `${T.assets}<br><b>¥ ${Math.round(totalCNY).toLocaleString('en-US')}</b>`
    : `${T.locked}<br><span class="hint">${T.hold}</span>`;
}
function bindLock() {
  const el = $('lock');
  const down = () => {
    if (unlocked) { unlocked = false; paintLock(); return; }
    el.classList.add('holding');
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { unlocked = true; el.classList.remove('holding'); paintLock(); }, HOLD_MS);
  };
  const up = () => { clearTimeout(holdTimer); el.classList.remove('holding'); };
  el.addEventListener('mousedown', down); el.addEventListener('mouseup', up); el.addEventListener('mouseleave', up);
}

// ---- 存储: 看板地址 / 登录令牌 / 上一次的画面数据 ----
const store = {
  get: keys => new Promise(res => { try { chrome.storage.local.get(keys, v => res(v || {})); } catch (e) { res({}); } }),
  set: obj => new Promise(res => { try { chrome.storage.local.set(obj, res); } catch (e) { res(); } }),
};
const UNAUTH = new Error('unauthorized');
async function getJson(path) {
  const r = await fetch(cfg.server + path + (path.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', headers: cfg.token ? { 'X-Auth-Token': cfg.token } : {} });
  if (r.status === 401) throw UNAUTH;
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// ---- 设置页 ----
function showSetup(err) {
  $('suUrl').value = cfg.server || '';
  $('suPwd').value = '';
  $('setupErr').textContent = err || '';
  $('setup').classList.add('show');
  setTimeout(() => (cfg.server ? $('suPwd') : $('suUrl')).focus(), 50);
}
async function connect() {
  const raw = $('suUrl').value.trim().replace(/\/+$/, ''), password = $('suPwd').value;
  let u;
  try { u = new URL(raw); if (!/^https?:$/.test(u.protocol)) throw 0; } catch (e) { $('setupErr').textContent = T.badUrl; return; }
  const origin = u.origin;
  // 向浏览器申请访问这一个地址的权限(只在点按钮时能申请)
  const granted = await new Promise(res => { try { chrome.permissions.request({ origins: [origin + '/*'] }, ok => res(!!ok)); } catch (e) { res(true); } });
  if (!granted) { $('setupErr').textContent = T.denied; return; }
  let token = '';
  try {
    if (password) {
      const r = await fetch(origin + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (r.status === 429) { $('setupErr').textContent = T.tooMany; return; }
      const d = r.ok ? await r.json() : null;
      if (!d || !d.token) { $('setupErr').textContent = T.badPwd; return; }
      token = d.token;
    }
    cfg = { server: origin, token };
    await getJson('/api/data');   // 试读一次: 没填密码而看板要登录时, 这里会是 401
  } catch (e) { $('setupErr').textContent = e === UNAUTH ? T.badPwd : T.unreachable; return; }
  await store.set({ server: cfg.server, token: cfg.token, snap: null });
  $('setup').classList.remove('show');
  load(null);
}

async function load(snap) {
  try {
    const [data, plan] = await Promise.all([getJson('/api/data'), getJson('/plan.json')]);
    render(data, plan);
    // 只存画面需要的字段, 不存价格和交易记录
    const slim = { rateInfo: data.rateInfo, exchangeRate: data.exchangeRate, accounts: (data.accounts || []).map(a => ({ currency: a.currency, cash: a.cash, holdings: (a.holdings || []).map(h => ({ symbol: h.symbol, name: h.name, market: h.market, shares: h.shares, marketValue: h.marketValue, pendingAmount: h.pendingAmount })) })) };
    store.set({ snap: { data: slim, plan: { creed: plan.creed, home: plan.home, groups: plan.groups, channels: { indexPlan: plan.channels && plan.channels.indexPlan, symbols: plan.channels && plan.channels.symbols } } } });
    $('link').className = 'on'; $('link').textContent = '● LINK';
  } catch (e) {
    if (e === UNAUTH) { cfg.token = ''; await store.set({ token: '' }); showSetup(); return; }
    $('link').className = 'off'; $('link').textContent = '● OFFLINE';
    if (!(snap && snap.data)) $('msg').textContent = T.lost;
  }
}

(async function main() {
  $('hdTitle').textContent = T.title; $('suHint').textContent = T.suHint; $('suUrlLab').textContent = T.suUrl; $('suPwdLab').textContent = T.suPwd;
  bindLock(); paintLock();
  $('gear').addEventListener('click', () => showSetup());
  $('suGo').addEventListener('click', connect);
  $('suPwd').addEventListener('keydown', e => { if (e.key === 'Enter') connect(); });
  const saved = await store.get(['server', 'token', 'snap']);
  cfg = { server: saved.server || '', token: saved.token || '' };
  if (!cfg.server) { showSetup(); return; }
  if (saved.snap && saved.snap.data) { try { render(saved.snap.data, saved.snap.plan); } catch (e) {} }   // 先画上一次的, 不闪空白
  load(saved.snap);
})();
