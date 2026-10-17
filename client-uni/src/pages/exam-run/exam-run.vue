<template>
  <view class="page" v-if="qs.length">
    <!-- 顶栏：倒计时 -->
    <view class="topbar">
      <text class="muted" style="font-size:13px;">{{ headTitle }} · {{ idx + 1 }}/{{ qs.length }}</text>
      <text class="countdown" :class="{ danger: remainSec < 60 }">{{ countdownText }}</text>
    </view>
    <view class="progress-track" style="margin:0 16px 14px;">
      <view class="progress-fill" :style="{ width: ((idx + 1) / qs.length) * 100 + '%' }"></view>
    </view>

    <view class="card">
      <view v-if="qs[idx].module" class="qtype">{{ qs[idx].module }}</view>
      <view class="stem">{{ qs[idx].stem }}</view>
      <view
        v-for="o in qs[idx].options" :key="o.label"
        class="opt" :class="{ 'opt-on': picks[qs[idx].id] === o.label }"
        @tap="pick(o.label)"
      >
        <view class="opt-label">{{ o.label }}</view>
        <view class="opt-content">{{ o.content }}</view>
      </view>
    </view>

    <view class="footer">
      <view class="btn-plain" style="flex:1;" :style="{ opacity: idx === 0 ? 0.4 : 1 }" @tap="prev">上一题</view>
      <view style="width:12px;"></view>
      <view v-if="idx < qs.length - 1" class="btn-primary" style="flex:2;" @tap="next">下一题</view>
      <view v-else class="btn-primary" style="flex:2;" @tap="submit">交卷</view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import api from '../../utils/api.js'

const exam = ref({})
const qs = ref([])
const idx = ref(0)
const picks = ref({})   // questionId → label（模考可反复改答案）
const remainSec = ref(0)
const startedAt = Date.now()
let timer = null
let submitting = false

const headTitle = computed(() =>
  (exam.value.paper && exam.value.paper.name) || exam.value.bankName || '模考'
)

const countdownText = computed(() => {
  const s = Math.max(0, remainSec.value)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`
})

function pick(label) { picks.value[qs.value[idx.value].id] = label }
function prev() { if (idx.value > 0) idx.value-- }
function next() {
  if (idx.value < qs.value.length - 1) idx.value++
  else submit()
}

async function submit() {
  if (submitting) return
  submitting = true
  clearInterval(timer)
  // 本地判分（用题目自带 isCorrect）
  const records = qs.value.map((q) => {
    const picked = picks.value[q.id] || ''
    const correctLabels = q.options.filter((o) => o.isCorrect).map((o) => o.label)
    return {
      questionId: q.id,
      bankId: q.bankId || exam.value.bankId || null,
      bankName: q.bankName || exam.value.bankName || '',
      module: q.module || '',
      stem: q.stem,
      picked,
      correctLabels,
      isCorrect: picked === correctLabels.join(''),
    }
  })
  // 模块维度汇总（套卷模式才有意义；单题库模考会聚成一项，报告页自动隐藏）
  const modMap = new Map()
  for (const r of records) {
    const k = r.module || '未分模块'
    if (!modMap.has(k)) modMap.set(k, { name: k, total: 0, correct: 0 })
    const agg = modMap.get(k)
    agg.total++
    if (r.isCorrect) agg.correct++
  }
  const modules = Array.from(modMap.values()).map((m) => ({
    ...m,
    accuracy: m.total ? Math.round((m.correct / m.total) * 100) : 0,
  }))
  const report = {
    mode: exam.value.mode || 'bank',
    bankId: exam.value.bankId || null,
    bankName: exam.value.bankName || '',
    paperName: exam.value.paper ? exam.value.paper.name : '',
    total: records.length,
    correct: records.filter((r) => r.isCorrect).length,
    usedSec: Math.round((Date.now() - startedAt) / 1000),
    limitSec: (exam.value.mins || 0) * 60,
    modules,
    records,
    finishedAt: Date.now(),
  }
  uni.setStorageSync('kaoshi_exam_report', report)
  uni.redirectTo({ url: '/pages/exam-report/exam-report' })
}

onLoad(async () => {
  const cfg = uni.getStorageSync('kaoshi_exam_config')
  const paperQs = cfg && cfg.paper && Array.isArray(cfg.paper.questions) ? cfg.paper.questions : null
  if (!cfg || (!cfg.bankId && !(paperQs && paperQs.length))) {
    uni.showToast({ title: '配置缺失', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  exam.value = cfg
  remainSec.value = (cfg.mins || (cfg.paper && cfg.paper.minutes) || 0) * 60
  try {
    if (paperQs && paperQs.length) {
      // 套卷模式：题目由后端按配比抽好，直接使用，保留模块归属
      qs.value = paperQs.map((q) => ({ ...q }))
    } else {
      const all = await api.bankQuestions(cfg.bankId)
      // 洗牌取前 N（模考按真考节奏抽题）
      const shuffled = all.slice()
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      qs.value = shuffled
        .slice(0, cfg.count)
        .map((q) => ({ ...q, bankId: cfg.bankId, bankName: cfg.bankName, module: '' }))
    }
    if (!qs.value.length) {
      uni.showToast({ title: '没有可用题目', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
  } catch (e) {
    uni.showToast({ title: '加载失败：' + e.message, icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  timer = setInterval(() => {
    remainSec.value--
    if (remainSec.value <= 0) {
      uni.showToast({ title: '时间到，自动交卷', icon: 'none' })
      submit()
    }
  }, 1000)
})

onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.topbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; }
.countdown { font-size: 15px; font-weight: 700; color: #1f2937; font-variant-numeric: tabular-nums; }
.countdown.danger { color: #dc2626; }
.qtype {
  display: inline-block; font-size: 11px; color: #2563eb; background: rgba(47, 107, 255, 0.1);
  border-radius: 8px; padding: 2px 8px; margin-bottom: 10px;
}
.stem { font-size: 16px; line-height: 1.7; margin-bottom: 16px; font-weight: 500; }
.opt {
  display: flex; flex-direction: row; align-items: center; gap: 12px;
  border: 1px solid #e9edf5; border-radius: 12px;
  padding: 13px 12px; margin-bottom: 10px; background: #ffffff;
}
.opt-on { border-color: #2f6bff; background: rgba(47,107,255,0.1); }
.opt-label {
  width: 28px; height: 28px; border-radius: 8px; background: #f2f4fa; color: #1f2937;
  text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;
}
.opt-on .opt-label { background: #2f6bff; color: #fff; }
.opt-content { flex: 1; font-size: 14px; line-height: 1.5; }
.footer {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: row; padding: 10px 16px 24px; background: #f5f7fb;
}
</style>
