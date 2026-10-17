// admin.js —— 后台管理 API（数据大盘 + 题库/题目维护）
// 挂载路径 /api/admin，除 /api/admin/login 外全部需要管理员 token。
// 凭证读环境变量：ADMIN_USER / ADMIN_PASS / ADMIN_SECRET（见 .env.example）
const crypto = require('crypto');
const express = require('express');
const db = require('./db');

const router = express.Router();

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'qq67607301';
// 未显式配置时随机生成：进程重启后旧 token 自动失效（更安全，代价是需重新登录）
const ADMIN_SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(24).toString('hex');
const TOKEN_TTL = 12 * 60 * 60 * 1000; // 12 小时

// 异步路由包装：Promise 拒绝兜底，避免 unhandledRejection 拖垮进程
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error('[admin]', e);
    if (!res.headersSent) res.status(500).json({ error: '服务器错误：' + e.message });
  });

// ===== token：无状态 HMAC 签名，payload = {user, exp} =====
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest('base64url');
  if (sig.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.exp || p.exp < Date.now()) return null; // 过期
    return p;
  } catch (e) {
    return null;
  }
}

// ===== 登录防爆破：同 IP 连续失败 5 次锁 10 分钟 =====
const FAIL_LIMIT = 5;
const LOCK_MS = 10 * 60 * 1000;
const failMap = new Map(); // ip -> { count, until }

function clientIp(req) {
  const xf = (req.header('x-forwarded-for') || '').split(',')[0].trim();
  return xf || req.ip || 'unknown';
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// POST /api/admin/login —— 账号密码换 token
router.post('/login', wrap(async (req, res) => {
  const ip = clientIp(req);
  const rec = failMap.get(ip);
  if (rec && rec.until && rec.until > Date.now()) {
    return res.status(429).json({ error: '尝试过于频繁，请 10 分钟后再试' });
  }

  const { username = '', password = '' } = req.body || {};
  const ok = safeEqual(username, ADMIN_USER) && safeEqual(password, ADMIN_PASS);
  if (!ok) {
    const next = { count: (rec && rec.count ? rec.count : 0) + 1, until: 0 };
    if (next.count >= FAIL_LIMIT) next.until = Date.now() + LOCK_MS;
    failMap.set(ip, next);
    return res.status(401).json({ error: '账号或密码错误', remain: Math.max(0, FAIL_LIMIT - next.count) });
  }

  failMap.delete(ip);
  const exp = Date.now() + TOKEN_TTL;
  res.json({ token: sign({ user: ADMIN_USER, exp }), expiresAt: exp });
}));

// 其余接口一律要求 token
router.use((req, res, next) => {
  const raw = req.header('authorization') || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : req.header('x-admin-token');
  const payload = verify(token || '');
  if (!payload) return res.status(401).json({ error: '未登录或登录已过期，请重新登录' });
  req.admin = payload;
  next();
});

router.get('/me', (req, res) => res.json({ user: req.admin.user, exp: req.admin.exp }));

// ===== 集中式考试类别 =====
// 把题库挂到「考试类别」下（公考/教资/会计/医学…），后台可自由增删改，使 App 成为通用刷题工具
async function resolveCategoryId(catId) {
  if (catId) {
    const row = await db.prepare('SELECT id FROM exam_categories WHERE id = ?').get(Number(catId));
    if (row) return row.id;
  }
  const def = await db.prepare("SELECT id FROM exam_categories WHERE name = '未分类'").get();
  return def ? def.id : null;
}

// GET /api/admin/categories —— 列表（含每类题库数 + 父级 id，前端组树）
router.get('/categories', wrap(async (req, res) => {
  const rows = await db
    .prepare(`SELECT c.id, c.name, c.parent_id, c.sort, COUNT(b.id) banks
              FROM exam_categories c LEFT JOIN banks b ON b.category_id = c.id
              GROUP BY c.id, c.name, c.parent_id, c.sort ORDER BY c.sort, c.id`)
    .all();
  res.json(rows.map((c) => ({
    id: c.id, name: c.name, parentId: c.parent_id == null ? null : Number(c.parent_id),
    sort: c.sort, banks: Number(c.banks) || 0,
  })));
}));

// 计算类别深度（顶级=1，最深 3 层），不存在返回 0
async function categoryDepth(id) {
  let depth = 0;
  let cur = id;
  while (cur != null && depth < 10) {
    const row = await db.prepare('SELECT id, parent_id FROM exam_categories WHERE id = ?').get(cur);
    if (!row) return 0;
    depth += 1;
    cur = row.parent_id == null ? null : Number(row.parent_id);
  }
  return depth;
}

// POST /api/admin/categories —— 新增（body.parentId 可选：挂到某类别下当子级，最多 3 层）
router.post('/categories', wrap(async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  const parentId = req.body && req.body.parentId ? Number(req.body.parentId) : null;
  if (!name) return res.status(400).json({ error: '类别名称不能为空' });
  if (name.length > 20) return res.status(400).json({ error: '类别名称最多 20 字' });
  let parentDepth = 0;
  if (parentId) {
    parentDepth = await categoryDepth(parentId);
    if (!parentDepth) return res.status(400).json({ error: '父类别不存在' });
    if (parentDepth >= 3) return res.status(400).json({ error: '最多支持 3 级分类（模块 → 子类 → 子子类）' });
  }
  const exist = await db.prepare('SELECT id FROM exam_categories WHERE name = ?').get(name);
  if (exist) return res.status(400).json({ error: '类别已存在' });
  const maxRow = await db.prepare('SELECT COALESCE(MAX(sort),0) m FROM exam_categories').get();
  const info = await db.prepare('INSERT INTO exam_categories (name, parent_id, sort) VALUES (?, ?, ?)')
    .run(name, parentId, (maxRow.m || 0) + 1);
  res.json({ id: info.lastInsertRowid });
}));

// PUT /api/admin/categories/:id —— 改名
router.put('/categories/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ error: '类别名称不能为空' });
  if (name.length > 20) return res.status(400).json({ error: '类别名称最多 20 字' });
  const row = await db.prepare('SELECT id FROM exam_categories WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '类别不存在' });
  const dup = await db.prepare('SELECT id FROM exam_categories WHERE name = ? AND id <> ?').get(name, id);
  if (dup) return res.status(400).json({ error: '类别名称已存在' });
  await db.prepare('UPDATE exam_categories SET name = ? WHERE id = ?').run(name, id);
  res.json({ ok: true });
}));

// DELETE /api/admin/categories/:id —— 删除（下有题库或子类别则阻止）
router.delete('/categories/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const row = await db.prepare('SELECT id, name FROM exam_categories WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '类别不存在' });
  const cntRow = await db.prepare('SELECT COUNT(*) c FROM banks WHERE category_id = ?').get(id);
  const cnt = Number(cntRow.c) || 0;
  if (cnt > 0) return res.status(400).json({ error: `该类别下还有 ${cnt} 个题库，请先迁移或删除后再删除类别` });
  const subRow = await db.prepare('SELECT COUNT(*) c FROM exam_categories WHERE parent_id = ?').get(id);
  const subCnt = Number(subRow.c) || 0;
  if (subCnt > 0) return res.status(400).json({ error: `该类别下还有 ${subCnt} 个子类别，请先删除子类别` });
  await db.prepare('DELETE FROM exam_categories WHERE id = ?').run(id);
  res.json({ ok: true });
}));

// ===== 数据大盘 =====
router.get('/overview', wrap(async (req, res) => {
  const [
    bankRow, qRow, prRow, userRow, todayUserRow, todayRow,
    wrongRow, favRow, noteRow, arenaMatchRow, arenaPlayerRow,
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) c FROM banks').get(),
    db.prepare('SELECT COUNT(*) c FROM questions').get(),
    db.prepare('SELECT COUNT(*) c, COALESCE(SUM(is_correct),0) ok FROM practice_records').get(),
    db.prepare('SELECT COUNT(DISTINCT user_key) c FROM practice_records').get(),
    db.prepare('SELECT COUNT(DISTINCT user_key) c FROM practice_records WHERE created_at >= CURDATE()').get(),
    db.prepare('SELECT COUNT(*) c FROM practice_records WHERE created_at >= CURDATE()').get(),
    db.prepare('SELECT COUNT(*) c FROM wrong_questions').get(),
    db.prepare('SELECT COUNT(*) c FROM favorites').get(),
    db.prepare('SELECT COUNT(*) c FROM notes').get(),
    db.prepare('SELECT COUNT(*) c FROM arena_matches').get(),
    db.prepare('SELECT COUNT(*) c FROM arena_players').get(),
  ]);

  const trend = await db
    .prepare(`SELECT DATE(created_at) d, COUNT(*) answers, COALESCE(SUM(is_correct),0) correct
              FROM practice_records
              WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
              GROUP BY DATE(created_at) ORDER BY d`)
    .all();

  const topBanks = await db
    .prepare(`SELECT b.id, b.name, COUNT(p.id) answers, COALESCE(SUM(p.is_correct),0) correct
              FROM banks b LEFT JOIN practice_records p ON p.bank_id = b.id
              GROUP BY b.id, b.name ORDER BY answers DESC LIMIT 10`)
    .all();

  const total = Number(prRow.c) || 0;
  const ok = Number(prRow.ok) || 0;
  res.json({
    banks: Number(bankRow.c) || 0,
    questions: Number(qRow.c) || 0,
    answers: total,
    accuracy: total > 0 ? Math.round((ok / total) * 100) : 0,
    users: Number(userRow.c) || 0,
    todayUsers: Number(todayUserRow.c) || 0,
    todayAnswers: Number(todayRow.c) || 0,
    wrongs: Number(wrongRow.c) || 0,
    favorites: Number(favRow.c) || 0,
    notes: Number(noteRow.c) || 0,
    arenaMatches: Number(arenaMatchRow.c) || 0,
    arenaPlayers: Number(arenaPlayerRow.c) || 0,
    trend: trend.map((t) => ({
      // MySQL DATE 可能返回 Date 对象，统一成 YYYY-MM-DD
      date: t.d instanceof Date ? t.d.toISOString().slice(0, 10) : String(t.d).slice(0, 10),
      answers: Number(t.answers) || 0,
      correct: Number(t.correct) || 0,
    })),
    topBanks: topBanks.map((b) => ({
      id: b.id,
      name: b.name,
      answers: Number(b.answers) || 0,
      correct: Number(b.correct) || 0,
    })),
  });
}));

// ===== 题库 =====
router.get('/banks', wrap(async (req, res) => {
  const rows = await db
    .prepare(`SELECT b.id, b.name, b.categories, b.category_id, b.created_at,
                     (SELECT c.name FROM exam_categories c WHERE c.id = b.category_id) category_name,
                     (SELECT COUNT(*) FROM questions WHERE bank_id = b.id) question_count,
                     (SELECT COUNT(*) FROM practice_records WHERE bank_id = b.id) answers
              FROM banks b ORDER BY b.id DESC`)
    .all();
  res.json(rows.map((b) => ({
    id: b.id,
    name: b.name,
    categories: JSON.parse(b.categories || '[]'),
    categoryId: b.category_id || null,
    categoryName: b.category_name || '未分类',
    questionCount: Number(b.question_count) || 0,
    answers: Number(b.answers) || 0,
    createdAt: b.created_at,
  })));
}));

router.post('/banks', wrap(async (req, res) => {
  const { name, categories, categoryId } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: '题库名称不能为空' });
  const cats = Array.isArray(categories) ? categories.filter(Boolean).map((c) => String(c).trim()) : [];
  const catId = await resolveCategoryId(categoryId);
  const info = await db
    .prepare('INSERT INTO banks (name, categories, category_id) VALUES (?, ?, ?)')
    .run(String(name).trim(), JSON.stringify(cats), catId);
  res.json({ id: info.lastInsertRowid });
}));

router.put('/banks/:id', wrap(async (req, res) => {
  const { name, categories, categoryId } = req.body || {};
  const id = Number(req.params.id);
  const row = await db.prepare('SELECT * FROM banks WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '题库不存在' });

  const nextName = name && String(name).trim() ? String(name).trim() : row.name;
  const cats = Array.isArray(categories) ? categories.filter(Boolean).map((c) => String(c).trim()) : JSON.parse(row.categories || '[]');
  const nextCat = req.body && 'categoryId' in req.body ? await resolveCategoryId(categoryId) : (row.category_id || null);
  await db.prepare('UPDATE banks SET name = ?, categories = ?, category_id = ? WHERE id = ?')
    .run(nextName, JSON.stringify(cats), nextCat, id);
  res.json({ ok: true });
}));

// 删库：先清掉题目以外的关联数据（练习/错题/收藏/笔记无外键，否则会留孤儿行）
router.delete('/banks/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const row = await db.prepare('SELECT id FROM banks WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '题库不存在' });

  let removed = 0;
  await db.transaction(async (tx) => {
    const qs = await tx.prepare('SELECT id FROM questions WHERE bank_id = ?').all(id);
    removed = qs.length;
    const ids = qs.map((q) => q.id);
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      await tx.prepare(`DELETE FROM practice_records WHERE question_id IN (${ph})`).run(...ids);
      await tx.prepare(`DELETE FROM wrong_questions WHERE question_id IN (${ph})`).run(...ids);
      await tx.prepare(`DELETE FROM favorites WHERE question_id IN (${ph})`).run(...ids);
      await tx.prepare(`DELETE FROM notes WHERE question_id IN (${ph})`).run(...ids);
      await tx.prepare(`DELETE FROM options WHERE question_id IN (${ph})`).run(...ids);
      await tx.prepare(`DELETE FROM questions WHERE bank_id = ?`).run(id);
    }
    await tx.prepare('DELETE FROM practice_records WHERE bank_id = ?').run(id);
    await tx.prepare('DELETE FROM wrong_questions WHERE bank_id = ?').run(id);
    await tx.prepare('DELETE FROM favorites WHERE bank_id = ?').run(id);
    await tx.prepare('DELETE FROM notes WHERE bank_id = ?').run(id);
    await tx.prepare('DELETE FROM banks WHERE id = ?').run(id);
  });
  res.json({ ok: true, removedQuestions: removed });
}));

// ===== 题目 =====
// GET /api/admin/banks/:id/questions?keyword=&limit=&offset=
router.get('/banks/:id/questions', wrap(async (req, res) => {
  const bankId = Number(req.params.id);
  const keyword = String(req.query.keyword || '').trim();
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = ['bank_id = ?'];
  const params = [bankId];
  if (keyword) {
    where.push('(stem LIKE ? OR analysis LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const whereSql = where.join(' AND ');

  const total = await db.prepare(`SELECT COUNT(*) c FROM questions WHERE ${whereSql}`).get(...params);
  const qs = await db
    .prepare(`SELECT id, type, stem, analysis, sort_order FROM questions WHERE ${whereSql}
              ORDER BY sort_order, id LIMIT ${limit} OFFSET ${offset}`)
    .all(...params);

  let options = [];
  if (qs.length) {
    const ph = qs.map(() => '?').join(',');
    options = await db
      .prepare(`SELECT question_id, label, content, is_correct FROM options
                WHERE question_id IN (${ph}) ORDER BY question_id, label`)
      .all(...qs.map((q) => q.id));
  }
  const byQ = new Map();
  for (const o of options) {
    if (!byQ.has(o.question_id)) byQ.set(o.question_id, []);
    byQ.get(o.question_id).push({ label: o.label, content: o.content, isCorrect: !!o.is_correct });
  }

  res.json({
    total: Number(total.c) || 0,
    list: qs.map((q) => ({
      id: q.id,
      type: q.type,
      stem: q.stem,
      analysis: q.analysis || '',
      sortOrder: q.sort_order,
      options: byQ.get(q.id) || [],
    })),
  });
}));

// POST /api/admin/banks/:id/questions —— 后台手动新增题目
router.post('/banks/:id/questions', wrap(async (req, res) => {
  const bankId = Number(req.params.id);
  const { type = 'single', stem, analysis = '', options = [] } = req.body || {};
  if (!stem || !String(stem).trim()) return res.status(400).json({ error: '题干不能为空' });
  if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ error: '至少需要 2 个选项' });
  if (!options.some((o) => o.isCorrect)) return res.status(400).json({ error: '请标记至少 1 个正确答案' });

  const bank = await db.prepare('SELECT id FROM banks WHERE id = ?').get(bankId);
  if (!bank) return res.status(404).json({ error: '题库不存在' });

  let qid;
  await db.transaction(async (tx) => {
    const maxRow = await tx.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM questions WHERE bank_id = ?').get(bankId);
    const qi = await tx
      .prepare('INSERT INTO questions (bank_id, type, stem, analysis, sort_order) VALUES (?,?,?,?,?)')
      .run(bankId, type, String(stem).trim(), String(analysis || '').trim(), (maxRow ? maxRow.m : 0) + 1);
    qid = qi.lastInsertRowid;
    const oi = tx.prepare('INSERT INTO options (question_id, label, content, is_correct) VALUES (?,?,?,?)');
    for (const o of options) await oi.run(qid, String(o.label || '').trim(), String(o.content ?? ''), o.isCorrect ? 1 : 0);
    await tx.prepare('UPDATE banks SET question_count = question_count + 1 WHERE id = ?').run(bankId);
  });
  res.json({ id: qid });
}));

// PUT /api/admin/questions/:id —— 编辑题目（题干/解析/选项整体替换）
router.put('/questions/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { type, stem, analysis, options } = req.body || {};
  const q = await db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  if (!q) return res.status(404).json({ error: '题目不存在' });

  if (options !== undefined) {
    if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ error: '至少需要 2 个选项' });
    if (!options.some((o) => o.isCorrect)) return res.status(400).json({ error: '请标记至少 1 个正确答案' });
  }
  if (stem !== undefined && !String(stem).trim()) return res.status(400).json({ error: '题干不能为空' });

  await db.transaction(async (tx) => {
    await tx
      .prepare('UPDATE questions SET type = ?, stem = ?, analysis = ? WHERE id = ?')
      .run(type || q.type, stem !== undefined ? String(stem).trim() : q.stem,
        analysis !== undefined ? String(analysis || '').trim() : (q.analysis || ''), id);
    if (Array.isArray(options)) {
      await tx.prepare('DELETE FROM options WHERE question_id = ?').run(id);
      const oi = tx.prepare('INSERT INTO options (question_id, label, content, is_correct) VALUES (?,?,?,?)');
      for (const o of options) await oi.run(id, String(o.label || '').trim(), String(o.content ?? ''), o.isCorrect ? 1 : 0);
    }
  });
  res.json({ ok: true });
}));

// DELETE /api/admin/questions/:id —— 删题并清理关联数据
router.delete('/questions/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const q = await db.prepare('SELECT bank_id FROM questions WHERE id = ?').get(id);
  if (!q) return res.status(404).json({ error: '题目不存在' });

  await db.transaction(async (tx) => {
    await tx.prepare('DELETE FROM practice_records WHERE question_id = ?').run(id);
    await tx.prepare('DELETE FROM wrong_questions WHERE question_id = ?').run(id);
    await tx.prepare('DELETE FROM favorites WHERE question_id = ?').run(id);
    await tx.prepare('DELETE FROM notes WHERE question_id = ?').run(id);
    await tx.prepare('DELETE FROM options WHERE question_id = ?').run(id);
    await tx.prepare('DELETE FROM questions WHERE id = ?').run(id);
    await tx.prepare('UPDATE banks SET question_count = GREATEST(question_count - 1, 0) WHERE id = ?').run(q.bank_id);
  });
  res.json({ ok: true });
}));

// 把前端传来的题目数组归一化并逐条校验（返回第一条错误信息，便于前端定位行号）
function normalize(list) {
  if (!Array.isArray(list) || list.length === 0) return { error: '请至少提供 1 道题目' };
  const norm = [];
  for (let i = 0; i < list.length; i++) {
    const q = list[i] || {};
    const stem = String(q.stem || '').trim();
    const opts = (Array.isArray(q.options) ? q.options : [])
      .map((o) => ({
        label: String(o.label || '').trim(),
        content: String(o.content ?? ''),
        isCorrect: !!o.isCorrect,
      }))
      .filter((o) => o.label && o.content.trim());
    if (!stem) return { error: `第 ${i + 1} 题题干为空` };
    if (opts.length < 2) return { error: `第 ${i + 1} 题选项不足 2 个` };
    if (!opts.some((o) => o.isCorrect)) return { error: `第 ${i + 1} 题未标记正确答案` };
    norm.push({
      type: q.type === 'multiple' || q.type === 'judge' ? q.type : 'single',
      stem,
      analysis: String(q.analysis || '').trim(),
      options: opts,
    });
  }
  return { norm };
}

// POST /api/admin/banks/:id/questions/batch —— 批量追加题目到已有题库
router.post('/banks/:id/questions/batch', wrap(async (req, res) => {
  const bankId = Number(req.params.id);
  const bank = await db.prepare('SELECT id FROM banks WHERE id = ?').get(bankId);
  if (!bank) return res.status(404).json({ error: '题库不存在' });

  const { norm, error } = normalize(req.body ? req.body.questions : null);
  if (error) return res.status(400).json({ error });

  await db.transaction(async (tx) => {
    const maxRow = await tx.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM questions WHERE bank_id = ?').get(bankId);
    let order = maxRow ? maxRow.m : 0;
    const qi = tx.prepare('INSERT INTO questions (bank_id, type, stem, analysis, sort_order) VALUES (?,?,?,?,?)');
    const oi = tx.prepare('INSERT INTO options (question_id, label, content, is_correct) VALUES (?,?,?,?)');
    for (const q of norm) {
      const qr = await qi.run(bankId, q.type, q.stem, q.analysis, ++order);
      for (const o of q.options) await oi.run(qr.lastInsertRowid, o.label, o.content, o.isCorrect ? 1 : 0);
    }
    await tx.prepare('UPDATE banks SET question_count = question_count + ?, total_questions = question_count WHERE id = ?')
      .run(norm.length, bankId);
  });
  res.json({ count: norm.length });
}));

// POST /api/admin/import —— 批量导入（新建题库，与 C 端 /api/import/bank 同逻辑，此处需鉴权）
router.post('/import', wrap(async (req, res) => {
  const { name, categories, questions, categoryId } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: '题库名称不能为空' });

  const cats = Array.isArray(categories) ? categories.filter(Boolean).map((c) => String(c).trim()) : [];
  const { norm, error } = normalize(questions);
  if (error) return res.status(400).json({ error });
  const catId = await resolveCategoryId(categoryId);

  let bankId;
  await db.transaction(async (tx) => {
    const bi = await tx
      .prepare('INSERT INTO banks (name, categories, category_id, question_count, total_questions) VALUES (?, ?, ?, ?, ?)')
      .run(String(name).trim(), JSON.stringify(cats), catId, norm.length, norm.length);
    bankId = bi.lastInsertRowid;
    const qi = tx.prepare('INSERT INTO questions (bank_id, type, stem, analysis, sort_order) VALUES (?,?,?,?,?)');
    const oi = tx.prepare('INSERT INTO options (question_id, label, content, is_correct) VALUES (?,?,?,?)');
    for (let i = 0; i < norm.length; i++) {
      const q = norm[i];
      const qr = await qi.run(bankId, q.type, q.stem, q.analysis, i + 1);
      for (const o of q.options) await oi.run(qr.lastInsertRowid, o.label, o.content, o.isCorrect ? 1 : 0);
    }
  });
  res.json({ bankId, count: norm.length });
}));

module.exports = router;
