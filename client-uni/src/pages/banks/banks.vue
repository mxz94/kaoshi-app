<template>
  <view class="page">
    <view class="spread" style="margin:12px 16px;">
      <text style="font-size:22px; font-weight:700;">题库</text>
      <view style="display:flex; gap:14px; align-items:center;">
        <text class="brand" style="font-size:13px;" @tap="goImport">⇪ 批量导入</text>
        <text class="brand" style="font-size:13px;" @tap="goAdd">+ 新建题库</text>
      </view>
    </view>

    <!-- 搜索 + 分类筛选 -->
    <view style="padding:0 16px 8px;">
      <input
        class="search-box"
        v-model="kw"
        placeholder="搜索题库名称"
        placeholder-style="color:#9ca3af"
        confirm-type="search"
      />
      <scroll-view scroll-x class="chips" :show-scrollbar="false">
        <view
          v-for="c in catOptions"
          :key="c"
          class="chip"
          :class="{ on: activeCat === c }"
          @tap="activeCat = c"
        >{{ c }}</view>
      </scroll-view>
    </view>

    <view v-for="b in filteredBanks" :key="b.id" class="card" @tap="goDetail(b.id)">
      <view class="spread">
        <text style="font-weight:600;">{{ b.name }}</text>
        <text :class="b.accuracy >= 80 ? 'good' : b.accuracy >= 60 ? 'brand' : 'bad'" style="font-size:13px;">
          正确率 {{ b.accuracy }}%
        </text>
      </view>
      <view class="muted" style="margin:6px 0 10px;">
        {{ b.totalQuestions }} 题 · 已做 {{ b.doneCount }} · {{ (b.categories || []).join(' / ') }}
      </view>
      <view class="progress-track">
        <view class="progress-fill" :style="{ width: pct(b) + '%' }"></view>
      </view>
    </view>

    <view v-if="!filteredBanks.length && loaded" class="card empty">
      <view style="font-size:40px;">📚</view>
      <view style="margin:8px 0 4px; font-weight:600;">没有匹配的题目库</view>
      <view class="muted">换个关键词，或新建一个题库开始刷题</view>
      <view class="btn-primary" style="margin-top:16px;" @tap="goAdd">新建题库</view>
    </view>
    <view style="height:24px;"></view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import api from '../../utils/api.js'

const banks = ref([])
const loaded = ref(false)
const kw = ref('')
const activeCat = ref('全部')
const pct = (b) => (b.totalQuestions ? Math.round((b.doneCount / b.totalQuestions) * 100) : 0)

// 分类选项：全部 + 所有题库 categories 去重
const catOptions = computed(() => {
  const set = new Set(['全部'])
  banks.value.forEach((b) => (b.categories || []).forEach((c) => set.add(c)))
  return Array.from(set)
})

// 过滤：名称搜索 + 分类筛选
const filteredBanks = computed(() => {
  const k = kw.value.trim().toLowerCase()
  return banks.value.filter((b) => {
    if (k && !b.name.toLowerCase().includes(k)) return false
    if (activeCat.value !== '全部' && !(b.categories || []).includes(activeCat.value)) return false
    return true
  })
})

async function refresh() {
  try {
    banks.value = await api.banks()
  } catch (e) {
    uni.showToast({ title: '加载失败：' + e.message, icon: 'none' })
  }
  loaded.value = true
}

function goAdd() { uni.navigateTo({ url: '/pages/bank-add/bank-add' }) }
function goImport() { uni.navigateTo({ url: '/pages/import/import' }) }
function goDetail(id) { uni.navigateTo({ url: `/pages/bank-detail/bank-detail?id=${id}` }) }

onShow(refresh)
</script>

<style scoped>
.empty { text-align: center; padding: 40px 16px; }
.search-box {
  width: 100%; box-sizing: border-box;
  height: 40px; border-radius: 20px; padding: 0 16px;
  background: #f2f4fa; font-size: 14px;
  border: 1px solid #dbe1ee; color: #1f2937;
}
.chips { white-space: nowrap; margin-top: 10px; }
.chip {
  display: inline-block; padding: 5px 14px; margin-right: 8px;
  border-radius: 16px; background: #f2f4fa; color: #4338ca;
  font-size: 13px;
}
.chip.on { background: linear-gradient(135deg, #2F6BFF, #7C3AED); color: #fff; font-weight: 600; }
</style>
