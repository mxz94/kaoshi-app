<template>
  <view class="page">
    <view class="card" style="text-align:center; padding:32px 16px;">
      <view class="avatar-big">{{ (nickname || '客').slice(0, 1) }}</view>
      <view style="font-weight:700; font-size:18px; margin-top:12px;">设置你的昵称</view>
      <view class="muted" style="margin:6px 0 18px;">游客模式可用<!-- #ifdef H5 -->；竞技场战绩将记在这个名字下<!-- #endif --></view>

      <input v-model="nickname" class="input" placeholder="如：考生#1234" placeholder-style="color:#9ca3af" maxlength="20" />

      <!-- 协议勾选（上架合规必须） -->
      <view class="row" style="justify-content:center; gap:6px; margin:16px 0;">
        <view class="checkbox" :class="{ 'checkbox-on': agreed }" @tap="agreed = !agreed">
          <text v-if="agreed" style="color:#fff; font-size:12px;">✓</text>
        </view>
        <text class="muted">已阅读并同意</text>
        <text class="brand" style="font-size:12px;" @tap="openAgreement('terms')">《用户协议》</text>
        <text class="muted" style="font-size:12px;">和</text>
        <text class="brand" style="font-size:12px;" @tap="openAgreement('privacy')">《隐私政策》</text>
      </view>

      <view class="btn-primary" :class="{ disabled: !nickname.trim() || !agreed }" @tap="save">开始使用</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getIdentity, setIdentity, displayName } from '../../utils/identity.js'

const nickname = ref('')
const agreed = ref(false)

function openAgreement(type) {
  uni.navigateTo({ url: `/pages/agreement/agreement?type=${type}` })
}

async function save() {
  const v = (nickname.value || '').trim()
  if (!v) return uni.showToast({ title: '先填个昵称吧', icon: 'none' })
  if (!agreed.value) return uni.showToast({ title: '请先阅读并同意协议', icon: 'none' })
  // 内容安全：昵称提交前校验（服务不可用时放行，后端 ingest 会二次拦截）
  let sec = { ok: true }
  try { sec = await api.checkContent(v, 'nickname') } catch (e) {}
  if (!sec.ok) return uni.showToast({ title: reasonText(sec.reason), icon: 'none' })
  const id = getIdentity() || {}
  setIdentity({ ...id, nickname: v })
  uni.showToast({ title: '已保存', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 600)
}

onLoad(() => { nickname.value = displayName() })
</script>

<style scoped>
.page { padding-top: 16px; }
.avatar-big {
  width: 72px; height: 72px; border-radius: 50%; margin: 0 auto;
  background: rgba(47,107,255,0.1); color: #2563eb; font-size: 28px; font-weight: 700;
  text-align: center; line-height: 72px;
}
.input { background: #f2f4fa; border: 1px solid #dbe1ee; color: #1f2937; border-radius: 10px; height: 46px; padding: 0 14px; font-size: 15px; }
.checkbox {
  width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid #c7cede;
  text-align: center; line-height: 14px;
}
.checkbox-on { background: #2f6bff; border-color: #2f6bff; }
</style>
