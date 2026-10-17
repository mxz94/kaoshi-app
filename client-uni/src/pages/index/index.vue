<template>
  <view class="page">
    <!-- 问候区（动态，修复设计稿硬编码"晚上好"） -->
    <view class="hello">
      <view class="hello-title">{{ greeting }}</view>
      <view class="muted">{{ dateText }} · 今日目标 {{ settings.dailyGoal }} 题</view>
    </view>

    <!-- 继续练习卡 -->
    <view v-if="lastBank" class="card">
      <view class="spread">
        <text class="brand" style="font-size:13px;">继续练习</text>
        <text class="muted">{{ lastBank.done }} / {{ lastBank.total }}</text>
      </view>
      <view class="bank-name">{{ lastBank.name }}</view>
      <view class="progress-track" style="margin:10px 0 14px;">
        <view class="progress-fill" :style="{ width: lastBankPct + '%' }"></view>
      </view>
      <view class="btn-primary" @tap="continueBank">继续刷题 →</view>
    </view>

    <!-- 今日三卡 -->
    <view class="card row" style="justify-content:space-between; padding:14px 16px;">
      <view class="stat3">
        <view class="stat3-num">{{ today.count }}</view>
        <view class="muted">今日刷题</view>
      </view>
      <view class="stat3">
        <view class="stat3-num good">{{ today.accuracy }}%</view>
        <view class="muted">平均正确率</view>
      </view>
      <view class="stat3">
        <view class="stat3-num gold">{{ today.streak }}</view>
        <view class="muted">连续打卡</view>
      </view>
    </view>

    <!-- 限时模考入口 -->
    <view class="card row" style="justify-content:space-between;" @tap="goExam">
      <view class="row">
        <view class="exam-icon">⏱</view>
        <view style="margin-left:12px;">
          <view style="font-weight:600;">限时模考</view>
          <view class="muted">120 分钟 · 130 题 · 真考节奏</view>
        </view>
      </view>
      <text class="muted" style="font-size:18px;">›</text>
    </view>

    <!-- 我的题库 -->
    <view class="spread" style="margin:8px 16px 10px;">
      <text style="font-weight:600; font-size:16px;">我的题库</text>
      <text class="brand" style="font-size:13px;" @tap="goAdd">+ 新建题库</text>
    </view>
    <view v-for="b in banks.slice(0, 5)" :key="b.id" class="card" @tap="goDetail(b.id)">
      <view class="spread">
        <text style="font-weight:600;">{{ b.name }}</text>
        <text :class="b.accuracy >= 80 ? 'good' : b.accuracy >= 60 ? 'brand' : 'bad'" style="font-size:13px;">
          正确率 {{ b.accuracy }}%
        </text>
      </view>
      <view class="muted" style="margin:6px 0 10px;">
        {{ b.totalQuestions }} 题 · 已做 {{ b.doneCount }} · {{ (b.categories || []).join(' / ') }}
      </view>
      <view class="progress-track">
        <view class="progress-fill" :style="{ width: pct(b) + '%' }"></view>
      </view>
    </view>
    <view v-if="!banks.length" class="card" style="text-align:center; color:#6b7280;" @tap="goAdd">
      还没有题库，点这里新建 →
    </view>
    <view style="height:24px;"></view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import api from '../../utils/api.js'
import { getSettings } from '../../utils/settings.js'

const greeting = ref('你好')
const dateText = ref('')
const today = ref({ count: 0, accuracy: 0, streak: 0 })
const banks = ref([])
const settings = ref(getSettings())
const lastBank = ref(null)

const lastBankPct = computed(() =>
  lastBank.value && lastBank.value.total ? Math.round((lastBank.value.done / lastBank.value.total) * 100) : 0
)
const pct = (b) => (b.totalQuestions ? Math.round((b.doneCount / b.totalQuestions) * 100) : 0)

function refreshHello() {
  const h = new Date().getHours()
  greeting.value = h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  dateText.value = `${d.getMonth() + 1}月${d.getDate()}日 周${week}`
}

async function refresh() {
  settings.value = getSettings()
  refreshHello()
  try {
    const [t, list] = await Promise.all([api.today(), api.banks()])
    today.value = t
    banks.value = list
    const stored = uni.getStorageSync('kaoshi_last_bank')
    const found = stored && stored.bankId ? list.find((b) => b.id === stored.bankId) : null
    if (found) {
      lastBank.value = { bankId: found.id, name: found.name, done: found.doneCount, total: found.totalQuestions || found.questionCount }
    } else if (list.length) {
      lastBank.value = { bankId: list[0].id, name: list[0].name, done: list[0].doneCount, total: list[0].totalQuestions || list[0].questionCount }
    } else {
      lastBank.value = null
    }
  } catch (e) {
    uni.showToast({ title: '加载失败：' + e.message, icon: 'none' })
  }
}

function continueBank() {
  uni.navigateTo({ url: `/pages/practice/practice?bankId=${lastBank.value.bankId}` })
}
function goExam() { uni.navigateTo({ url: '/pages/exam-setup/exam-setup' }) }
function goAdd() { uni.navigateTo({ url: '/pages/bank-add/bank-add' }) }
function goDetail(id) { uni.navigateTo({ url: `/pages/bank-detail/bank-detail?id=${id}` }) }

onShow(refresh)
</script>

<style scoped>
.page { padding-top: 12px; }
.hello { margin: 4px 16px 14px; }
.hello-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.bank-name { font-size: 17px; font-weight: 700; margin-top: 10px; }
.stat3 { flex: 1; text-align: center; }
.stat3-num { font-size: 24px; font-weight: 700; }
.exam-icon {
  width: 36px; height: 36px; border-radius: 10px; background: rgba(217,119,6,0.12);
  color: #d97706; text-align: center; line-height: 36px; font-size: 18px;
}
</style>
