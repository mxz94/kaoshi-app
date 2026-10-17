// server.js —— Express 后端：题库/题目/练习/统计/竞技场 API（MySQL 版，纯接口无静态页面）
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
// 上线后收敛为域名白名单（避免任意站点盗用接口）；本地 curl / 服务端调用无 Origin，放行
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://malanxi.top,https://www.malanxi.top,https://kaoshi.malanxi.top')
  .split(',').map((s) => s.trim()).filter(Boolean)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    return callback(null, ALLOWED_ORIGINS.includes(origin))
  },
}))
app.use(express.json());

// ===== 设备身份（免注册）：前端每次请求带 X-User-Key，后端据此隔离数据 =====
// 缺省落到 'anonymous' 公共桶，保证旧客户端（public/ 手写 H5）不报错也不丢数据
app.use((req, res, next) => {
  const raw = req.header('x-user-key') || req.query.user_key || (req.body && req.body.user_key);
  const key = String(raw || '').trim().slice(0, 64);
  req.userKey = key || 'anonymous';
  next();
});

// 竞技场（多人直播答题）：弹幕/外部系统调 /api/arena/ingest 喂答案
app.use('/api/arena', require('./arena'));

// 后台管理：/api/admin/* 接口（自带 token 鉴权）+ /admin/ 单文件页面
app.use('/api/admin', require('./admin'));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

const MODULES = ['言语理解', '判断推理', '资料分析', '数量关系', '常识'];
// 升级前遗留数据归属的 key（用户可在「我的 → 数据迁移」里认领）
const LEGACY_KEY = 'legacy';

// 异步路由包装：捕获 Promise 拒绝，避免 unhandledRejection
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: '服务器错误：' + e.message });
  });

// 把 banks 表行转成前端用结构；doneCount/accuracy 传 me 时按「本人」口径覆盖（避免多人串号）
function toBankView(b, me) {
  const doneCount = me ? Number(me.done) || 0 : b.done_count;
  const okCount = me ? Number(me.ok) || 0 : b.correct_count;
  const accuracy = doneCount > 0 ? Math.round((okCount / doneCount) * 100) : 0;
  return {
    id: b.id,
    name: b.name,
    categories: JSON.parse(b.categories || '[]'),
    totalQuestions: b.total_questions,
    questionCount: b.question_count,
    doneCount,
    accuracy,
  };
}

// GET /api/banks —— 题库列表（统计按本人 user_key 口径）
app.get('/api/banks', wrap(async (req, res) => {
  const rows = await db
    .prepare(`SELECT b.*, COALESCE(p.done, 0) my_done, COALESCE(p.ok, 0) my_ok
              FROM banks b
              LEFT JOIN (SELECT bank_id, COUNT(*) done, SUM(is_correct) ok
                         FROM practice_records WHERE user_key = ? GROUP BY bank_id) p
                ON p.bank_id = b.id
              ORDER BY b.created_at DESC`)
    .all(req.userKey);
  res.json(rows.map((b) => toBankView(b, { done: b.my_done, ok: b.my_ok })));
}));

// POST /api/banks —— 新建题库
app.post('/api/banks', wrap(async (req, res) => {
  const { name, categories } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: '题库名称不能为空' });
  const cats = Array.isArray(categories) ? categories.filter(Boolean) : [];
  const info = await db.prepare('INSERT INTO banks (name, categories) VALUES (?, ?)').run(name.trim(), JSON.stringify(cats));
  res.json({ id: info.lastInsertRowid });
}));

// GET /api/banks/:id/questions —— 某题库题目（含选项）
// 可选 ?mode=wrong（只返回本人错题本内题目）/ ?mode=unanswered（只返回本人未作答题目）
app.get('/api/banks/:id/questions', wrap(async (req, res) => {
  const { mode } = req.query;
  let sql = 'SELECT * FROM questions WHERE bank_id = ?';
  const params = [req.params.id];
  if (mode === 'wrong') {
    sql += ' AND id IN (SELECT question_id FROM wrong_questions WHERE user_key = ? AND bank_id = ?)';
    params.push(req.userKey, req.params.id);
  } else if (mode === 'unanswered') {
    sql += ' AND id NOT IN (SELECT question_id FROM practice_records WHERE user_key = ? AND bank_id = ?)';
    params.push(req.userKey, req.params.id);
  }
  sql += ' ORDER BY sort_order, id';
  const qs = await db.prepare(sql).all(...params);
  const result = await Promise.all(
    qs.map(async (q) => {
      const opts = await db.prepare('SELECT label, content, is_correct FROM options WHERE question_id = ? ORDER BY label').all(q.id);
      return {
        id: q.id,
        type: q.type, // single | multiple | judge
        stem: q.stem,
        analysis: q.analysis,
        options: opts.map((o) => ({ label: o.label, content: o.content, isCorrect: !!o.is_correct })),
      };
    })
  );
  res.json(result);
}));

// POST /api/banks/:id/questions —— 手动录入题目（事务）
app.post('/api/banks/:id/questions', wrap(async (req, res) => {
  const { type = 'single', stem, analysis = '', options = [] } = req.body || {};
  if (!stem || !stem.trim()) return res.status(400).json({ error: '题干不能为空' });
  if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ error: '至少需要 2 个选项' });
  const hasCorrect = options.some((o) => o.isCorrect);
  if (!hasCorrect) return res.status(400).json({ error: '请标记至少 1 个正确答案' });

  let qid;
  try {
    await db.transaction(async (tx) => {
      const maxRow = await tx.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM questions WHERE bank_id = ?').get(req.params.id);
      const maxOrder = maxRow ? maxRow.m : 0;
      const qi = await tx
        .prepare('INSERT INTO questions (bank_id, type, stem, analysis, sort_order) VALUES (?,?,?,?,?)')
        .run(req.params.id, type, stem.trim(), analysis.trim(), maxOrder + 1);
      qid = qi.lastInsertRowid;
      const oi = tx.prepare('INSERT INTO options (question_id, label, content, is_correct) VALUES (?,?,?,?)');
      for (const o of options) await oi.run(qid, o.label, o.content || '', o.isCorrect ? 1 : 0);
      await tx.prepare('UPDATE banks SET question_count = question_count + 1 WHERE id = ?').run(req.params.id);
    });
  } catch (e) {
    return res.status(500).json({ error: '保存失败：' + e.message });
  }
  res.json({ id: qid });
}));

// POST /api/import/bank —— 批量导入：建库 + 一次性写入多题（事务）
// 前端把 Excel/CSV/粘贴文本 归一化成同一题结构后调用，避免 N 次往返。
app.post('/api/import/bank', wrap(async (req, res) => {
  const { name, categories, questions } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: '题库名称不能为空' });
  if (!Array.isArray(questions) || questions.length === 0)
    return res.status(400).json({ error: '请至少提供 1 道题目' });

  const cats = Array.isArray(categories) ? categories.filter(Boolean) : [];
  const norm = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] || {};
    const stem = (q.stem || '').toString().trim();
    const opts = Array.isArray(q.options) ? q.options : [];
    const validOpts = opts
      .map((o) => ({
        label: (o.label || '').toString().trim(),
        content: (o.content ?? '').toString(),
        isCorrect: !!o.isCorrect,
      }))
      .filter((o) => o.label && o.content.trim());
    if (!stem) return res.status(400).json({ error: `第 ${i + 1} 题题干为空` });
    if (validOpts.length < 2) return res.status(400).json({ error: `第 ${i + 1} 题选项不足 2 个` });
    if (!validOpts.some((o) => o.isCorrect)) return res.status(400).json({ error: `第 ${i + 1} 题未标记正确答案` });
    norm.push({
      type: q.type === 'multiple' || q.type === 'judge' ? q.type : 'single',
      stem,
      analysis: (q.analysis || '').toString().trim(),
      options: validOpts,
    });
  }

  let bankId, inserted;
  await db.transaction(async (tx) => {
    const bi = await tx
      .prepare('INSERT INTO banks (name, categories, question_count, total_questions) VALUES (?, ?, ?, ?)')
      .run(name.trim(), JSON.stringify(cats), norm.length, norm.length);
    bankId = bi.lastInsertRowid;
    const qi = tx.prepare('INSERT INTO questions (bank_id, type, stem, analysis, sort_order) VALUES (?,?,?,?,?)');
    const oi = tx.prepare('INSERT INTO options (question_id, label, content, is_correct) VALUES (?,?,?,?)');
    for (let i = 0; i < norm.length; i++) {
      const q = norm[i];
      const qr = await qi.run(bankId, q.type, q.stem, q.analysis, i + 1);
      const qid = qr.lastInsertRowid;
      for (const o of q.options) await oi.run(qid, o.label, o.content, o.isCorrect ? 1 : 0);
    }
    inserted = norm.length;
  });
  res.json({ bankId, count: inserted });
}));

// POST /api/practice/answer —— 提交答案，返回判定与解析
app.post('/api/practice/answer', wrap(async (req, res) => {
  const { bankId, questionId, selected = [], duration = 0, revise = false } = req.body || {};
  const q = await db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
  if (!q) return res.status(404).json({ error: '题目不存在' });

  const opts = await db.prepare('SELECT label, is_correct FROM options WHERE question_id = ?').all(questionId);
  const correctLabels = opts.filter((o) => o.is_correct).map((o) => o.label).sort();
  const sel = (Array.isArray(selected) ? selected : [selected]).filter(Boolean).slice().sort();
  const isCorrect =
    sel.length === correctLabels.length && sel.every((v, i) => v === correctLabels[i]);

  // 修订（回到上一题改答案）：更新最近一条记录而非新增，避免 done_count / 正确率重复计数
  if (revise) {
    const prev = await db
      .prepare('SELECT id, is_correct FROM practice_records WHERE user_key = ? AND question_id = ? ORDER BY id DESC LIMIT 1')
      .get(req.userKey, questionId);
    if (prev) {
      await db
        .prepare('UPDATE practice_records SET selected = ?, is_correct = ?, duration = ? WHERE id = ?')
        .run(JSON.stringify(sel), isCorrect ? 1 : 0, duration, prev.id);
      return res.json({ isCorrect, correctLabels, analysis: q.analysis, revised: true });
    }
  }

  await db
    .prepare('INSERT INTO practice_records (user_key, bank_id, question_id, selected, is_correct, duration) VALUES (?,?,?,?,?,?)')
    .run(req.userKey, bankId, questionId, JSON.stringify(sel), isCorrect ? 1 : 0, duration);

  res.json({ isCorrect, correctLabels, analysis: q.analysis });
}));

// POST /api/wrong —— 加入错题本
app.post('/api/wrong', wrap(async (req, res) => {
  const { bankId, questionId } = req.body || {};
  await db
    .prepare('INSERT IGNORE INTO wrong_questions (user_key, bank_id, question_id) VALUES (?,?,?)')
    .run(req.userKey, bankId, questionId);
  res.json({ ok: true });
}));

// GET /api/stats/today —— 首页今日统计 + 连续打卡
app.get('/api/stats/today', wrap(async (req, res) => {
  const uk = req.userKey;
  const today = await db
    .prepare(`SELECT COUNT(*) c, COALESCE(SUM(is_correct),0) correct FROM practice_records
              WHERE user_key = ? AND DATE(created_at) = CURDATE()`)
    .get(uk);
  const count = today.c || 0;
  const accuracy = count ? Math.round((today.correct / count) * 100) : 0;

  let streak = 0;
  let d = 0;
  // 从今天往前逐日检查，断一天即停止
  while (true) {
    const r = await db
      .prepare(`SELECT COUNT(*) c FROM practice_records
                WHERE user_key = ? AND DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL ? DAY)`)
      .get(uk, d);
    if (r.c > 0) { streak++; d++; } else break;
  }
  res.json({ count, accuracy, streak });
}));

// GET /api/stats/overview —— 统计页一次拉全：今日三卡 + 模块正确率 + 近7天 + 热力图 + 错题数
// period: week(近7天) | month(近30天) | all，只影响模块正确率口径（热力图恒近126天）
app.get('/api/stats/overview', wrap(async (req, res) => {
  const period = req.query.period || 'month';
  const days = period === 'week' ? 7 : period === 'all' ? null : 30;
  const uk = req.userKey;

  // 今日三卡（与 /api/stats/today 同口径）
  const today = await db
    .prepare(`SELECT COUNT(*) c, COALESCE(SUM(is_correct),0) correct FROM practice_records
              WHERE user_key = ? AND DATE(created_at) = CURDATE()`)
    .get(uk);
  const todayCount = today.c || 0;
  let streak = 0;
  for (let d = 0; ; d++) {
    const r = await db
      .prepare(`SELECT COUNT(*) c FROM practice_records
                WHERE user_key = ? AND DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL ? DAY)`)
      .get(uk, d);
    if (r.c > 0) streak++; else break;
  }

  // 模块正确率（题库分类口径，Q5：一题计入其题库的每个分类）
  const where = days ? 'WHERE pr.user_key = ? AND pr.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)' : 'WHERE pr.user_key = ?';
  const params = days ? [uk, days] : [uk];
  const rows = await db
    .prepare(`SELECT b.categories, COUNT(*) c, COALESCE(SUM(pr.is_correct),0) ok
              FROM practice_records pr JOIN banks b ON b.id = pr.bank_id
              ${where} GROUP BY pr.bank_id, b.categories`)
    .all(...params);
  const modMap = {};
  for (const r of rows) {
    let cats = [];
    try { cats = JSON.parse(r.categories || '[]'); } catch { /* 忽略脏数据 */ }
    for (const cat of cats) {
      if (!modMap[cat]) modMap[cat] = { name: cat, count: 0, ok: 0 };
      modMap[cat].count += Number(r.c) || 0;   // mysql2 对 COUNT/SUM 可能返回 string，必须归一
      modMap[cat].ok += Number(r.ok) || 0;
    }
  }
  const modules = Object.values(modMap)
    .map((m) => ({ name: m.name, count: m.count, accuracy: m.count ? Math.round((m.ok / m.count) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  // 近 7 天练习量（柱状图，固定近7天）
  const last7Raw = await db
    .prepare(`SELECT DATE(created_at) d, COUNT(*) c FROM practice_records
              WHERE user_key = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
              GROUP BY DATE(created_at)`)
    .all(uk);
  const last7Map = {};
  for (const r of last7Raw) last7Map[new Date(r.d).toISOString().slice(0, 10)] = r.c;
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    last7.push({ date: dt, count: last7Map[dt] || 0 });
  }

  // 练习热力图（近 126 天 = 18 周 × 7）
  const heatRaw = await db
    .prepare(`SELECT DATE(created_at) d, COUNT(*) c FROM practice_records
              WHERE user_key = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 125 DAY)
              GROUP BY DATE(created_at)`)
    .all(uk);
  const heatMap = {};
  for (const r of heatRaw) heatMap[new Date(r.d).toISOString().slice(0, 10)] = r.c;
  const heatmap = [];
  for (let i = 125; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    heatmap.push({ date: dt, count: heatMap[dt] || 0 });
  }

  // 错题数
  const wrong = await db.prepare('SELECT COUNT(*) c FROM wrong_questions WHERE user_key = ?').get(uk);

  res.json({
    today: { count: todayCount, accuracy: todayCount ? Math.round((today.correct / todayCount) * 100) : 0, streak },
    modules,
    last7,
    heatmap,
    wrongCount: wrong.c || 0,
    period,
  });
}));

// GET /api/wrong/list —— 错题本列表（含题干/正确答案/所属题库）
app.get('/api/wrong/list', wrap(async (req, res) => {
  const rows = await db
    .prepare(`SELECT w.bank_id bankId, w.question_id questionId, w.created_at createdAt,
                     q.stem, q.type, q.analysis, b.name bankName
              FROM wrong_questions w
              JOIN questions q ON q.id = w.question_id
              JOIN banks b ON b.id = w.bank_id
              WHERE w.user_key = ?
              ORDER BY w.created_at DESC`)
    .all(req.userKey);
  const result = await Promise.all(rows.map(async (r) => {
    const opts = await db
      .prepare('SELECT label, content, is_correct FROM options WHERE question_id = ? ORDER BY label')
      .all(r.questionId);
    return {
      bankId: r.bankId,
      questionId: r.questionId,
      bankName: r.bankName,
      stem: r.stem,
      type: r.type,
      analysis: r.analysis,
      createdAt: r.createdAt,
      options: opts.map((o) => ({ label: o.label, content: o.content, isCorrect: !!o.is_correct })),
    };
  }));
  res.json(result);
}));

// POST /api/wrong/remove —— 移出错题本（答对重做后调用）
app.post('/api/wrong/remove', wrap(async (req, res) => {
  const { bankId, questionId } = req.body || {};
  await db
    .prepare('DELETE FROM wrong_questions WHERE user_key = ? AND bank_id = ? AND question_id = ?')
    .run(req.userKey, bankId, questionId);
  res.json({ ok: true });
}));

// ===== 收藏 + 笔记（user_key 隔离，免注册）=====
// GET /api/favorite/ids?bankId= —— 本人在该题库已收藏的题目 id 列表（练习页初始化星标用）
app.get('/api/favorite/ids', wrap(async (req, res) => {
  const bankId = req.query.bankId;
  const rows = await db
    .prepare('SELECT question_id FROM favorites WHERE user_key = ? AND bank_id = ?')
    .all(req.userKey, bankId);
  res.json(rows.map((r) => r.question_id));
}));

// GET /api/note/ids?bankId= —— 本人在该题库已写笔记的题目 id 列表（练习页初始化笔标用）
app.get('/api/note/ids', wrap(async (req, res) => {
  const bankId = req.query.bankId;
  const rows = await db
    .prepare('SELECT question_id FROM notes WHERE user_key = ? AND bank_id = ?')
    .all(req.userKey, bankId);
  res.json(rows.map((r) => r.question_id));
}));

// GET /api/favorite/list —— 收藏列表（含题干/选项/题库名/笔记）
app.get('/api/favorite/list', wrap(async (req, res) => {
  const rows = await db
    .prepare(`SELECT f.bank_id bankId, f.question_id questionId, f.created_at createdAt,
                     q.stem, q.type, q.analysis, b.name bankName,
                     n.content note
              FROM favorites f
              JOIN questions q ON q.id = f.question_id
              JOIN banks b ON b.id = f.bank_id
              LEFT JOIN notes n ON n.user_key = f.user_key AND n.question_id = f.question_id
              WHERE f.user_key = ?
              ORDER BY f.created_at DESC`)
    .all(req.userKey);
  const result = await Promise.all(rows.map(async (r) => {
    const opts = await db
      .prepare('SELECT label, content, is_correct FROM options WHERE question_id = ? ORDER BY label')
      .all(r.questionId);
    return {
      bankId: r.bankId,
      questionId: r.questionId,
      bankName: r.bankName,
      stem: r.stem,
      type: r.type,
      analysis: r.analysis,
      createdAt: r.createdAt,
      note: r.note || '',
      options: opts.map((o) => ({ label: o.label, content: o.content, isCorrect: !!o.is_correct })),
    };
  }));
  res.json(result);
}));

// POST /api/favorite/toggle —— 收藏 / 取消收藏（同一题幂等）
app.post('/api/favorite/toggle', wrap(async (req, res) => {
  const { bankId, questionId } = req.body || {};
  const exist = await db
    .prepare('SELECT id FROM favorites WHERE user_key = ? AND question_id = ?')
    .get(req.userKey, questionId);
  if (exist) {
    await db
      .prepare('DELETE FROM favorites WHERE user_key = ? AND question_id = ?')
      .run(req.userKey, questionId);
    return res.json({ favorited: false });
  }
  await db
    .prepare('INSERT INTO favorites (user_key, bank_id, question_id) VALUES (?,?,?)')
    .run(req.userKey, bankId, questionId);
  res.json({ favorited: true });
}));

// GET /api/note —— 读取某题笔记（content 为空串表示未写）
app.get('/api/note', wrap(async (req, res) => {
  const { questionId } = req.query;
  const row = await db
    .prepare('SELECT content FROM notes WHERE user_key = ? AND question_id = ?')
    .get(req.userKey, questionId);
  res.json({ content: row ? row.content || '' : '' });
}));

// POST /api/note —— 保存（upsert）某题笔记；content 为空 → 删除该笔记
app.post('/api/note', wrap(async (req, res) => {
  const { bankId, questionId, content } = req.body || {};
  const text = (content || '').toString();
  if (!text.trim()) {
    await db
      .prepare('DELETE FROM notes WHERE user_key = ? AND question_id = ?')
      .run(req.userKey, questionId);
    return res.json({ ok: true, deleted: true });
  }
  await db
    .prepare(`INSERT INTO notes (user_key, bank_id, question_id, content, updated_at)
              VALUES (?,?,?,?,NOW())
              ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = NOW()`)
    .run(req.userKey, bankId, questionId, text);
  res.json({ ok: true });
}));

// ===== 数据迁移（免注册方案②）：换设备时用 8 位迁移码把旧数据搬到新设备 =====
// POST /api/user/migrate-code —— 为「当前设备」生成迁移码（24h 有效，同设备复用未过期的码）
app.post('/api/user/migrate-code', wrap(async (req, res) => {
  const uk = req.userKey;
  if (uk === 'anonymous' || uk === LEGACY_KEY) {
    return res.status(400).json({ error: '当前身份未初始化，无法生成迁移码' });
  }
  const exist = await db
    .prepare(`SELECT code, expires_at FROM migration_codes
              WHERE user_key = ? AND used_at IS NULL AND expires_at > NOW()
              ORDER BY created_at DESC LIMIT 1`)
    .get(uk);
  if (exist) return res.json({ code: exist.code, expiresAt: exist.expires_at });

  const code = randomCode();
  await db
    .prepare('INSERT INTO migration_codes (code, user_key, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))')
    .run(code, uk);
  const row = await db.prepare('SELECT expires_at FROM migration_codes WHERE code = ?').get(code);
  res.json({ code, expiresAt: row.expires_at });
}));

// POST /api/user/migrate-claim —— 新设备凭码认领旧设备数据（body: {code}）
app.post('/api/user/migrate-claim', wrap(async (req, res) => {
  const { code } = req.body || {};
  const target = req.userKey;
  const c = String(code || '').trim().toUpperCase();
  if (!c) return res.status(400).json({ error: '请输入迁移码' });
  if (target === 'anonymous' || target === LEGACY_KEY) {
    return res.status(400).json({ error: '当前身份未初始化，无法认领' });
  }
  const row = await db
    .prepare('SELECT code, user_key, expires_at, used_at FROM migration_codes WHERE code = ?')
    .get(c);
  if (!row) return res.status(404).json({ error: '迁移码不存在' });
  if (row.used_at) return res.status(400).json({ error: '迁移码已使用过' });
  if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: '迁移码已过期，请重新生成' });
  if (row.user_key === target) return res.status(400).json({ error: '这就是当前设备，无需迁移' });

  // 旧数据整体改挂到新 key 名下（唯一键冲突的行直接丢弃，保留新设备已有的）
  const pr = await db
    .prepare('UPDATE IGNORE practice_records SET user_key = ? WHERE user_key = ?')
    .run(target, row.user_key);
  const wq = await db
    .prepare('UPDATE IGNORE wrong_questions SET user_key = ? WHERE user_key = ?')
    .run(target, row.user_key);
  await db
    .prepare('UPDATE IGNORE practice_records SET user_key = ? WHERE user_key = ?')
    .run(target, LEGACY_KEY); // 顺带接管升级前的遗留数据
  await db.prepare('UPDATE migration_codes SET used_at = NOW() WHERE code = ?').run(c);
  res.json({ ok: true, from: row.user_key, records: pr.changes, wrongs: wq.changes });
}));

// POST /api/user/claim-legacy —— 把「升级前遗留的数据」直接归到当前设备名下
app.post('/api/user/claim-legacy', wrap(async (req, res) => {
  const target = req.userKey;
  if (target === 'anonymous' || target === LEGACY_KEY) {
    return res.status(400).json({ error: '当前身份未初始化，无法认领' });
  }
  const pr = await db
    .prepare('UPDATE IGNORE practice_records SET user_key = ? WHERE user_key = ?')
    .run(target, LEGACY_KEY);
  const wq = await db
    .prepare('UPDATE IGNORE wrong_questions SET user_key = ? WHERE user_key = ?')
    .run(target, LEGACY_KEY);
  res.json({ ok: true, records: pr.changes, wrongs: wq.changes });
}));

// 8 位大写迁移码（去掉 0/O/1/I 等易混字符）
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// 兜底返回首页
// 内容安全：用户可见文本（昵称/房间号等）校验
// 前端设置昵称前调用；后端 /api/arena/ingest 也会二次校验，不信任前端
const { checkTextSecurity } = require('./security');
app.post('/api/content/check', wrap(async (req, res) => {
  const { text, scene = 'nickname' } = req.body || {};
  const r = await checkTextSecurity(String(text || ''), scene);
  res.json(r);
}));

// ===== 微信登录（个人主体：免 300 认证，仅取 openid）=====
// 仅小程序端调用（wx.login 拿 code → 服务端 code2Session 换 openid）。
// openid 作为 user_key 前缀（wx:<openid>），复用既有「按 user_key 隔离」的全部逻辑，
// 因此微信登录后刷题/错题/收藏/笔记自动归属账号，实现多端云同步。
const { WX_APPID, WX_APPSECRET } = process.env;

// 把某 user_key 名下的全部练习数据改挂到另一个 key（唯一键冲突的行丢弃，保留目标已有）
async function reassignUserKey(from, to) {
  if (!from || !to || from === to) return { records: 0, wrongs: 0, favorites: 0, notes: 0 };
  if (from === 'anonymous' || from === LEGACY_KEY || to === 'anonymous' || to === LEGACY_KEY) {
    return { records: 0, wrongs: 0, favorites: 0, notes: 0 };
  }
  const pr = await db.prepare('UPDATE IGNORE practice_records SET user_key = ? WHERE user_key = ?').run(to, from);
  const wq = await db.prepare('UPDATE IGNORE wrong_questions SET user_key = ? WHERE user_key = ?').run(to, from);
  const fa = await db.prepare('UPDATE IGNORE favorites SET user_key = ? WHERE user_key = ?').run(to, from);
  const no = await db.prepare('UPDATE IGNORE notes SET user_key = ? WHERE user_key = ?').run(to, from);
  return { records: pr.changes, wrongs: wq.changes, favorites: fa.changes, notes: no.changes };
}

// code → openid（服务端调用微信接口，密钥来自环境变量，绝不回传前端）
async function code2Session(code) {
  if (!WX_APPID || !WX_APPSECRET) {
    const e = new Error('服务端未配置微信密钥（WX_APPID / WX_APPSECRET）');
    e.status = 500;
    throw e;
  }
  const url =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(WX_APPID)}` +
    `&secret=${encodeURIComponent(WX_APPSECRET)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const resp = await fetch(url);
  const data = await resp.json().catch(() => ({}));
  if (data.errcode) {
    const e = new Error('微信登录失败：' + (data.errmsg || 'errcode ' + data.errcode));
    e.status = 502;
    throw e;
  }
  if (!data.openid) {
    const e = new Error('微信登录未返回 openid');
    e.status = 502;
    throw e;
  }
  return { openid: data.openid, unionid: data.unionid || null };
}

// POST /api/auth/wechat-login —— 小程序端：code 换 openid，落库用户，返回账号信息
app.post('/api/auth/wechat-login', wrap(async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: '缺少登录 code' });
  const { openid, unionid } = await code2Session(code);

  const exist = await db.prepare('SELECT id, nick_name, avatar_url FROM users WHERE openid = ?').get(openid);
  let isNewUser = false;
  if (exist) {
    await db.prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?').run(exist.id);
  } else {
    isNewUser = true;
    await db.prepare('INSERT INTO users (openid, unionid, last_login_at) VALUES (?, ?, NOW())').run(openid, unionid);
  }
  const row = exist || (await db.prepare('SELECT nick_name, avatar_url FROM users WHERE openid = ?').get(openid));
  res.json({
    openid,
    userKey: 'wx:' + openid,
    nickName: (row && row.nick_name) || '',
    avatarUrl: (row && row.avatar_url) || '',
    isNewUser,
  });
}));

// POST /api/auth/bind —— 首次微信登录时，把本机游客数据合并到微信账号（方案②，不丢历史）
// body: { fromKey, toKey }（toKey 应为 wx:<openid>）
app.post('/api/auth/bind', wrap(async (req, res) => {
  const { fromKey, toKey } = req.body || {};
  const r = await reassignUserKey(String(fromKey || ''), String(toKey || ''));
  res.json({ ok: true, ...r });
}));

// GET /api/auth/profile —— 当前微信账号资料（按 user_key 前缀 wx: 识别）
app.get('/api/auth/profile', wrap(async (req, res) => {
  const uk = req.userKey;
  if (!uk.startsWith('wx:')) return res.status(400).json({ error: '当前不是微信登录状态' });
  const row = await db.prepare('SELECT nick_name, avatar_url, created_at FROM users WHERE openid = ?').get(uk.slice(3));
  if (!row) return res.status(404).json({ error: '账号不存在' });
  res.json({ nickName: row.nick_name || '', avatarUrl: row.avatar_url || '', registeredAt: row.created_at });
}));

// POST /api/auth/profile —— 保存昵称/头像（昵称过内容安全校验）
app.post('/api/auth/profile', wrap(async (req, res) => {
  const uk = req.userKey;
  if (!uk.startsWith('wx:')) return res.status(400).json({ error: '当前不是微信登录状态' });
  const openid = uk.slice(3);
  const { nickName, avatarUrl } = req.body || {};
  const name = (nickName || '').toString().trim().slice(0, 32);
  if (name) {
    const r = await checkTextSecurity(name, 'nickname');
    if (!r.ok) return res.status(400).json({ error: '昵称含不合规内容：' + (r.reason || '') });
  }
  const avatar = (avatarUrl || '').toString().trim().slice(0, 512);
  const exist = await db.prepare('SELECT id FROM users WHERE openid = ?').get(openid);
  if (!exist) return res.status(404).json({ error: '账号不存在' });
  await db.prepare('UPDATE users SET nick_name = ?, avatar_url = ? WHERE openid = ?').run(name, avatar, openid);
  res.json({ ok: true });
}));

// ===== 模考组卷：按真实考试模块配比，跨题库抽题成卷 =====
// 预设定义「模块 → 目标题量」。模块名对应 exam_categories 的顶层类别名；
// 题库只要挂在某模块分类、或该模块下的任意子孙分类，即计入该模块。
const EXAM_PRESETS = {
  xingce: {
    key: 'xingce',
    name: '行测标准套卷',
    minutes: 120,
    modules: [
      { category: '言语理解与表达', count: 40 },
      { category: '数量关系', count: 15 },
      { category: '判断推理', count: 40 },
      { category: '资料分析', count: 20 },
      { category: '常识判断', count: 20 },
    ],
  },
};

// 沿 parent_id 上溯，找出题库所属的顶层模块名（找不到返回 null）
function topModuleOf(categoryId, catMap, moduleNames) {
  let cur = catMap.get(Number(categoryId));
  for (let guard = 0; cur && guard < 10; guard++) {
    if (moduleNames.has(cur.name)) return cur.name;
    cur = cur.parentId == null ? null : catMap.get(cur.parentId);
  }
  return null;
}

// 生成一套卷：先统计各模块可用题量，再按 fit 决定取题数
//   scale（默认）= 用「最紧缺模块」的余量作统一系数，保证模块占比与真考一致
//   fill        = 每个模块尽量取满（题量优先，配比会失真）
async function buildPaper(preset, fit) {
  const catRows = await db.prepare('SELECT id, name, parent_id FROM exam_categories').all();
  const catMap = new Map(
    catRows.map((c) => [
      Number(c.id),
      { id: Number(c.id), name: c.name, parentId: c.parent_id == null ? null : Number(c.parent_id) },
    ])
  );
  const moduleNames = new Set(preset.modules.map((m) => m.category));
  const banks = await db.prepare('SELECT id, name, category_id FROM banks').all();

  // 模块 → 该模块下的题库列表
  const banksByModule = new Map(preset.modules.map((m) => [m.category, []]));
  for (const b of banks) {
    const mod = topModuleOf(b.category_id, catMap, moduleNames);
    if (mod) banksByModule.get(mod).push(b);
  }

  // 各模块可用题量
  const available = new Map();
  for (const m of preset.modules) {
    const ids = banksByModule.get(m.category).map((b) => Number(b.id));
    if (!ids.length) {
      available.set(m.category, 0);
      continue;
    }
    const ph = ids.map(() => '?').join(',');
    const row = await db.prepare(`SELECT COUNT(*) c FROM questions WHERE bank_id IN (${ph})`).get(...ids);
    available.set(m.category, Number(row && row.c) || 0);
  }

  let scale = 1;
  if (fit !== 'fill') {
    const ratios = preset.modules
      .filter((m) => available.get(m.category) > 0)
      .map((m) => available.get(m.category) / m.count);
    scale = ratios.length ? Math.min(1, ...ratios) : 0;
  }

  const picked = [];
  const modules = [];
  for (const m of preset.modules) {
    const bl = banksByModule.get(m.category);
    const ids = bl.map((b) => Number(b.id));
    const nameById = new Map(bl.map((b) => [Number(b.id), b.name]));
    const avail = available.get(m.category);
    let want = 0;
    if (ids.length && avail > 0) {
      want = fit === 'fill' ? Math.min(avail, m.count) : Math.floor(m.count * scale);
      if (want === 0 && scale > 0) want = 1; // 题量极少时也保证每模块至少 1 题
    }
    let rows = [];
    if (want > 0) {
      const ph = ids.map(() => '?').join(',');
      rows = await db
        .prepare(`SELECT id, bank_id, type, stem, analysis FROM questions WHERE bank_id IN (${ph}) ORDER BY RAND() LIMIT ?`)
        .all(...ids, want);
    }
    for (const q of rows) {
      picked.push({ ...q, module: m.category, bankName: nameById.get(Number(q.bank_id)) || '' });
    }
    modules.push({ name: m.category, target: m.count, count: rows.length, available: avail, bankCount: bl.length });
  }

  // 批量取选项
  const optMap = new Map();
  if (picked.length) {
    const ph = picked.map(() => '?').join(',');
    const opts = await db
      .prepare(`SELECT question_id, label, content, is_correct FROM options WHERE question_id IN (${ph}) ORDER BY question_id, label`)
      .all(...picked.map((q) => Number(q.id)));
    for (const o of opts) {
      const k = Number(o.question_id);
      if (!optMap.has(k)) optMap.set(k, []);
      optMap.get(k).push({ label: o.label, content: o.content, isCorrect: !!o.is_correct });
    }
  }

  const questions = picked.map((q) => ({
    id: Number(q.id),
    bankId: Number(q.bank_id),
    bankName: q.bankName,
    module: q.module,
    type: q.type,
    stem: q.stem,
    analysis: q.analysis,
    options: optMap.get(Number(q.id)) || [],
  }));

  return {
    preset: preset.key,
    name: preset.name,
    minutes: preset.minutes,
    fit,
    scale: Number(scale.toFixed(4)),
    total: questions.length,
    modules,
    questions,
  };
}

// GET /api/exam/presets —— 可用组卷预设（前端展示配比用）
app.get('/api/exam/presets', wrap(async (req, res) => {
  res.json(
    Object.values(EXAM_PRESETS).map((p) => ({
      key: p.key,
      name: p.name,
      minutes: p.minutes,
      total: p.modules.reduce((s, m) => s + m.count, 0),
      modules: p.modules.map((m) => ({ name: m.category, count: m.count })),
    }))
  );
}));

// GET /api/exam/paper?preset=xingce&fit=scale —— 跨题库按模块配比抽题组卷
app.get('/api/exam/paper', wrap(async (req, res) => {
  const preset = EXAM_PRESETS[String(req.query.preset || 'xingce')];
  if (!preset) return res.status(400).json({ error: '未知的组卷预设' });
  const fit = req.query.fit === 'fill' ? 'fill' : 'scale';
  const paper = await buildPaper(preset, fit);
  if (!paper.total) {
    return res
      .status(404)
      .json({ error: '暂无可用题目：请先导入题库，并把它挂到「言语理解与表达 / 数量关系 / 判断推理 / 资料分析 / 常识判断」分类下' });
  }
  res.json(paper);
}));

const PORT = process.env.PORT || 3000;
db.initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`行测刷题App 已启动 → http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('数据库初始化失败：', e);
    process.exit(1);
  });

module.exports = { MODULES };
