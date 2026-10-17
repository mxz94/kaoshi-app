<template>
  <view class="page">
    <view class="card" style="text-align:center; padding:28px 16px;">
      <view style="font-weight:700; font-size:20px;">{{ SITE.appName }}</view>
      <view class="muted" style="margin-top:6px;">版本 {{ SITE.version }}</view>
    </view>

    <view class="card" style="padding:4px 16px;">
      <!-- 点击 ICP 号：复制 + 提示去工信部查验 -->
      <view class="menu-row" @tap="copy(SITE.icp)">
        <view style="flex:1;">
          <view>ICP 备案号</view>
          <view class="muted" style="font-size:12px;">点击复制 · 可在工信部备案系统查验</view>
        </view>
        <text class="brand" style="font-size:12px;">{{ SITE.icp }}</text>
      </view>
      <view class="menu-row" v-if="SITE.gongan" @tap="copy(SITE.gongan)">
        <view style="flex:1;">
          <view>公安备案号</view>
          <view class="muted" style="font-size:12px;">点击复制</view>
        </view>
        <text class="muted" style="font-size:12px;">{{ SITE.gongan }}</text>
      </view>
      <view class="menu-row" v-if="SITE.organizer">
        <view style="flex:1;">
          <view>主办单位</view>
          <view class="muted" style="font-size:12px;">{{ SITE.organizer }}</view>
        </view>
      </view>
      <view class="menu-row" v-if="SITE.contact" @tap="copy(SITE.contact)">
        <view style="flex:1;">
          <view>联系我们</view>
          <view class="muted" style="font-size:12px;">点击复制</view>
        </view>
        <text class="muted" style="font-size:12px;">{{ SITE.contact }}</text>
      </view>
    </view>

    <view class="card">
      <view class="muted body">
        本应用为个人开发的学习工具，题目均为模拟练习题，仅供学习交流使用，不代表任何官方考试机构立场。
      </view>
      <view class="muted body" style="margin-top:10px;">
        隐私政策与用户协议可在「我的 - 设置」中查看。我们仅在为记录学习进度所必需的范围内收集昵称与做题数据。
      </view>
    </view>

    <view style="height:24px;"></view>
  </view>
</template>

<script setup>
import { SITE } from '../../utils/site.js'

function copy(text) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制', icon: 'success' }),
  })
}
</script>

<style scoped>
.page { padding-top: 16px; }
.menu-row { display: flex; flex-direction: row; align-items: center; gap: 12px; padding: 14px 0; }
.brand { color: #2563eb; }
.body { font-size: 13px; line-height: 1.8; }
</style>
