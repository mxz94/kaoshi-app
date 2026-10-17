// 端到端验证 /api/import/bank：建库 + 批量写题 + 读回校验
const BASE = 'http://127.0.0.1:3399'

async function main() {
  const sample = {
    name: '导入验证题库_' + Date.now(),
    categories: ['验证', '导入'],
    questions: [
      {
        type: 'single',
        stem: '下列关于导入的说法正确的是（ ）。',
        analysis: '导入应成功',
        options: [
          { label: 'A', content: '错', isCorrect: false },
          { label: 'B', content: '对', isCorrect: true },
          { label: 'C', content: '半对', isCorrect: false },
          { label: 'D', content: '全错', isCorrect: false },
        ],
      },
      {
        type: 'multiple',
        stem: '下列哪些属于验证项（ ）。',
        analysis: '多选',
        options: [
          { label: 'A', content: '甲', isCorrect: true },
          { label: 'B', content: '乙', isCorrect: false },
          { label: 'C', content: '丙', isCorrect: true },
          { label: 'D', content: '丁', isCorrect: false },
        ],
      },
    ],
  }

  const res = await fetch(BASE + '/api/import/bank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sample),
  })
  const created = await res.json()
  console.log('import/bank ->', JSON.stringify(created))

  if (!created.bankId || created.count !== 2) {
    console.log('❌ 期望 bankId 且 count=2')
    process.exit(1)
  }

  const qs = await fetch(BASE + `/api/banks/${created.bankId}/questions`).then((r) => r.json())
  console.log('读回题目数 ->', qs.length)
  const allCorrect = qs.every((q) => q.options.length === 4)
  const bcRes = await fetch(BASE + '/api/banks').then((r) => r.json())
  const bank = bcRes.find((b) => b.id === created.bankId)
  console.log('题库 question_count ->', bank && bank.questionCount, 'total ->', bank && bank.totalQuestions)

  if (qs.length === 2 && allCorrect && bank.questionCount === 2) {
    console.log('✅ 批量导入接口验证通过')
  } else {
    console.log('❌ 校验不通过')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('运行失败:', e.message)
  process.exit(1)
})
