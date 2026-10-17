// 后台管理接口自测（连 3400 测试实例；会在远端库里建一个 __test__ 题库并立即删除）
const BASE = 'http://127.0.0.1:3400';

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* 非 JSON（如 HTML） */ }
  return { status: r.status, json, text };
}

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra });
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  → ' + extra : ''));
}

(async () => {
  // 1) 静态页面
  const page = await call('/admin/');
  check('GET /admin/ 返回 200', page.status === 200, String(page.status));
  check('页面含登录框', /id="lgUser"/.test(page.text || ''));

  // 2) 错误密码
  const bad = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'wrong-password' } });
  check('错误密码 401', bad.status === 401, JSON.stringify(bad.json));

  // 3) 正确登录
  const ok = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'qq67607301' } });
  check('正确密码拿 token', ok.status === 200 && !!ok.json.token, JSON.stringify(ok.json).slice(0, 60));
  const token = ok.json && ok.json.token;
  if (!token) { console.log('无 token，终止'); process.exit(1); }

  // 4) 未带 token
  const noAuth = await call('/api/admin/overview');
  check('无 token 访问 401', noAuth.status === 401, JSON.stringify(noAuth.json));

  // 5) 大盘
  const ov = await call('/api/admin/overview', { token });
  check('大盘 200', ov.status === 200);
  check('大盘含题库数/正确率/趋势', ov.json && typeof ov.json.banks === 'number' &&
    typeof ov.json.accuracy === 'number' && Array.isArray(ov.json.trend),
    ov.json ? `banks=${ov.json.banks} q=${ov.json.questions} answers=${ov.json.answers} acc=${ov.json.accuracy}% trend=${ov.json.trend.length}` : '');

  // 6) 题库列表
  const banks = await call('/api/admin/banks', { token });
  check('题库列表 200', Array.isArray(banks.json), `共 ${banks.json && banks.json.length} 个`);

  // 7) 建测试题库
  const created = await call('/api/admin/banks', { method: 'POST', token, body: { name: '__test__临时题库', categories: ['测试'] } });
  check('新建题库', created.status === 200 && created.json.id > 0, JSON.stringify(created.json));
  const bankId = created.json && created.json.id;

  if (bankId) {
    // 8) 加题
    const q = await call(`/api/admin/banks/${bankId}/questions`, {
      method: 'POST', token,
      body: {
        type: 'single', stem: '1+1=?', analysis: '基础运算',
        options: [
          { label: 'A', content: '1', isCorrect: false },
          { label: 'B', content: '2', isCorrect: true },
          { label: 'C', content: '3', isCorrect: false },
        ],
      },
    });
    check('新增题目', q.status === 200 && q.json.id > 0, JSON.stringify(q.json));
    const qid = q.json && q.json.id;

    // 9) 题目列表
    const list = await call(`/api/admin/banks/${bankId}/questions?limit=20&offset=0`, { token });
    const first = list.json && list.json.list && list.json.list[0];
    check('题目列表含新增题', list.json && list.json.total === 1 && first && first.stem === '1+1=?',
      JSON.stringify(list.json && { total: list.json.total, stem: first && first.stem, opts: first && first.options.length }));

    // 10) 关键词搜索
    const s1 = await call(`/api/admin/banks/${bankId}/questions?keyword=1%2B1`, { token });
    const s2 = await call(`/api/admin/banks/${bankId}/questions?keyword=zzz不存在`, { token });
    check('关键词搜索命中/未命中', s1.json.total === 1 && s2.json.total === 0, `${s1.json.total} / ${s2.json.total}`);

    if (qid) {
      // 11) 编辑题目（改题干 + 换正确答案）
      const up = await call(`/api/admin/questions/${qid}`, {
        method: 'PUT', token,
        body: {
          type: 'multiple', stem: '1+1=?(已编辑)', analysis: '改过的解析',
          options: [
            { label: 'A', content: '1', isCorrect: true },
            { label: 'B', content: '2', isCorrect: true },
            { label: 'C', content: '3', isCorrect: false },
          ],
        },
      });
      check('编辑题目 200', up.status === 200, JSON.stringify(up.json));
      const after = await call(`/api/admin/banks/${bankId}/questions?limit=20&offset=0`, { token });
      const f2 = after.json.list[0];
      check('编辑生效（题干/题型/答案）', f2.stem === '1+1=?(已编辑)' && f2.type === 'multiple' &&
        f2.options.filter((o) => o.isCorrect).length === 2, JSON.stringify(f2.options));

      // 12) 删题
      const del = await call(`/api/admin/questions/${qid}`, { method: 'DELETE', token });
      check('删除题目', del.status === 200, JSON.stringify(del.json));
      const afterDel = await call(`/api/admin/banks/${bankId}/questions?limit=20&offset=0`, { token });
      check('删除后为 0 题', afterDel.json.total === 0, String(afterDel.json.total));
    }

    // 13) 批量导入
    const imp = await call('/api/admin/import', {
      method: 'POST', token,
      body: {
        name: '__test__导入题库', categories: ['测试'],
        questions: [{
          type: 'single', stem: '导入题1', analysis: '',
          options: [{ label: 'A', content: 'x', isCorrect: true }, { label: 'B', content: 'y', isCorrect: false }],
        }],
      },
    });
    check('批量导入', imp.status === 200 && imp.json.count === 1, JSON.stringify(imp.json));

    // 14) 清理：删掉两个测试库
    for (const id of [bankId, imp.json && imp.json.bankId]) {
      if (!id) continue;
      const d = await call(`/api/admin/banks/${id}`, { method: 'DELETE', token });
      check('删除测试题库 ' + id, d.status === 200, JSON.stringify(d.json));
    }
  }

  const banksAfter = await call('/api/admin/banks', { token });
  const leftover = (banksAfter.json || []).filter((b) => b.name.indexOf('__test__') === 0);
  check('测试库清理干净', leftover.length === 0, JSON.stringify(leftover));

  const failed = results.filter((r) => !r.ok);
  console.log('\n==== ' + (results.length - failed.length) + '/' + results.length + ' 通过 ====');
  if (failed.length) { failed.forEach((f) => console.log('FAILED: ' + f.name)); process.exit(1); }
})().catch((e) => { console.error('测试异常：', e); process.exit(1); });
