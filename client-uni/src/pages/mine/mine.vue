<template>
  <view class="page">
    <!-- ProfileCard：渐变头 -->
    <view class="profile">
      <view class="avatar"><text>{{ avatarChar }}</text></view>
      <view style="margin-left:14px;">
        <view class="nickname">{{ nickname || '未设置昵称' }}</view>
        <view class="profile-sub" @tap="goLogin">
          ID: {{ shortId }}<template v-if="!nickname"> · 点这里设置昵称</template><template v-else> · 编辑资料</template>
        </view>
      </view>
    </view>

    <!-- 竞技三卡（仅 H5：小程序端无竞技场，个人主体合规剔除） -->
    <!-- #ifdef H5 -->
    <view class="card row" style="justify-content:space-between; margin-top:-28px;">
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
    <!-- #endif -->

    <!-- 菜单 -->
    <view class="card" style="padding:4px 16px;">
      <view class="menu-row" @tap="goWrong">
        <view class="menu-icon" style="background:rgba(220,38,38,0.1); color:#dc2626;">✗</view>
        <text style="flex:1;">错题本</text>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
      <view class="menu-row" @tap="goFavorite">
        <view class="menu-icon" style="background:rgba(217,119,6,0.12); color:#d97706;">★</view>
        <text style="flex:1;">我的收藏</text>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
      <view class="menu-row" @tap="goBanks">
        <view class="menu-icon" style="background:rgba(47,107,255,0.1); color:#2563eb;">▤</view>
        <text style="flex:1;">我的题库</text>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
      <view class="menu-row" @tap="goSetting">
        <view class="menu-icon" style="background:#f2f4fa; color:#6b7280;">⚙</view>
        <text style="flex:1;">设置</text>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
      <view class="menu-row" @tap="goMigrate">
        <view class="menu-icon" style="background:rgba(47,107,255,0.1); color:#2563eb;">⇄</view>
        <text style="flex:1;">数据迁移</text>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
    </view>

    <!-- 退出登录 -->
    <view class="card" style="text-align:center; padding:14px;" @tap="logout">
      <text class="bad" style="font-weight:500;">退出登录</text>
    </view>

    <!-- 备案号 footer：点击进备案信息页（上架要求备案号可访问） -->
    <view class="footer muted" @tap="goAbout">{{ SITE.appName }} · {{ SITE.icp }}</view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import api from '../../utils/api.js'
import { getIdentity, clearIdentity, displayName } from '../../utils/identity.js'
import { SITE } from '../../utils/site.js'

const nickname = ref('')
const shortId = ref('')
const me = ref({ found: false })

const avatarChar = computed(() => (nickname.value ? nickname.value.slice(0, 1) : '客'))
const winRate = computed(() => {
  if (!me.value.found || !me.value.player.games) return '—'
  return Math.round((me.value.player.wins / me.value.player.games) * 100) + '%'
})

async function refresh() {
  const id = getIdentity()
  shortId.value = id ? (id.userKey || id.id).slice(0, 8) : ''
  nickname.value = displayName()
  if (!nickname.value) { me.value = { found: false }; return }
  // #ifdef H5
  try {
    me.value = await api.arenaPlayer(nickname.value)
  } catch (e) {
    me.value = { found: false }
  }
  // #endif
  // #ifndef H5
  me.value = { found: false }
  // #endif
}

function goLogin() { uni.navigateTo({ url: '/pages/login/login' }) }
function goWrong() { uni.navigateTo({ url: '/pages/wrong/wrong' }) }
function goFavorite() { uni.navigateTo({ url: '/pages/favorite/favorite' }) }
function goBanks() { uni.switchTab({ url: '/pages/banks/banks' }) }
function goSetting() { uni.navigateTo({ url: '/pages/setting/setting' }) }
function goMigrate() { uni.navigateTo({ url: '/pages/migrate/migrate' }) }
function goAbout() { uni.navigateTo({ url: '/pages/about/about' }) }

function logout() {
  uni.showModal({
    title: '退出登录',
    content: '清除本机身份并重新初始化？之后本机数据会从零计起，建议先到「数据迁移」生成迁移码。',
    success: (r) => {
      if (!r.confirm) return
      clearIdentity()
      uni.reLaunch({ url: '/pages/index/index' })
    },
  })
}

onShow(refresh)
</script>

<style scoped>
.profile {
  background: linear-gradient(135deg, #2f6bff 0%, #7c3aed 100%);
  height: 148px;
  padding: 0 16px;
  display: flex;
  align-items: center;
}
.avatar {
  width: 64px; height: 64px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.18); border: 1px solid rgba(255, 255, 255, 0.35);
  text-align: center; line-height: 62px;
}
.avatar text { font-size: 24px; font-weight: 700; color: #fff; }
.nickname { color: #fff; font-size: 20px; font-weight: 700; }
.profile-sub { color: rgba(255, 255, 255, 0.85); font-size: 12px; margin-top: 4px; }
.stat3 { flex: 1; text-align: center; }
.stat3-num { font-size: 24px; font-weight: 700; }
.menu-row {
  display: flex; flex-direction: row; align-items: center;
  gap: 12px; height: 54px;
}
.menu-icon {
  width: 32px; height: 32px; border-radius: 8px;
  text-align: center; line-height: 32px; font-weight: 700;
}
.footer { text-align: center; font-size: 11px; color: #6b7280; padding: 18px 0 24px; }
</style>
