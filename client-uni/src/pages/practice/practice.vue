<template>
  <view class="page" v-if="q">
    <!-- 顶栏：进度 + 计时 -->
    <view class="topbar">
      <view style="display:flex; align-items:center; gap:8px;">
      <text class="muted" style="font-size:13px;">{{ idx + 1 }} / {{ list.length }}</text>
      <text v-if="badgeText" class="mode-badge">{{ badgeText }}</text>
      </view>
      <text class="timer">⏱ {{ elapsedText }}</text>
    </view>
    <view class="progress-track" style="margin:0 16px 14px;">
      <view class="progress-fill" :style="{ width: ((idx + 1) / list.length) * 100 + '%' }"></view>
    </view>

    <!-- 收藏 / 笔记 工具条 -->
    <view class="toolbar">
      <view class="tool" :class="{ active: isFav }" @tap="toggleFav">
        <text class="tool-ico">{{ isFav ? '★' : '☆' }}</text>
        <text>{{ isFav ? '已收藏' : '收藏' }}</text>
      </view>
      <view class="tool" :class="{ active: hasNote }" @tap="openNote">
        <text class="tool-ico">✎</text>
        <text>笔记</text>
      </view>
    </view>

    <view class="card">
      <view v-if="q.type !== 'single'" class="qtype" :class="q.type === 'judge' ? 'j' : 'm'">
        {{ q.type === 'judge' ? '判断题' : '多选题' }}
      </view>
      <view class="stem">{{ q.stem }}</view>

      <view
        v-for="o in q.options" :key="o.label"
        class="opt"
        :class="optClass(o)"
        @tap="pick(o.label)"
      >
        <view class="opt-label">{{ o.label }}</view>
        <view class="opt-content">{{ o.content }}</view>
      </view>
    </view>

    <!-- 结果态：对错 + 正确答案 + 解析 -->
    <view v-if="phase === 'result'" class="card">
      <view class="spread">
        <text :class="lastResult.isCorrect ? 'good' : 'bad'" style="font-weight:700; font-size:16px;">
          {{ lastResult.isCorrect ? '✓ 回答正确' : '✗ 回答错误' }}
        </text>
        <text class="muted">正确答案：{{ lastResult.correctLabels.join('') }}</text>
        <text v-if="lastResult.revised" class="muted" style="font-size:11px;">已修改</text>
      </view>
      <view v-if="lastResult.analysis" class="muted" style="margin-top:10px; line-height:1.6; font-size:13px;">
        解析：{{ lastResult.analysis }}
      </view>
    </view>

    <!-- 底部操作 -->
    <view class="footer">
      <view class="btn-plain" style="flex:1;" :style="{ opacity: idx === 0 ? 0.4 : 1 }" @tap="goPrev">上一题</view>
      <view style="width:12px;"></view>
      <view
        v-if="phase === 'answering'"
        class="btn-primary" :class="{ disabled: !selected.length }" style="flex:2;" @tap="confirm"
      >确认答案</view>
      <view v-else class="btn-primary" style="flex:2;" @tap="goNext">
        {{ idx === list.length - 1 ? '完成本轮' : '下一题' }}
      </view>
    </view>

    <!-- 笔记面板 -->
    <view v-if="noteOpen" class="mask" @tap.self="closeNote">
      <view class="sheet">
        <view class="sheet-title">笔记（仅自己可见）</view>
        <textarea
          class="note-area"
          v-model="noteText"
          :disabled="noteLoading"
          placeholder="写下你的解题思路、易错点、口诀…"
          placeholder-style="color:#9ca3af"
          maxlength="2000"
        />
        <view class="sheet-actions">
          <view class="btn-plain" style="flex:1;" @tap="closeNote">取消</view>
          <view style="width:12px;"></view>
          <view class="btn-primary" style="flex:1;" :class="{ disabled: noteSaving }" @tap="saveNote">保存</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import api from '../../utils/api.js'
import { getSettings } from '../../utils/settings.js'

const list = ref([])
const idx = ref(0)
const selected = ref([])
const phase = ref('answering')
const lastResult = ref(null)
const records = ref([])      // 本轮每题结果（总结页数据源，按作答顺序）
const answerMap = ref({})    // questionId → 结果（供回看上一题）
const bankId = ref('')
const mode = ref('all')                 // all | wrong | unanswered
const smart = ref(null)                 // 智能练习：{ kind, module, limit } | null
const modeText = computed(() =>
  mode.value === 'wrong' ? '错题模式' : mode.value === 'unanswered' ? '未做模式' : ''
)
// 智能模式徽标（优先于普通 mode 徽标）
const smartText = computed(() => {
  if (!smart.value) return ''
  const k = smart.value.kind
  if (k === 'redo') return '错题重练'
  if (k === 'targeted') return smart.value.module ? '专项·' + smart.value.module : '专项练习'
  if (k === 'daily') return '每日一练'
  return '智能练习'
})
const badgeText = computed(() => (smart.value ? smartText.value : modeText.value))
const settings = ref(getSettings())
const startedAt = Date.now()
const qStartAt = ref(Date.now())

// 收藏 / 笔记 状态
const favSet = ref({})          // { [questionId]: true }
const isFav = computed(() => q.value && !!favSet.value[q.value.id])
const noteSet = ref({})         // { [questionId]: true }
const hasNote = computed(() => q.value && !!noteSet.value[q.value.id])
const noteOpen = ref(false)
const noteText = ref('')
const noteLoading = ref(false)
const noteSaving = ref(false)

const q = computed(() => list.value[idx.value] || null)
// 智能模式下题目自带 bankId；普通模式回退到路由 bankId。所有按题操作统一走这里。
const curBankId = () => (q.value && q.value.bankId) ? q.value.bankId : bankId.value
const elapsedText = computed(() => {
  const s = Math.floor((Date.now() - startedAt) / 1000)
  const m = String(Math.floor(s / 60)).padStart(2, '0')
  return `${m}:${String(s % 60).padStart(2, '0')}`
})

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function optClass(o) {
  if (phase.value === 'answering') {
    return { 'opt-on': selected.value.includes(o.label) }
  }
  const r = lastResult.value
  if (r.correctLabels.includes(o.label)) return { 'opt-right': true }
  if (r.selected.includes(o.label)) return { 'opt-wrong': true }
  return {}
}

function pick(label) {
  if (phase.value !== 'answering' || !q.value) return
  if (q.value.type === 'multiple') {
    const i = selected.value.indexOf(label)
    if (i >= 0) selected.value.splice(i, 1)
    else selected.value.push(label)
    selected.value.sort()
  } else {
    selected.value = [label]
  }
}

async function confirm() {
  if (!selected.value.length || phase.value !== 'answering') return
  const qid = q.value.id
  const prev = answerMap.value[qid] || null   // 非空 = 本题改答案（修订）
  const duration = Math.min(600, Math.round((Date.now() - qStartAt.value) / 1000))
  try {
    const r = await api.submitAnswer({
      bankId: curBankId(),
      questionId: qid,
      selected: selected.value,
      duration,
      revise: !!prev,
    })
    lastResult.value = { ...r, selected: selected.value.slice(), revised: !!prev }
    phase.value = 'result'

    const rec = { questionId: qid, stem: q.value.stem, isCorrect: !!r.isCorrect, duration }
    if (prev) {
      // 修订：更新总结页数据源里那条，不重复追加
      const i = records.value.findIndex((x) => x.questionId === qid)
      if (i >= 0) records.value[i] = rec
    } else {
      records.value.push(rec)
    }
    answerMap.value[qid] = {
      isCorrect: !!r.isCorrect,
      correctLabels: r.correctLabels || [],
      selected: selected.value.slice(),
      analysis: r.analysis || '',
    }

    // 修订后同步错题本：改对则移出，改错则加入
    if (prev) {
      if (prev.isCorrect && !r.isCorrect) api.addWrong(curBankId(), qid).catch(() => {})
      if (!prev.isCorrect && r.isCorrect) api.removeWrong(curBankId(), qid).catch(() => {})
    } else if (!r.isCorrect) {
      api.addWrong(curBankId(), qid).catch(() => {})
    }

    // 自动下一题：仅答对时生效，答错停留看解析
    if (settings.value.autoNextQuestion && r.isCorrect) {
      setTimeout(() => {
        if (phase.value === 'result') goNext()
      }, 1200)
    }
  } catch (e) {
    uni.showToast({ title: '提交失败：' + e.message, icon: 'none' })
  }
}

function goPrev() {
  if (idx.value === 0) return
  idx.value--
  const answered = q.value && answerMap.value[q.value.id]
  if (answered) {
    // 已作答的题：允许修改（练习语义），预填原选择后重新提交
    phase.value = 'answering'
    lastResult.value = null
    selected.value = answered.selected ? answered.selected.slice() : []
    qStartAt.value = Date.now()
  } else {
    phase.value = 'answering'
    lastResult.value = null
    selected.value = []
    qStartAt.value = Date.now()
  }
}

function goNext() {
  if (idx.value < list.value.length - 1) {
    idx.value++
    phase.value = 'answering'
    lastResult.value = null
    selected.value = []
    qStartAt.value = Date.now()
    if (!smart.value && bankId.value) {
      uni.setStorageSync('kaoshi_last_bank', { bankId: bankId.value, lastIdx: idx.value })
    }
  } else {
    finish()
  }
}

function finish() {
  const round = {
    bankId: bankId.value,
    kind: (smart.value && smart.value.kind) || '',
    module: (smart.value && smart.value.module) || '',
    limit: (smart.value && smart.value.limit) || '',
    total: records.value.length,
    correct: records.value.filter((r) => r.isCorrect).length,
    totalSec: Math.round((Date.now() - startedAt) / 1000),
    records: records.value,
    finishedAt: Date.now(),
  }
  uni.setStorageSync('kaoshi_round_summary', round)
  uni.setStorageSync('kaoshi_last_bank', { bankId: bankId.value, lastIdx: 0 })
  uni.redirectTo({ url: '/pages/summary/summary' })
}

// 收藏：乐观切换 + 失败回滚
async function toggleFav() {
  if (!q.value) return
  const qid = q.value.id
  const next = !favSet.value[qid]
  favSet.value[qid] = next
  try {
    await api.favoriteToggle(curBankId(), qid)
  } catch (e) {
    favSet.value[qid] = !next // 回滚
    uni.showToast({ title: '操作失败：' + e.message, icon: 'none' })
  }
}

// 笔记面板
async function openNote() {
  if (!q.value) return
  noteOpen.value = true
  noteLoading.value = true
  noteText.value = ''
  try {
    const r = await api.noteGet(curBankId(), q.value.id)
    noteText.value = r.content || ''
  } catch (e) {
    noteText.value = ''
    uni.showToast({ title: '读取失败：' + e.message, icon: 'none' })
  } finally {
    noteLoading.value = false
  }
}
function closeNote() {
  noteOpen.value = false
}
async function saveNote() {
  if (!q.value || noteSaving.value) return
  noteSaving.value = true
  try {
    await api.noteSave(curBankId(), q.value.id, noteText.value)
    noteSet.value[q.value.id] = noteText.value.trim().length > 0
    uni.showToast({ title: '已保存', icon: 'success' })
    noteOpen.value = false
  } catch (e) {
    uni.showToast({ title: '保存失败：' + e.message, icon: 'none' })
  } finally {
    noteSaving.value = false
  }
}

onLoad(async (query) => {
  bankId.value = query.bankId || ''
  mode.value = query.mode || 'all'
  if (query.kind) {
    smart.value = {
      kind: query.kind,
      module: query.module || '',
      limit: query.limit ? Number(query.limit) : '',
    }
  }
  try {
    let qs
    if (smart.value) {
      qs = await api.smartQuestions({
        kind: smart.value.kind,
        module: smart.value.module,
        limit: smart.value.limit || undefined,
      })
    } else {
      qs = await api.bankQuestions(bankId.value, { mode: mode.value })
    }
    // 错题重练保持「反复错优先」顺序，不打乱；其余智能组已随机，普通组按设置
    if (settings.value.shuffleQuestions && smart.value?.kind !== 'redo') qs = shuffle(qs)
    const startCfg = uni.getStorageSync('kaoshi_practice_start')
    const from = startCfg && String(startCfg.bankId) === String(bankId.value) ? startCfg.from || 0 : 0
    list.value = qs
    idx.value = Math.min(from, Math.max(0, qs.length - 1))
    qStartAt.value = Date.now()
    // 初始化收藏 / 笔记标记（一次拉全题库，避免逐题请求）；智能模式跨题库，跳过
    if (!smart.value) {
      try {
        const [fids, nids] = await Promise.all([
          api.favoriteIds(curBankId()).catch(() => []),
          api.noteIds(curBankId()).catch(() => []),
        ])
        const fm = {}
        fids.forEach((id) => (fm[id] = true))
        favSet.value = fm
        const nm = {}
        nids.forEach((id) => (nm[id] = true))
        noteSet.value = nm
      } catch { /* 标记失败不阻塞刷题 */ }
    }
    if (!qs.length) {
      let tip
      if (smart.value && smart.value.kind === 'redo') tip = '错题本是空的'
      else if (mode.value === 'wrong') tip = '这个题库还没有你的错题'
      else if (mode.value === 'unanswered') tip = '题目都做过了'
      else tip = '这套题还没有题目'
      uni.showToast({ title: tip, icon: 'none' })
      setTimeout(() => uni.navigateBack(), 1000)
    }
  } catch (e) {
    uni.showToast({ title: '加载失败：' + e.message, icon: 'none' })
    setTimeout(() => uni.navigateBack(), 1000)
  }
})
</script>

<style scoped>
.topbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; }
.mode-badge {
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: rgba(217,119,6,0.12); color: #d97706; font-weight: 600;
}
.timer { font-size: 13px; color: #6b7280; font-variant-numeric: tabular-nums; }
.qtype {
  display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 6px; margin-bottom: 10px;
  background: rgba(47,107,255,0.1); color: #2563eb; align-self: flex-start;
}
.qtype.j { background: rgba(22,163,74,0.12); color: #16a34a; }
.qtype.m { background: rgba(217,119,6,0.12); color: #d97706; }
.stem { font-size: 16px; line-height: 1.7; margin-bottom: 16px; font-weight: 500; }
.opt {
  display: flex; flex-direction: row; align-items: center; gap: 12px;
  border: 1px solid #e9edf5; border-radius: 12px;
  padding: 13px 12px; margin-bottom: 10px; background: #ffffff;
}
.opt-on { border-color: #2f6bff; background: rgba(47,107,255,0.1); }
.opt-right { border-color: #16a34a; background: rgba(22,163,74,0.12); }
.opt-wrong { border-color: #dc2626; background: rgba(220,38,38,0.1); }
.opt-label {
  width: 28px; height: 28px; border-radius: 8px; background: #f2f4fa; color: #1f2937;
  text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;
}
.opt-on .opt-label { background: #2f6bff; color: #fff; }
.opt-right .opt-label { background: #16a34a; color: #fff; }
.opt-wrong .opt-label { background: #dc2626; color: #fff; }
.opt-content { flex: 1; font-size: 14px; line-height: 1.5; }
.footer {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: row; padding: 10px 16px 24px;
  background: #f5f7fb;
}
.toolbar {
  display: flex; flex-direction: row; gap: 10px;
  padding: 0 16px 12px;
}
.tool {
  display: flex; flex-direction: row; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 18px;
  background: #f2f4fa; border: 1px solid #dbe1ee;
  font-size: 13px; color: #4338ca;
}
.tool.active { border-color: #d97706; color: #d97706; background: rgba(217,119,6,0.1); }
.tool-ico { font-size: 16px; line-height: 1; }
.mask {
  position: fixed; inset: 0; background: rgba(17,24,39,0.45);
  display: flex; align-items: flex-end; z-index: 50;
}
.sheet {
  width: 100%; background: #ffffff; border-radius: 16px 16px 0 0;
  border-top: 1px solid #e9edf5;
  padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
}
.sheet-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
.note-area {
  width: 100%; box-sizing: border-box; min-height: 140px;
  border: 1px solid #dbe1ee; border-radius: 12px; padding: 12px;
  font-size: 14px; line-height: 1.6; background: #ffffff; color: #1f2937;
}
.sheet-actions {
  display: flex; flex-direction: row; margin-top: 14px;
}
</style>
