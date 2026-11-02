# 配置你自己的规则

规则写在 `data/plan.json`。第一次可以复制示例改：

```bash
cp plan.example.json data/plan.json
```

主要字段：

| 字段 | 作用 |
|---|---|
| `targetAllocation` | 结构目标：指数下限、个股上限 |
| `channels.symbols` | 每只标的的买入规则，决定"可加 / 封仓"签 |
| `channels.indexPlan` | 每月指数定投：哪几只、多少钱算完成 |
| `groups` | 个人分组：警戒仓、非决策持仓（如券商赠股） |
| `motto` | 纪律页底部的一句话 |

`channels.symbols` 里每只标的选一种类型：

| 类型 | 规则 |
|---|---|
| `open` | 一直可加 |
| `seal` | 一直封仓 |
| `band` | 看占比：低于 `openBelowPct` 可加，到 `sealAtPct` 封仓；可选 `targetShares` 目标股数，买够即封 |
| `premium` | 场内 ETF 看溢价：不超过 `maxPremiumPct` 才可加 |
| `offshore` | 境外账户总额到 `offshoreTargetUSD` 后封仓 |

没写进表里的标的按 `default`（默认封仓）处理。思路是：**想买什么，先把规则写下来。**

`open` / `seal` / `band` 三种也可以直接在页面上设（见 [features.md](features.md#在页面上设规则)）；溢价、境外这两种仍需在文件里改。

改完保存即可生效，不用重启。
