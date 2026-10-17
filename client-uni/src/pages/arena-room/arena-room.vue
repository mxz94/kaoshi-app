<template>
  <view class="page">
    <!-- 背景光斑装饰 -->
    <view class="bg-blob b1"></view>
    <view class="bg-blob b2"></view>
    <view class="bg-blob b3"></view>

    <!-- 顶栏：房间 / 轮次 / 人数 -->
    <view class="topbar">
      <view class="pill">⚔ 房间 {{ roomId }}</view>
      <view class="pill">👥 {{ state.participants || 0 }} 人</view>
      <view class="pill">第 {{ state.roundNo || 0 }} 题</view>
    </view>

    <!-- 倒计时：大数字 + 时间条 -->
    <view v-if="state.question" class="timer-wrap">
      <view class="timer-num" :class="timerCls">{{ leftSec }}</view>
      <view class="timer-bar"><view class="timer-fill" :class="timerCls" :style="{ width: timePct + '%' }"></view></view>
    </view>

    <!-- 题目区 -->
    <view v-if="state.question" class="panel">
      <view class="stem">{{ state.question.stem }}</view>

      <view
        v-for="(o, i) in state.question.options" :key="o.label"
        class="opt" :class="optClass(o.label)"
        :style="{ animationDelay: (i * 60) + 'ms' }"
        @tap="pick(o.label)"
      >
        <view class="opt-label">{{ o.label }}</view>
        <view class="opt-content">{{ o.content }}</view>
        <view v-if="reveal && reveal.correctLabels && reveal.correctLabels.includes(o.label)" class="mark mk-ok">✓</view>
        <view v-else-if="reveal && myPick === o.label" class="mark mk-bad">✗</view>
      </view>

      <!-- 揭晓横幅 -->
      <view v-if="reveal" class="reveal-banner" :class="amRight ? 'rb-ok' : 'rb-bad'">
        <text class="rb-big">{{ amRight ? '答对了！🔥' : '答错了…' }}</text>
        <text class="rb-ans">正确答案：{{ reveal.correctLabels.join('') }}</text>
      </view>
      <view v-if="reveal && reveal.analysis" class="analysis">解析：{{ reveal.analysis }}</view>
      <view v-else-if="myPick && !reveal" class="waiting-tip">已提交 {{ myPick }} · {{ waitHint }}</view>
    </view>

    <!-- 等待开题 -->
    <view v-else class="panel wait-panel">
      <view class="vs-title">⚡ 对决准备中</view>
      <view class="dots"><text class="d1">●</text><text class="d2">●</text><text class="d3">●</text></view>
      <view class="muted2">等待房主发题…</view>
    </view>

    <!-- 实时榜（hideRankDuringPlay 时答题阶段由后端返回空） -->
    <view v-if="board.length" class="panel">
      <view class="lb-title">⚡ 实时榜</view>
      <view v-for="(p, idx) in board" :key="p.username" class="lb-row" :style="{ animationDelay: (idx * 80) + 'ms' }">
        <view class="lb-rank" :class="'r' + (p.rank <= 3 ? p.rank : 0)">{{ medal(p.rank) }}</view>
        <view class="lb-main">
          <view class="lb-name">{{ p.username }}</view>
          <view class="lb-bar"><view class="lb-fill" :style="{ width: lbPct(p) + '%' }"></view></view>
        </view>
        <view class="lb-score">{{ p.score }}<text class="lb-sub"> 分</text></view>
      </view>
    </view>

    <!-- 房主操作 -->
    <view v-if="isHost" class="footer">
      <view class="btn-ghost" @tap="endRoom">结束对局</view>
      <view class="btn-neon" @tap="nextQuestion">下一题 →</view>
    </view>
    <view style="height:96px;"></view>

    <!-- 答对闪光特效 -->
    <view v-if="amRight && reveal" class="flash"></view>

    <!-- 结算弹层 -->
    <view v-if="showResult" class="overlay" @tap="closeResult">
      <view class="result-card" @tap.stop>
        <view class="trophy">🏆</view>
        <view class="result-title">本局结算</view>
        <view
          v-for="(p, idx) in standings" :key="p.username"
          class="res-row" :class="{ me: p.username === me }"
          :style="{ animationDelay: (idx * 100) + 'ms' }"
        >
          <text class="res-rank">{{ medal(p.rank) }}</text>
          <text class="res-name">{{ p.username }}</text>
          <text class="res-score">{{ p.score }} 分 · 对 {{ p.correctCount }}</text>
        </view>
        <view v-if="!standings.length" class="muted2" style="padding:12px 0;">本局无人作答</view>
        <view class="btn-neon" style="margin-top:16px;" @tap="backArena">返回竞技场</view>
        <view class="btn-ghost" style="margin-top:10px;" @tap="closeResult">查看榜单</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import api from '../../utils/api.js'
import { displayName } from '../../utils/identity.js'

const roomId = ref('')
const isHost = ref(false)
const bankId = ref(null)
const state = ref({})
const questions = ref([])
const qIndex = ref(0)
const myPick = ref('')
const answered = ref({})
const me = ref('')
const showResult = ref(false)
const standings = ref([])
const maxSec = ref(20)
let timer = null

const board = computed(() => state.value.leaderboard || [])
const reveal = computed(() => state.value.reveal || null)
// 本轮我答对了没（用于横幅与闪光特效）
const amRight = computed(() => {
  const r = reveal.value
  return !!(r && r.correctLabels && myPick.value && r.correctLabels.includes(myPick.value))
})
// 等待提示：按同步模式说明在等谁
const waitHint = computed(() => {
  const s = state.value
  if (s.syncMode === 'free') return '自由节奏模式，答案稍后揭晓'
  const left = Math.max(0, (s.participants || 0) - (s.answeredCount || 0))
  return left > 0 ? `等待对手作答（还剩 ${left} 人）` : '等待揭晓…'
})
const leftSec = computed(() => {
  const q = state.value.question
  if (!q) return 0
  return Math.max(0, Math.ceil((q.endsAt - (state.value.now || Date.now())) / 1000))
})
// 时间条百分比（按本轮最大秒数折算）
const timePct = computed(() => Math.min(100, Math.round((leftSec.value / Math.max(1, maxSec.value)) * 100)))
// 倒计时配色：充裕→青、临近→琥珀、最后 5 秒→红 + 脉冲
const timerCls = computed(() => (leftSec.value <= 5 ? 't-danger' : leftSec.value <= 10 ? 't-warn' : 't-cyan'))

// 新一轮题目：记录本轮总时长（供时间条折算）+ 清理已选
watch(() => state.value.roundNo, () => {
  maxSec.value = Math.max(leftSec.value, 10)
})

function medal(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return String(rank)
}
// 榜单分数条：相对榜首分数的占比
function lbPct(p) {
  const top = board.value.reduce((m, x) => Math.max(m, x.score || 0), 0)
  return top > 0 ? Math.max(6, Math.round(((p.score || 0) / top) * 100)) : 6
}

function optClass(label) {
  const r = reveal.value
  if (r && r.correctLabels) {
    if (r.correctLabels.includes(label)) return 'opt-ok'
    if (myPick.value === label) return 'opt-bad'
  }
  return myPick.value === label ? 'opt-on' : ''
}

async function refresh() {
  if (!roomId.value) return
  try {
    // 传真实昵称：free 模式下后端据此判断"自己是否已答"来决定何时揭晓
    state.value = await api.arenaState(roomId.value, isHost.value ? 'host' : me.value)
  } catch (e) { /* 轮询失败忽略，下一秒重试 */ }
}

async function pick(label) {
  const rn = state.value.roundNo
  if (!state.value.question || answered.value[rn]) return
  myPick.value = label
  answered.value = { ...answered.value, [rn]: label }
  try {
    await api.arenaAnswer({ roomId: roomId.value, username: me.value, option: label })
  } catch (e) {
    uni.showToast({ title: '提交失败', icon: 'none' })
    return
  }
  refresh()
}

async function nextQuestion() {
  if (!questions.value.length) return
  const q = questions.value[qIndex.value % questions.value.length]
  qIndex.value += 1
  try {
    await api.arenaPush({ roomId: roomId.value, questionId: q.id, roundNo: (state.value.roundNo || 0) + 1 })
  } catch (e) {
    uni.showToast({ title: '推题失败', icon: 'none' })
    return
  }
  myPick.value = ''
  refresh()
}

async function endRoom() {
  try {
    const r = await api.arenaEnd(roomId.value)
    standings.value = r.standings || []
    showResult.value = true
  } catch (e) {
    uni.showToast({ title: '结束失败', icon: 'none' })
  }
}

function closeResult() { showResult.value = false }
function backArena() { uni.navigateBack() }

onLoad(async (opt) => {
  roomId.value = opt.roomId || 'default'
  isHost.value = opt.host === '1'
  bankId.value = opt.bankId || null
  me.value = displayName() || '游客'
  if (!me.value || me.value === '游客') {
    uni.showToast({ title: '请先设置昵称', icon: 'none' })
  }
  // 房主需要题库题目用于推题
  if (isHost.value && bankId.value) {
    try { questions.value = await api.bankQuestions(bankId.value) } catch (e) { questions.value = [] }
  }
  await refresh()
  timer = setInterval(refresh, 1000)
})

onUnload(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
/* ===== 明亮酷炫战斗风（浅底 + 蓝紫渐变点缀）===== */
.page {
  position: relative;
  min-height: 100vh;
  background: linear-gradient(165deg, #f7f9ff 0%, #eef2ff 52%, #f6f1ff 100%);
  color: #1f2937;
  overflow: hidden;
}
/* 背景光斑（浅色彩晕） */
.bg-blob { position: fixed; border-radius: 50%; pointer-events: none; z-index: 0; }
.b1 { width: 320px; height: 320px; left: -120px; top: -100px;
  background: radial-gradient(circle, rgba(47,107,255,0.18) 0%, rgba(47,107,255,0) 70%); }
.b2 { width: 380px; height: 380px; right: -150px; top: 30%;
  background: radial-gradient(circle, rgba(124,58,237,0.16) 0%, rgba(124,58,237,0) 70%); }
.b3 { width: 300px; height: 300px; left: 10%; bottom: -120px;
  background: radial-gradient(circle, rgba(14,165,183,0.14) 0%, rgba(14,165,183,0) 70%); }

/* ===== 顶栏胶囊 ===== */
.topbar {
  position: relative; z-index: 1;
  display: flex; flex-direction: row; gap: 8px; flex-wrap: wrap;
  padding: 12px 16px 0;
}
.pill {
  padding: 5px 12px; border-radius: 999px; font-size: 12px;
  color: #4338ca;
  background: #eef2ff;
  border: 1px solid #dfe3fb;
}

/* ===== 倒计时 ===== */
.timer-wrap { position: relative; z-index: 1; padding: 14px 16px 0; display: flex; align-items: center; gap: 12px; }
.timer-num { font-size: 34px; font-weight: 800; font-family: 'Inter Tight', -apple-system, sans-serif; min-width: 52px; text-align: center; }
.timer-bar { flex: 1; height: 8px; border-radius: 4px; background: #e6ebf7; overflow: hidden; }
.timer-fill { height: 8px; border-radius: 4px; transition: width 0.8s linear; }
.t-cyan { color: #0e7490; }
.t-cyan.timer-fill { background: linear-gradient(90deg, #0e7490, #22d3ee); box-shadow: 0 0 10px rgba(34,211,238,0.4); }
.t-warn { color: #b45309; }
.t-warn.timer-fill { background: linear-gradient(90deg, #d97706, #fbbf24); box-shadow: 0 0 10px rgba(251,191,36,0.45); }
.t-danger { color: #dc2626; animation: pulse 1s ease-in-out infinite; }
.t-danger.timer-fill { background: linear-gradient(90deg, #dc2626, #ef4444); box-shadow: 0 0 12px rgba(239,68,68,0.45); }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }

/* ===== 通用面板 ===== */
.panel {
  position: relative; z-index: 1;
  margin: 12px 16px; padding: 16px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #e9edf5;
  box-shadow: 0 6px 20px rgba(17,24,39,0.06);
}

/* ===== 题干 ===== */
.stem { font-size: 16px; line-height: 1.75; margin-bottom: 14px; font-weight: 500; color: #111827; }

/* ===== 选项 ===== */
.opt {
  display: flex; flex-direction: row; align-items: center; gap: 10px;
  padding: 13px 14px; margin-bottom: 10px;
  border: 1px solid #e4e9f2; border-radius: 12px;
  background: #fbfcfe;
  animation: optIn 0.35s ease both;
  transition: transform 0.12s ease;
}
.opt:active { transform: scale(0.97); }
@keyframes optIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.opt-label {
  width: 26px; height: 26px; border-radius: 8px; line-height: 26px; text-align: center;
  font-weight: 800; font-size: 13px; color: #fff;
  background: linear-gradient(135deg, #2f6bff, #7c3aed);
}
.opt-content { flex: 1; font-size: 14px; line-height: 1.5; color: #334155; }
.opt-on { border-color: #2f6bff; background: rgba(47,107,255,0.08); box-shadow: 0 0 0 3px rgba(47,107,255,0.12); }
.opt-ok { border-color: #16a34a; background: rgba(22,163,74,0.1); box-shadow: 0 0 0 3px rgba(22,163,74,0.14); animation: pop 0.35s ease; }
.opt-bad { border-color: #dc2626; background: rgba(220,38,38,0.08); animation: shake 0.4s ease; }
@keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.03); } 100% { transform: scale(1); } }
@keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 50% { transform: translateX(5px); } 75% { transform: translateX(-3px); } }
.mark { width: 22px; height: 22px; border-radius: 50%; line-height: 22px; text-align: center; font-size: 13px; font-weight: 800; color: #fff; }
.mk-ok { background: #16a34a; }
.mk-bad { background: #dc2626; }

/* ===== 揭晓横幅 ===== */
.reveal-banner {
  display: flex; flex-direction: row; align-items: center; justify-content: space-between;
  margin-top: 6px; padding: 12px 14px; border-radius: 12px;
  animation: rise 0.4s ease both;
}
.rb-ok { background: linear-gradient(90deg, rgba(22,163,74,0.16), rgba(22,163,74,0.05)); border: 1px solid rgba(22,163,74,0.35); }
.rb-bad { background: linear-gradient(90deg, rgba(220,38,38,0.14), rgba(220,38,38,0.04)); border: 1px solid rgba(220,38,38,0.3); }
.rb-big { font-size: 16px; font-weight: 800; }
.rb-ok .rb-big { color: #15803d; }
.rb-bad .rb-big { color: #dc2626; }
.rb-ans { font-size: 13px; color: #475569; }
@keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.analysis { margin-top: 10px; font-size: 13px; line-height: 1.7; color: #64748b; }
.waiting-tip { margin-top: 10px; font-size: 13px; color: #64748b; }

/* ===== 等待开题 ===== */
.wait-panel { text-align: center; padding: 34px 16px; }
.vs-title { font-size: 18px; font-weight: 800; letter-spacing: 2px; color: #312e81; }
.muted2 { color: #6b7280; font-size: 13px; margin-top: 10px; }
.dots { margin-top: 14px; display: flex; flex-direction: row; justify-content: center; gap: 8px; }
.dots text { font-size: 10px; color: #2f6bff; animation: blink 1.2s ease-in-out infinite; }
.d2 { animation-delay: 0.2s !important; }
.d3 { animation-delay: 0.4s !important; }
@keyframes blink { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }

/* ===== 实时榜 ===== */
.lb-title { font-weight: 700; margin-bottom: 12px; color: #b45309; }
.lb-row {
  display: flex; flex-direction: row; align-items: center; gap: 10px;
  padding: 7px 0; animation: rise 0.4s ease both;
}
.lb-rank { width: 34px; font-size: 16px; text-align: center; font-weight: 700; color: #6b7280; }
.lb-rank.r1, .lb-rank.r2, .lb-rank.r3 { font-size: 20px; }
.lb-main { flex: 1; }
.lb-name { font-size: 13px; color: #334155; margin-bottom: 4px; }
.lb-bar { height: 6px; border-radius: 3px; background: #e8ecf4; overflow: hidden; }
.lb-fill { height: 6px; border-radius: 3px; background: linear-gradient(90deg, #2f6bff, #7c3aed); box-shadow: 0 0 8px rgba(124,58,237,0.35); transition: width 0.6s ease; }
.lb-score { font-size: 16px; font-weight: 800; color: #b45309; font-family: 'Inter Tight', -apple-system, sans-serif; }
.lb-sub { font-size: 11px; font-weight: 400; color: #6b7280; }

/* ===== 房主底部操作 ===== */
.footer {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 3;
  display: flex; flex-direction: row; gap: 12px;
  padding: 12px 16px 26px;
  background: linear-gradient(180deg, rgba(247,249,255,0) 0%, rgba(247,249,255,0.96) 40%);
}
.btn-neon {
  flex: 1; height: 48px; line-height: 48px; text-align: center;
  border-radius: 12px; font-size: 15px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, #2f6bff, #7c3aed);
  box-shadow: 0 6px 18px rgba(124,58,237,0.32);
}
.btn-neon:active { transform: scale(0.97); }
.btn-ghost {
  flex: 1; height: 48px; line-height: 48px; text-align: center;
  border-radius: 12px; font-size: 14px; color: #4f46e5;
  background: #ffffff;
  border: 1px solid #dfe5f0;
}

/* ===== 答对闪光特效 ===== */
.flash {
  position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 2; pointer-events: none;
  background: radial-gradient(circle at 50% 60%, rgba(74,222,128,0.35) 0%, rgba(74,222,128,0) 60%);
  animation: fade 0.9s ease both;
}
@keyframes fade { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }

/* ===== 结算弹层 ===== */
.overlay {
  position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 9;
  background: rgba(17, 24, 39, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.result-card {
  width: 100%; max-width: 360px; max-height: 80vh; overflow-y: auto;
  border-radius: 20px; padding: 22px 18px; text-align: center;
  background: #ffffff;
  border: 1px solid #f0dfba;
  box-shadow: 0 18px 50px rgba(17,24,39,0.18);
  animation: pop 0.35s ease both;
}
.trophy { font-size: 44px; animation: trophy 1.4s ease-in-out infinite; }
@keyframes trophy { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-6px) rotate(4deg); } }
.result-title { font-size: 18px; font-weight: 800; margin: 8px 0 14px; color: #b45309; letter-spacing: 2px; }
.res-row {
  display: flex; flex-direction: row; align-items: center; gap: 10px;
  padding: 10px 12px; margin-bottom: 8px; border-radius: 12px;
  background: #f7f9fd;
  animation: rise 0.45s ease both;
  text-align: left;
}
.res-row.me { border: 1px solid rgba(47,107,255,0.5); background: rgba(47,107,255,0.08); }
.res-rank { width: 30px; font-size: 18px; text-align: center; }
.res-name { flex: 1; font-size: 14px; font-weight: 600; color: #1f2937; }
.res-score { font-size: 13px; color: #64748b; }
</style>
