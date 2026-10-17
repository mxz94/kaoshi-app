<template>
  <view class="page" v-if="bank">
    <view class="card">
      <view style="font-size:20px; font-weight:700;">{{ bank.name }}</view>
      <view class="muted" style="margin:8px 0 14px;">
        {{ bank.totalQuestions }} 题 · 已做 {{ bank.doneCount }} · 正确率 {{ bank.accuracy }}%
      </view>
      <view class="progress-track" style="margin-bottom:6px;">
        <view class="progress-fill" :style="{ width: pct + '%' }"></view>
      </view>
      <view class="muted">已完成 {{ pct }}%</view>
    </view>

    <view class="card" style="padding:4px 16px;">
      <view class="menu-row" @tap="startAll">
        <view class="menu-icon" style="background:rgba(47,107,255,0.1); color:#2563eb;">▶</view>
        <text style="flex:1;">从头刷这套题</text>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
      <view class="menu-row" v-if="lastIdx > 0" @tap="continueFrom">
        <view class="menu-icon" style="background:rgba(47,107,255,0.1); color:#2563eb;">⏩</view>
        <text style="flex:1;">继续上次（第 {{ lastIdx + 1 }} 题）</text>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
      <view class="menu-row" @tap="addQuestion">
        <view class="menu-icon" style="background:#f2f4fa; color:#6b7280;">＋</view>
        <text style="flex:1;">手动录入题目</text>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
      <view class="menu-row" @tap="startTargeted">
        <view class="menu-icon" style="background:rgba(22,163,74,0.12); color:#16a34a;">⌖</view>
        <text style="flex:1;">定向练习（错题 / 未做）</text>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
      <view class="menu-row" @tap="startExam">
        <view class="menu-icon" style="background:rgba(217,119,6,0.12); color:#d97706;">⏱</view>
        <text style="flex:1;">用这套卷模考（限时）</text>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
    </view>

    <view class="card" v-if="!bank.questionCount">
      <view style="font-weight:600; margin-bottom:6px;">这套题还没有题目</view>
      <view class="muted">先手动录入几道题，再来开刷。</view>
      <view class="btn-primary" style="margin-top:14px;" @tap="addQuestion">去录入题目</view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import api from '../../utils/api.js'

const bank = ref(null)
const bankId = ref('')
const lastIdx = ref(0)
const pct = computed(() =>
  bank.value && bank.value.totalQuestions ? Math.round((bank.value.doneCount / bank.value.totalQuestions) * 100) : 0
)

async function refresh() {
  try {
    const list = await api.banks()
    bank.value = list.find((b) => String(b.id) === String(bankId.value)) || null
    const stored = uni.getStorageSync('kaoshi_last_bank')
    if (stored && String(stored.bankId) === String(bankId.value)) lastIdx.value = stored.lastIdx || 0
    else lastIdx.value = 0
  } catch (e) {
    uni.showToast({ title: '加载失败：' + e.message, icon: 'none' })
  }
}

function go() { uni.navigateTo({ url: `/pages/practice/practice?bankId=${bankId.value}` }) }
function startAll() {
  uni.setStorageSync('kaoshi_practice_start', { bankId: bankId.value, from: 0 })
  go()
}
function continueFrom() {
  uni.setStorageSync('kaoshi_practice_start', { bankId: bankId.value, from: lastIdx.value })
  go()
}
function addQuestion() { uni.navigateTo({ url: `/pages/question-add/question-add?bankId=${bankId.value}` }) }
function startExam() {
  uni.navigateTo({ url: `/pages/exam-setup/exam-setup?bankId=${bankId.value}` })
}
// 定向练习：选模式 → 跳练习页（错题 / 未做 按 user_key 隔离过滤）
function startTargeted() {
  uni.showActionSheet({
    itemList: ['全部题目', '只刷错题', '只刷未做'],
    success: (r) => {
      if (r.tapIndex === 0) { startAll(); return }
      const mode = r.tapIndex === 1 ? 'wrong' : 'unanswered'
      uni.setStorageSync('kaoshi_practice_start', { bankId: bankId.value, from: 0 })
      uni.navigateTo({ url: `/pages/practice/practice?bankId=${bankId.value}&mode=${mode}` })
    },
  })
}

onLoad((q) => { bankId.value = q.id || '' })
onShow(refresh)
</script>

<style scoped>
.menu-row { display: flex; flex-direction: row; align-items: center; gap: 12px; height: 54px; }
.menu-icon { width: 32px; height: 32px; border-radius: 8px; text-align: center; line-height: 32px; font-weight: 700; }
</style>
