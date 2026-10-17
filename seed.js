// seed.js —— 灌入演示数据，让首页/统计一打开就有内容（MySQL 版）
const db = require('./db');

async function seed() {
  await db.exec(`
    DELETE FROM practice_records;
    DELETE FROM wrong_questions;
    DELETE FROM options;
    DELETE FROM questions;
    DELETE FROM banks;
  `);

  const insertBank = (name, categories, total, qc, dc, cc) =>
    db.prepare('INSERT INTO banks (name, categories, total_questions, question_count, done_count, correct_count) VALUES (?,?,?,?,?,?)')
      .run(name, JSON.stringify(categories), total, qc, dc, cc);
  const insertQuestion = (bankId, type, stem, analysis, sort) =>
    db.prepare('INSERT INTO questions (bank_id, type, stem, analysis, sort_order) VALUES (?,?,?,?,?)')
      .run(bankId, type, stem, analysis, sort);
  const insertOption = (qid, label, content, isCorrect) =>
    db.prepare('INSERT INTO options (question_id, label, content, is_correct) VALUES (?,?,?,?)')
      .run(qid, label, content, isCorrect ? 1 : 0);
  const insertRecord = (bankId, qid, selected, isCorrect, createdAt) =>
    db.prepare('INSERT INTO practice_records (bank_id, question_id, selected, is_correct, created_at) VALUES (?,?,?,?,?)')
      .run(bankId, qid, JSON.stringify(selected), isCorrect ? 1 : 0, createdAt);

  // —— 题库 1：2023 河南省考行测真题 ——
  const b1 = (await insertBank('2023河南省考行测真题', ['判断推理', '言语理解'], 135, 0, 120, 94)).lastInsertRowid;
  let q = (await insertQuestion(b1, 'single', '12. 从所给的四个选项中，选择最合适的一个填入问号处，使之呈现一定规律性：', '题干中图形封闭区域数量依次为 2、3、4、5，呈等差数列递增，故问号处应为含 5 个封闭区域的图形，对应选项 C。', 1)).lastInsertRowid;
  await insertOption(q, 'A', '图形中直角的数量依次为 0、1、2、3', 0);
  await insertOption(q, 'B', '图形中对称轴的数量依次为 1、2、3、4', 0);
  await insertOption(q, 'C', '图形中封闭区域数依次为 2、3、4、5', 1);
  await insertOption(q, 'D', '图形中交点数依次为 3、4、5、6', 0);

  q = (await insertQuestion(b1, 'single', '面对复杂局面，他始终______，从容应对。', '“泰然处之”形容在紧急情况下沉着镇定，符合语境。其余三项均含慌乱之意，与“从容”矛盾。', 2)).lastInsertRowid;
  await insertOption(q, 'A', '泰然处之', 1);
  await insertOption(q, 'B', '惊慌失措', 0);
  await insertOption(q, 'C', '手忙脚乱', 0);
  await insertOption(q, 'D', '不知所措', 0);

  q = (await insertQuestion(b1, 'judge', '所有金属都能导电，铁是金属，所以铁能导电。', '典型的三段论推理，前提与结论均成立，判断为正确。', 3)).lastInsertRowid;
  await insertOption(q, 'A', '正确', 1);
  await insertOption(q, 'B', '错误', 0);

  // —— 题库 2：行测模块强化·判断推理 ——
  const b2 = (await insertBank('行测模块强化·判断推理', ['判断推理'], 200, 0, 60, 39)).lastInsertRowid;
  q = (await insertQuestion(b2, 'single', '如果“苹果”是“水果”的一种，那么以下哪项逻辑关系与之相同？', '苹果与水果是种属关系（个体属于大类）。白菜属于蔬菜，逻辑关系一致。', 1)).lastInsertRowid;
  await insertOption(q, 'A', '白菜 — 蔬菜', 1);
  await insertOption(q, 'B', '汽车 — 公路', 0);
  await insertOption(q, 'C', '医生 — 医院', 0);
  await insertOption(q, 'D', '钢笔 — 纸张', 0);

  q = (await insertQuestion(b2, 'multiple', '下列属于可再生能源的有：', '太阳能、风能属于可再生能源；石油、天然气为不可再生化石能源。', 2)).lastInsertRowid;
  await insertOption(q, 'A', '太阳能', 1);
  await insertOption(q, 'B', '风能', 1);
  await insertOption(q, 'C', '石油', 0);
  await insertOption(q, 'D', '天然气', 0);

  // —— 题库 3：常识判断专项 ——
  const b3 = (await insertBank('常识判断专项', ['常识'], 90, 0, 0, 0)).lastInsertRowid;
  q = (await insertQuestion(b3, 'single', '河南省的省会是：', '河南省省会为郑州。', 1)).lastInsertRowid;
  await insertOption(q, 'A', '郑州', 1);
  await insertOption(q, 'B', '洛阳', 0);
  await insertOption(q, 'C', '开封', 0);
  await insertOption(q, 'D', '南阳', 0);

  // 更新各题库实际题量
  await db.prepare('UPDATE banks SET question_count = (SELECT COUNT(*) FROM questions WHERE bank_id = banks.id)').run();

  // —— 练习记录：让首页统计有数据 ——
  // 今天 45 条（约 75% 正确），并往前 5 天各补 1 条，凑出“连续打卡 6 天”
  const b1Questions = (await db.prepare('SELECT id FROM questions WHERE bank_id = ? ORDER BY id').all(b1)).map((r) => r.id);
  for (let i = 0; i < 45; i++) {
    const qid = b1Questions[i % b1Questions.length];
    const isCorrect = i % 4 !== 3; // 75% 正确率
    const ans = await db.prepare('SELECT label FROM options WHERE question_id=? AND is_correct=1').get(qid);
    await insertRecord(b1, qid, [ans.label], isCorrect ? 1 : 0, new Date().toISOString().slice(0, 19).replace('T', ' '));
  }
  for (let d = 1; d <= 5; d++) {
    const qid = b1Questions[d % b1Questions.length];
    const ans = await db.prepare('SELECT label FROM options WHERE question_id=? AND is_correct=1').get(qid);
    const day = new Date(Date.now() - d * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    await insertRecord(b1, qid, [ans.label], 1, day);
  }

  const qc = (await db.prepare('SELECT COUNT(*) c FROM questions').get()).c;
  const rc = (await db.prepare('SELECT COUNT(*) c FROM practice_records').get()).c;
  console.log('✅ 种子数据写入完成');
  console.log(`   题库: 3 个 | 题目: ${qc} 道 | 练习记录: ${rc} 条`);
}

db.initSchema()
  .then(seed)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('种子数据写入失败：', e);
    process.exit(1);
  });
