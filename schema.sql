-- schema.sql —— 行测刷题 App 数据库结构（MySQL / InnoDB）
-- 首次启动由 db.js 读取并执行，IF NOT EXISTS 保证幂等。

CREATE TABLE IF NOT EXISTS banks (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  name            VARCHAR(255) NOT NULL,
  categories      TEXT NOT NULL,                        -- JSON 数组，如 ["判断推理","言语理解"]
  total_questions INT NOT NULL DEFAULT 0,              -- 题库标称题量（用于进度显示）
  question_count  INT NOT NULL DEFAULT 0,              -- 实际已录入题目数
  done_count      INT NOT NULL DEFAULT 0,              -- 已作答次数
  correct_count   INT NOT NULL DEFAULT 0,              -- 答对次数
  created_at      DATETIME NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 集中式考试类别（后台「类别管理」维护，题库挂到类别下，支持任意考试类型）
-- parent_id 支持上下级树形（最多 3 层：模块 → 子类 → 子子类，如 行测→言语理解与表达→逻辑填空→实词填空）
CREATE TABLE IF NOT EXISTS exam_categories (
  id    INT PRIMARY KEY AUTO_INCREMENT,
  name  VARCHAR(50) NOT NULL,
  parent_id INT NULL,                                  -- 父类别 id，NULL=顶级
  sort  INT NOT NULL DEFAULT 0,                    -- 展示排序，越小越靠前
  created_at DATETIME NOT NULL DEFAULT NOW(),
  UNIQUE KEY uk_cat_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 应用级键值标记（记录「默认分类已预置」等一次性动作，避免每次启动重复执行）
CREATE TABLE IF NOT EXISTS app_meta (
  k   VARCHAR(64) PRIMARY KEY,
  v   VARCHAR(255) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS questions (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  bank_id    INT NOT NULL,
  type       VARCHAR(16) NOT NULL DEFAULT 'single',    -- single | multiple | judge
  stem       TEXT NOT NULL,
  analysis   TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS options (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  question_id INT NOT NULL,
  label      VARCHAR(8) NOT NULL,                       -- A | B | C | D
  content    TEXT NOT NULL,
  is_correct INT NOT NULL DEFAULT 0,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 练习记录：user_key = 本地设备身份（无需注册，见 utils/identity.js）
-- DEFAULT 'legacy' 仅用于兼容升级前既有的历史数据（可由用户主动认领）
CREATE TABLE IF NOT EXISTS practice_records (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_key   VARCHAR(64) NOT NULL DEFAULT 'legacy',     -- 设备身份 key
  bank_id    INT NOT NULL,
  question_id INT NOT NULL,
  selected   TEXT NOT NULL,                           -- JSON 数组，所选 label
  is_correct INT NOT NULL DEFAULT 0,
  duration   INT NOT NULL DEFAULT 0,                    -- 作答耗时（秒）
  created_at DATETIME NOT NULL DEFAULT NOW(),
  INDEX (bank_id),
  INDEX (created_at),
  INDEX idx_pr_user_key (user_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wrong_questions (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_key   VARCHAR(64) NOT NULL DEFAULT 'legacy',     -- 设备身份 key
  bank_id    INT NOT NULL,
  question_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT NOW(),
  UNIQUE KEY uq_user_bank_q (user_key, bank_id, question_id),
  INDEX (bank_id),
  INDEX idx_wq_user_key (user_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 数据迁移码：换设备时把旧 user_key 的数据搬到新 user_key 名下（24h 有效，一次性）
CREATE TABLE IF NOT EXISTS migration_codes (
  code       VARCHAR(8) PRIMARY KEY,
  user_key   VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT NOW(),
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  INDEX (user_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 竞技场：战绩持久化（多人直播答题）
CREATE TABLE IF NOT EXISTS arena_players (
  nickname    VARCHAR(64) PRIMARY KEY,
  total_score INT NOT NULL DEFAULT 0,   -- 累计总积分
  games       INT NOT NULL DEFAULT 0,   -- 参与对局数
  best_score  INT NOT NULL DEFAULT 0,   -- 单局最高分
  wins        INT NOT NULL DEFAULT 0,   -- 拿过第1名的次数
  last_seen   DATETIME NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS arena_matches (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  room_id      VARCHAR(64) NOT NULL,
  bank_id      INT,
  rounds       INT NOT NULL DEFAULT 0,  -- 本局题目数
  participants INT NOT NULL DEFAULT 0,  -- 参与人数
  started_at   DATETIME NOT NULL DEFAULT NOW(),
  ended_at     DATETIME NOT NULL DEFAULT NOW(),
  INDEX (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS arena_match_players (
  match_id    INT NOT NULL,
  nickname    VARCHAR(64) NOT NULL,
  `ranking`   INT NOT NULL,
  total_score INT NOT NULL DEFAULT 0,
  correct     INT NOT NULL DEFAULT 0,
  answered    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, nickname),
  FOREIGN KEY (match_id) REFERENCES arena_matches(id) ON DELETE CASCADE,
  INDEX (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS arena_answers (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  match_id    INT NOT NULL,
  round_no    INT NOT NULL,
  nickname    VARCHAR(64) NOT NULL,
  question_id INT,
  `option`    VARCHAR(8),
  is_correct  INT NOT NULL DEFAULT 0,
  score       INT NOT NULL DEFAULT 0,
  answered_at DATETIME NOT NULL DEFAULT NOW(),
  FOREIGN KEY (match_id) REFERENCES arena_matches(id) ON DELETE CASCADE,
  INDEX (match_id),
  INDEX (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 收藏：user_key 隔离，同一用户对同一题只收藏一次
CREATE TABLE IF NOT EXISTS favorites (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_key    VARCHAR(64) NOT NULL DEFAULT 'legacy',
  bank_id     INT NOT NULL,
  question_id INT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT NOW(),
  UNIQUE KEY uq_fav (user_key, question_id),
  INDEX (user_key),
  INDEX (bank_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 笔记：每题每用户一条，content 为空视为删除
CREATE TABLE IF NOT EXISTS notes (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_key    VARCHAR(64) NOT NULL DEFAULT 'legacy',
  bank_id     INT NOT NULL,
  question_id INT NOT NULL,
  content     TEXT,
  updated_at  DATETIME NOT NULL DEFAULT NOW(),
  UNIQUE KEY uq_note (user_key, question_id),
  INDEX (user_key),
  INDEX (bank_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
