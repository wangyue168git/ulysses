// 界面英文: 默认跟随浏览器语言(中文环境显示中文, 其余显示英文), 也可以在「⋯」菜单里手动切换。
// 做法: 页面本身只写中文; 选了英文时, 这个脚本把页面上的中文界面文字换成英文(包括之后动态生成的)。
// 持仓名称、你自己写的三句话和说明文字不翻译。AI 顾问的回答、年度回顾和分享图里的大段文字目前只有中文。
(function () {
  "use strict";
  var KEY = "ulyssesLang";
  function pick() {
    try { var v = localStorage.getItem(KEY); if (v === "zh" || v === "en") return v; } catch (e) {}
    return /^zh\b/i.test(navigator.language || "zh") ? "zh" : "en";
  }
  var lang = pick();
  window.UlyssesI18n = {
    lang: lang,
    label: function () { return lang === "en" ? "English" : "中文"; },
    toggle: function () { try { localStorage.setItem(KEY, lang === "en" ? "zh" : "en"); } catch (e) {} location.reload(); },
  };
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  if (lang !== "en") return;

  // ---------- 整句对照(文字节点或属性完全等于左边时替换) ----------
  var EXACT = {
    // 导航和标题
    "航向": "Heading", "投资组合": "Portfolio", "持仓": "Holdings", "总览": "Overview", "更多": "More", "关闭": "Close", "关闭 (Esc)": "Close (Esc)",
    // 首页
    "你拥有": "You own", "总资产": "Total assets", "种": "种", "收": "收", "守": "守",
    "还没写规则：所有持仓默认「封仓」。可以在上面的「开始使用」里写规则。": "No rules yet: every holding is on hold by default. Write your rules from the \"Get started\" card above.",
    // 分组和标签
    "指数": "Index", "个股": "Stocks", "其他": "Other", "现金": "Cash", "观察": "Watch", "观察仓": "Watch list", "警戒": "Caution", "可加": "Add", "封仓": "Hold off",
    "纳指": "Nasdaq", "标普": "S&P", "纳指指数类": "Nasdaq index", "加密资产": "Crypto", "加密货币": "Crypto", "加密": "Crypto", "美国": "US", "中国": "China", "港股": "Hong Kong", "基金": "Fund", "全部": "All",
    "展开": "Show more", "收起": "Show less", "无行情": "No quote", "暂无持仓": "No holdings yet", "定投中": "Auto-invest on",
    // 「⋯」菜单
    "新增持仓": "Add holding", "本月该买什么": "What to buy this month", "纪律成绩单": "Discipline scorecard", "年度回顾": "Year in review", "AI 顾问": "AI advisor",
    "首页设置": "Home settings", "外观": "Appearance", "语言": "Language", "跟随系统": "System", "浅色": "Light", "深色": "Dark", "持仓鱼缸": "Fish tank",
    "🌗 跟随系统": "🌗 System", "☀️ 浅色": "☀️ Light", "🌙 深色": "🌙 Dark",
    // 金额面板和详情
    "总额与走势": "Amount and trend", "金额与走势": "Amount and trend", "全部时间": "all time", "今日": "today", "更新于": "Updated", "点一下看盈亏": "Tap to see P&L",
    "点击切换 ¥ / $": "Tap to switch ¥ / $", "按住 2 秒显示金额": "Hold 2 seconds to reveal amounts", "按住 2 秒显示": "Hold 2 seconds to reveal",
    "按住 2 秒显示金额; 再点一下隐藏": "Hold 2 seconds to reveal amounts; click again to hide", "按住 2 秒显示价格和成本; 再点一下隐藏": "Hold 2 seconds to reveal price and cost; click again to hide",
    "显示金额": "Reveal amounts", "显示价格": "Reveal prices",
    "当前价格 · 今日": "Price · today", "总市值": "Market value", "单位成本 · 总成本": "Unit cost · total cost", "持仓盈亏": "Profit / loss",
    "修改持仓": "Edit holding", "🪙 基金申购 / 校准份额": "🪙 Fund order / adjust units", "修改请在手机上操作（电脑端只看不改）": "Edit on your phone (the desktop page is read-only)",
    // 首页设置
    "首页最上面显示": "Top of the home screen", "自动（定投的指数；没写定投就是最大的持仓）": "Automatic (your index plan's fund, or your largest holding)",
    "某一只持仓的数量": "Share count of one holding", "总资产（默认模糊）": "Total assets (blurred by default)", "什么都不显示": "Nothing",
    "哪一只": "Which one", "数字下面的一句说明（可不填）": "A line under the number (optional)", "写给自己的三句话（可不填，第一句最大）": "Three lines to yourself (optional; the first is largest)",
    "首页还要显示（默认都不显示）": "Also show on the home screen (all off by default)", "本月定投进度": "This month's index purchase", "结构（指数和个股的占比）": "Structure (index vs stocks)", "个股目标（买够了没有）": "Stock targets (bought enough?)",
    "比如：美国五百家公司的一小块": "e.g. A small piece of 500 companies", "比如：买股票就是买公司": "e.g. Buying a stock is buying a company", "比如：不预测市场": "e.g. Don't predict the market", "比如：慢就是快": "e.g. Slow is fast",
    "结构": "Structure", "个股目标": "Stock targets", "在途申购": "Pending fund orders", "境外托管": "Offshore custody", "✓ 完成": "✓ Done", "已买够 ✓": "Bought enough ✓", "已买够": "Bought enough",
    // 表单通用
    "保存": "Save", "取消": "Cancel", "删除": "Delete", "添加": "Add", "确认": "Confirm", "验证": "Verify", "登录": "Sign in", "进入": "Enter", "密码": "Password",
    "保存失败": "Could not save", "删除失败": "Could not delete", "添加失败": "Could not add",
    "需要密码": "Password required", "需要验证": "Verification required", "修改需要输入密码": "Enter the password to make changes", "输入部署时设置的密码后才能看到持仓": "Enter the password set at deployment to see your holdings",
    "密码错误，请重试": "Wrong password, try again", "密码不对，请重试": "Wrong password, try again", "登录已过期，请重新操作": "Session expired, please try again",
    "请输入登录密码（首次启动时打印在服务日志里）": "Enter the password (printed in the server log on first start)",
    // 新增 / 修改持仓
    "类型": "Type", "账户": "Account", "全部账户": "All accounts", "股票代码": "Symbol", "名称": "Name", "数量": "Quantity", "持仓数量": "Quantity", "现金金额": "Cash amount", "修改现金": "Edit cash",
    "（可选）": "(optional)", "(可留空)": "(optional)", "可留空，默认用代码": "Optional; defaults to the symbol", "未命名": "Unnamed",
    "如 TSLA": "e.g. TSLA", "如 600519 / 000001": "e.g. 600519 / 000001", "如 000055 / 270042 / 161126": "e.g. 000055 / 270042 / 161126", "如 ETH / BTC": "e.g. ETH / BTC", "如 20": "e.g. 20", "如 2099.61": "e.g. 2099.61", "如 2.3814": "e.g. 2.3814",
    "请输入股票代码": "Enter a symbol", "请输入有效的数量和成本价": "Enter a valid quantity and cost", "请输入有效的现金金额": "Enter a valid cash amount", "请输入有效金额": "Enter a valid amount",
    "确认删除这笔持仓？": "Delete this holding?", "美股账户": "US account", "A股账户": "China account",
    // 规则
    "买入规则": "Buying rule", "不设（按默认）": "None (use default)", "一直可加": "Always add", "看占比": "By weight", "一直封仓": "Never add",
    "占比低于 % 可加": "Add while weight is below %", "占比到 % 封仓": "Hold off at weight %", "目标股数（可选，买够即封仓）": "Target shares (optional; stop once reached)",
    "修改理由（可选，会记进规则的修改记录）": "Reason (optional; kept in the rule change log)", "为什么这样定？": "Why this rule?", "目标股数需大于 0": "Target shares must be above 0",
    "占比填写有误：需在 0–100 之间，且「可加」不高于「封仓」": "Invalid weights: use 0–100, and the add line cannot exceed the hold-off line", "填了成本价后显示参考股数": "Enter a cost to see suggested share counts",
    // 基金
    "基金申购 / 校准": "Fund orders / adjust", "申购记录": "Orders", "暂无申购记录": "No orders yet", "＋ 记一笔在途申购": "+ Record a pending order", "记一笔申购（只填金额，份额自动算）": "Record an order (amount only; units are computed)",
    "下单日期": "Order date", "15:00 后下单（按下一交易日净值）": "Ordered after 15:00 (next day's NAV)", "校准份额": "Adjust units", "校准 ›": "Adjust ›", "确认净值": "Confirmed NAV", "实际确认份额（券商显示，最准）": "Confirmed units (as shown by your broker)",
    "两者填其一即可；都填则以「实际份额」为准。": "Fill in either one; if both, confirmed units win.", "请至少填写净值或实际份额其一": "Enter the NAV or the confirmed units", "等待首笔确认": "Waiting for the first confirmation",
    "确认删除这笔申购记录？已确认的会同时撤销对应份额。": "Delete this order? If confirmed, its units are removed too.",
    // 刷新 / 冷静页
    "↓ 下拉刷新": "↓ Pull to refresh", "↓ 继续下拉": "↓ Keep pulling", "松手刷新": "Release to refresh", "刷新中…": "Refreshing…", "✓ 已更新": "✓ Updated", "轻点返回": "Tap to return", "已守候": "Held for", "天": "days",
    "✕ 退出 (Esc)": "✕ Exit (Esc)", "Fish Tank · 持仓鱼缸": "Fish Tank", "鱼越大, 占比越大 · 名字下面是你拥有的数量": "Bigger fish, bigger weight · the number under each name is what you own",
    // 新手引导
    "开始使用": "Get started", "不再提示": "Dismiss", "录入持仓": "Enter your holdings", "手动添加，或者导入券商导出的表格 / 截图": "Add by hand, or import a broker export / screenshot", "添加持仓": "Add holding", "导入 CSV": "Import CSV",
    "写下买入规则": "Write your buying rules", "决定每只持仓旁边显示「可加」还是「封仓」。没写之前，所有持仓默认封仓": "They decide whether a holding is tagged \"add\" or \"hold off\". Until you write them, everything is on hold.",
    "怎么写规则": "How to write rules", "AI 帮我起草": "Draft with AI", "装到手机桌面": "Add to your home screen", "以后像 App 一样打开": "Open it like an app from then on", "怎么装": "How",
    "安卓": "Android", "：用 Safari 打开 → 底部「分享」→「添加到主屏幕」。": ": open in Safari → Share → \"Add to Home Screen\".", "：浏览器右上角菜单 →「添加到主屏幕」或「安装应用」。": ": browser menu → \"Add to Home screen\" or \"Install app\".",
    // 本月该买什么 / 成绩单
    "买入有规则": "Buys follow rules", "全年改规则": "Rule changes this year", "定投完成": "Index plan done", "指数占比": "Index weight", "剩下的钱回到指数": "The rest goes back to the index",
    "现在没有「可加」的标的，剩下的钱先留作现金。": "Nothing is tagged \"add\" right now; keep the rest as cash.", "定投计划里的指数现在都不是「可加」，这部分先不分配。": "No index in your plan is tagged \"add\" right now; this part is left unallocated.",
    "A 股 / 港股按 100 股一手取整，零头没有分配。": "China and Hong Kong shares are rounded to lots of 100; the remainder is unallocated.",
    // 常见公司的中文名(英文界面下不显示)
    "谷歌": "", "苹果": "", "微软": "", "亚马逊": "", "英伟达": "", "特斯拉": "", "伯克希尔": "", "可口可乐": "", "开市客": "", "强生": "", "美光": "",
  };

  // ---------- 句式(带数字的) ----------
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var UNIT = { "股": "shares", "份": "units", "枚": "coins" };
  function unit(n, u) { var w = UNIT[u] || u; return String(n).replace(/,/g, "") === "1" ? w.replace(/s$/, "") : w; }
  var RULES = [
    [/^(\d+) 月 (\d+) 日，(种下|收下) ([\d,.]+) (股|份|枚)。$/, function (m) { return MON[m[1] - 1] + " " + m[2] + " — " + (m[3] === "种下" ? "planted " : "harvested ") + m[4] + " " + unit(m[4], m[5]) + "."; }],
    [/^(\d{4}) 年 (\d+) 月，(种下|收下) ([\d,.]+) (股|份|枚)。$/, function (m) { return MON[m[2] - 1] + " " + m[1] + " — " + (m[3] === "种下" ? "planted " : "harvested ") + m[4] + " " + unit(m[4], m[5]) + "."; }],
    [/^(\d{4}) 年 (\d+) 月 (\d+) 日$/, function (m) { return MON[m[2] - 1] + " " + m[3] + ", " + m[1]; }],
    [/^\s*(股|份|枚)\s*$/, function (m) { return " " + UNIT[m[1]]; }],
    [/^占\s*$/, function () { return ""; }],
    [/^你的公司 · ([\d.]+%)$/, function (m) { return "Your companies · " + m[1]; }],
    [/^指数 · ([\d.]+%)$/, function (m) { return "Index · " + m[1]; }],
    [/^已守候 $/, function () { return "Held for "; }],
    [/^更新于 ?(.*)$/, function (m) { return "Updated " + m[1]; }],
    [/^买入规则：(.*)$/, function (m) { return "Buying rule: " + frag(m[1]); }],
    [/^自动定投：开，每个交易日 ¥([\d.]+)$/, function (m) { return "Auto-invest on: ¥" + m[1] + " each trading day"; }],
    [/^现金金额 \((.*)\)$/, function (m) { return "Cash amount (" + m[1] + ")"; }],
    [/^成本价 \($/, function () { return "Cost ("; }],
    [/^(\d+) 月定投 · (.*)$/, function (m) { return MON[m[1] - 1] + " index purchase · " + m[2]; }],
    [/^差 ¥([\d,]+) 达标$/, function (m) { return "¥" + m[1] + " to go"; }],
    [/^(.*) 已同步 (.*)$/, function (m) { return m[1] + " synced " + m[2]; }],
    [/^(.*) 同步异常 ›$/, function (m) { return m[1] + " sync problem ›"; }],
    [/^(.*) 令牌已过期 ›$/, function (m) { return m[1] + " token expired ›"; }],
    [/^(.*) 同步 · 等待首次运行$/, function (m) { return m[1] + " sync · waiting for the first run"; }],
    [/^(.*)-现金$/, function (m) { return m[1] + " cash"; }],
  ];
  // 短语(出现在「占 8.1% · 还差 8 股」这类拼出来的句子里; 只在界面文字里用, 不动持仓名称)
  var FRAGS = [
    [/目标 ([\d,.]+) 股/g, "target $1"], [/还差 ([\d,.]+) 股/g, "$1 to go"], [/占比上限 ([\d.]+)%/g, "cap $1%"], [/占比 ([\d.]+%)/g, "weight $1"], [/占 ([\d.]+%)/g, "$1"], [/^占 /g, ""],
    [/已买够 ✓/g, "bought enough ✓"], [/已买够/g, "bought enough"], [/可加/g, "add"], [/封仓/g, "hold off"], [/本月未买入/g, "nothing bought this month"], [/上次/g, "last"],
    [/最近确认 (\S+) · 自动按净值落地/g, "last confirmed $1 · filled at NAV automatically"], [/含场外 ([\d.]+) 股/g, "incl. $1 off-broker shares"],
    [/([\d.]+)% 以下可加，([\d.]+)% 封仓/g, "add below $1%, hold off at $2%"], [/按 ([\d.]+)% 约 ([\d,.]+) 股/g, "$1% ≈ $2 shares"], [/纳指/g, "Nasdaq"], [/标普/g, "S&P"], [/ 股\b/g, " shares"], [/ 股$/g, " shares"],
  ];
  function frag(t) { for (var i = 0; i < FRAGS.length; i++) t = t.replace(FRAGS[i][0], FRAGS[i][1]); return t; }

  var ZH = /[一-鿿]/;
  function tr(text, allowFrag) {
    if (!text || !ZH.test(text)) return null;
    var lead = text.match(/^\s*/)[0], tail = text.match(/\s*$/)[0], core = text.trim();
    if (Object.prototype.hasOwnProperty.call(EXACT, core)) return lead + EXACT[core] + tail;
    for (var i = 0; i < RULES.length; i++) { var m = core.match(RULES[i][0]); if (m) return lead + RULES[i][1](m) + tail; }
    if (allowFrag) { var f = frag(core); if (f !== core) return lead + f + tail; }
    return null;
  }
  // 这些地方是用户自己的内容(持仓名称、三句话、说明), 只做整句对照, 不做短语替换
  var USER = ".truncate, .w1-nm, .dc-u2-lab, .w1-lab, #detailSymbol, #w1dSymbol, .dc-cv-main, .dc-cv-sub, .w1-cv, .zen-v, .zen-sub, #detailName, #w1dName, #hsSym, #cashAccountSel, [data-noi18n]";
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { one(root); return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE|CANVAS)$/.test(root.tagName)) return;
    attrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) one(n); else attrs(n); }
  }
  function one(node) {
    var p = node.parentElement; if (!p || /^(SCRIPT|STYLE)$/.test(p.tagName)) return;
    var out = tr(node.nodeValue, !p.closest(USER));
    if (out !== null && out !== node.nodeValue) node.nodeValue = out;
  }
  function attrs(el) {
    for (var i = 0, names = ["placeholder", "title", "aria-label"]; i < names.length; i++) {
      var v = el.getAttribute && el.getAttribute(names[i]); if (!v) continue;
      var out = tr(v, false); if (out !== null && out !== v) el.setAttribute(names[i], out);
    }
  }
  function start() {
    walk(document.body);
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === "characterData") one(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);

  // 英文界面的版式: 三句话横排, 用衬线体
  var css = document.createElement("style");
  css.textContent =
    'html[lang="en"] .dc-u2, html[lang="en"] #w1Left, html[lang="en"] .w1-kai { font-family: Georgia, "Times New Roman", serif !important; }' +
    'html[lang="en"] .dc-creed-v, html[lang="en"] .w1-creed { flex-direction: column !important; align-items: center; gap: 14px !important; min-height: 0 !important; }' +
    'html[lang="en"] .dc-cv-main, html[lang="en"] .dc-cv-sub, html[lang="en"] .w1-cv { writing-mode: horizontal-tb !important; letter-spacing: .5px !important; white-space: normal !important; text-align: center; font-family: Georgia, "Times New Roman", serif !important; }' +
    'html[lang="en"] .dc-cv-main, html[lang="en"] .w1-cv.main { font-size: 26px !important; }' +
    'html[lang="en"] .dc-cv-col, html[lang="en"] .w1-creed > div { padding-top: 0 !important; }' +
    'html[lang="en"] .zen-v { writing-mode: horizontal-tb !important; font-size: 34px !important; letter-spacing: 1px !important; }' +
    'html[lang="en"] .zen-sub, html[lang="en"] .zen-days { letter-spacing: 1px !important; }';
  (document.head || document.documentElement).appendChild(css);
})();
