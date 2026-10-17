// db.js —— MySQL 连接池（mysql2/promise），配置读环境变量
// 提供与旧 node:sqlite 近似的 API（prepare / all / get / run / exec / transaction），
// 让 server.js / arena.js / seed.js 以最小改动迁移。
// 本地开发时读 .env（无 dotenv 也不报错，便于生产直接用环境变量注入）
try { require('dotenv').config(); } catch (e) { /* dotenv 可选 */ }

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'kaoshi',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  multipleStatements: true, // 支持 schema.sql / seed 的多语句
});

// 事务期间把查询路由到同一连接（避免跨连接 BEGIN/写/COMMIT 错乱）
let activeConn = null;

function prepareOn(target, sql) {
  return {
    async all(...params) {
      const [rows] = await target.query(sql, params);
      return rows;
    },
    async get(...params) {
      const [rows] = await target.query(sql, params);
      return rows[0];
    },
    async run(...params) {
      const [result] = await target.query(sql, params);
      // 兼容 node:sqlite 的 { lastInsertRowid, changes }
      return { lastInsertRowid: result.insertId, changes: result.affectedRows };
    },
  };
}

const db = {
  prepare(sql) {
    return prepareOn(activeConn || pool, sql);
  },
  async exec(sql) {
    await (activeConn || pool).query(sql);
  },
  get pool() {
    return pool;
  },
  // 单连接事务：fn 内用传入的 tx.prepare(...) / tx.query(...)
  async transaction(fn) {
    const conn = await pool.getConnection();
    activeConn = conn;
    try {
      await conn.beginTransaction();
      await fn({
        prepare: (sql) => prepareOn(conn, sql),
        query: async (sql, ...params) => {
          const [rows] = await conn.query(sql, params);
          return rows;
        },
      });
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      activeConn = null;
      conn.release();
    }
  },
  // 首次启动按 schema.sql 建表（IF NOT EXISTS，幂等）+ 老库增量迁移
  async initSchema() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    const stmts = sql
      .split(';')
      // 逐行去掉整行注释（避免「注释 + 建表」被并成一段后以 -- 开头被误删）
      .map((s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim())
      .filter((s) => s)
      .map((s) => s + ';');
    for (const st of stmts) {
      await pool.query(st);
    }
    await migrateUserKey();
    await migrateCategory();
  },
};

// ===== 增量迁移：给既有库补上「按设备身份隔离数据」的 user_key =====
// MySQL 不支持 ADD COLUMN IF NOT EXISTS / ADD INDEX IF NOT EXISTS，
// 只能查 information_schema 判断后再 ALTER，且必须可重复执行。
async function hasColumn(table, col) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, col]
  );
  return rows.length > 0;
}

async function hasIndex(table, idx) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, idx]
  );
  return rows.length > 0;
}

async function migrateUserKey() {
  // 1) practice_records 加 user_key 列 + 索引
  if (!(await hasColumn('practice_records', 'user_key'))) {
    await pool.query(
      `ALTER TABLE practice_records ADD COLUMN user_key VARCHAR(64) NOT NULL DEFAULT 'legacy' AFTER id`
    );
  }
  if (!(await hasIndex('practice_records', 'idx_pr_user_key'))) {
    await pool.query('ALTER TABLE practice_records ADD INDEX idx_pr_user_key (user_key)');
  }

  // 2) wrong_questions 加 user_key 列，并把唯一键从 (bank_id,question_id) 换成 (user_key,bank_id,question_id)
  if (!(await hasColumn('wrong_questions', 'user_key'))) {
    await pool.query(
      `ALTER TABLE wrong_questions ADD COLUMN user_key VARCHAR(64) NOT NULL DEFAULT 'legacy' AFTER id`
    );
  }
  if (await hasIndex('wrong_questions', 'uq_bank_q')) {
    await pool.query('ALTER TABLE wrong_questions DROP INDEX uq_bank_q');
  }
  if (!(await hasIndex('wrong_questions', 'uq_user_bank_q'))) {
    try {
      await pool.query(
        'ALTER TABLE wrong_questions ADD UNIQUE KEY uq_user_bank_q (user_key, bank_id, question_id)'
      );
    } catch (e) {
      // 历史数据里同一 (user_key,bank_id,question_id) 出现重复时先去重，再建唯一键
      await pool.query(
        `DELETE w FROM wrong_questions w JOIN (
           SELECT MIN(id) keep_id, user_key, bank_id, question_id FROM wrong_questions
           GROUP BY user_key, bank_id, question_id HAVING COUNT(*) > 1
         ) d ON w.user_key = d.user_key AND w.bank_id = d.bank_id AND w.question_id = d.question_id
         WHERE w.id > d.keep_id`
      );
      await pool.query(
        'ALTER TABLE wrong_questions ADD UNIQUE KEY uq_user_bank_q (user_key, bank_id, question_id)'
      );
    }
  }
  if (!(await hasIndex('wrong_questions', 'idx_wq_user_key'))) {
    await pool.query('ALTER TABLE wrong_questions ADD INDEX idx_wq_user_key (user_key)');
  }
}

// ===== 增量迁移：集中式考试类别 =====
// 1) banks 表加 category_id 列（可为空，FK 不强制，便于逐步迁移旧题库）
// 2) 确保存在默认类别「未分类」，并把历史 NULL 题库归到该类别
// 3) exam_categories 加 parent_id 列（上下级树形，最多 3 层）
// 4) 首次启动预置「行测」默认分类树（app_meta 打标，仅执行一次，避免复活管理员删除的类别）
async function migrateCategory() {
  if (!(await hasColumn('banks', 'category_id'))) {
    await pool.query('ALTER TABLE banks ADD COLUMN category_id INT NULL');
    await pool.query('ALTER TABLE banks ADD INDEX idx_bank_cat (category_id)');
  }
  if (!(await hasColumn('exam_categories', 'parent_id'))) {
    await pool.query('ALTER TABLE exam_categories ADD COLUMN parent_id INT NULL');
    await pool.query('ALTER TABLE exam_categories ADD INDEX idx_cat_parent (parent_id)');
  }
  // 默认类别
  const [def] = await pool.query('SELECT id FROM exam_categories WHERE name = ?', ['未分类']);
  let defId;
  if (def.length === 0) {
    const [ins] = await pool.query('INSERT INTO exam_categories (name, sort) VALUES (?, ?)', ['未分类', 999]);
    defId = ins.insertId;
  } else {
    defId = def[0].id;
  }
  // 历史题库（无类别）归到「未分类」
  await pool.query('UPDATE banks SET category_id = ? WHERE category_id IS NULL', [defId]);
  // 行测默认分类树（仅一次）
  await seedDefaultCategories();
}

// 行测五大模块默认树（参考主流刷题 App 层级：模块 → 子类 → 子子类）
// 结构：[名称, sort, 子类数组]；子类元素：[名称, [子子类...]]
const DEFAULT_CATEGORY_TREE = [
  ['言语理解与表达', 1, [
    ['逻辑填空', ['实词填空', '成语填空', '混搭填空']],
    ['片段阅读', ['主旨概括', '意图判断', '细节理解']],
    ['语句表达', ['语句排序', '语句填空']],
  ]],
  ['数量关系', 2, [
    ['数学运算', []],
    ['数字推理', []],
  ]],
  ['判断推理', 3, [
    ['图形推理', []],
    ['定义判断', []],
    ['类比推理', []],
    ['逻辑判断', []],
  ]],
  ['资料分析', 4, []],
  ['常识判断', 5, ['政治常识', '法律常识', '经济常识', '历史文化常识', '科技常识'].map((n) => [n, []])],
];

async function seedDefaultCategories() {
  // app_meta 打标：只跑一次。管理员之后删掉某个默认类别不会被复活。
  const [done] = await pool.query('SELECT v FROM app_meta WHERE k = ? LIMIT 1', ['cat_defaults']);
  if (done.length > 0) return;
  async function ensure(name, parentId, sort) {
    const [rows] = await pool.query('SELECT id FROM exam_categories WHERE name = ? LIMIT 1', [name]);
    if (rows.length > 0) return rows[0].id;
    const [ins] = await pool.query(
      'INSERT INTO exam_categories (name, parent_id, sort) VALUES (?, ?, ?)',
      [name, parentId, sort]
    );
    return ins.insertId;
  }
  try {
    for (const [rootName, rootSort, children] of DEFAULT_CATEGORY_TREE) {
      const rootId = await ensure(rootName, null, rootSort);
      for (let i = 0; i < children.length; i++) {
        const [childName, grandsons] = children[i];
        const childId = await ensure(childName, rootId, i + 1);
        for (let j = 0; j < grandsons.length; j++) {
          await ensure(grandsons[j], childId, j + 1);
        }
      }
    }
    await pool.query("INSERT IGNORE INTO app_meta (k, v) VALUES ('cat_defaults', '1')");
  } catch (e) {
    // 预置失败不阻塞启动（下次启动重试；打标未写入）
    console.error('[db] 预置默认分类失败（将在下次启动重试）:', e.message);
  }
}

module.exports = db;
