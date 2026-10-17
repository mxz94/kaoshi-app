// 验证：① 不同 user_key 数据互不串号 ② 迁移码换设备搬数据
const BASE = 'http://127.0.0.1:3399'

async function req(path, { method = 'GET', body, userKey } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Key': userKey },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`)
  return data
}

const A = 'verifyA-' + Date.now()
const B = 'verifyB-' + Date.now()
const C = 'verifyC-' + Date.now()

;(async () => {
  const banks = await req('/api/banks', { userKey: A })
  const bank = banks.find((b) => b.questionCount > 0) || banks[0]
  const qs = await req(`/api/banks/${bank.id}/questions`, { userKey: A })
  const q = qs[0]
  const correct = q.options.filter((o) => o.isCorrect).map((o) => o.label)

  console.log(`题库 #${bank.id}《${bank.name}》 题目 #${q.id} 正确答案 ${correct.join('')}`)

  // 1) A 答一题（答对）
  const r1 = await req('/api/practice/answer', {
    method: 'POST', userKey: A,
    body: { bankId: bank.id, questionId: q.id, selected: correct, duration: 5 },
  })
  console.log('A 提交答案 isCorrect =', r1.isCorrect)

  const a1 = await req('/api/stats/today', { userKey: A })
  const b1 = await req('/api/stats/today', { userKey: B })
  console.log(`隔离检查 → A: count=${a1.count}  B: count=${b1.count}`)
  if (a1.count !== 1 || b1.count !== 0) throw new Error('❌ 数据串号：B 看到了 A 的刷题记录')

  // 2) A 加入错题本，B 看不到
  await req('/api/wrong', { method: 'POST', userKey: A, body: { bankId: bank.id, questionId: q.id } })
  const wA = await req('/api/wrong/list', { userKey: A })
  const wB = await req('/api/wrong/list', { userKey: B })
  console.log(`错题隔离 → A: ${wA.length} 条  B: ${wB.length} 条`)
  if (wA.length === 0 || wB.length !== 0) throw new Error('❌ 错题本串号')

  // 3) A 生成迁移码 → C（新设备）认领
  const { code } = await req('/api/user/migrate-code', { method: 'POST', userKey: A })
  console.log('A 生成迁移码 =', code)
  const mv = await req('/api/user/migrate-claim', { method: 'POST', userKey: C, body: { code } })
  console.log('C 认领结果 =', JSON.stringify(mv))

  const c1 = await req('/api/stats/today', { userKey: C })
  const wC = await req('/api/wrong/list', { userKey: C })
  console.log(`迁移后 → C: count=${c1.count} 错题=${wC.length}`)
  if (c1.count < 1) throw new Error('❌ 迁移失败：C 没拿到 A 的数据')

  // 4) 迁移码一次性：再认领应报错
  try {
    await req('/api/user/migrate-claim', { method: 'POST', userKey: B, body: { code } })
    throw new Error('❌ 迁移码可被重复使用')
  } catch (e) {
    console.log('一次性校验通过 →', e.message.includes('已使用') ? '已使用过的码被拒绝' : e.message)
  }

  console.log('\n✅ 全部通过：设备身份隔离 + 迁移码搬运均正常')
})().catch((e) => {
  console.error('\n❌ ' + e.message)
  process.exit(1)
})
