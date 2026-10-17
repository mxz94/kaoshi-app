import { parseTable, parsePasted, classifyAnswer } from '../client-uni/src/utils/import-parse.js'

const csv = `题干,A,B,C,D,答案,解析,分类
下列关于xx的说法正确的是（ ）。,选项一,选项二,选项三,选项四,C,因为原因,判断推理
下面哪些是正确选项（ ）。,甲,乙,丙,丁,AC,多选解析,言语理解`

const paste = `1. 下列关于xx的说法正确的是（ ）。
A. 选项一
B. 选项二
C. 选项三
D. 选项四
答案：C
解析：因为……
2. 下列说法正确的是（ ）。
A. 对
B. 错
答案：A
解析：判断题意。`

const t = parseTable(csv)
console.log('--- CSV ---')
console.log('questions:', t.questions.length, 'warnings:', t.warnings)
console.log(JSON.stringify(t.questions[0], null, 0))
console.log(JSON.stringify(t.questions[1], null, 0))

const p = parsePasted(paste)
console.log('--- PASTE ---')
console.log('questions:', p.questions.length, 'warnings:', p.warnings)
console.log(JSON.stringify(p.questions[0], null, 0))
console.log(JSON.stringify(p.questions[1], null, 0))

console.log('--- classify ---')
console.log(classifyAnswer('C'), classifyAnswer('AC'), classifyAnswer('对'), classifyAnswer('错'))
