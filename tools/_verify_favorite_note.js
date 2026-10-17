// 验证：收藏 + 笔记 接口（user_key 隔离）
const BASE = 'http://127.0.0.1:3399'
const UK = 'VERIFY_FAVNOTE_' + Date.now()
const H = { 'Content-Type': 'application/json', 'X-User-Key': UK }

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { ...H, ...(opts.headers || {}) },
  })
  const data = await r.json().catch(() => ({}))
  if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + ' ' + JSON.stringify(data))
  return data
}

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅', name) }
  else { fail++; console.log('  ❌', name) }
}

async function main() {
  // 选一个题库 + 一道题
  const banks = await req('/api/banks')
  if (!banks.length) throw new Error('没有任何题库，请先导入一个')
  const bankId = banks[0].id
  const qs = await req(`/api/banks/${bankId}/questions`)
  if (!qs.length) throw new Error('该题库没有题目')
  const qid = qs[0].id
  console.log(`题库 ${bankId}，题目 ${qid}`)

  // 1. 收藏 toggle 开
  const t1 = await req('/api/favorite/toggle', { method: 'POST', body: JSON.stringify({ bankId, questionId: qid }) })
  check('收藏 toggle → favorited=true', t1.favorited === true)

  // 2. favorite/ids 含该题
  const ids = await req(`/api/favorite/ids?bankId=${bankId}`)
  check('favorite/ids 含该题', Array.isArray(ids) && ids.includes(qid))

  // 3. 写笔记
  const noteText = '这道题易错点在… ' + Date.now()
  const n1 = await req('/api/note', { method: 'POST', body: JSON.stringify({ bankId, questionId: qid, content: noteText }) })
  check('笔记保存 ok', n1.ok === true)

  // 4. note/ids 含该题
  const nids = await req(`/api/note/ids?bankId=${bankId}`)
  check('note/ids 含该题', Array.isArray(nids) && nids.includes(qid))

  // 5. noteGet 读回一致
  const ng = await req(`/api/note?bankId=${bankId}&questionId=${qid}`)
  check('noteGet 读回一致', ng.content === noteText)

  // 6. favorite/list 含该记录且带 note
  const fl = await req('/api/favorite/list')
  const rec = fl.find((x) => x.questionId === qid)
  check('favorite/list 含该记录', !!rec)
  check('favorite/list 带 note 内容', rec && rec.note === noteText)
  check('favorite/list 带题库名', rec && !!rec.bankName)

  // 7. 另一个 user_key 看不到（隔离）
  const H2 = { 'Content-Type': 'application/json', 'X-User-Key': 'OTHER_USER_' + Date.now() }
  const fl2 = await (await fetch(BASE + '/api/favorite/list', { headers: H2 })).json()
  check('其他用户看不到我的收藏', !fl2.some((x) => x.questionId === qid))

  // 8. 取消收藏
  const t2 = await req('/api/favorite/toggle', { method: 'POST', body: JSON.stringify({ bankId, questionId: qid }) })
  check('收藏 toggle → favorited=false', t2.favorited === false)
  const ids2 = await req(`/api/favorite/ids?bankId=${bankId}`)
  check('取消后 favorite/ids 不含该题', !ids2.includes(qid))

  // 9. 清空笔记
  const n2 = await req('/api/note', { method: 'POST', body: JSON.stringify({ bankId, questionId: qid, content: '   ' }) })
  check('空内容删除笔记 ok', n2.deleted === true)
  const ng2 = await req(`/api/note?bankId=${bankId}&questionId=${qid}`)
  check('删除后 noteGet 为空串', ng2.content === '')

  console.log(`\n结果：通过 ${pass} / 失败 ${fail}`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('验证异常:', e.message); process.exit(2) })
