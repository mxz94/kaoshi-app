<template>
  <view class="page">
    <!-- 说明 -->
    <view class="card">
      <view style="font-weight:600; margin-bottom:8px;">数据跟着设备走</view>
      <view class="muted" style="line-height:1.8;">
        本 App 免注册，刷题记录、错题本、统计都绑定在这台设备上。
        换手机 / 换浏览器 / 清缓存后，用「迁移码」把老数据搬过来即可。
      </view>
      <view class="muted" style="margin-top:10px;">当前设备 ID：{{ shortKey }}</view>
    </view>

    <!-- 旧设备：生成迁移码 -->
    <view class="card">
      <view style="font-weight:600; margin-bottom:8px;">① 老设备：生成迁移码</view>
      <view class="muted" style="margin-bottom:12px;">迁移码 24 小时内有效，只能使用一次。</view>
      <view v-if="code" class="code-box">
        <text class="code">{{ code }}</text>
        <text class="brand" style="font-size:13px; margin-left:10px;" @tap="copyCode">复制</text>
      </view>
      <view v-else class="btn-plain" @tap="genCode">生成迁移码</view>
      <view v-if="expiresAt" class="muted" style="margin-top:8px;">有效期至：{{ expiresAt }}</view>
    </view>

    <!-- 新设备：认领 -->
    <view class="card">
      <view style="font-weight:600; margin-bottom:8px;">② 新设备：输入迁移码</view>
      <input v-model="inputCode" class="input" placeholder="8 位迁移码" placeholder-style="color:#9ca3af" maxlength="8" />
      <view class="btn-primary" style="margin-top:12px;" :class="{ disabled: !inputCode.trim() }" @tap="claim">
        认领数据
      </view>
    </view>

    <!-- 认领升级前的历史数据 -->
    <view class="card" style="padding:4px 16px;">
      <view class="menu-row" @tap="claimLegacy">
        <view style="flex:1;">
          <view>认领升级前的历史数据</view>
          <view class="muted">把这设备早期（未做身份区分时）刷过的题归到当前名下</view>
        </view>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import api from '../../utils/api.js'
import { getUserKey } from '../../utils/identity.js'

const code = ref('')
const expiresAt = ref('')
const inputCode = ref('')

const shortKey = computed(() => getUserKey().slice(0, 8))

function fmt(d) {
  if (!d) return ''
  const s = String(d).replace('T', ' ').slice(0, 19)
  return s
}

async function genCode() {
  try {
    const r = await api.migrateCode()
    code.value = r.code
    expiresAt.value = fmt(r.expiresAt)
  } catch (e) {
    uni.showToast({ title: e.message || '生成失败', icon: 'none' })
  }
}

function copyCode() {
  uni.setClipboardData({ data: code.value, success: () => uni.showToast({ title: '已复制', icon: 'success' }) })
}

async function claim() {
  const c = (inputCode.value || '').trim().toUpperCase()
  if (!c) return uni.showToast({ title: '先输入迁移码', icon: 'none' })
  try {
    const r = await api.migrateClaim(c)
    uni.showModal({
      title: '迁移完成',
      content: `已搬入 ${r.records || 0} 条练习记录、${r.wrongs || 0} 条错题`,
      showCancel: false,
    })
    inputCode.value = ''
  } catch (e) {
    uni.showToast({ title: e.message || '认领失败', icon: 'none' })
  }
}

async function claimLegacy() {
  try {
    const r = await api.claimLegacy()
    uni.showModal({
      title: '已认领',
      content: `归入 ${r.records || 0} 条练习记录、${r.wrongs || 0} 条错题`,
      showCancel: false,
    })
  } catch (e) {
    uni.showToast({ title: e.message || '认领失败', icon: 'none' })
  }
}
</script>

<style scoped>
.page { padding-top: 16px; }
.input { background: #f2f4fa; border: 1px solid #dbe1ee; color: #1f2937; border-radius: 10px; height: 46px; padding: 0 14px; font-size: 15px; }
.code-box {
  background: rgba(47,107,255,0.1); border-radius: 10px; padding: 14px;
  display: flex; flex-direction: row; align-items: center;
}
.code { font-size: 22px; font-weight: 700; letter-spacing: 3px; color: #2563eb; }
.menu-row {
  display: flex; flex-direction: row; align-items: center;
  gap: 12px; min-height: 54px;
}
</style>
