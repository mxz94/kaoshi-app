// 由已验证的 CSV 生成「粘贴文本」版题库，并用 App 的 parsePasted 反向校验题数与答案一致
// 运行：node _gen_paste_txt.mjs
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync('./client-uni/src/utils/import-parse.js', 'utf8')
const { parseTable, parsePasted } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))

const DIR = './question-banks'
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.csv')).sort()

// 解析文本里若出现「A、B正确」这类行首（字母＋顿号＋非空白），会被解析器误判成选项行，加「选项」前缀规避。
// 注意：不能误伤正常的选项行「A. 内容」，故仅当标点后紧跟非空白字符时才处理。
function guardAnalysis(s) {
  return /^[A-Da-d][、．)）](?!\s)/.test(s) ? '选项' + s : s
}

let ok = true
for (const f of files) {
  const { questions } = parseTable(fs.readFileSync(path.join(DIR, f), 'utf8'))
  const lines = []
  questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.stem}`)
    q.options.forEach((o) => lines.push(`${o.label}. ${o.content}`))
    lines.push('答案：' + q.options.filter((o) => o.isCorrect).map((o) => o.label).join(''))
    if (q.analysis) lines.push('解析：' + guardAnalysis(q.analysis))
    lines.push('')
  })
  const out = DIR + '/' + f.replace(/\.csv$/, '.txt')
  fs.writeFileSync(out, lines.join('\n'), 'utf8')

  // 反向校验
  const back = parsePasted(fs.readFileSync(out, 'utf8'))
  const sameCount = back.questions.length === questions.length
  const sameAns = back.questions.every((q, i) => {
    const a = q.options.filter((o) => o.isCorrect).map((o) => o.label).join('')
    const b = questions[i].options.filter((o) => o.isCorrect).map((o) => o.label).join('')
    return a === b
  })
  const sameStem = back.questions.every((q, i) => q.stem === questions[i].stem)
  const good = sameCount && sameAns && sameStem && back.warnings.length === 0
  if (!good) ok = false
  console.log(`${path.basename(out)}: CSV ${questions.length} 题 → 粘贴版回读 ${back.questions.length} 题 | 答案一致=${sameAns} 题干一致=${sameStem} 警告=${back.warnings.length} ${good ? 'OK' : 'FAIL'}`)
  if (back.warnings.length) back.warnings.slice(0, 3).forEach((w) => console.log('   [warn] ' + w))
}

console.log(ok ? '\nPASTE_ROUNDTRIP_ALL_PASS' : '\nPASTE_ROUNDTRIP_HAS_FAILURE')
