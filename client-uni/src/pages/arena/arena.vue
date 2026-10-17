<template>
  <view class="page">
    <!-- 未设置昵称：同屏内联引导（零摩擦身份流程③） -->
    <view v-if="!nickname" class="card">
      <view style="font-weight:700; font-size:17px;">先给自己起个名字</view>
      <view class="muted" style="margin:6px 0 14px;">竞技场战绩都记在这个名字下，之后可在「我的」里修改</view>
      <input v-model="nicknameInput" class="input" placeholder="如：考生#1234" placeholder-style="color:#9ca3af" maxlength="20" />
      <view class="btn-primary" style="margin-top:14px;" @tap="saveNickname">开始</view>
    </view>

    <template v-else>
      <!-- 我的战绩 -->
      <view class="card row" style="justify-content:space-between; padding:16px;">
        <view class="stat3">
          <view class="stat3-num">{{ me.found ? me.player.games : '—' }}</view>
          <view class="muted">场次</view>
        </view>
        <view class="stat3">
          <view class="stat3-num good">{{ winRate }}</view>
          <view class="muted">胜率</view>
        </view>
        <view class="stat3">
          <view class="stat3-num gold">{{ me.found ? me.player.total_score : '—' }}</view>
          <view class="muted">积分</view>
        </view>
      </view>

      <!-- 玩法入口 -->
      <view class="card" @tap="createRoom">
        <view class="spread">
          <view>
            <view style="font-weight:600;">1v1 对战</view>
            <view class="muted">创建房间，把房间号发给好友即刻开战</view>
          </view>
          <text class="muted" style="font-size:18px;">›</text>
        </view>
      </view>

      <view class="card" @tap="showJoin = true">
        <view class="spread">
          <view>
            <view style="font-weight:600;">输入房间号加入</view>
            <view class="muted">好友已建房？输入房间号直接加入</view>
          </view>
          <text class="muted" style="font-size:18px;">›</text>
        </view>
      </view>

      <!-- 加入房间：内联输入（uni.showModal 的 editable 在 H5 不可靠，故用内联） -->
      <view v-if="showJoin" class="card">
        <view class="muted" style="margin-bottom:8px;">输入好友给你的房间号</view>
        <input v-model="roomInput" class="input" placeholder="如：R7K2M" placeholder-style="color:#9ca3af" maxlength="20" />
        <view class="row" style="margin-top:12px;">
          <view class="btn-plain" style="flex:1;" @tap="showJoin = false">取消</view>
          <view style="width:12px;"></view>
          <view class="btn-primary" style="flex:1;" @tap="joinRoom">加入</view>
        </view>
      </view>

      <view class="card" @tap="douyinRoom">
        <view class="spread">
          <view>
            <view style="font-weight:600;">抖音直播局</view>
            <view class="muted">主播开房，观众发弹幕答题（自动开题·可配置）</view>
          </view>
          <text class="muted" style="font-size:18px;">›</text>
        </view>
      </view>
    </template>

    <!-- 抖音直播局：配置 + 接入指引 面板 -->
    <view v-if="showDouyinPanel" class="overlay" @tap.self="showDouyinPanel = false">
      <view class="sheet">
        <view class="sheet-head">
          <text style="font-weight:700; font-size:17px;">抖音直播局</text>
          <text class="x" @tap="showDouyinPanel = false">✕</text>
        </view>

        <view class="field">
          <view class="field-label">题库</view>
          <view class="field-val">{{ douyinBankName }}</view>
        </view>

        <view class="section-title">对局配置</view>
        <view class="row-between">
          <view>每题作答（秒）</view>
          <input type="number" v-model="douyinConfig.durationSec" class="num-input" />
        </view>
        <view class="row-between">
          <view>题间间隔（秒）</view>
          <input type="number" v-model="douyinConfig.gapSec" class="num-input" />
        </view>
        <view class="row-between">
          <view>总题数（0=不限）</view>
          <input type="number" v-model="douyinConfig.roundsTotal" class="num-input" />
        </view>
        <view class="row-between">
          <view>自动连题</view>
          <view class="toggle" :class="{ on: douyinConfig.autoContinue }" @tap="douyinConfig.autoContinue = !douyinConfig.autoContinue"><view class="knob" /></view>
        </view>
        <view class="row-between">
          <view>答题中隐藏排行榜</view>
          <view class="toggle" :class="{ on: douyinConfig.hideRankDuringPlay }" @tap="douyinConfig.hideRankDuringPlay = !douyinConfig.hideRankDuringPlay"><view class="knob" /></view>
        </view>
        <view class="row-between">
          <view>选项乱序</view>
          <view class="toggle" :class="{ on: douyinConfig.shuffleOptions }" @tap="douyinConfig.shuffleOptions = !douyinConfig.shuffleOptions"><view class="knob" /></view>
        </view>
        <view class="row-between">
          <view>显示他人答案分布</view>
          <view class="toggle" :class="{ on: douyinConfig.showOthersAnswers }" @tap="douyinConfig.showOthersAnswers = !douyinConfig.showOthersAnswers"><view class="knob" /></view>
        </view>
        <view class="row-between">
          <view>答完揭晓答案</view>
          <view class="chips">
            <view class="chip" :class="{ on: douyinConfig.revealCorrect === 'roundEnd' }" @tap="douyinConfig.revealCorrect = 'roundEnd'">每题结束</view>
            <view class="chip" :class="{ on: douyinConfig.revealCorrect === 'never' }" @tap="douyinConfig.revealCorrect = 'never'">永不</view>
          </view>
        </view>

        <view class="section-title">接入指引</view>
        <view class="guide-room">房间号：<text class="mono">{{ douyinRoomId }}</text><text class="copy" @tap="copyText(douyinRoomId)">复制</text></view>

        <view class="guide-cmd">① 测试链路（无需抖音，模拟弹幕）</view>
        <view class="code">{{ douyinLinkDemo }}<text class="copy" @tap="copyText(douyinLinkDemo)">复制</text></view>
        <view class="guide-cmd">② 真实直播间接弹幕</view>
        <view class="code">{{ douyinLinkLive }}<text class="copy" @tap="copyText(douyinLinkLive)">复制</text></view>
        <view class="guide-tip">真实抓取建议加 <text class="mono">--cookie</text>（用独立小号），降低主号关联风险。</view>
        <view class="guide-tip">在 <text class="mono">kaoshi-app</text> 目录运行；需同级 <text class="mono">douyin-bridge</text> 仓库与 Git Bash。脚本会同时拉起弹幕桥与转发客户端，观众在抖音发弹幕 A/B/C/D 即自动答题，大屏实时出榜、自动连题。</view>
        <view class="guide-tip">异地 / 服务器跑时，命令前加前缀 <text class="mono">ARENA=https://kaoshi.malanxi.top/api/arena/ingest </text></view>

        <view class="section-title">手动部署（自行装好 Python+Playwright 与 Node）</view>
        <view class="guide-cmd">先起弹幕桥：<text class="mono">python douyin_bridge.py --room {{ douyinRoomId }}</text></view>
        <view class="guide-cmd">再起转发：</view>
        <view class="code">{{ douyinManual }}<text class="copy" @tap="copyText(douyinManual)">复制</text></view>

        <view class="section-title">直播合规（防封号）</view>
        <view class="guide-tip">① 主播需真人出镜、持续讲题互动；不要长时间挂静态画面（抖音严打录播/挂机）。</view>
        <view class="guide-tip">② 全程不要口播或展示 App 名称/网址/二维码/粉丝群（站外引流＝直播中断）。</view>
        <view class="guide-tip">③ 不做红包/返现/奖品等物质奖励（诱导互动＝限流）。</view>
        <view class="guide-tip">④ 题库避免政治/医疗/投资等敏感题材。</view>
        <view class="guide-tip">⑤ 弹幕抓取建议用<text class="mono">独立小号</text>，不要用主播主号。</view>

        <view class="btn-primary" style="margin-top:18px;" @tap="startDouyinRoom">开始直播局（自动开题）</view>
      </view>
    </view>

    <view style="height:24px;"></view>
  </view>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import api from '../../utils/api.js'
import { getIdentity, setIdentity, displayName } from '../../utils/identity.js'
import { reasonText } from '../../utils/site.js'

const nickname = ref('')
const nicknameInput = ref('')
const me = ref({ found: false })

const winRate = computed(() => {
  if (!me.value.found || !me.value.player.games) return '—'
  return Math.round((me.value.player.wins / me.value.player.games) * 100) + '%'
})

async function refresh() {
  nickname.value = displayName()
  nicknameInput.value = ''
  if (!nickname.value) return
  try {
    me.value = await api.arenaPlayer(nickname.value)
  } catch (e) {
    me.value = { found: false }
  }
}

function saveNickname() {
  const v = (nicknameInput.value || '').trim()
  if (!v) return uni.showToast({ title: '先填个昵称吧', icon: 'none' })
  const id = getIdentity() || {}
  setIdentity({ ...id, nickname: v })
  refresh()
}

const showJoin = ref(false)
const roomInput = ref('')

/** 生成 5 位房间号 */
function genRoomId() {
  return 'R' + Math.random().toString(36).slice(2, 7).toUpperCase()
}

/** 进房前的公共动作：开局 + 跳转对战页
 *  opts: { syncMode, autoStart, config }
 */
async function enterRoom(roomId, isHost, bankId, opts = {}) {
  try {
    await api.arenaStart({
      roomId,
      bankId: bankId || null,
      autoStart: !!opts.autoStart,
      syncMode: opts.syncMode || 'wait-all',
      config: opts.config || {},
    })
  } catch (e) {
    return uni.showToast({ title: '开局失败：' + e.message, icon: 'none' })
  }
  uni.navigateTo({
    url: `/pages/arena-room/arena-room?roomId=${encodeURIComponent(roomId)}&host=${isHost ? 1 : 0}` +
         (bankId ? `&bankId=${bankId}` : ''),
  })
}

/** 创建房间：选题库 → 开局 → 以房主身份进入 */
async function createRoom() {
  let banks = []
  try { banks = await api.banks() } catch (e) { banks = [] }
  if (!banks.length) return uni.showToast({ title: '先去添加一个题库吧', icon: 'none' })

  uni.showActionSheet({
    itemList: banks.map((b) => b.name),
    success: (res) => {
      const bank = banks[res.tapIndex]
      // 选同步模式：等齐揭晓 / 自由节奏
      uni.showActionSheet({
        itemList: ['等齐揭晓（双方都答完才出答案）', '自由节奏（答完就看，不等对方）'],
        success: (m) => {
          enterRoom(genRoomId(), true, bank.id, { syncMode: m.tapIndex === 1 ? 'free' : 'wait-all' })
        },
        fail: () => {},
      })
    },
    fail: () => {},
  })
}

// —— 抖音直播局：选库 → 配置面板（预填推荐值）+ 接入指引 → 自动开题 ——
const showDouyinPanel = ref(false)
const douyinBankName = ref('')
const douyinBankId = ref(null)
const douyinRoomId = ref('')

// 抖音直播局推荐配置（主播开房、弹幕答题、自动连题）
const douyinConfig = reactive({
  durationSec: 25,          // 每题作答秒数
  gapSec: 5,                // 题间间隔秒数
  roundsTotal: 10,          // 总题数（0 = 不限）
  autoContinue: true,       // 自动连题
  hideRankDuringPlay: true, // 答题中隐藏排行榜（防抄榜）
  revealCorrect: 'roundEnd',// 每题结束揭晓 / never 永不
  shuffleOptions: false,    // 选项乱序
  showOthersAnswers: false, // 显示他人答案分布
})

// 接入指引命令（房间号已内联，复制即可跑）
const douyinLinkDemo = computed(() => `bash tools/start-douyin-link.sh ${douyinRoomId.value} --demo`)
const douyinLinkLive = computed(() => `bash tools/start-douyin-link.sh ${douyinRoomId.value} <直播间URL>`)
const douyinManual = computed(
  () =>
    `node arena-bridge-client.js --bridge ws://127.0.0.1:9001/ws/${douyinRoomId.value} ` +
    `--arena https://kaoshi.malanxi.top/api/arena/ingest --room ${douyinRoomId.value}`
)

async function douyinRoom() {
  let banks = []
  try { banks = await api.banks() } catch (e) { banks = [] }
  if (!banks.length) return uni.showToast({ title: '先去添加一个题库吧', icon: 'none' })
  uni.showActionSheet({
    itemList: banks.map((b) => b.name),
    success: (res) => {
      const bank = banks[res.tapIndex]
      douyinBankName.value = bank.name
      douyinBankId.value = bank.id
      douyinRoomId.value = genRoomId()
      showDouyinPanel.value = true
    },
    fail: () => {},
  })
}

function copyText(text) {
  uni.setClipboardData({
    data: String(text),
    success: () => uni.showToast({ title: '已复制', icon: 'none' }),
  })
}

async function startDouyinRoom() {
  const cfg = {
    durationSec: Number(douyinConfig.durationSec) || 25,
    gapSec: Number(douyinConfig.gapSec) || 5,
    roundsTotal: Number(douyinConfig.roundsTotal) > 0 ? Number(douyinConfig.roundsTotal) : null,
    autoContinue: !!douyinConfig.autoContinue,
    hideRankDuringPlay: !!douyinConfig.hideRankDuringPlay,
    revealCorrect: douyinConfig.revealCorrect === 'never' ? 'never' : 'roundEnd',
    shuffleOptions: !!douyinConfig.shuffleOptions,
    showOthersAnswers: !!douyinConfig.showOthersAnswers,
  }
  showDouyinPanel.value = false
  // 后端 session/start 已支持 autoStart + config 合并（无需改后端）
  await enterRoom(douyinRoomId.value, true, douyinBankId.value, { autoStart: true, config: cfg })
}

/** 加入房间 */
async function joinRoom() {
  const rid = (roomInput.value || '').trim()
  if (!rid) return uni.showToast({ title: '先填房间号', icon: 'none' })
  showJoin.value = false
  roomInput.value = ''
  // 参与者不重新开局（房主已开），直接进对战页
  uni.navigateTo({ url: `/pages/arena-room/arena-room?roomId=${encodeURIComponent(rid)}&host=0` })
}

onShow(refresh)
</script>

<style scoped>
.input {
  background: #f2f4fa; border: 1px solid #dbe1ee;
  color: #1f2937; border-radius: 10px; height: 46px; padding: 0 14px; font-size: 15px;
}
.stat3 { flex: 1; text-align: center; }
.stat3-num { font-size: 24px; font-weight: 700; }

/* 抖音直播局面板 */
.overlay {
  position: fixed; inset: 0; background: rgba(17,24,39,0.45);
  display: flex; align-items: flex-end; justify-content: center; z-index: 50;
}
.sheet {
  width: 100%; max-width: 480px; background: #ffffff; border-radius: 16px 16px 0 0;
  border-top: 1px solid #e9edf5;
  max-height: 88vh; overflow-y: auto; padding: 18px 18px 24px;
}
.sheet-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.x { font-size: 18px; color: #6b7280; padding: 4px 8px; }
.field { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #e8ecf4; }
.field-label { color: #4338ca; }
.field-val { color: #2563eb; font-weight: 600; }
.section-title { font-weight: 700; margin: 16px 0 6px; font-size: 15px; }
.row-between { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; }
.num-input { width: 84px; height: 38px; background: #f2f4fa; border: 1px solid #dbe1ee; color: #1f2937; border-radius: 8px; text-align: center; font-size: 15px; }
.toggle { width: 44px; height: 26px; border-radius: 13px; background: #dbe1ee; position: relative; transition: .2s; }
.toggle.on { background: linear-gradient(135deg, #2F6BFF, #7C3AED); }
.knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: .2s; }
.toggle.on .knob { left: 21px; }
.chips { display: flex; gap: 8px; }
.chip { padding: 6px 12px; border-radius: 18px; background: #f2f4fa; color: #4338ca; font-size: 13px; }
.chip.on { background: linear-gradient(135deg, #2F6BFF, #7C3AED); color: #fff; }
.guide-room { font-size: 14px; color: #4338ca; margin-bottom: 6px; }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; background: #e8ecf4; padding: 2px 6px; border-radius: 6px; color: #1f2937; font-size: 13px; }
.copy { color: #2563eb; font-size: 13px; margin-left: 10px; }
.guide-cmd { font-size: 13px; color: #6b7280; margin: 10px 0 4px; }
.code { background: #f5f7fb; color: #334155; border-radius: 8px; padding: 10px 12px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; word-break: break-all; position: relative; }
.code .copy { color: #2563eb; }
.guide-tip { font-size: 13px; color: #6b7280; margin: 8px 0 2px; line-height: 1.5; }
</style>
