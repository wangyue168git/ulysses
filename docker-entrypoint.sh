#!/bin/sh
# 容器启动: 云平台挂载的持久磁盘(Fly.io / Render / Railway)通常归 root 所有, 先把数据目录交给 node 用户, 再降权运行。
# 已经以普通用户启动(比如 docker run --user)时什么都不做。
set -e
D="${DATA_DIR:-/data}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$D"
  chown -R node:node "$D" 2>/dev/null || true
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=node --regid=node --init-groups "$@"
  fi
  echo "[entrypoint] 没有 setpriv, 以 root 运行" >&2
fi
exec "$@"
