<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">题库名称 <text class="req">*</text></text>
        <input class="input" v-model="name" placeholder="如：2024省考真题" placeholder-style="color:#9ca3af" maxlength="40" />
      </view>
      <view class="field">
        <text class="label">分类（可选，逗号分隔）</text>
        <input class="input" v-model="cats" placeholder="如：判断推理,言语理解" placeholder-style="color:#9ca3af" />
      </view>
    </view>

    <view class="tabs">
      <view :class="['tab', mode === 'file' ? 'on' : '']" @tap="mode = 'file'">文件导入（CSV/TSV）</view>
      <view :class="['tab', mode === 'paste' ? 'on' : '']" @tap="mode = 'paste'">粘贴文本（PDF/Word）</view>
    </view>

    <!-- 文件模式 -->
    <view v-if="mode === 'file'" class="card">
      <view class="hint">Excel 可「另存为 → CSV（UTF-8）」或「Tab 分隔文本」后选择。表头需包含：题干、A、B、C、D、答案、解析（分类可选）。</view>
      <button class="btn-line" @tap="pickFile">选择 CSV / TSV 文件</button>
      <view v-if="fileName" class="muted" style="margin-top:8px;">已选：{{ fileName }}</view>
      <!-- #ifdef H5 -->
      <input ref="fileInput" type="file" accept=".csv,.tsv,.txt" style="display:none" @change="onFileH5" />
      <!-- #endif -->
    </view>

    <!-- 粘贴模式 -->
    <view v-else class="card">
      <view class="hint">从 PDF / Word 复制题目文本粘贴到下方。每题以「1.」或「一、」或「第1题」开头，选项用 A. B. C. D.，文末注明「答案：C」「解析：…」。</view>
      <textarea class="ta" v-model="pasteText" placeholder-style="color:#9ca3af" placeholder="1. 下列关于xxx的说法正确的是（ ）。&#10;A. 选项一&#10;B. 选项二&#10;C. 选项三&#10;D. 选项四&#10;答案：C&#10;解析：因为……" />
      <button class="btn-line" @tap="parsePaste">解析文本</button>
    </view>

    <!-- 预览 -->
    <view v-if="questions.length" class="card">
      <view class="spread">
        <text style="font-weight:600;">识别到 {{ questions.length }} 题</text>
        <text class="brand" @tap="clearPreview">清空</text>
      </view>
      <view v-if="warnings.length" class="warn">
        <view v-for="(w, i) in warnings.slice(0, 5)" :key="i" class="witem">⚠ {{ w }}</view>
        <view v-if="warnings.length > 5" class="muted">…另有 {{ warnings.length - 5 }} 条提示</view>
      </view>
      <view v-for="(q, i) in questions.slice(0, 3)" :key="i" class="qprev">
        <view class="qstem">{{ i + 1 }}. {{ q.stem }}</view>
        <view class="qmeta muted">
          答案：{{ q.options.filter((o) => o.isCorrect).map((o) => o.label).join('') }}
          · {{ q.type === 'multiple' ? '多选' : q.type === 'judge' ? '判断' : '单选' }}
        </view>
      </view>
      <view v-if="questions.length > 3" class="muted">…仅预览前 3 题</view>
    </view>

    <view class="btn-primary" :class="{ disabled: !canImport }" @tap="doImport">
      导入（{{ questions.length }} 题）
    </view>
    <view style="height:24px;"></view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import api from '../../utils/api.js'
import { parseTable, parsePasted } from '../../utils/import-parse.js'

const name = ref('')
const cats = ref('')
const mode = ref('file')
const fileName = ref('')
const pasteText = ref('')
const questions = ref([])
const warnings = ref([])
const fileInput = ref(null)

const canImport = computed(() => name.value.trim() && questions.value.length > 0)

function clearPreview() {
  questions.value = []
  warnings.value = []
  fileName.value = ''
  pasteText.value = ''
}

function setResult({ questions: qs, warnings: ws }) {
  questions.value = qs
  warnings.value = ws
}

function handleText(text, fname) {
  fileName.value = fname || ''
  setResult(parseTable(text))
  if (!questions.value.length && !warnings.value.length) {
    warnings.value = ['未能解析出题目，请检查分隔符或表头']
  }
}

// H5 文件选择
function onFileH5(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => handleText(String(reader.result || ''), file.name)
  reader.readAsText(file, 'utf-8')
}

// 小程序文件选择
function pickMp() {
  wx.chooseMessageFile({
    count: 1,
    type: 'file',
    success: (res) => {
      const f = res.tempFiles[0]
      wx.getFileSystemManager().readFile({
        filePath: f.path,
        encoding: 'utf-8',
        success: (r) => handleText(r.data, f.name),
        fail: (er) => uni.showToast({ title: '读取失败：' + er.errMsg, icon: 'none' }),
      })
    },
  })
}

function pickFile() {
  // #ifdef H5
  fileInput.value && fileInput.value.click()
  // #endif
  // #ifndef H5
  pickMp()
  // #endif
}

function parsePaste() {
  if (!pasteText.value.trim()) {
    uni.showToast({ title: '请先粘贴文本', icon: 'none' })
    return
  }
  setResult(parsePasted(pasteText.value))
}

async function doImport() {
  if (!canImport.value) return
  const categories = cats.value
    ? cats.value.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
    : []
  uni.showLoading({ title: '导入中…' })
  try {
    const res = await api.importBank({
      name: name.value.trim(),
      categories,
      questions: questions.value,
    })
    uni.hideLoading()
    uni.showToast({ title: `成功导入 ${res.count} 题`, icon: 'success' })
    setTimeout(() => uni.navigateBack(), 800)
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: '导入失败：' + e.message, icon: 'none' })
  }
}
</script>

<style scoped>
.page { padding: 12px; }
.card { background: #ffffff; border: 1px solid #e9edf5; border-radius: 16px; padding: 16px; margin-bottom: 12px; }
.field { margin-bottom: 14px; }
.field:last-child { margin-bottom: 0; }
.label { font-size: 13px; color: #6b7280; }
.req { color: #dc2626; }
.input { margin-top: 6px; height: 40px; border-bottom: 1px solid #dbe1ee; color: #1f2937; font-size: 15px; }
.tabs { display: flex; gap: 8px; margin-bottom: 12px; }
.tab { flex: 1; text-align: center; padding: 10px; font-size: 14px; border-radius: 12px; background: #f2f4fa; color: #4338ca; }
.tab.on { background: linear-gradient(135deg, #2f6bff, #7c3aed); color: #fff; font-weight: 600; }
.hint { font-size: 12px; color: #6b7280; line-height: 1.6; margin-bottom: 12px; }
.btn-line { background: rgba(47,107,255,0.1); color: #2563eb; font-size: 14px; border-radius: 10px; padding: 8px 0; border: none; }
.btn-line::after { border: none; }
.btn-primary { background: linear-gradient(135deg, #2f6bff, #7c3aed); color: #fff; border-radius: 10px; font-size: 16px; margin-top: 4px; border: none; box-shadow: 0 6px 20px rgba(47,107,255,0.22); }
/* 禁用态交由 App.vue 全局 .btn-primary.disabled 统一控制 */
.ta { width: 100%; height: 180px; border: 1px solid #dbe1ee; border-radius: 10px; padding: 10px; font-size: 14px; box-sizing: border-box; background: #ffffff; color: #1f2937; }
.spread { display: flex; justify-content: space-between; align-items: center; }
.brand { color: #2563eb; }
.muted { color: #6b7280; font-size: 12px; }
.warn { background: rgba(217,119,6,0.1); border: 1px solid rgba(217, 119, 6, 0.32); border-radius: 8px; padding: 8px; margin: 10px 0; }
.witem { font-size: 12px; color: #d97706; line-height: 1.7; }
.qprev { border-top: 1px solid #e8ecf4; padding: 10px 0; }
.qstem { font-size: 14px; line-height: 1.5; }
.qmeta { font-size: 12px; margin-top: 4px; }
</style>
