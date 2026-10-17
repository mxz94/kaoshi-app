// 端到端验证：定向练习的 wrong / unanswered 过滤（按 user_key 隔离）
// 用 Node 内置 fetch（Node 22 自带），免去 curl 在 Windows 下的引号问题
const BASE = 'http://127.0.0.1:3399'

async function api(method, path, key, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Key': key },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text }
}

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { console.log(`  ✅ ${name}`); pass++ }
  else { console.log(`  ❌ ${name} ${extra}`); fail++ }
}

;(async () => {
  const KEY = 'vTargetA'
  const KEY2 = 'vTargetB'

  const bank = await api('POST', '/api/banks', KEY, { name: '定向练习验证_' + Date.now(), categories: ['言语', '判断'] })
  const bankId = bank.id
  await api('POST', `/api/banks/${bankId}/questions`, KEY, { type: 'single', stem: 'Q1', analysis: 'x', options: [{ label: 'A', content: 'a', isCorrect: true }, { label: 'B', content: 'b', isCorrect: false }] })
  await api('POST', `/api/banks/${bankId}/questions`, KEY, { type: 'single', stem: 'Q2', analysis: 'x', options: [{ label: 'A', content: 'a', isCorrect: true }, { label: 'B', content: 'b', isCorrect: false }] })
  await api('POST', `/api/banks/${bankId}/questions`, KEY, { type: 'single', stem: 'Q3', analysis: 'x', options: [{ label: 'A', content: 'a', isCorrect: true }, { label: 'B', content: 'b', isCorrect: false }] })

  const all = await api('GET', `/api/banks/${bankId}/questions?mode=all`, KEY)
  const ids = all.map((q) => q.id)
  const [q1, q2, q3] = ids

  // vA 答 Q1(对) 与 Q2(错)；答错后像前端 confirm() 那样显式调 addWrong 入错题本；Q3 未做
  await api('POST', '/api/practice/answer', KEY, { bankId, questionId: q1, selected: ['A'], duration: 5 })
  await api('POST', '/api/practice/answer', KEY, { bankId, questionId: q2, selected: ['B'], duration: 5 })
  await api('POST', '/api/wrong', KEY, { bankId, questionId: q2 })

  console.log('题库', bankId, '题目', ids.length)
  console.log('--- 模式过滤（按 user_key 隔离）---')

  check('all 返回 3 题', all.length === 3, `got ${all.length}`)

  const wrongM = await api('GET', `/api/banks/${bankId}/questions?mode=wrong`, KEY)
  check('wrong 仅含 Q2', wrongM.length === 1 && wrongM[0].id === q2, `got ${wrongM.map((x) => x.id)}`)

  const unM = await api('GET', `/api/banks/${bankId}/questions?mode=unanswered`, KEY)
  check('unanswered 仅含 Q3', unM.length === 1 && unM[0].id === q3, `got ${unM.map((x) => x.id)}`)

  const wrongB = await api('GET', `/api/banks/${bankId}/questions?mode=wrong`, KEY2)
  const unB = await api('GET', `/api/banks/${bankId}/questions?mode=unanswered`, KEY2)
  check('vB wrong 为空', wrongB.length === 0, `got ${wrongB.length}`)
  check('vB unanswered 为 3', unB.length === 3, `got ${unB.length}`)

  console.log(`\n结果：通过 ${pass} / 失败 ${fail}`)
  process.exit(fail ? 1 : 0)
})()
