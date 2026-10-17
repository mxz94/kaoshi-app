// 导入解析工具（纯 JS，无第三方依赖，H5 / 小程序通用，也可在 Node 下单测）
// 两种入口：① parseTable —— 解析 CSV/TSV（Excel 另存为 UTF-8 CSV 即可）
//           ② parsePasted —— 解析从 PDF/Word 复制出来的题目文本（标准版式）
// 两者都归一化为同一题结构：{ type:'single'|'multiple'|'judge', stem, analysis, options:[{label,content,isCorrect}] }

// 把答案 token 分类：返回题型 + 正确选项字母集合
export function classifyAnswer(token) {
  const t = (token || '').trim()
  if (/^(对|正确|对的|是|√)$/i.test(t)) return { type: 'judge', correct: 'A' }
  if (/^(错|错误|错的|不对|否|×|✕)$/i.test(t)) return { type: 'judge', correct: 'B' }
  const letters = (t.match(/[A-Da-d]/g) || []).map((s) => s.toUpperCase())
  const uniq = [...new Set(letters)]
  if (uniq.length >= 2) return { type: 'multiple', correctLabels: uniq }
  if (uniq.length === 1) return { type: 'single', correctLabels: uniq }
  return { type: 'single', correctLabels: [] }
}

// 按题型与答案，给选项标 isCorrect
function applyAnswer(opts, ans) {
  if (!ans) return opts
  if (ans.type === 'judge') {
    // 已有 A/B 选项则用现成的，否则合成 正确/错误
    const hasAB = opts.length >= 2
    const out = hasAB
      ? opts.map((o) => ({ ...o, isCorrect: o.label.toUpperCase() === ans.correct }))
      : [
          { label: 'A', content: '正确', isCorrect: ans.correct === 'A' },
          { label: 'B', content: '错误', isCorrect: ans.correct === 'B' },
        ]
    return out
  }
  const set = new Set(ans.correctLabels || [])
  return opts.map((o) => ({ ...o, isCorrect: set.has(o.label.toUpperCase()) }))
}

// —— CSV / TSV ——
function detectDelim(text) {
  if (text.includes('\t')) return '\t'
  if (text.includes(';') && !text.includes(',')) return ';'
  return ','
}

function splitLine(line, delim) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += c
    } else if (c === '"') inQ = true
    else if (c === delim) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function parseDelimited(text) {
  const delim = detectDelim(text)
  const rows = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => splitLine(l, delim))
  return rows
}

function normHeader(h) {
  return (h || '').toString().trim().toLowerCase()
}

// 表头 → 列索引映射
function mapHeaders(header) {
  const m = { stem: -1, answer: -1, analysis: -1, category: -1, opt: {} }
  header.forEach((h, i) => {
    const n = normHeader(h)
    if (m.stem < 0 && /(stem|question|题干|题目|题面)/.test(n)) m.stem = i
    else if (m.answer < 0 && /(答案|answer|key|正确选项|参考)/.test(n)) m.answer = i
    else if (m.analysis < 0 && /(解析|analysis|答疑)/.test(n)) m.analysis = i
    else if (m.category < 0 && /(分类|类别|知识点|category|类型|科目)/.test(n)) m.category = i
    const om = n.match(/^(?:选项)?([a-d])$/i)
    if (om) m.opt[om[1].toUpperCase()] = i
  })
  return m
}

export function parseTable(text) {
  const warnings = []
  const rows = parseDelimited(text)
  const questions = []
  if (rows.length < 2) {
    warnings.push('未识别到表格数据（至少需要表头 + 1 行题目）')
    return { questions, warnings }
  }
  const map = mapHeaders(rows[0])
  if (map.stem < 0) warnings.push('未找到「题干」列，请确认表头含 题干/题目')
  const optLetters = Object.keys(map.opt).sort()

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const stem = (row[map.stem] || '').trim()
    if (!stem) { warnings.push(`第 ${r} 行题干为空，已跳过`); continue }
    const opts = []
    for (const L of optLetters) {
      const c = (row[map.opt[L]] || '').trim()
      if (c) opts.push({ label: L, content: c, isCorrect: false })
    }
    const ansRaw = map.answer >= 0 ? row[map.answer] : ''
    const ans = classifyAnswer(ansRaw)
    const finalOpts = applyAnswer(opts, ans)
    const analysis = map.analysis >= 0 ? (row[map.analysis] || '').trim() : ''
    const catRaw = map.category >= 0 ? row[map.category] : ''
    const categories = catRaw
      ? String(catRaw).split(/[、,，/]/).map((s) => s.trim()).filter(Boolean)
      : []
    if (finalOpts.length < 2) { warnings.push(`第 ${r} 行选项不足 2 个，已跳过`); continue }
    if (!ans || (!ans.correctLabels && ans.type !== 'judge')) {
      warnings.push(`第 ${r} 行答案无法识别（${ansRaw || '空'}），已跳过`)
      continue
    }
    questions.push({ type: ans.type, stem, analysis, options: finalOpts, categories })
  }
  return { questions, warnings }
}

// —— 粘贴文本（标准题目版式）——
const Q_START = /^(?:\s*(?:\d+|[一二三四五六七八九十百]+)[\.、．。)）]\s*|\s*第\s*[\d一二三四五六七八九十]+\s*题[．。、]?\s*)/

function stripPrefix(line) {
  return line.replace(Q_START, '').trim()
}

export function parsePasted(text) {
  const warnings = []
  const questions = []
  const raw = (text || '').replace(/\r\n/g, '\n')
  const lines = raw.split('\n')

  // 切分题块
  const blocks = []
  let cur = []
  let inBlock = false
  for (const line of lines) {
    if (Q_START.test(line)) {
      if (cur.length) blocks.push(cur)
      cur = [line]
      inBlock = true
    } else if (inBlock) {
      cur.push(line)
    }
  }
  if (cur.length) blocks.push(cur)

  if (!blocks.length) {
    warnings.push('未识别到题目（行首需以「1.」或「一、」或「第1题」开头）')
    return { questions, warnings }
  }

  blocks.forEach((blk, idx) => {
    const stemRaw = stripPrefix(blk[0])
    // 选项行
    const optRe = /^\s*([A-Da-d])[\.、．)）]\s*(.+?)\s*$/
    const opts = []
    const optLines = []
    const rest = []
    let firstOpt = -1
    blk.forEach((ln, i) => {
      const om = ln.match(optRe)
      if (om && i > 0) {
        if (firstOpt < 0) firstOpt = i
        opts.push({ label: om[1].toUpperCase(), content: om[2].trim(), isCorrect: false })
        optLines.push(i)
      }
    })
    // stem = 题块首行（去前缀）；无选项时整块首行即题干
    const stem = stemRaw || (firstOpt > 0 ? stripPrefix(blk[0]) : '')
    // 选项之后的内容 = 答案 + 解析
    const tail = blk.slice(firstOpt > 0 ? firstOpt + 1 : 1).join('\n')
    const ansM = tail.match(/(?:答案|参考答案|正确答案|【答案】|答案)[:：]?\s*([^\n]+)/i) ||
      tail.match(/答案为?\s*([A-Da-d对对错错正确错误√×]+)/i)
    const ansRaw = ansM ? ansM[1] : ''
    const anaM = tail.match(/(?:解析|【解析】|答案解析)[:：]?\s*([\s\S]+)/i)
    const analysis = anaM ? anaM[1].trim() : ''
    const ans = classifyAnswer(ansRaw)
    const finalOpts = applyAnswer(opts, ans)

    if (!stem) { warnings.push(`第 ${idx + 1} 题题干缺失，已跳过`); return }
    if (finalOpts.length < 2) { warnings.push(`第 ${idx + 1} 题选项不足 2 个，已跳过`); return }
    if (!ans || (!ans.correctLabels && ans.type !== 'judge')) {
      warnings.push(`第 ${idx + 1} 题答案未识别（"${ansRaw.trim() || '空'}"），已跳过`)
      return
    }
    questions.push({ type: ans.type, stem, analysis, options: finalOpts, categories: [] })
  })
  return { questions, warnings }
}
