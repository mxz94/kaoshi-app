<template>
  <view class="page">
    <view class="card">
      <!-- 题型 -->
      <view class="row" style="gap:8px; margin-bottom:14px;">
        <text
          v-for="t in TYPES" :key="t.key"
          class="chip" :class="{ 'chip-on': type === t.key }"
          @tap="type = t.key"
        >{{ t.label }}</text>
      </view>

      <!-- 题干 -->
      <textarea v-model="stem" class="stem-input" placeholder="输入题干…" placeholder-style="color:#9ca3af" maxlength="1000" :maxlength="-1" auto-height />

      <!-- 选项 -->
      <view v-for="(o, i) in options" :key="o.label" class="opt-row">
        <view
          class="opt-label" :class="{ 'opt-label-on': isCorrect(o.label) }"
          @tap="markCorrect(o.label)"
        >{{ o.label }}</view>
        <input v-model="o.content" class="opt-input" placeholder-style="color:#9ca3af" :placeholder="`选项 ${o.label} 内容（点左侧圆圈标记正确项）`" />
      </view>
      <view class="muted" style="margin-top:2px;">
        {{ type === 'multiple' ? '可标记多个正确项' : '点选项圆圈标记正确项（单选/判断只认第一个）' }}
      </view>

      <!-- 解析 -->
      <textarea v-model="analysis" class="stem-input" style="min-height:70px;" placeholder="解析（选填）" placeholder-style="color:#9ca3af" :maxlength="-1" auto-height />
    </view>

    <view style="margin:0 16px;">
      <view class="btn-primary" :class="{ disabled: !canSave }" @tap="save">保存题目</view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import api from '../../utils/api.js'

const TYPES = [
  { key: 'single', label: '单选' },
  { key: 'multiple', label: '多选' },
  { key: 'judge', label: '判断' },
]

const bankId = ref('')
const type = ref('single')
const stem = ref('')
const analysis = ref('')
const options = ref([
  { label: 'A', content: '' },
  { label: 'B', content: '' },
  { label: 'C', content: '' },
  { label: 'D', content: '' },
])
const corrects = ref([])

const canSave = computed(
  () =>
    stem.value.trim() &&
    options.value.filter((o) => o.content.trim()).length >= 2 &&
    corrects.value.length >= 1
)

function isCorrect(l) { return corrects.value.includes(l) }
function markCorrect(l) {
  if (type.value === 'multiple') {
    const i = corrects.value.indexOf(l)
    if (i >= 0) corrects.value.splice(i, 1)
    else corrects.value.push(l)
    corrects.value.sort()
  } else {
    corrects.value = [l]
  }
}

async function save() {
  if (!canSave.value) return
  try {
    await api.addQuestion(bankId.value, {
      type: type.value,
      stem: stem.value.trim(),
      analysis: analysis.value.trim(),
      options: options.value
        .filter((o) => o.content.trim())
        .map((o) => ({ label: o.label, content: o.content.trim(), isCorrect: corrects.value.includes(o.label) })),
    })
    uni.showToast({ title: '已保存', icon: 'success' })
    stem.value = ''
    analysis.value = ''
    options.value.forEach((o) => (o.content = ''))
    corrects.value = []
  } catch (e) {
    uni.showToast({ title: '保存失败：' + e.message, icon: 'none' })
  }
}

onLoad((q) => { bankId.value = q.bankId || '' })
</script>

<style scoped>
.page { padding-top: 16px; }
.chip { font-size: 13px; color: #4338ca; background: #f2f4fa; border-radius: 16px; padding: 6px 14px; }
.chip-on { background: linear-gradient(135deg, #2f6bff, #7c3aed); color: #fff; }
.stem-input {
  width: 100%; min-height: 90px; background: #f2f4fa; color: #1f2937;
  border: 1px solid #dbe1ee;
  border-radius: 10px;
  padding: 12px 14px; font-size: 15px; box-sizing: border-box; margin-bottom: 14px;
}
.opt-row { display: flex; flex-direction: row; align-items: center; gap: 10px; margin-bottom: 10px; }
.opt-label {
  width: 30px; height: 30px; border-radius: 50%; border: 2px solid #c7cede; color: #1f2937;
  text-align: center; line-height: 27px; font-weight: 600; font-size: 13px;
}
.opt-label-on { background: #16a34a; border-color: #16a34a; color: #fff; }
.opt-input { flex: 1; background: #f2f4fa; color: #1f2937; border: 1px solid #dbe1ee; border-radius: 10px; height: 44px; padding: 0 12px; font-size: 14px; }
</style>
