# 配置你自己的规则

规则写在 `data/plan.json`。第一次可以复制示例改：

```bash
cp plan.example.json data/plan.json
```

改完保存即可生效，不用重启。不想手写的话，也可以用 AI 顾问的「起草规则」（见 [ai.md](ai.md)），或者在添加 / 修改持仓时直接在页面上设（见 [features.md](features.md#在页面上设规则)）。

## 常用字段

| 字段 | 作用 | 不写会怎样 |
|---|---|---|
| `channels.symbols` | 每只标的的买入规则，决定「可加 / 封仓」签 | 没写的标的按 `default`（默认封仓） |
| `targetAllocation` | 结构目标：指数合计下限 `indexTargetPct`、个股合计上限 `stockCapPct`、单只个股默认上限 `singleCapPct` | 纪律页只显示各类占比，不做比较 |
| `channels.indexPlan` | 每月指数定投：从哪几只里任选、每月目标金额、买够多少算完成 | 纪律页不显示定投这一块 |
| `motto` / `creed` | 纪律页底部的一句话；写给自己看的投资信条 | 不显示 |

`channels.symbols` 里每只标的选一种类型：

| 类型 | 规则 |
|---|---|
| `open` | 一直可加，适合定投的指数 |
| `seal` | 一直封仓，只持有不再加 |
| `band` | 看占比：低于 `openBelowPct` 可加，到 `sealAtPct` 封仓；可选 `targetShares` 目标股数，买够即封 |

思路是：**想买什么，先把规则写下来。**没写进表里的，默认就是封仓。

## 进阶（可选）

下面几项只适合特定情况，用不上就不用写。写了才会在页面上出现对应的提示。

| 写法 | 适合谁 | 效果 |
|---|---|---|
| `"type": "premium"`，配 `maxPremiumPct` | 在 A 股场内买跨境 ETF（如标普、纳指 ETF）的人。这类 ETF 经常比净值贵 | 溢价不超过设定值才显示可加；电脑版体检条显示当前溢价 |
| `"type": "offshore"`，配 `channels.offshoreTargetUSD` / `offshoreRestartUSD` / `offshoreAccounts` | 想把境外账户攒到某个金额就停的人 | 境外账户总额到目标后封仓，跌回重启线以下再开 |
| `channels.observationCapPct` | 习惯先用小仓位「试水」个股的人 | 占比不到 5%、又没写建仓规则的小仓个股算「观察仓」，合计超过这个上限时电脑版体检条会提醒 |
| `groups.warning` / `groups.other` | 有主题 / 单赛道的旧仓位，或券商赠股之类的非决策持仓 | 归到「其他」组，不计入个股 |

完整的写法可以参考演示模式用的规则 [`examples/plan.demo.json`](../examples/plan.demo.json)，它把这些进阶项都用上了。

`open` / `seal` / `band` 三种也可以直接在页面上设；溢价、境外托管这两种只能在文件里改。
