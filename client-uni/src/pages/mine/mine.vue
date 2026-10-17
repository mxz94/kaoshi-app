<template>
  <view class="page">
    <!-- ProfileCard：渐变头 -->
    <view class="profile">
      <image v-if="avatarUrl" class="avatar-img" :src="avatarUrl" mode="aspectFill" />
      <view v-else class="avatar"><text>{{ avatarChar }}</text></view>
      <view style="margin-left:14px; flex:1;">
        <view class="nickname">{{ nickname || (bound ? '微信用户' : '游客模式') }}</view>
        <view class="profile-sub" @tap="profileTap">
          <template v-if="bound">☁ {{ syncText }}</template>
          <template v-else>微信登录 · 多端同步刷题记录 ›</template>
        </view>
      </view>
    </view>

    <!-- 云端同步状态卡（仅微信登录后展示） -->
    <view v-if="bound" class="card row" style="justify-content:space-between; margin-top:-28px;">
      <view class="stat3">
        <view class="stat3-num brand">☁</view>
        <view class="muted">云端同步</view>
      </view>
      <view class="stat3">
        <view class="stat3-num" style="font-size:15px;">{{ nickname || '微信用户' }}</view>
        <view class="muted">账号昵称</view>
      </view>
      <view class="stat3">
        <view class="stat3-num good">✓</view>
        <view class="muted">多端通用</view>
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
import { getIdentity, clearIdentity, displayName, isWechatBound, setWxOpenid, clearWxOpenid } from '../../utils/identity.js'
import { SITE } from '../../utils/site.js'

const nickname = ref('')
const shortId = ref('')
const avatarUrl = ref('')
const bound = ref(false)
const syncText = ref('')
const me = ref({ found: false })

const avatarChar = computed(() => (nickname.value ? nickname.value.slice(0, 1) : '微'))
const winRate = computed(() => {
  if (!me.value.found || !me.value.player.games) return '—'
  return Math.round((me.value.player.wins / me.value.player.games) * 100) + '%'
})

async function refresh() {
  const id = getIdentity()
  shortId.value = id ? (id.userKey || id.id).slice(0, 8) : ''
  bound.value = isWechatBound()
  if (bound.value) {
    // 已微信登录：拉取账号资料
    try {
      const p = await api.profileGet()
      nickname.value = p.nickName || '微信用户'
      avatarUrl.value = p.avatarUrl || ''
    } catch (e) {
      nickname.value = '微信用户'
      avatarUrl.value = ''
    }
    syncText.value = '已同步到微信账号 · 多端通用'
    me.value = { found: false }
  } else {
    nickname.value = displayName()
    avatarUrl.value = ''
    syncText.value = ''
    // #ifdef H5
    if (nickname.value) {
      try { me.value = await api.arenaPlayer(nickname.value) } catch (e) { me.value = { found: false } }
    } else { me.value = { found: false } }
    // #endif
    // #ifndef H5
    me.value = { found: false }
    // #endif
  }
}

// 点击头像/昵称区：已登录→改昵称；未登录→触发微信登录
function profileTap() {
  if (bound.value) editProfile()
  else doLogin()
}

// 手动微信登录（小程序端；H5 提示去小程序）
async function doLogin() {
  // #ifndef MP-WEIXIN
  uni.showToast({ title: '请在小程序端微信登录', icon: 'none' })
  return
  // #endif
  uni.showLoading({ title: '登录中' })
  try {
    const { code } = await new Promise((resolve, reject) =>
      uni.login({ provider: 'weixin', success: resolve, fail: reject })
    )
    if (!code) throw new Error('未获取到登录 code')
    const r = await api.wechatLogin(code)
    const before = getIdentity()
    if (before && before.userKey && !before.userKey.startsWith('wx:') && before.userKey !== 'anonymous') {
      try { await api.bind({ fromKey: before.userKey, toKey: 'wx:' + r.openid }) } catch (e) { /* 合并失败不阻塞 */ }
    }
    setWxOpenid(r.openid)
    await refresh()
    uni.showToast({ title: '微信登录成功', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: e.message || '登录失败', icon: 'none' })
  } finally {
    uni.hideLoading()
  }
}

// 编辑昵称（头像用微信昵称体系，暂以首字展示，避免服务端图片托管）
function editProfile() {
  uni.showModal({
    title: '设置昵称',
    editable: true,
    placeholderText: '请输入昵称',
    content: nickname.value === '微信用户' ? '' : nickname.value,
    success: async (r) => {
      if (!r.confirm) return
      const name = (r.content || '').trim()
      if (!name) { uni.showToast({ title: '昵称不能为空', icon: 'none' }); return }
      try {
        await api.profileSave(name, avatarUrl.value)
        nickname.value = name
        uni.showToast({ title: '已保存', icon: 'success' })
      } catch (e) {
        uni.showToast({ title: e.message || '保存失败', icon: 'none' })
      }
    },
  })
}

function goWrong() { uni.navigateTo({ url: '/pages/wrong/wrong' }) }
function goFavorite() { uni.navigateTo({ url: '/pages/favorite/favorite' }) }
function goBanks() { uni.switchTab({ url: '/pages/banks/banks' }) }
function goSetting() { uni.navigateTo({ url: '/pages/setting/setting' }) }
function goMigrate() { uni.navigateTo({ url: '/pages/migrate/migrate' }) }
function goAbout() { uni.navigateTo({ url: '/pages/about/about' }) }

function logout() {
  const isBound = isWechatBound()
  uni.showModal({
    title: isBound ? '退出微信登录' : '退出登录',
    content: isBound
      ? '退出后本机切换回游客模式，刷题记录仍安全保存在微信账号下，重新登录即可恢复并多端同步。'
      : '清除本机身份并重新初始化？之后本机数据会从零计起，建议先到「数据迁移」生成迁移码。',
    success: (r) => {
      if (!r.confirm) return
      if (isBound) clearWxOpenid()
      else clearIdentity()
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
.avatar-img {
  width: 64px; height: 64px; border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.18);
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
