#!/usr/bin/env node
// arena-bridge-client.js —— 把抖音弹幕桥(WS) 的聊天消息转发到竞技场 ingest 接口
// 零依赖：用 Node 22 全局 WebSocket + fetch
//
// 配置方式（环境变量或命令行参数皆可）：
//   BRIDGE_URL = 弹幕桥 WS 地址，如 ws://127.0.0.1:9001/ws/demo
//   ARENA_URL  = 竞技场 ingest 接口，如 http://127.0.0.1:3399/api/arena/ingest
//   ROOM       = 竞技场房间号（与主播控制台一致）
//
// 用法示例：
//   BRIDGE_URL=ws://127.0.0.1:9001/ws/demo \
//   ARENA_URL=http://127.0.0.1:3399/api/arena/ingest \
//   ROOM=demo node arena-bridge-client.js
//
// 或：
//   node arena-bridge-client.js --bridge ws://127.0.0.1:9001/ws/demo --arena http://127.0.0.1:3399/api/arena/ingest --room demo

const WebSocket = globalThis.WebSocket;

function parseArgs(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bridge') o.bridge = argv[++i];
    else if (a === '--arena') o.arena = argv[++i];
    else if (a === '--room') o.room = argv[++i];
  }
  return o;
}
const args = parseArgs(process.argv);
const BRIDGE_URL = args.bridge || process.env.BRIDGE_URL || 'ws://127.0.0.1:9001/ws/demo';
// 后端默认端口 3399（项目约定：避开 3000/3210）
const ARENA_URL = args.arena || process.env.ARENA_URL || 'http://127.0.0.1:3399/api/arena/ingest';
const ROOM = args.room || process.env.ROOM || 'default';

// 把 "选A"/"a"/"1"/"答案B" 归一为 A-D；无法识别返回 null
function parseOption(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  const letter = s.match(/[A-Da-d]/i);
  if (letter) return letter[0].toUpperCase();
  const digit = s.match(/[1-4]/);
  if (digit) return String.fromCharCode(64 + parseInt(digit[0], 10));
  return null;
}

async function postAnswer(nickname, option) {
  try {
    const r = await fetch(ARENA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: nickname, option, roomId: ROOM }),
    });
    const j = await r.json().catch(() => ({}));
    console.log(`[ingest] ${nickname} -> ${option} : ${JSON.stringify(j)}`);
  } catch (e) {
    console.error('[ingest err]', e.message);
  }
}

// 随机退避：3–15s，避免固定间隔重连被判定为自动化/被限流
function nextDelay() {
  return 3000 + Math.floor(Math.random() * 12000);
}

function connect() {
  console.log(`[bridge] connecting ${BRIDGE_URL}`);
  let ws;
  try {
    ws = new WebSocket(BRIDGE_URL);
  } catch (e) {
    console.error('[bridge] create failed, retry with backoff:', e.message);
    setTimeout(connect, nextDelay());
    return;
  }
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type !== 'chat') return; // 只处理聊天弹幕
    const nickname = msg.nickname || msg.user;
    const content = msg.content || '';
    const option = parseOption(content);
    if (!nickname || !option) return; // 解析不出选项就忽略
    postAnswer(nickname, option);
  };
  ws.onclose = () => { console.log('[bridge] closed, retry with backoff'); setTimeout(connect, nextDelay()); };
  ws.onerror = (e) => console.error('[bridge] error', e.message || e);
}
connect();
