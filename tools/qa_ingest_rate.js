// tools/qa_ingest_rate.js —— QA 独立压测：ingest 轻量限流正确性 + 不误伤 + 边界昵称
const path = require('path');
const express = require('express');

const modulePath = require.resolve(path.join(__dirname, '../arena.js'));
const dbPath = require.resolve(path.join(__dirname, '..', 'db.js'));

const stub = {
  prepare(sql) {
    return {
      async all() {
        if (/FROM questions WHERE bank_id\s*=\s*\?/.test(sql)) return [{ id: 1 }];
        if (/FROM options WHERE question_id\s*=\s*\?/.test(sql)) {
          return [{ label: 'A', content: '2', is_correct: 1 }, { label: 'B', content: '3', is_correct: 0 }];
        }
        return [];
      },
      async get() {
        if (/FROM questions WHERE id\s*=\s*\?/.test(sql)) {
          return { id: 1, type: 'single', stem: '1+1=?', analysis: '', bank_id: 1 };
        }
        return undefined;
      },
      async run() { return { lastInsertRowid: 1, changes: 1 }; },
    };
  },
  async transaction(fn) { return fn({ prepare: (s) => stub.prepare(s), query: async () => [] }); },
  async exec() {},
  pool: {},
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: stub };

const router = require(modulePath);
const app = express();
app.use(express.json());
app.use('/api/arena', router);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  (cond ? pass++ : fail++);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/arena`;
  const J = { 'Content-Type': 'application/json' };
  const start = (body) => fetch(base + '/session/start', { method: 'POST', headers: J, body: JSON.stringify(body) });
  const ingest = (body) => fetch(base + '/ingest', { method: 'POST', headers: J, body: JSON.stringify(body) });

  try {
    // ============ 测试1：同房间 180 次不同昵称 → 前150非429，后30为429 ============
    await start({ roomId: 'rateA', bankId: 1, autoStart: true, config: { durationSec: 120, revealCorrect: 'never' } });
    let non429 = 0, c429 = 0;
    const bodies429 = [];
    for (let i = 0; i < 180; i++) {
      const r = await ingest({ username: `u${i}`, option: 'A', roomId: 'rateA' });
      if (r.status === 429) { c429++; if (bodies429.length < 2) bodies429.push(await r.json()); }
      else non429++;
    }
    check('T1 同房180次不同昵称：非429=150', non429 === 150, `实际非429=${non429}`);
    check('T1 同房180次不同昵称：429=30', c429 === 30, `实际429=${c429}`);
    check('T1 429 响应体为 rate limited', bodies429.every((b) => b && b.reason === 'rate limited'), JSON.stringify(bodies429));

    // ============ 测试2：同昵称 <800ms 连发 2 次 → 第2次 too fast（HTTP200）============
    await fetch(base + '/session/start', { method: 'POST', headers: J, body: JSON.stringify({ roomId: 'rateB', bankId: 1, autoStart: true, config: { durationSec: 120, revealCorrect: 'never' } }) });
    const t2a = await ingest({ username: 'sameNick', option: 'A', roomId: 'rateB' });
    const t2b = await ingest({ username: 'sameNick', option: 'B', roomId: 'rateB' });
    const j2b = await t2b.json();
    check('T2 同昵称连发第2次 HTTP200', t2b.status === 200, `status=${t2b.status}`);
    check('T2 第2次 body.reason=too fast', j2b.ok === false && j2b.reason === 'too fast', JSON.stringify(j2b));

    // ============ 测试3：不误伤 —— 80个不同昵称各1次，分散几秒 ============
    await fetch(base + '/session/start', { method: 'POST', headers: J, body: JSON.stringify({ roomId: 'rateC', bankId: 1, autoStart: true, config: { durationSec: 120, revealCorrect: 'never' } }) });
    let c3_429 = 0;
    for (let i = 0; i < 80; i++) {
      const r = await ingest({ username: `live${i}`, option: 'A', roomId: 'rateC' });
      if (r.status === 429) c3_429++;
      await sleep(40);
    }
    check('T3 正常直播80人各1次：无429', c3_429 === 0, `实际429=${c3_429}`);

    // ============ 测试4：/state、/session/start、/session/end、/stream 不受限流 ============
    let s429 = 0;
    for (let i = 0; i < 300; i++) {
      const r = await fetch(base + '/state?roomId=rateA&viewer=host');
      if (r.status === 429) s429++;
    }
    check('T4 /state 300次无429', s429 === 0, `429=${s429}`);
    const rs = await start({ roomId: 'rateD', bankId: 1, autoStart: false });
    check('T4 /session/start 200', rs.status === 200);
    const re = await fetch(base + '/session/end', { method: 'POST', headers: J, body: JSON.stringify({ roomId: 'rateD' }) });
    check('T4 /session/end 200', re.status === 200);
    // /stream 是 SSE，读首个 chunk 后中断
    let streamStatus = 0;
    try {
      const ac = new AbortController();
      const rstream = await fetch(base + '/stream?roomId=rateD&viewer=viewer', { signal: ac.signal });
      streamStatus = rstream.status;
      await rstream.body.getReader().read();
      ac.abort();
    } catch (e) { /* abort 抛错忽略 */ }
    check('T4 /stream 200（非429）', streamStatus === 200, `status=${streamStatus}`);

    // ============ 测试5：边界昵称长度（arena slice(0,24) vs security nickname max=20）============
    await fetch(base + '/session/start', { method: 'POST', headers: J, body: JSON.stringify({ roomId: 'rateE', bankId: 1, autoStart: true, config: { durationSec: 120, revealCorrect: 'never' } }) });
    const mk = (n) => '测'.repeat(n); // 恰好 n 个字符（UTF-16 code unit / 可见字符一致）
    async function nickTest(label, nick) {
      const r = await ingest({ username: nick, option: 'A', roomId: 'rateE' });
      const j = await r.json();
      console.log(`   [边界] ${label} len=${nick.length} -> HTTP ${r.status} ${JSON.stringify(j)}`);
      return { status: r.status, j, len: nick.length };
    }
    await nickTest('题目例子(16)', '非常爱学习的小明明1234567');
    const r20 = await nickTest('20字符', mk(20));
    const r21 = await nickTest('21字符', mk(21));
    const r23 = await nickTest('23字符', mk(23));
    const r24 = await nickTest('24字符', mk(24));
    const r25 = await nickTest('25字符', mk(25));
    check('T5 20字符昵称可用', r20.status === 200 && r20.j.ok === true, `status=${r20.status}`);
    const longRejected = [r21, r23, r24, r25].every((r) => r.status === 400);
    check('T5 21/23/24/25字符昵称被 400 误拒', longRejected, `21:${r21.status} 23:${r23.status} 24:${r24.status} 25:${r25.status}`);
    console.log(`   [边界结论] 实测：len<=20 放行，len>=21 一律 400「昵称包含不当内容」（arena.slice(0,24) 与 security 昵称 max=20 不一致）`);

    console.log(`\n==== 小计: PASS=${pass} FAIL=${fail} ====`);
  } catch (e) {
    console.error('harness error:', e);
  } finally {
    server.close(() => process.exit(fail ? 1 : 0));
  }
});
