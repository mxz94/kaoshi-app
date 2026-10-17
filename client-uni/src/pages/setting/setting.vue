<template>
  <view class="page">
    <view class="card">
      <view style="font-weight:600; margin-bottom:12px;">每日目标</view>
      <view class="row" style="gap:10px;">
        <text
          v-for="n in [20, 30, 50, 100]" :key="n"
          class="chip" :class="{ 'chip-on': form.dailyGoal === n }"
          @tap="form.dailyGoal = n"
        >{{ n }} 题</text>
      </view>
    </view>

    <view class="card" style="padding:4px 16px;">
      <view class="menu-row">
        <view style="flex:1;">
          <view>题目乱序</view>
          <view class="muted">打乱题库原顺序刷题</view>
        </view>
        <switch :checked="form.shuffleQuestions" color="#2F6BFF" @change="(e) => (form.shuffleQuestions = e.detail.value)" />
      </view>
      <view class="menu-row">
        <view style="flex:1;">
          <view>答对后自动下一题</view>
          <view class="muted">答错时停留看解析，不自动跳走</view>
        </view>
        <switch :checked="form.autoNextQuestion" color="#2F6BFF" @change="(e) => (form.autoNextQuestion = e.detail.value)" />
      </view>
    </view>

    <!-- 关于 / 备案 / 协议（小程序与 Web 上架均要求备案号与协议可访问） -->
    <view class="card" style="padding:4px 16px;">
      <view class="menu-row" @tap="openAgreement('terms')">
        <view style="flex:1;">用户协议</view>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
      <view class="menu-row" @tap="openAgreement('privacy')">
        <view style="flex:1;">隐私政策</view>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
      <view class="menu-row" v-if="contact" @tap="copyContact">
        <view style="flex:1;">
          <view>联系我们</view>
          <view class="muted">{{ contact }}</view>
        </view>
        <text class="muted" style="font-size:13px;">复制</text>
      </view>
      <view class="menu-row" @tap="clearLocal">
        <view style="flex:1;">
          <view style="color:#dc2626;">清除本地数据</view>
          <view class="muted">清空本机昵称与偏好设置（不影响服务端记录）</view>
        </view>
        <text class="muted" style="font-size:16px;">›</text>
      </view>
    </view>

    <view class="card">
      <view class="muted" style="font-size:12px; line-height:1.8;">
        <view>备案号：{{ icp }}</view>
        <view>版本：1.0.0</view>
      </view>
    </view>

    <view style="margin:0 16px;">
      <view class="btn-primary" @tap="save">保存设置</view>
    </view>
  </view>
</template>

<script setup>
import { reactive } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getSettings, saveSettings } from '../../utils/settings.js'
import { getIdentity, setIdentity } from '../../utils/identity.js'
import { SITE } from '../../utils/site.js'

const form = reactive(getSettings())

// 统一取自 site.js（那里是备案信息唯一来源，改一处全局生效）
const icp = SITE.icp
const contact = SITE.contact

function goAbout() { uni.navigateTo({ url: '/pages/about/about' }) }

function openAgreement(type) {
  uni.navigateTo({ url: `/pages/agreement/agreement?type=${type}` })
}

function copyContact() {
  uni.setClipboardData({
    data: contact,
    success: () => uni.showToast({ title: '已复制', icon: 'success' }),
  })
}

// 隐私政策承诺「可在设置页清除本地数据」，故必须真实可用
function clearLocal() {
  uni.showModal({
    title: '清除本地数据',
    content: '将清空本机昵称与偏好设置。学习记录归属凭证会保留（否则服务端记录会变成无人认领），确定继续？',
    confirmColor: '#dc2626',
    success: (res) => {
      if (!res.confirm) return
      // 保留 userKey：它是服务端数据的归属凭证，清掉等于永久丢数据
      const keep = getIdentity()
      uni.clearStorageSync()
      if (keep && keep.userKey) setIdentity({ userKey: keep.userKey, remember: false, ts: Date.now() })
      uni.showToast({ title: '已清除', icon: 'success' })
      setTimeout(() => uni.reLaunch({ url: '/pages/login/login' }), 800)
    },
  })
}

function save() {
  saveSettings({ ...form })
  uni.showToast({ title: '已保存', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 600)
}

onLoad(() => { Object.assign(form, getSettings()) })
</script>

<style scoped>
.page { padding-top: 16px; }
.chip { font-size: 13px; color: #4338ca; background: #f2f4fa; border-radius: 16px; padding: 6px 14px; }
.chip-on { background: linear-gradient(135deg, #2f6bff, #7c3aed); color: #fff; }
.menu-row { display: flex; flex-direction: row; align-items: center; gap: 12px; padding: 14px 0; }
</style>
