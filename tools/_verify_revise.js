// 临时验证脚本：修订（改答案）不得重复计数
const BASE = 'http://127.0.0.1:3399';
const get = async (p) => (await fetch(BASE + p)).json();
const post = async (p, body) =>
  (await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })).json();

(async () => {
  const qs = await get('/api/banks/10/questions');
  // 选一道有正确答案标记的题
  const q = qs.find((x) => x.options.some((o) => o.isCorrect));
  if (!q) return console.log('没有标记正确答案的题目，无法验证');
  const correct = q.options.filter((o) => o.isCorrect).map((o) => o.label);
  const wrong = q.options.filter((o) => !o.isCorrect).map((o) => o.label);
  console.log('题目', q.id, '正确=', correct.join(''), '错误选项=', wrong.join(''));

  const bankOf = async () => (await get('/api/banks')).find((b) => b.id === 10);
  const s0 = await get('/api/stats/today');
  const b0 = await bankOf();
  console.log('初始: today.count=%s  done=%s accuracy=%s', s0.count, b0.doneCount, b0.accuracy);

  // 1. 首次提交（故意答错）
  const r1 = await post('/api/practice/answer', { bankId: 10, questionId: q.id, selected: [wrong[0]], duration: 5 });
  const s1 = await get('/api/stats/today');
  const b1 = await bankOf();
  console.log('首次答错: isCorrect=%s | today.count=%s(+%s) done=%s(+%s) accuracy=%s',
    r1.isCorrect, s1.count, s1.count - s0.count, b1.doneCount, b1.doneCount - b0.doneCount, b1.accuracy);

  // 2. 修订为正确答案
  const r2 = await post('/api/practice/answer', { bankId: 10, questionId: q.id, selected: correct, duration: 6, revise: true });
  const s2 = await get('/api/stats/today');
  const b2 = await bankOf();
  console.log('修订答对: isCorrect=%s revised=%s | today.count=%s(+%s) done=%s(+%s) accuracy=%s',
    r2.isCorrect, r2.revised, s2.count, s2.count - s1.count, b2.doneCount, b2.doneCount - b1.doneCount, b2.accuracy);

  console.log('--- 断言 ---');
  console.log('修订判定为正确:', r2.isCorrect === true ? 'PASS' : 'FAIL');
  console.log('修订不新增记录:', s2.count === s1.count ? 'PASS' : `FAIL (${s1.count}->${s2.count})`);
  console.log('修订不重复计 done:', b2.doneCount === b1.doneCount ? 'PASS' : `FAIL (${b1.doneCount}->${b2.doneCount})`);
  console.log('正确率应上升:', b2.accuracy >= b1.accuracy ? 'PASS' : `FAIL (${b1.accuracy}->${b2.accuracy})`);
})();
