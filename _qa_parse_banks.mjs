// 用 App 自带解析器验证生成的题库 CSV 能否被正确导入
// 运行：node _qa_parse_banks.mjs
import fs from 'fs'
import path from 'path'

// 运行时加载真实解析源码（client-uni 是 commonjs，故用 data URL 以 ESM 方式载入，避免复制一份解析器导致不同步）
const src = fs.readFileSync('./client-uni/src/utils/import-parse.js', 'utf8')
const { parseTable } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))

const DIR = './question-banks'
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.csv')).sort()

let grand = 0
const allStems = new Map()
let problems = []

for (const f of files) {
  const text = fs.readFileSync(path.join(DIR, f), 'utf8')
  const { questions, warnings } = parseTable(text)
  grand += questions.length

  // 逐题结构自检
  let bad = []
  questions.forEach((q, i) => {
    const labels = q.options.map((o) => o.label)
    const correct = q.options.filter((o) => o.isCorrect).map((o) => o.label)
    if (labels.length < 2) bad.push(`#${i + 1} 选项不足`)
    if (correct.length === 0) bad.push(`#${i + 1} 无正确项`)
    if (q.type === 'single' && correct.length !== 1) bad.push(`#${i + 1} 单选正确答案数=${correct.length}`)
    if (!q.analysis || q.analysis.length < 10) bad.push(`#${i + 1} 解析过短`)
    // 类比推理等题型题干天然很短（如「温度计∶温度」），阈值放到 4
    if (!q.stem || q.stem.length < 4) bad.push(`#${i + 1} 题干过短`)
    // 只有「完整题干完全相同」才算重复（资料分析各题共用同一段材料，题干并不相同）
    const key = q.stem
    if (allStems.has(key)) bad.push(`#${i + 1} 与 ${allStems.get(key)} 题干完全重复`)
    else allStems.set(key, f)
  })

  console.log(`\n=== ${f} ===`)
  console.log(`  解析出题目: ${questions.length}  |  警告: ${warnings.length}  |  结构异常: ${bad.length}`)
  if (warnings.length) warnings.forEach((w) => console.log('   [warn] ' + w))
  if (bad.length) { bad.forEach((b) => console.log('   [BAD ] ' + b)); problems.push(`${f}: ${bad.length}`) }
  // 抽样打印第 1 题的答案与选项数
  if (questions[0]) {
    const q = questions[0]
    console.log(`   样例: 类型=${q.type} 选项数=${q.options.length} 正确项=${q.options.filter(o=>o.isCorrect).map(o=>o.label).join('')}`)
  }
}

console.log('\n============================')
console.log(`合计题目: ${grand}`)
console.log(problems.length ? `存在问题: ${problems.join(', ')}` : 'ALL_PASS: 无结构问题、无解析警告')
