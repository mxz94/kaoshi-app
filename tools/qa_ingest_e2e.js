// tools/qa_ingest_e2e.js —— QA 独立端到端验证：ingest 正常作答必须 ok:true
// 用法：node tools/qa_ingest_e2e.js [模块相对路径，默认 ../arena.js]
// 关键：在 require arena 之前，用 require.cache 注入 db.js 桩（本地无 MySQL）
const path = require('path');
const express = require('express');

const MODULE_REL = process.argv[2] || '../arena.js';
const modulePath = require.resolve(path.join(__dirname, MODULE_REL));
const dbPath = require.resolve(path.join(__dirname, '..', 'db.js'));

// —— db 桩：按 SQL 文本返回假数据 ——
const stub = {
  __stub: true,
  prepare(sql) {
    return {
      async all(..._p) {
        if (/FROM questions WHERE bank_id\s*=\s*\?/.test(sql)) return [{ id: 1 }];
        if (/FROM options WHERE question_id\s*=\s*\?/.test(sql)) {
          return [
            { label: 'A', content: '2', is_correct: 1 },
            { label: 'B', content: '3', is_correct: 0 },
          ];
        }
        return [];
      },
      async get(..._p) {
        if (/FROM questions WHERE id\s*=\s*\?/.test(sql)) {
          return { id: 1, type: 'single', stem: '1+1=?', analysis: '基础算术', bank_id: 1 };
        }
        return undefined;
      },
      async run(..._p) { return { lastInsertRowid: 1, changes: 1 }; },
    };
  },
  async transaction(fn) {
    return fn({ prepare: (s) => stub.prepare(s), query: async () => [] });
  },
  async exec() {},
  pool: {},
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: stub };

// 注入后再 require arena（此时 arena 内部 require('./db') 命中桩）
const router = require(modulePath);

const app = express();
app.use(express.json());
app.use('/api/arena', router);

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/arena`;
  const J = { 'Content-Type': 'application/json' };
  let ok = false;
  try {
    const r1 = await fetch(base + '/session/start', {
      method: 'POST', headers: J,
      body: JSON.stringify({ roomId: 'qae2e', bankId: 1, autoStart: true, config: { revealCorrect: 'never' } }),
    });
    const j1 = await r1.json();
    console.log('[HTTP %d] POST /session/start ->', r1.status, JSON.stringify(j1));

    const r2 = await fetch(base + '/ingest', {
      method: 'POST', headers: J,
      body: JSON.stringify({ username: '测试观众', option: 'A', roomId: 'qae2e' }),
    });
    const j2 = await r2.json();
    console.log('[HTTP %d] POST /ingest ->', r2.status, JSON.stringify(j2));

    ok = r2.status === 200 && j2.ok === true && j2.isCorrect === true && j2.score >= 100;
    console.log('\n判定: 正常作答 ' + (ok ? '✅ ok:true' : '❌ 未返回 ok:true') +
      ` (status=${r2.status}, ok=${j2.ok}, isCorrect=${j2.isCorrect}, score=${j2.score})`);
  } catch (e) {
    console.error('harness error:', e);
  } finally {
    server.close(() => process.exit(ok ? 0 : 1));
  }
});
