<template>
  <view class="page">
    <view v-if="!list.length && loaded" class="card empty">
      <view style="font-size:40px;">🎉</view>
      <view style="margin:8px 0 4px; font-weight:600;">错题本是空的</view>
      <view class="muted">刷题答错的题会自动收进来，方便针对性复习</view>
    </view>

    <view v-if="list.length" class="card redo-card" @tap="redoAll">
      <view class="row" style="justify-content:space-between;">
        <view class="row" style="gap:10px;">
          <view class="redo-ico">🔁</view>
          <view>
            <view style="font-weight:600;">开始重练全部错题</view>
            <view class="muted">按错题频次排序，优先攻克反复做错的 {{ list.length }} 题</view>
          </view>
        </view>
        <text class="muted" style="font-size:18px;">›</text>
      </view>
    </view>

    <view v-for="(w, i) in list" :key="w.questionId + '-' + i" class="card">
      <view class="spread" @tap="toggle(i)">
        <text class="muted" style="font-size:12px;">{{ w.bankName }}</text>
        <text class="muted" style="font-size:16px;">{{ openIdx === i ? '▾' : '›' }}</text>
      </view>
      <view class="stem" @tap="toggle(i)">{{ w.stem }}</view>

      <template v-if="openIdx === i">
        <view
          v-for="o in w.options" :key="o.label"
          class="opt" :class="{ 'opt-right': o.isCorrect }"
        >
          <view class="opt-label">{{ o.label }}</view>
          <view class="opt-content">{{ o.content }}</view>
        </view>
        <view v-if="w.analysis" class="muted" style="line-height:1.6; margin-top:8px;">解析：{{ w.analysis }}</view>
        <view class="btn-plain" style="margin-top:12px; height:40px; line-height:40px;" @tap="remove(w)">已掌握，移出错题本</view>
      </template>
    </view>
    <view style="height:24px;"></view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import api from '../../utils/api.js'

const list = ref([])
const loaded = ref(false)
const openIdx = ref(-1)

async function refresh() {
  try {
    list.value = await api.wrongList()
  } catch (e) {
    uni.showToast({ title: '加载失败：' + e.message, icon: 'none' })
  }
  loaded.value = true
}

function toggle(i) { openIdx.value = openIdx.value === i ? -1 : i }

function redoAll() {
  uni.navigateTo({ url: '/pages/practice/practice?kind=redo' })
}

function remove(w) {
  api
    .removeWrong(w.bankId, w.questionId)
    .then(() => {
      list.value = list.value.filter((x) => x !== w)
      openIdx.value = -1
      uni.showToast({ title: '已移出', icon: 'success' })
    })
    .catch((e) => uni.showToast({ title: '操作失败：' + e.message, icon: 'none' }))
}

onShow(refresh)
</script>

<style scoped>
.empty { text-align: center; padding: 40px 16px; margin-top: 16px; }
.stem { font-size: 15px; line-height: 1.6; margin: 8px 0; }
.opt {
  display: flex; flex-direction: row; align-items: center; gap: 10px;
  border: 1px solid #e9edf5; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;
}
.opt-right { border-color: #16a34a; background: rgba(22,163,74,0.12); }
.opt-label {
  width: 24px; height: 24px; border-radius: 6px; background: #f2f4fa; color: #1f2937;
  text-align: center; line-height: 24px; font-weight: 600; font-size: 12px;
}
.opt-right .opt-label { background: #16a34a; color: #fff; }
.opt-content { flex: 1; font-size: 14px; }
.redo-card {
  border: 1px solid rgba(47,107,255,0.25);
  background: linear-gradient(135deg, rgba(47,107,255,0.06), rgba(124,58,237,0.06));
}
.redo-ico {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg, #2f6bff, #7c3aed); color: #fff;
  text-align: center; line-height: 36px; font-size: 18px;
}
</style>
