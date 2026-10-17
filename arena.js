// arena.js —— 多人直播答题竞技场（弹幕/外部系统调接口喂答案）
// 数据流：主播后台推题(server驱动当前题) → 观众弹幕/外部调用 POST /api/arena/ingest 传 {username, option}
//        → 服务端校验当前题、按配置计分、维护实时排行榜 → 展示端轮询 GET /api/arena/state
// 内存态（sessions / sseClients / 计时器）与数据库无关，逻辑完整保留；仅落库接口换 MySQL。
const express = require('express');
const db = require('./db');
const { checkTextSecurity } = require('./security');

const router = express.Router();

// 异步路由包装
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: '服务器错误：' + e.message });
  });

// 计分参数（可调）
const SCORE_BASE = 100;     // 答对基础分
const SPEED_BONUS = 100;    // 速度满分附加（剩余时间比例 * 100）
const DEFAULT_GAP = 4;      // 自动连题：揭晓后到下一道题的间隔(秒)
const HISTORY_PAGE = 20;

// —— ingest 轻量限流（零依赖，纯内存态）——
// 阈值刻意宽松：正常直播几十~几百观众每题各发 1 条不会被误伤。
const INGEST_MAX_PER_ROOM = 150;   // 单房间滑动窗口内最大条数
const INGEST_WINDOW_MS = 10000;    // 滑动窗口长度（10s）
const INGEST_MIN_GAP_MS = 800;     // 同一昵称最小作答间隔
const RATE_KEYS_CAP = 2000;        // 限流表键数上限，超过则清理空闲键

const roomHits = new Map(); // roomId -> number[] 窗口内时间戳
const nickLast = new Map(); // nickname -> 上次作答时间戳

// 惰性清理：仅在窗口/表膨胀时清理空闲键，避免内存泄漏
function sweepRateKeys(now) {
  if (roomHits.size + nickLast.size <= RATE_KEYS_CAP) return;
  for (const [k, arr] of roomHits) {
    const kept = arr.filter((t) => now - t < INGEST_WINDOW_MS);
    if (kept.length) roomHits.set(k, kept);
    else roomHits.delete(k);
  }
  for (const [k, t] of nickLast) {
    if (now - t > INGEST_WINDOW_MS) nickLast.delete(k);
  }
}

// 返回 null 表示放行；否则返回 { status, body } 供直接回包
function checkIngestRate(roomId, uname, now) {
  // 1) 按昵称：800ms 内重复作答
  const last = nickLast.get(uname);
  if (last != null && now - last < INGEST_MIN_GAP_MS) {
    return { status: 200, body: { ok: false, reason: 'too fast' } };
  }
  // 2) 按房间：滑动窗口条数（顺带清理该键过期时间戳）
  let arr = roomHits.get(roomId);
  if (!arr) { arr = []; roomHits.set(roomId, arr); }
  while (arr.length && now - arr[0] >= INGEST_WINDOW_MS) arr.shift();
  if (arr.length >= INGEST_MAX_PER_ROOM) {
    return { status: 429, body: { ok: false, reason: 'rate limited' } };
  }
  return null;
}

// 记录一次通过的 ingest
function recordIngest(roomId, uname, now) {
  let arr = roomHits.get(roomId);
  if (!arr) { arr = []; roomHits.set(roomId, arr); }
  arr.push(now);
  nickLast.set(uname, now);
  sweepRateKeys(now);
}

// —— 竞技场配置默认值（刷题场景）——
const DEFAULT_CONFIG = {
  showOthersAnswers: false,     // 观众端是否可见他人已选分布（用户点名项）
  revealCorrect: 'roundEnd',    // 正确答案揭示时机: 'roundEnd'(窗口关闭后) | 'never'
  shuffleOptions: false,       // 选项乱序（防记位，强迫真理解）
  allowDigit: true,            // 数字 1-4 作答
  speedBonus: true,            // 速度加权（越快越高）
  wrongPenalty: false,         // 答错扣分
  wrongPenaltyScore: 30,        // 答错扣分值
  hideRankDuringPlay: false,   // 答题中隐藏实时榜（防抄榜）
  questionOrder: 'random',     // 抽题顺序: 'random' | 'sequential'
  duplicateGuard: true,         // 同昵称同回合只计首条（防刷，固定开启）
  autoContinue: false,
  gapSec: DEFAULT_GAP,
  roundsTotal: null,
  durationSec: 15,
  // 同步模式: 'wait-all' 等双方都答完才揭晓 | 'free' 自由节奏，自己答完即可看对错
  syncMode: 'wait-all',
};

// 校验并规整配置（兼容旧版顶层字段）
function sanitizeConfig(input, overrides) {
  const c = { ...DEFAULT_CONFIG, ...(input || {}), ...(overrides || {}) };
  c.showOthersAnswers = !!c.showOthersAnswers;
  c.revealCorrect = c.revealCorrect === 'never' ? 'never' : 'roundEnd';
  c.syncMode = c.syncMode === 'free' ? 'free' : 'wait-all';
  c.shuffleOptions = !!c.shuffleOptions;
  c.allowDigit = c.allowDigit !== false;
  c.speedBonus = c.speedBonus !== false;
  c.wrongPenalty = !!c.wrongPenalty;
  c.wrongPenaltyScore = Math.min(1000, Math.max(0, Number(c.wrongPenaltyScore) || 30));
  c.hideRankDuringPlay = !!c.hideRankDuringPlay;
  c.questionOrder = c.questionOrder === 'sequential' ? 'sequential' : 'random';
  c.duplicateGuard = true;
  c.autoContinue = !!c.autoContinue;
  c.gapSec = Number(c.gapSec) || DEFAULT_GAP;
  c.roundsTotal = c.roundsTotal != null ? Number(c.roundsTotal) : null;
  c.durationSec = Math.min(120, Math.max(3, Number(c.durationSec) || 15));
  return c;
}

const sessions = new Map(); // roomId -> session
const sseClients = new Map(); // roomId -> Set<{res, viewer}>

function sseSend(client, event, data) {
  try {
    client.res.write(`event: ${event}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) { /* 连接已断，忽略 */ }
}

function sseBroadcast(roomId, event, data, allowFn) {
  const set = sseClients.get(roomId);
  if (!set || !set.size) return;
  for (const c of set) {
    if (!allowFn || allowFn(c)) sseSend(c, event, data);
  }
}

function broadcastAnswer(roomId, payload) {
  const s = sessions.get(roomId);
  const allowed = !!(s && s.config.showOthersAnswers);
  sseBroadcast(roomId, 'answer', payload, (c) => c.viewer === 'host' || allowed);
}

function getSession(roomId) {
  let s = sessions.get(roomId);
  if (!s) {
    s = {
      roomId, bankId: null, roundNo: 0, seqPtr: 0,
      current: null, players: new Map(), allAnswers: [],
      config: { ...DEFAULT_CONFIG },
      gapTimer: null, expireTimer: null, gapEndsAt: null,
    };
    sessions.set(roomId, s);
  }
  return s;
}

function clearTimers(s) {
  if (s.expireTimer) { clearTimeout(s.expireTimer); s.expireTimer = null; }
  if (s.gapTimer) { clearTimeout(s.gapTimer); s.gapTimer = null; }
  s.gapEndsAt = null;
}

// 把 "选A" / "a" / "1" / "答案B" 归一为 A-D；无法识别返回 null（allowDigit 控制数字分支）
function parseOption(raw, allowDigit = true) {
  if (raw == null) return null;
  const s = String(raw).trim();
  const letter = s.match(/[A-Da-d]/i);
  if (letter) return letter[0].toUpperCase();
  if (allowDigit) {
    const digit = s.match(/[1-4]/);
    if (digit) return String.fromCharCode(64 + parseInt(digit[0], 10)); // 1->A ... 4->D
  }
  return null;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 按配置抽下一题（random / sequential）
async function nextQuestion(s) {
  const bid = s.bankId;
  if (!bid) return null;
  if (s.config.questionOrder === 'sequential') {
    const rows = await db.prepare('SELECT id FROM questions WHERE bank_id = ? ORDER BY id').all(bid);
    if (!rows.length) return null;
    const id = rows[s.seqPtr % rows.length].id;
    s.seqPtr += 1;
    return db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  }
  const rows = await db.prepare('SELECT id FROM questions WHERE bank_id = ?').all(bid);
  if (!rows.length) return null;
  const pick = rows[Math.floor(Math.random() * rows.length)];
  return db.prepare('SELECT * FROM questions WHERE id = ?').get(pick.id);
}

// 设定当前题并启动窗口计时（含 shuffleOptions 重映射）
async function buildCurrent(s, q, durationSec) {
  let opts = await db
    .prepare('SELECT label, content, is_correct FROM options WHERE question_id = ? ORDER BY label')
    .all(q.id);
  if (s.config.shuffleOptions) opts = shuffle(opts); // 打乱顺序，index 即新展示位
  const options = opts.map((o, i) => ({ label: String.fromCharCode(65 + i), content: o.content }));
  const correctLabels = opts
    .map((o, i) => (o.is_correct ? String.fromCharCode(65 + i) : null))
    .filter(Boolean)
    .sort();
  const now = Date.now();
  s.roundNo += 1;
  s.current = {
    questionId: q.id,
    type: q.type,
    stem: q.stem,
    analysis: q.analysis,
    options,
    correctLabels,
    startedAt: now,
    endsAt: now + durationSec * 1000,
    durationSec,
    answers: new Map(),
  };
  clearTimers(s);
  s.expireTimer = setTimeout(() => onRoundExpire(s), durationSec * 1000);
  return s.current;
}

// 单题窗口到期：进入揭晓阶段；若开启自动连题，则延时推下一题
async function onRoundExpire(s) {
  if (s.config.autoContinue && (s.config.roundsTotal == null || s.roundNo < s.config.roundsTotal)) {
    s.gapEndsAt = Date.now() + s.config.gapSec * 1000;
    s.gapTimer = setTimeout(async () => {
      const q = await nextQuestion(s);
      if (q) await buildCurrent(s, q, s.current ? s.current.durationSec : s.config.durationSec);
      else { s.config.autoContinue = false; s.gapEndsAt = null; }
    }, s.config.gapSec * 1000);
  }
}

// 持久化一局战绩（事务：单连接保证 BEGIN/写/COMMIT 一致）
async function persistMatch(s) {
  const insPlayer = 'INSERT IGNORE INTO arena_players (nickname, total_score, games, best_score, wins, last_seen) VALUES (?,0,0,0,0,NOW())';
  // 注意：SQLite 的标量 MAX(a,b) 在 MySQL 里是聚合函数（只接受 1 个参数）→ 必须用 GREATEST(a,b)
  const upPlayer = 'UPDATE arena_players SET total_score=total_score+?, games=games+1, best_score=GREATEST(best_score,?), wins=wins+?, last_seen=NOW() WHERE nickname=?';
  const insMatch = 'INSERT INTO arena_matches (room_id, bank_id, rounds, participants, ended_at) VALUES (?,?,?,?,NOW())';
  const insMP = 'INSERT INTO arena_match_players (match_id, nickname, `ranking`, total_score, correct, answered) VALUES (?,?,?,?,?,?)';
  const insAP = 'INSERT INTO arena_answers (match_id, round_no, nickname, question_id, `option`, is_correct, score, answered_at) VALUES (?,?,?,?,?,?,?,NOW())';

  await db.transaction(async (tx) => {
    const standings = [...s.players.values()]
      .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount);
    const matchInfo = await tx.prepare(insMatch).run(s.roomId, s.bankId, s.roundNo, s.players.size);
    const matchId = matchInfo.lastInsertRowid;
    for (const p of standings) {
      const rank = standings.indexOf(p) + 1;
      await tx.prepare(insMP).run(matchId, p.username, rank, p.score, p.correctCount, p.answered);
      await tx.prepare(insPlayer).run(p.username);
      await tx.prepare(upPlayer).run(p.score, p.score, rank === 1 ? 1 : 0, p.username);
    }
    for (const a of s.allAnswers) {
      await tx.prepare(insAP).run(matchId, a.roundNo, a.nickname, a.questionId, a.label, a.isCorrect ? 1 : 0, a.score);
    }
  });
}

// —— 开始 / 重置一场对局（含配置）——
router.post('/session/start', wrap(async (req, res) => {
  const body = req.body || {};
  const { roomId = 'default', bankId = null, autoStart = false } = body;
  const s = getSession(roomId);
  clearTimers(s);
  s.bankId = bankId ? Number(bankId) : null;
  s.roundNo = 0;
  s.seqPtr = 0;
  s.current = null;
  s.players.clear();
  s.allAnswers = [];
  // 顶层旧字段 + config 对象合并（顶层字段可覆盖，兼容两种传参方式）
  const merged = {
    ...(body.config || {}),
    showOthersAnswers: body.showOthersAnswers ?? (body.config && body.config.showOthersAnswers),
    revealCorrect: body.revealCorrect ?? (body.config && body.config.revealCorrect),
    shuffleOptions: body.shuffleOptions ?? (body.config && body.config.shuffleOptions),
    allowDigit: body.allowDigit ?? (body.config && body.config.allowDigit),
    speedBonus: body.speedBonus ?? (body.config && body.config.speedBonus),
    wrongPenalty: body.wrongPenalty ?? (body.config && body.config.wrongPenalty),
    wrongPenaltyScore: body.wrongPenaltyScore ?? (body.config && body.config.wrongPenaltyScore),
    hideRankDuringPlay: body.hideRankDuringPlay ?? (body.config && body.config.hideRankDuringPlay),
    questionOrder: body.questionOrder ?? (body.config && body.config.questionOrder),
    autoContinue: body.autoContinue ?? (body.config && body.config.autoContinue),
    gapSec: body.gapSec ?? (body.config && body.config.gapSec),
    roundsTotal: body.roundsTotal ?? (body.config && body.config.roundsTotal),
    durationSec: body.durationSec ?? (body.config && body.config.durationSec),
    syncMode: body.syncMode ?? (body.config && body.config.syncMode),
  };
  s.config = sanitizeConfig(merged);
  if (autoStart && s.bankId) {
    const q = await nextQuestion(s);
    if (q) await buildCurrent(s, q, s.config.durationSec);
  }
  res.json({ ok: true, roomId, bankId: s.bankId, config: s.config, current: !!s.current });
}));

// —— 主播推下一题（server 驱动当前题，全场同题）——
router.post('/question/push', wrap(async (req, res) => {
  const { roomId = 'default', bankId, questionId, durationSec, autoContinue, gapSec, roundsTotal } = req.body || {};
  const s = getSession(roomId);
  if (autoContinue !== undefined) s.config.autoContinue = !!autoContinue;
  if (gapSec !== undefined) s.config.gapSec = Number(gapSec) || DEFAULT_GAP;
  if (roundsTotal !== undefined) s.config.roundsTotal = roundsTotal != null ? Number(roundsTotal) : null;

  let q;
  if (questionId) {
    q = await db.prepare('SELECT * FROM questions WHERE id = ?').get(Number(questionId));
  } else {
    const bid = bankId ? Number(bankId) : s.bankId;
    if (!bid) return res.status(400).json({ error: '请提供 bankId 或 questionId' });
    s.bankId = bid;
    q = await nextQuestion(s);
  }
  if (!q) return res.status(404).json({ error: '题目不存在或无题目' });

  await buildCurrent(s, q, Number(durationSec) || s.config.durationSec);
  sseBroadcast(roomId, 'question', { roundNo: s.roundNo, questionId: q.id });
  res.json({
    ok: true,
    roundNo: s.roundNo,
    question: { id: q.id, type: q.type, stem: q.stem, options: s.current.options },
    correctLabels: s.current.correctLabels,
    endsAt: s.current.endsAt,
    durationSec: s.current.durationSec,
    autoContinue: s.config.autoContinue,
  });
}));

// —— 核心接口：外部/弹幕喂答案 ——
router.post('/ingest', wrap(async (req, res) => {
  const body = req.body || {};
  const { username, option, roomId = 'default' } = body;
  if (!username || !String(username).trim()) {
    return res.status(400).json({ ok: false, error: 'username 必填' });
  }
  // 截断到 20：与 security.js nickname max=20 对齐，避免长昵称/含 emoji（UTF-16 码元）昵称被误拒为 400「昵称包含不当内容」
  const uname = String(username).trim().slice(0, 20);
  // checkTextSecurity 为 async（可能调用微信 msgSecCheck），必须 await，否则 sec.ok 恒为 undefined（接口必返 400）
  const sec = await checkTextSecurity(uname, 'nickname');
  if (!sec.ok) return res.status(400).json({ ok: false, error: '昵称包含不当内容，请更换' });

  // 轻量限流：防刷接口（阈值宽松，不影响正常直播节奏）
  const nowRate = Date.now();
  const limited = checkIngestRate(roomId, uname, nowRate);
  if (limited) return res.status(limited.status).json(limited.body);
  recordIngest(roomId, uname, nowRate);

  const s = sessions.get(roomId);
  if (!s || !s.current) return res.json({ ok: false, reason: 'no active question' });

  const cur = s.current;
  const now = Date.now();
  if (now >= cur.endsAt) return res.json({ ok: false, reason: 'window closed' });
  if (s.config.duplicateGuard && cur.answers.has(uname)) return res.json({ ok: false, reason: 'already answered' });

  const label = parseOption(option, s.config.allowDigit);
  if (!label) return res.json({ ok: false, reason: 'invalid option' });

  const isCorrect = cur.correctLabels.includes(label);
  let score = 0;
  if (isCorrect) {
    if (s.config.speedBonus) {
      const remainingRatio = Math.max(0, (cur.endsAt - now) / (cur.durationSec * 1000));
      score = SCORE_BASE + Math.round(SPEED_BONUS * remainingRatio); // 越快越高，区间 [100,200]
    } else {
      score = SCORE_BASE; // 关掉速度加权则固定基础分
    }
  } else if (s.config.wrongPenalty) {
    score = -s.config.wrongPenaltyScore; // 答错扣分
  }

  cur.answers.set(uname, { label, isCorrect, score, answeredAt: now });
  s.allAnswers.push({ roundNo: s.roundNo, nickname: uname, questionId: cur.questionId, label, isCorrect, score, answeredAt: now });

  let p = s.players.get(uname);
  if (!p) { p = { username: uname, score: 0, correctCount: 0, answered: 0 }; s.players.set(uname, p); }
  p.score += score;
  p.answered += 1;
  if (isCorrect) p.correctCount += 1;

  broadcastAnswer(roomId, { username: uname, option: label, isCorrect, score, ts: now });

  res.json({ ok: true, username: uname, isCorrect, score, totalScore: p.score });
}));

// —— 展示端轮询：当前题 + 倒计时 + 实时榜 ——
router.get('/state', wrap(async (req, res) => {
  const roomId = req.query.roomId || 'default';
  const isHost = req.query.viewer === 'host';
  const viewerName = isHost ? null : String(req.query.viewer || '').trim();
  const s = sessions.get(roomId);
  if (!s) return res.json({ roomId, active: false, phase: 'idle' });
  const cur = s.current;
  const now = Date.now();
  const phase = !cur ? 'idle' : (now < cur.endsAt ? 'answering' : 'reveal');
  const nextInMs = (phase === 'reveal' && s.gapEndsAt) ? Math.max(0, s.gapEndsAt - now) : null;

  // 实时榜（hideRankDuringPlay 时答题阶段隐藏）
  const hideRank = s.config.hideRankDuringPlay && phase === 'answering';
  const leaderboard = hideRank ? [] : [...s.players.values()]
    .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount)
    .slice(0, 20)
    .map((p, i) => ({ rank: i + 1, username: p.username, score: p.score, correctCount: p.correctCount }));

  // 他人答案分布（showOthersAnswers 或 主播视角 才返回）
  let answerDist = null;
  if (cur && (s.config.showOthersAnswers || isHost)) {
    answerDist = {};
    cur.options.forEach((o) => { answerDist[o.label] = 0; });
    for (const a of cur.answers.values()) {
      if (answerDist[a.label] != null) answerDist[a.label] += 1;
    }
  }

  // 正确答案揭晓：never 永不；否则按 syncMode 决定时机
  //   wait-all：双方都答完即揭晓，时间到兜底（避免有人不答卡住）
  //   free：自己答完立刻揭晓，不等对方
  let reveal = null;
  if (cur && s.config.revealCorrect === 'roundEnd') {
    const timedOut = now >= cur.endsAt;
    const allAnswered = s.players.size >= 2 && cur.answers.size >= s.players.size;
    const selfAnswered = !isHost && viewerName && cur.answers.has(viewerName);
    const shouldReveal =
      s.config.syncMode === 'free' ? (timedOut || selfAnswered) : (timedOut || allAnswered);
    if (shouldReveal) {
      reveal = { correctLabels: cur.correctLabels, analysis: cur.analysis };
    }
  }

  res.json({
    roomId,
    active: !!cur,
    roundNo: s.roundNo,
    phase,
    nextInMs,
    now,
    participants: s.players.size,
    answeredCount: cur ? cur.answers.size : 0,
    question: cur
      ? { id: cur.questionId, type: cur.type, stem: cur.stem, options: cur.options, endsAt: cur.endsAt, durationSec: cur.durationSec }
      : null,
    reveal,
    answerDist,
    showOthers: !!(s.config.showOthersAnswers || isHost),
    syncMode: s.config.syncMode,
    selfAnswered: !!(cur && !isHost && viewerName && cur.answers.has(viewerName)),
    leaderboard,
    config: s.config,
  });
}));

// —— 结束对局，落库并返回最终排名 ——
router.post('/session/end', wrap(async (req, res) => {
  const { roomId = 'default' } = req.body || {};
  const s = sessions.get(roomId);
  if (!s) return res.json({ ok: false });
  const standings = [...s.players.values()]
    .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount)
    .map((p, i) => ({ rank: i + 1, username: p.username, score: p.score, correctCount: p.correctCount }));
  clearTimers(s);
  let persisted = false;
  try {
    if (s.players.size > 0 || s.allAnswers.length > 0) { await persistMatch(s); persisted = true; }
  } catch (e) {
    return res.status(500).json({ ok: false, error: '落库失败：' + e.message });
  }
  s.current = null;
  res.json({ ok: true, roomId, standings, persisted });
}));

// —— 战绩历史（按对局倒序）——
router.get('/history', wrap(async (req, res) => {
  const roomId = req.query.roomId;
  const limit = Math.min(Number(req.query.limit) || HISTORY_PAGE, 50);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  let sql = `SELECT m.id, m.room_id, m.rounds, m.participants, m.started_at, m.ended_at,
      (SELECT GROUP_CONCAT(CONCAT(nickname, '(', total_score, ')')) FROM
        (SELECT nickname, total_score FROM arena_match_players WHERE match_id=m.id ORDER BY ranking LIMIT 3) t) AS top3
    FROM arena_matches m`;
  const params = [];
  if (roomId) { sql += ' WHERE m.room_id = ?'; params.push(roomId); }
  sql += ' ORDER BY m.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = await db.prepare(sql).all(...params);
  res.json({ matches: rows });
}));

// —— 全时段排行榜（累计积分）——
router.get('/leaderboard', wrap(async (req, res) => {
  const period = req.query.period || 'all';
  let where = '';
  if (period === 'recent') where = ' WHERE last_seen >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
  const rows = await db
    .prepare(`SELECT nickname, total_score, games, wins, best_score, last_seen FROM arena_players${where} ORDER BY total_score DESC LIMIT 50`)
    .all();
  res.json({ period, players: rows });
}));

// —— 单个玩家战绩 ——
router.get('/player/:nickname', wrap(async (req, res) => {
  const nickname = req.params.nickname;
  const p = await db
    .prepare('SELECT nickname, total_score, games, wins, best_score, last_seen FROM arena_players WHERE nickname = ?')
    .get(nickname);
  if (!p) return res.json({ found: false });
  const recent = await db
    .prepare(
      `SELECT m.id, m.ended_at, mp.ranking, mp.total_score, mp.correct, mp.answered
       FROM arena_match_players mp JOIN arena_matches m ON m.id = mp.match_id
       WHERE mp.nickname = ? ORDER BY m.id DESC LIMIT 10`
    )
    .all(nickname);
  res.json({ found: true, player: p, recent });
}));

// —— SSE 实时流：弹幕 / 题目切换推送 ——
router.get('/stream', (req, res) => {
  const roomId = req.query.roomId || 'default';
  const viewer = req.query.viewer === 'host' ? 'host' : 'viewer';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const s = sessions.get(roomId);
  const cfg = s ? s.config : DEFAULT_CONFIG;
  const phase = s && s.current ? (Date.now() < s.current.endsAt ? 'answering' : 'reveal') : 'idle';
  sseSend(res, 'config', { showOthersAnswers: !!cfg.showOthersAnswers, phase, roundNo: s ? s.roundNo : 0 });
  const client = { res, viewer };
  if (!sseClients.has(roomId)) sseClients.set(roomId, new Set());
  sseClients.get(roomId).add(client);
  const ka = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch (e) {} }, 25000);
  req.on('close', () => {
    clearInterval(ka);
    const set = sseClients.get(roomId);
    if (set) { set.delete(client); if (!set.size) sseClients.delete(roomId); }
  });
});

module.exports = router;
