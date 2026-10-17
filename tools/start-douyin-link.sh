#!/usr/bin/env bash
# 抖音弹幕 → 竞技场 一键联通
#
# 数据流：
#   抖音直播间弹幕 → douyin_bridge.py(WS:9001) → arena-bridge-client.js → 后端 /api/arena/ingest → 竞技场实时榜
#
# 用法：
#   ./start-douyin-link.sh <房间号> --demo          # 离线模拟弹幕，验证链路（无需抖音）
#   ./start-douyin-link.sh <房间号> <直播间URL>      # 真实直播间接弹幕
#   ./start-douyin-link.sh T9 279133970652          # 也可直接传抖音房间号
#
# 注意：真实直播间需要抖音登录态时加 --cookie "<cookie>"（见 douyin_bridge.py --help）

set -euo pipefail

ROOM="${1:-}"
MODE="${2:---demo}"
PORT="${PORT:-9001}"
ARENA="${ARENA:-http://127.0.0.1:3399/api/arena/ingest}"

if [ -z "$ROOM" ]; then
  echo "用法: $0 <房间号> [--demo | <直播间URL|抖音房间号>]"
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
BRIDGE_DIR="$(cd "$ROOT/../douyin-bridge" && pwd)"
PY="C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
NODE_BIN="/c/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-2"

export PATH="$NODE_BIN:$PATH"

echo "=============================================="
echo " 抖音弹幕 → 竞技场"
echo "   房间号 : $ROOM"
echo "   模式   : $MODE"
echo "   ingest : $ARENA"
echo "=============================================="

# 1) 启动弹幕桥（WS server）
if [ "$MODE" = "--demo" ]; then
  echo "[1/2] 启动弹幕桥（离线 demo 模式）…"
  "$PY" "$BRIDGE_DIR/douyin_bridge.py" --demo --room "$ROOM" --port "$PORT" &
else
  echo "[1/2] 启动弹幕桥（真实直播间 $MODE）…"
  "$PY" "$BRIDGE_DIR/douyin_bridge.py" --room "$ROOM" --port "$PORT" --url "$MODE" &
fi
BRIDGE_PID=$!

# 2) 启动转发客户端（WS → ingest）
echo "[2/2] 启动转发客户端（约 2s 后开始转发）…"
sleep 2
BRIDGE_URL="ws://127.0.0.1:$PORT/ws/$ROOM" \
ARENA_URL="$ARENA" \
ROOM="$ROOM" \
node "$ROOT/arena-bridge-client.js" &
CLIENT_PID=$!

cleanup() {
  echo ""
  echo "正在停止（bridge=$BRIDGE_PID client=$CLIENT_PID）…"
  kill "$CLIENT_PID" 2>/dev/null || true
  kill "$BRIDGE_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo ""
echo "已联通。Ctrl+C 停止。"
echo "查看战况：curl 'http://127.0.0.1:3399/api/arena/state?roomId=$ROOM&viewer=host'"
wait
