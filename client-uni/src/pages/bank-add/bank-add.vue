<template>
  <view class="page">
    <view class="card">
      <view style="font-weight:600; margin-bottom:10px;">题库名称</view>
      <input v-model="name" class="input" placeholder="如：2023 省考真题" placeholder-style="color:#9ca3af" maxlength="50" />

      <view style="font-weight:600; margin:18px 0 10px;">分类标签（选填，逗号分隔）</view>
      <input v-model="catsText" class="input" placeholder="如：判断推理,言语理解" placeholder-style="color:#9ca3af" maxlength="50" />

      <view class="muted" style="margin-top:14px;">标称题量（选填，用于展示进度）</view>
      <input v-model="total" type="number" class="input" placeholder="如 135" placeholder-style="color:#9ca3af" style="margin-top:8px;" />

      <view class="btn-primary" style="margin-top:20px;" :class="{ disabled: !name.trim() }" @tap="create">创建题库</view>
      <view class="muted" style="text-align:center; margin-top:10px;">文件批量导入将在后台管理端提供，手机端请手动录入</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import api from '../../utils/api.js'

const name = ref('')
const catsText = ref('')
const total = ref('')

async function create() {
  if (!name.value.trim()) return
  try {
    const cats = catsText.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    const r = await api.addBank(name.value.trim(), cats)
    if (total.value && Number(total.value) > 0) {
      // 标称题量走后端暂无独立接口，先存本地展示（题目录入后以 question_count 为准）
      try {
        const s = uni.getStorageSync('kaoshi_bank_totals') || {}
        s[r.id] = Number(total.value)
        uni.setStorageSync('kaoshi_bank_totals', s)
      } catch (e) { /* ignore */ }
    }
    uni.showToast({ title: '创建成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 600)
  } catch (e) {
    uni.showToast({ title: '创建失败：' + e.message, icon: 'none' })
  }
}
</script>

<style scoped>
.page { padding-top: 16px; }
.input {
  background: #f2f4fa; border: 1px solid #dbe1ee;
  color: #1f2937; border-radius: 10px; height: 46px; padding: 0 14px; font-size: 15px;
}
.cats { display: flex; flex-direction: row; flex-wrap: wrap; gap: 8px; }
.chip {
  font-size: 13px; color: #4338ca; background: #f2f4fa;
  border-radius: 16px; padding: 6px 14px;
}
.chip-on { background: linear-gradient(135deg, #2f6bff, #7c3aed); color: #fff; }
</style>
