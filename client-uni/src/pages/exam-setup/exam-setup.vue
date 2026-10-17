<template>
  <view class="page">
    <!-- 行测标准套卷：跨题库按真考配比组卷 -->
    <view class="card paper-card">
      <view class="spread">
        <text class="paper-title">行测标准套卷</text>
        <text class="paper-tag">{{ paperMins }} 分钟</text>
      </view>
      <view class="muted" style="margin-top:8px; line-height:1.6;">
        按真考模块配比跨题库抽题，练的是整卷节奏与时间分配。
      </view>
      <view class="cats" style="margin-top:12px;">
        <text v-for="m in presetModules" :key="m.name" class="chip chip-off">{{ m.name }} {{ m.count }}</text>
      </view>
      <view class="muted" style="margin-top:10px; font-size:12px;">
        题量按现有题库自适应：某模块题不足时会等比缩小整卷，保证模块占比不变。
      </view>
      <view class="btn-primary" :class="{ disabled: paperLoading }" style="margin-top:14px;" @tap="startPaper">
        {{ paperLoading ? '正在组卷…' : '生成套卷并开始' }}
      </view>
    </view>

    <!-- 单题库模考：专项训练 -->
    <view class="card">
      <view class="spread">
        <text style="font-weight:600;">单题库模考</text>
        <text class="muted" style="font-size:12px;">专项训练</text>
      </view>
      <view class="muted" style="margin:6px 0 10px;">只从某一个题库抽题，适合单模块刷题。</view>
      <view v-if="!banks.length" class="muted">还没有题库，先去新建一个</view>
      <view class="cats">
        <text
          v-for="b in banks" :key="b.id"
          class="chip" :class="{ 'chip-on': String(bankId) === String(b.id) }"
          @tap="bankId = b.id"
        >{{ b.name }}（{{ b.questionCount }} 题）</text>
      </view>

      <view style="font-weight:600; margin:16px 0 10px;">题量</view>
      <view class="row" style="gap:8px;">
        <text v-for="n in counts" :key="n" class="chip" :class="{ 'chip-on': count === n }" @tap="count = n">{{ n }} 题</text>
      </view>
      <view style="font-weight:600; margin:16px 0 10px;">限时</view>
      <view class="row" style="gap:8px;">
        <text v-for="m in minutes" :key="m" class="chip" :class="{ 'chip-on': mins === m }" @tap="mins = m">{{ m }} 分钟</text>
      </view>

      <view class="btn-primary" :class="{ disabled: !bankId }" style="margin-top:16px;" @tap="start">开始模考</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import api from '../../utils/api.js'

const banks = ref([])
const bankId = ref('')
const counts = [10, 20, 50]
const minutes = [15, 30, 60, 120]
const count = ref(20)
const mins = ref(30)

// 行测标准套卷
const paperMins = ref(120)
const presetModules = ref([])
const paperLoading = ref(false)

function start() {
  const bank = banks.value.find((b) => String(b.id) === String(bankId.value))
  if (!bank) return
  const n = Math.min(count.value, bank.questionCount || count.value)
  uni.setStorageSync('kaoshi_exam_config', {
    mode: 'bank',
    bankId: bank.id,
    bankName: bank.name,
    count: n,
    mins: mins.value,
  })
  uni.navigateTo({ url: '/pages/exam-run/exam-run' })
}

async function startPaper() {
  if (paperLoading.value) return
  paperLoading.value = true
  uni.showLoading({ title: '正在组卷…' })
  try {
    const paper = await api.examPaper('xingce', 'scale')
    uni.hideLoading()
    if (!paper || !paper.questions || !paper.questions.length) {
      uni.showModal({ title: '组卷失败', content: '没有抽到题目，请先导入题库', showCancel: false })
      return
    }
    uni.setStorageSync('kaoshi_exam_config', {
      mode: 'paper',
      bankName: paper.name,
      mins: paper.minutes || 120,
      paper,
    })
    uni.navigateTo({ url: '/pages/exam-run/exam-run' })
  } catch (e) {
    uni.hideLoading()
    uni.showModal({ title: '组卷失败', content: e.message || '网络错误', showCancel: false })
  } finally {
    paperLoading.value = false
  }
}

onLoad(async (q) => {
  if (q && q.bankId) bankId.value = q.bankId
  // 套卷配比（拿不到不影响单题库模考）
  try {
    const presets = await api.examPresets()
    const p = (presets || []).find((x) => x.key === 'xingce') || (presets || [])[0]
    if (p) {
      paperMins.value = p.minutes || 120
      presetModules.value = p.modules || []
    }
  } catch (e) { /* 静默 */ }
  try {
    banks.value = await api.banks()
    if (!bankId.value && banks.value.length) bankId.value = banks.value[0].id
  } catch (e) {
    uni.showToast({ title: '加载失败：' + e.message, icon: 'none' })
  }
})
</script>

<style scoped>
.page { padding-top: 16px; }
.cats { display: flex; flex-direction: row; flex-wrap: wrap; gap: 8px; }
.chip { font-size: 13px; color: #4338ca; background: #f2f4fa; border-radius: 16px; padding: 6px 12px; }
.chip-on { background: linear-gradient(135deg, #2f6bff, #7c3aed); color: #fff; }
.chip-off { color: #2563eb; background: rgba(47, 107, 255, 0.1); }
.paper-card { background: linear-gradient(135deg, rgba(47, 107, 255, 0.08), rgba(124, 58, 237, 0.08)); border: 1px solid rgba(47, 107, 255, 0.25); }
.paper-title { font-size: 16px; font-weight: 700; color: #1f2937; }
.paper-tag { font-size: 12px; color: #2563eb; background: rgba(47, 107, 255, 0.14); border-radius: 12px; padding: 3px 10px; }
</style>
