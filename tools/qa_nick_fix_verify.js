// tools/qa_nick_fix_verify.js —— QA 聚焦复验：P2 昵称修复 + surrogate 边界
// 输出统一写入 ./_qa_report.txt（当前环境 stdout 不可见）
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const express = require('express');

const OUT = [];
function w(s) { OUT.push(s); }
function check(name, cond, extra = '') {
  w(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  return cond;
}

// ---------- Part A: 改动范围（mtime）----------
w('===== Part A: 改动范围核查 =====');
const root = path.join(__dirname, '..');            // kaoshi-app
const sibling = path.join(root, '..');              // 项目根
const targets = [
  ['arena.js', path.join(root, 'arena.js')],
  ['security.js', path.join(root, 'security.js')],
  ['server.js', path.join(root, 'server.js')],
  ['schema.sql', path.join(root, 'schema.sql')],
  ['db.js', path.join(root, 'db.js')],
  ['arena-bridge-client.js', path.join(root, 'arena-bridge-client.js')],
  ['arena.vue', path.join(root, 'client-uni/src/pages/arena/arena.vue')],
  ['arena-room.vue', path.join(root, 'client-uni/src/pages/arena-room/arena-room.vue')],
  ['douyin_bridge.py', path.join(sibling, 'douyin-bridge/douyin_bridge.py')],
];
for (const [name, p] of targets) {
  try { w(`  ${name.padEnd(22)} ${fs.statSync(p).mtime.toISOString()}`); }
  catch (e) { w(`  ${name.padEnd(22)} <缺失>`); }
}
// 以 arena.js 自身 mtime 为基准（本轮改动锚点）：扫描同期被改的源文件
const arenaMtime = fs.statSync(path.join(root, 'arena.js')).mtimeMs;
const THRESH = arenaMtime - 60000; // 基准前 60s 内的都算"本轮"
function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue;
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(fp));
    else if (ent.isFile()) {
      try { const st = fs.statSync(fp); if (st.mtimeMs >= THRESH) out.push(`${fp.replace(sibling, '.')}  ${st.mtime.toISOString()}`); } catch (e) {}
    }
  }
  return out;
}
const newer = walk(sibling).filter((l) => !/[_]qa_|qa_ingest|qa_nick|_qa_report|_qa_probe/.test(l));
w('  --- 与 arena.js 同期(±60s)被改的源文件（已排除QA产物）---');
newer.forEach((l) => w('    ' + l));
check('A1 本轮仅 arena.js 一个源码文件被改', newer.length === 1 && /arena\.js/.test(newer[0]), `命中${newer.length}个`);

// ---------- Part B: node --check ----------
w('\n===== Part B: 语法检查 =====');
const chk = cp.spawnSync(process.execPath, ['--check', path.join(root, 'arena.js')], { encoding: 'utf8' });
check('B1 node --check arena.js', chk.status === 0, `exit=${chk.status} ${chk.stderr || ''}`);

// ---------- db 桩 ----------
const dbPath = require.resolve(path.join(root, 'db.js'));
const runLog = [];
const stub = {
  prepare(sql) {
    return {
      async all() {
        if (/FROM questions WHERE bank_id\s*=\s*\?/.test(sql)) return [{ id: 1 }];
        if (/FROM options WHERE question_id\s*=\s*\?/.test(sql)) return [{ label: 'A', content: '2', is_correct: 1 }, { label: 'B', content: '3', is_correct: 0 }];
        return [];
      },
      async get() {
        if (/FROM questions WHERE id\s*=\s*\?/.test(sql)) return { id: 1, type: 'single', stem: '1+1=?', analysis: '', bank_id: 1 };
        return undefined;
      },
      async run(...p) { runLog.push({ sql, p }); return { lastInsertRowid: 1, changes: 1 }; },
    };
  },
  async transaction(fn) { return fn({ prepare: (s) => stub.prepare(s), query: async () => [] }); },
  async exec() {},
  pool: {},
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: stub };
const router = require(path.join(root, 'arena.js'));

const app = express();
app.use(express.json());
app.use('/api/arena', router);

const loneRe = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/arena`;
  const J = { 'Content-Type': 'application/json' };
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: J, body: JSON.stringify(b) });
  async function ingest(username, option, roomId) {
    const r = await post('/ingest', { username, option, roomId });
    return { status: r.status, json: await r.json() };
  }
  async function startedRoom(roomId) {
    await post('/session/start', { roomId, bankId: 1, autoStart: true, config: { durationSec: 120, revealCorrect: 'never' } });
  }
  async function leaderNick(roomId) {
    const r = await fetch(base + `/state?roomId=${roomId}&viewer=host`);
    const j = await r.json();
    return (j.leaderboard && j.leaderboard[0] && j.leaderboard[0].username) || null;
  }

  try {
    // ============ Part C: 2) 复现修复 ============
    w('\n===== Part C: 昵称修复复验（端到端）=====');
    await startedRoom('nickA');
    const c24 = '汉字昵称一二三四五六七八九十甲乙丙丁戊己庚辛壬癸'; // 24 汉字
    const r24 = await ingest(c24, 'A', 'nickA');
    w(`  [24汉字] len=${c24.length} -> HTTP ${r24.status} ${JSON.stringify(r24.json)}`);
    check('C1 24汉字昵称 → 200 ok:true isCorrect:true', r24.status === 200 && r24.json.ok === true && r24.json.isCorrect === true);
    const back24 = await leaderNick('nickA');
    check('C2 落库昵称长度 ≤20 且为前20字', back24 && back24.length === 20 && back24 === c24.slice(0, 20), `len=${back24 ? back24.length : 'null'} val=${JSON.stringify(back24)}`);

    await startedRoom('nickB');
    const emojiNick = '观众' + '🎉'.repeat(10); // 2+20 码元 = 22
    const rEmo = await ingest(emojiNick, 'A', 'nickB');
    w(`  [emoji长昵称] len=${emojiNick.length} -> HTTP ${rEmo.status} ${JSON.stringify(rEmo.json)}`);
    check('C3 含emoji长昵称 → ok:true', rEmo.status === 200 && rEmo.json.ok === true);
    const backEmo = await leaderNick('nickB');
    check('C4 emoji昵称落库长度 ≤20', backEmo && backEmo.length <= 20, `len=${backEmo ? backEmo.length : 'null'}`);

    await startedRoom('nickC');
    const c20 = '测'.repeat(20);
    const r20 = await ingest(c20, 'A', 'nickC');
    check('C5 20字符边界 → ok:true', r20.status === 200 && r20.json.ok === true, `HTTP${r20.status}`);

    await startedRoom('nickD');
    const short = '小明';
    const rShort = await ingest(short, 'A', 'nickD');
    check('C6 短昵称 → ok:true', rShort.status === 200 && rShort.json.ok === true, `HTTP${rShort.status}`);

    // ============ Part D: 回归 ============
    w('\n===== Part D: 限流/接口回归 =====');
    await startedRoom('regA');
    let non429 = 0, c429 = 0;
    for (let i = 0; i < 180; i++) {
      const r = await post('/ingest', { username: `x${i}`, option: 'A', roomId: 'regA' });
      if (r.status === 429) c429++; else non429++;
    }
    check('D1 同房180不同昵称：非429=150 / 429=30', non429 === 150 && c429 === 30, `非429=${non429} 429=${c429}`);

    await startedRoom('regB');
    await ingest('sameGuy', 'A', 'regB');
    const r2 = await ingest('sameGuy', 'B', 'regB');
    check('D2 同昵称<800ms → too fast (HTTP200)', r2.status === 200 && r2.json.reason === 'too fast', JSON.stringify(r2.json));

    let s429 = 0;
    for (let i = 0; i < 300; i++) { const r = await fetch(base + '/state?roomId=regA&viewer=host'); if (r.status === 429) s429++; }
    check('D3 /state 300次无429', s429 === 0, `429=${s429}`);

    // ============ Part E: surrogate 边界（截在代理对中间）============
    w('\n===== Part E: surrogate 边界探测（slice(0,20) 切在 emoji 中间）=====');
    const base19 = 'A'.repeat(19);          // 19 ASCII 码元 (idx 0..18)
    const pair = '🎉';                       // 1 码点 = 2 码元 (idx 19,20)
    const full = base19 + pair + 'BCDEFG';   // 共 27 码元
    const cut = full.slice(0, 20);           // 应为 base19 + 高代理（lone high surrogate）
    w(`  构造全串 len=${full.length}; slice(0,20) len=${cut.length}; 末码元=U+${cut.charCodeAt(19).toString(16).toUpperCase()}`);
    w(`  slice 结果含 lone surrogate ? ${loneRe.test(cut)}`);
    w(`  slice 结果 JSON: ${JSON.stringify(cut)}`);

    await startedRoom('surA');
    const rSur = await ingest(full, 'A', 'surA');
    w(`  [surrogate边界] HTTP ${rSur.status} ${JSON.stringify(rSur.json)}`);
    check('E1 边界昵称 ingest 未 500', rSur.status !== 500, `HTTP${rSur.status}`);

    const backSur = await leaderNick('surA');
    w(`  读回落库昵称: len=${backSur ? backSur.length : 'null'} hasLoneSurrogate=${backSur ? loneRe.test(backSur) : 'n/a'}`);
    w(`  读回昵称 JSON: ${JSON.stringify(backSur)}`);

    // 触发落库事务路径，确认不抛错
    let persistErr = null, persisted = null;
    try {
      const rEnd = await post('/session/end', { roomId: 'surA' });
      const jEnd = await rEnd.json();
      persisted = jEnd.persisted;
    } catch (e) { persistErr = e.message; }
    check('E2 surrogate 昵称走 /session/end 落库路径无异常', persistErr === null && persisted !== null, `persisted=${persisted} err=${persistErr}`);

    // 若落库，检查 run() 收到的参数里昵称是否含 lone surrogate
    const surRuns = runLog.filter((r) => /arena_match_players/.test(r.sql));
    const storedArg = surRuns.length ? surRuns[surRuns.length - 1].p[1] : null;
    if (storedArg != null) w(`  落库写入的 nickname 参数: JSON=${JSON.stringify(storedArg)} hasLoneSurrogate=${loneRe.test(storedArg)}`);

    // Node UTF-8 编码行为佐证
    const loneHigh = '\uD83C';
    const asBuf = Buffer.from(loneHigh, 'utf8');
    w(`  [佐证] Node Buffer.from(loneHigh,'utf8') hex=${asBuf.toString('hex')} -> '${asBuf.toString('utf8')}' (U+FFFD=${asBuf.toString('hex') === 'efbfbd'})`);
    let mysqlEsc = 'n/a';
    try {
      const mysql = require('mysql2');
      if (typeof mysql.escape === 'function') mysqlEsc = mysql.escape(loneHigh);
      else if (mysql.SqlString && typeof mysql.SqlString.escape === 'function') mysqlEsc = mysql.SqlString.escape(loneHigh);
      else mysqlEsc = 'no-escape-export';
    } catch (e) { mysqlEsc = 'ERR:' + e.message; }
    w(`  [佐证] mysql2 escape(loneHigh) = ${mysqlEsc}`);

    // ============ 汇总 ============
    const fails = OUT.filter((l) => l.startsWith('FAIL'));
    w(`\n===== 汇总: PASS=${OUT.filter((l) => l.startsWith('PASS')).length} FAIL=${fails.length} =====`);
  } catch (e) {
    w('HARNESS ERROR: ' + (e && e.stack || e));
  } finally {
    fs.writeFileSync(path.join(__dirname, '..', '_qa_report.txt'), OUT.join('\n') + '\n', 'utf8');
    server.close(() => process.exit(0));
  }
});
