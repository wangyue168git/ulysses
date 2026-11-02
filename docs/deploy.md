# 部署

## 用 Docker（推荐）

```bash
git clone https://github.com/wangyue168git/ulysses.git
cd ulysses
cp .env.example .env        # 按需修改, 比如设置 APP_PASSWORD
docker compose up -d
docker compose logs         # 没设 APP_PASSWORD 时, 这里能看到首次生成的登录密码
```

浏览器打开 `http://<你的服务器>:3457`，输入密码即可。手机上可以"添加到主屏幕"，当 App 用。

> 容器启动时会自动把数据目录交给容器内的普通用户（uid 1000）再降权运行，一般不需要手动改权限。

## 部署到云平台

不想自己管服务器，可以用云平台。三点要注意：
- **要有持久磁盘**：持仓数据存在 `/data`，没有磁盘的话一重启就丢。
- **不能让实例休眠**：后台要定时取行情、同步券商。
- 部署后在平台里设置 `APP_PASSWORD`，并定期备份 `/data`。

**Render**（点按钮，按提示填密码）：

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/wangyue168git/ulysses)

按钮会读取仓库里的 `render.yaml`：Docker 部署、1GB 磁盘挂在 `/data`。持久磁盘需要付费实例（starter 起），免费实例重启会丢数据。

**Fly.io**（命令行，仓库里有 `fly.toml`）：

```bash
fly launch --no-deploy                    # 选应用名和地区, 沿用仓库里的 fly.toml
fly volumes create ulysses_data --size 1     # 建持久磁盘, 地区和应用一致
fly secrets set APP_PASSWORD=你的密码
fly deploy
```

**Railway**：New Project → Deploy from GitHub repo，选你 fork 的仓库（会自动用 Dockerfile）；然后在服务里加一个 Volume 挂到 `/data`，在 Variables 里设 `APP_PASSWORD`。

AI 顾问、券商同步需要的密钥（如 `AI_API_KEY`、`IB_FLEX_TOKEN`）都在平台的环境变量 / secrets 里设置，不要写进仓库。

## 直接用 Node.js

需要 Node.js 18 以上。

```bash
npm ci
DEMO=1 node server.js       # DEMO=1: 首次启动载入虚构演示持仓, 先看看效果
```

数据默认存在 `./data/`，可以用 `DATA_DIR` 换位置。
