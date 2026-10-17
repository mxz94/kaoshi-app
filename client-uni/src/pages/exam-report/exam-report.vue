<template>
  <view class="page" v-if="report.total">
    <!-- 总分卡 -->
    <view class="card" style="text-align:center; padding:28px 16px;">
      <view class="muted">{{ report.paperName || report.bankName }}</view>
      <view style="font-size:44px; font-weight:700; margin-top:6px;" :class="accuracy >= 80 ? 'good' : accuracy >= 60 ? 'brand' : 'bad'">
        {{ report.correct }}<text style="font-size:20px; color:#6b7280;"> / {{ report.total }}</text>
      </view>
      <view class="muted" style="margin-top:4px;">正确率 {{ accuracy }}% · 用时 {{ usedText }} / 限时 {{ limitText }}</view>
    </view>

    <!-- 用时节奏 -->
    <view class="card">
      <view style="font-weight:600; margin-bottom:8px;">节奏</view>
      <view class="muted" style="line-height:1.7;">
        平均每题 {{ avgSec }} 秒
        <template v-if="report.usedSec > report.limitSec"> · <text class="bad">超时交卷</text></template>
        <template v-else-if="paceOk"> · 节奏在真考线内（约 55 秒/题）</template>
        <template v-else> · 略慢于真考线（约 55 秒/题），注意提速</template>
      </view>
    </view>

    <!-- 模块维度（套卷模式才有多个模块） -->
    <view v-if="moduleRows.length > 1" class="card">
      <view style="font-weight:600; margin-bottom:12px;">模块得分</view>
      <view v-for="m in moduleRows" :key="m.name" class="mod-row">
        <text class="mod-name">{{ m.name }}</text>
        <view class="mod-track">
          <view
            class="mod-fill" :class="m.accuracy >= 80 ? 'ok' : m.accuracy >= 60 ? 'mid' : 'low'"
            :style="{ width: m.accuracy + '%' }"
          ></view>
        </view>
        <text class="mod-stat">{{ m.correct }}/{{ m.total }}</text>
      </view>
    </view>

    <!-- 错题回顾 -->
    <view class="card">
      <view style="font-weight:600; margin-bottom:10px;">错题（{{ wrongRecords.length }}）</view>
      <view v-if="!wrongRecords.length" class="good">全对，漂亮！</view>
      <view v-for="(r, i) in wrongRecords" :key="i" class="wrong-item">
        <view class="stem">{{ i + 1 }}. {{ r.stem }}</view>
        <view class="muted">你的答案：{{ r.picked || '未作答' }} · 正确：{{ r.correctLabels.join('') }}</view>
      </view>
    </view>

    <view class="footer">
      <view class="btn-plain" style="flex:1;" @tap="again">再来一次</view>
      <view style="width:12px;"></view>
      <view class="btn-primary" style="flex:1;" @tap="home">返回首页</view>
    </view>
  </view>

  <!-- 空态：无模考数据（直接从入口进入时），避免整页白屏 -->
  <view class="page" v-else style="text-align:center; padding-top:140px;">
    <view class="muted" style="font-size:14px; margin-bottom:24px;">暂无模考报告，先完成一次模考吧</view>
    <view class="btn-primary" style="margin:0 48px;" @tap="again">去模考</view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const report = ref({ total: 0, correct: 0, usedSec: 0, limitSec: 0, records: [] })

const accuracy = computed(() => (report.value.total ? Math.round((report.value.correct / report.value.total) * 100) : 0))
const wrongRecords = computed(() => (report.value.records || []).filter((r) => !r.isCorrect))
const moduleRows = computed(() => (report.value.modules || []).filter((m) => m && m.total))
const avgSec = computed(() => (report.value.total ? Math.round(report.value.usedSec / report.value.total) : 0))
const paceOk = computed(() => avgSec.value <= 55)
const usedText = computed(() => {
  const s = report.value.usedSec || 0
  return `${Math.floor(s / 60)}分${s % 60}秒`
})
const limitText = computed(() => `${Math.round((report.value.limitSec || 0) / 60)}分钟`)

function again() { uni.redirectTo({ url: '/pages/exam-setup/exam-setup' }) }
function home() { uni.switchTab({ url: '/pages/index/index' }) }

onLoad(() => {
  const r = uni.getStorageSync('kaoshi_exam_report')
  if (r && typeof r === 'object') report.value = r
})
</script>

<style scoped>
.page { padding-top: 16px; }
.stem { font-size: 14px; line-height: 1.6; margin-bottom: 4px; }
.wrong-item { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #e8ecf4; }
.mod-row { display: flex; flex-direction: row; align-items: center; gap: 10px; margin-bottom: 12px; }
.mod-row:last-child { margin-bottom: 0; }
.mod-name { width: 96px; font-size: 13px; color: #1f2937; }
.mod-track { flex: 1; height: 8px; border-radius: 4px; background: #eef2f9; overflow: hidden; }
.mod-fill { height: 8px; border-radius: 4px; }
.mod-fill.ok { background: #16a34a; }
.mod-fill.mid { background: #d97706; }
.mod-fill.low { background: #dc2626; }
.mod-stat { width: 56px; text-align: right; font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums; }
.footer {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: row; padding: 10px 16px 24px; background: #f5f7fb;
}
</style>
