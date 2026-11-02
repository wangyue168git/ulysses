# 券商同步

都是**只读**的：只查询持仓和成交，不会下单。规则都一样：第一次运行只记基线；之后只有券商那边有变化才写入看板；你手动改过的数不会被改回去。

| 方式 | 适用 | 配置说明 |
|---|---|---|
| Interactive Brokers | IB 用户，用官方 Flex 只读令牌 | [ib.md](ib.md) |
| 长桥 Longbridge | 长桥用户，用官方 OpenAPI | [longbridge.md](longbridge.md) |
| 导入 CSV | **任何券商**：导出持仓表，在电脑版导入 | [csv.md](csv.md) |
| 截图导入 | 拍下持仓页，AI 识别（需要配置 AI 顾问） | [../ai.md](../ai.md) |
| 富途 / moomoo | 暂无内置，可导入 CSV 或自己接 OpenD | [futu.md](futu.md) |
| 自己写适配器 | 其他有接口的券商、或自己定时生成的文件 | [custom.md](custom.md) |

多个券商可以同时启用，手机端首页底部会各显示一行同步状态；令牌快到期时会提醒。
