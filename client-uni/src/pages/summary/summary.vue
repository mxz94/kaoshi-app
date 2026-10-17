<template>
  <view class="page">
    <view class="card" style="text-align:center; padding:28px 16px;">
      <view style="font-size:44px; font-weight:700;" :class="accuracy >= 80 ? 'good' : accuracy >= 60 ? 'brand' : 'bad'">
        {{ accuracy }}%
      </view>
      <view class="muted" style="margin-top:4px;">本轮正确率</view>
      <view class="row" style="justify-content:center; gap:24px; margin-top:18px;">
        <view>
          <view style="font-size:20px; font-weight:700;">{{ round.correct }}/{{ round.total }}</view>
          <view class="muted">答对题数</view>
        </view>
        <view>
          <view style="font-size:20px; font-weight:700;">{{ timeText }}</view>
          <view class="muted">总用时</view>
        </view>
        <view>
          <view style="font-size:20px; font-weight:700;">{{ avgText }}</view>
          <view class="muted">平均每题</view>
        </view>
      </view>
    </view>

    <!-- 用时分布（超时标红：必修#4） -->
    <view class="card" v-if="round.records && round.records.length">
      <view style="font-weight:600; margin-bottom:10px;">每题用时</view>
      <view class="dots">
        <view
          v-for="(r, i) in round.records" :key="i"
          class="dot" :class="r.isCorrect ? (r.duration > 60 ? 'dot-slow' : 'dot-ok') : 'dot-bad'"
          :style="{ height: 8 + Math.min(36, r.duration) + 'px' }"
        >
          <text class="dot-label">{{ i + 1 }}</text>
        </view>
      </view>
      <view class="muted" style="margin-top:8px;">绿=答对 · 红=答错 · 黄=超 60 秒（建议每题控制在 60 秒内）</view>
    </view>

    <view class="footer">
      <view class="btn-plain" style="flex:1;" @tap="again">再来一轮</view>
      <view style="width:12px;"></view>
      <view class="btn-primary" style="flex:1;" @tap="home">返回首页</view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const round = ref({ total: 0, correct: 0, totalSec: 0, records: [], bankId: '' })

const accuracy = computed(() => (round.value.total ? Math.round((round.value.correct / round.value.total) * 100) : 0))
const timeText = computed(() => {
  const s = round.value.totalSec || 0
  return `${Math.floor(s / 60)}分${s % 60}秒`
})
const avgText = computed(() =>
  round.value.total ? `${Math.round((round.value.totalSec || 0) / round.value.total)}秒` : '—'
)

function again() {
  uni.navigateTo({ url: `/pages/practice/practice?bankId=${round.value.bankId}` })
}
function home() {
  uni.switchTab({ url: '/pages/index/index' })
}

onLoad(() => {
  const r = uni.getStorageSync('kaoshi_round_summary')
  if (r && typeof r === 'object') round.value = r
})
</script>

<style scoped>
.page { padding-top: 16px; }
.dots { display: flex; flex-direction: row; align-items: flex-end; gap: 4px; flex-wrap: wrap; }
.dot {
  width: 22px; border-radius: 4px 4px 0 0;
  display: flex; align-items: flex-start; justify-content: center;
}
.dot-ok { background: #16a34a; }
.dot-bad { background: #dc2626; }
.dot-slow { background: #d97706; }
.dot-label { font-size: 9px; color: #fff; line-height: 10px; }
.footer {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: row; padding: 10px 16px 24px; background: #f5f7fb;
}
</style>
