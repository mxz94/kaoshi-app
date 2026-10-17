<template>
  <view class="page">
    <view class="tabs">
      <view class="tab" :class="{ on: tab === 'fav' }" @tap="tab = 'fav'">收藏 {{ favItems.length }}</view>
      <view class="tab" :class="{ on: tab === 'note' }" @tap="tab = 'note'">笔记 {{ noteItems.length }}</view>
    </view>

    <view v-if="loading" class="empty">加载中…</view>
    <view v-else-if="!list.length" class="empty">
      {{ tab === 'fav' ? '还没有收藏任何题目。刷题时点 ★ 即可收藏好题。' : '还没有写笔记。刷题时点 ✎ 记录思路。' }}
    </view>

    <view
      v-for="it in list"
      :key="it.questionId"
      class="card item"
      @tap="goPractice(it.bankId)"
    >
      <view class="bank">{{ it.bankName }}</view>
      <view class="stem">{{ it.stem }}</view>
      <view v-if="tab === 'note' && it.note" class="note-preview">{{ it.note }}</view>
      <view class="meta">
        <text class="tag" v-if="tab === 'fav' && it.note">有笔记</text>
        <text class="muted">点击进入练习 ›</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import api from '../../utils/api.js'

const loading = ref(true)
const tab = ref('fav')
const items = ref([]) // 全部收藏（含 note 字段）

const favItems = computed(() => items.value)
const noteItems = computed(() => items.value.filter((x) => (x.note || '').trim().length > 0))
const list = computed(() => (tab.value === 'fav' ? favItems.value : noteItems.value))

async function refresh() {
  loading.value = true
  try {
    items.value = await api.favoriteList()
  } catch (e) {
    uni.showToast({ title: '加载失败：' + e.message, icon: 'none' })
    items.value = []
  } finally {
    loading.value = false
  }
}

function goPractice(bankId) {
  uni.navigateTo({ url: '/pages/practice/practice?bankId=' + bankId })
}

onShow(refresh)
</script>

<style scoped>
.page { padding: 12px 16px 24px; }
.tabs { display: flex; flex-direction: row; gap: 10px; margin-bottom: 12px; }
.tab {
  padding: 8px 16px; border-radius: 18px; font-size: 14px;
  background: #f2f4fa; color: #4338ca; border: 1px solid #dbe1ee;
}
.tab.on { background: linear-gradient(135deg, #2f6bff, #7c3aed); color: #fff; border-color: transparent; }
.empty { text-align: center; color: #6b7280; font-size: 14px; padding: 60px 24px; line-height: 1.7; }
.card {
  background: #ffffff; border: 1px solid #e9edf5;
  border-radius: 16px; padding: 14px;
  margin-bottom: 12px;
}
.bank { font-size: 12px; color: #2563eb; margin-bottom: 6px; }
.stem { font-size: 15px; line-height: 1.6; font-weight: 500; }
.note-preview {
  margin-top: 8px; padding: 10px 12px; border-radius: 10px;
  background: rgba(217,119,6,0.1); color: #d97706; font-size: 13px; line-height: 1.6;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.meta { display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 10px; }
.tag { font-size: 11px; color: #d97706; background: rgba(217,119,6,0.1); padding: 2px 8px; border-radius: 6px; }
.muted { font-size: 12px; color: #6b7280; }
</style>
