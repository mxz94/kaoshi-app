<template>
  <view class="page">
    <!-- 今日三卡 -->
    <view class="card row" style="justify-content:space-between; margin-top:12px; padding:16px;">
      <view class="stat3">
        <view class="stat3-num">{{ ov.today.count }}</view>
        <view class="muted">今日练习</view>
      </view>
      <view class="stat3">
        <view class="stat3-num good">{{ ov.today.accuracy }}%</view>
        <view class="muted">正确率</view>
      </view>
      <view class="stat3">
        <view class="stat3-num gold">{{ ov.today.streak }}</view>
        <view class="muted">连续天数</view>
      </view>
    </view>

    <!-- 模块正确率 -->
    <view class="card">
      <view class="spread" style="margin-bottom:12px;">
        <text style="font-weight:600;">模块正确率</text>
        <view class="row" style="gap:6px;">
          <text
            v-for="p in periods" :key="p.key"
            class="chip" :class="{ 'chip-on': period === p.key }"
            @tap="switchPeriod(p.key)"
          >{{ p.label }}</text>
        </view>
      </view>
      <view v-for="m in ov.modules" :key="m.name" style="margin-bottom:12px;">
        <view class="spread" style="margin-bottom:6px;">
          <text style="font-size:14px;">{{ m.name }}</text>
          <text :style="{ color: barColor(m.accuracy), fontWeight: 700, fontSize: '14px' }">{{ m.accuracy }}%</text>
        </view>
        <view class="progress-track">
          <view class="progress-fill" :style="{ width: m.accuracy + '%', background: barColor(m.accuracy) }"></view>
        </view>
      </view>
      <view v-if="!ov.modules.length" class="muted">本月暂无练习数据</view>
    </view>

    <!-- 本周建议（洞察卡：数据 → 一句话行动） -->
    <view v-if="advice" class="card">
      <view class="row" style="gap:6px; margin-bottom:6px;">
        <text class="gold" style="font-size:14px;">💡</text>
        <text style="font-weight:600;">本周建议</text>
      </view>
      <view style="font-size:14px; line-height:1.6;">{{ advice }}</view>
    </view>

    <!-- 最近 7 天练习 -->
    <view class="card">
      <view style="font-weight:600; margin-bottom:14px;">最近7天练习</view>
      <view class="bars">
        <view v-for="(d, i) in ov.last7" :key="i" class="bar-col">
          <view class="bar" :style="{ height: barH(d.count) + 'px' }"></view>
          <text class="muted" style="font-size:11px;">{{ weekLabels[i] }}</text>
        </view>
      </view>
    </view>

    <!-- 错题本入口 -->
    <view class="card row" style="justify-content:space-between;" @tap="goWrong">
      <view class="row">
        <view class="wrong-icon">✗</view>
        <view style="margin-left:12px;">
          <view style="font-weight:600;">错题本</view>
          <view class="muted">{{ ov.wrongCount }} 题待复习</view>
        </view>
      </view>
      <text class="muted" style="font-size:18px;">›</text>
    </view>

    <!-- 练习热力图 -->
    <view class="card">
      <view class="spread" style="margin-bottom:10px;">
        <text style="font-weight:600;">练习热力图</text>
        <text class="muted">近 18 周</text>
      </view>
      <view class="heat">
        <view
          v-for="(d, i) in ov.heatmap" :key="i"
          class="heat-cell" :style="{ background: heatColor(d.count) }"
        ></view>
      </view>
      <view class="row" style="justify-content:flex-end; gap:4px; margin-top:8px;">
        <text class="muted" style="font-size:11px;">少</text>
        <view v-for="c in ['#f2f4fa', '#bbf7d0', '#86efac', '#4ade80', '#16a34a']" :key="c"
          style="width:12px; height:12px; border-radius:3px;" :style="{ background: c }"></view>
        <text class="muted" style="font-size:11px;">多</text>
      </view>
    </view>
    <view style="height:24px;"></view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import api from '../../utils/api.js'

const periods = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
]
const period = ref('month')
const ov = ref({
  today: { count: 0, accuracy: 0, streak: 0 },
  modules: [], last7: [], heatmap: [], wrongCount: 0,
})
const weekLabels = ['一', '二', '三', '四', '五', '六', '日']

// Q7：≥80 绿 / 60–79 主蓝 / <60 红
const barColor = (a) => (a >= 80 ? '#16a34a' : a >= 60 ? '#2F6BFF' : '#dc2626')
// Q6：0 / 1–2 / 3–5 / 6–9 / ≥10（深色底可读绿阶）
const heatColor = (c) => (c === 0 ? '#f2f4fa' : c <= 2 ? '#bbf7d0' : c <= 5 ? '#86efac' : c <= 9 ? '#4ade80' : '#16a34a')

const max7 = computed(() => Math.max(1, ...ov.value.last7.map((d) => d.count)))
const barH = (c) => Math.max(4, Math.round((c / max7.value) * 72))

const advice = computed(() => {
  const ms = ov.value.modules
  if (!ms.length) return ''
  const worst = [...ms].sort((a, b) => a.accuracy - b.accuracy)[0]
  const best = [...ms].sort((a, b) => b.accuracy - a.accuracy)[0]
  if (worst.accuracy < 60) return `${worst.name} 正确率仅 ${worst.accuracy}%，明显拖分，建议每天加练 10 题优先补弱。`
  if (best.accuracy - worst.accuracy >= 15) return `${worst.name}（${worst.accuracy}%）低于 ${best.name}（${best.accuracy}%）${best.accuracy - worst.accuracy} 个百分点，是当前最值得投入的模块。`
  return `各模块差距不大（最弱 ${worst.name} ${worst.accuracy}%），保持节奏、按考试比重分配练习量即可。`
})

async function refresh() {
  try {
    ov.value = await api.overview(period.value)
  } catch (e) {
    uni.showToast({ title: '加载失败：' + e.message, icon: 'none' })
  }
}
function switchPeriod(p) {
  if (period.value === p) return
  period.value = p
  refresh()
}
function goWrong() { uni.navigateTo({ url: '/pages/wrong/wrong' }) }

onShow(refresh)
</script>

<style scoped>
.stat3 { flex: 1; text-align: center; }
.stat3-num { font-size: 24px; font-weight: 700; }
.chip {
  font-size: 12px; color: #4338ca; background: #f2f4fa;
  border-radius: 12px; padding: 3px 10px;
}
.chip-on { background: linear-gradient(135deg, #2f6bff, #7c3aed); color: #fff; }
.bars {
  display: flex; flex-direction: row; align-items: flex-end;
  justify-content: space-between; height: 92px; padding: 0 4px;
}
.bar-col { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 24px; }
.bar { width: 24px; border-radius: 4px; background: linear-gradient(180deg, #2f6bff, #7c3aed); }
.wrong-icon {
  width: 36px; height: 36px; border-radius: 10px; background: rgba(220,38,38,0.1);
  color: #dc2626; text-align: center; line-height: 36px; font-weight: 700;
}
.heat {
  display: grid;
  grid-template-columns: repeat(18, 1fr);
  gap: 4px;
}
.heat-cell { width: 100%; padding-bottom: 100%; border-radius: 3px; }
</style>
