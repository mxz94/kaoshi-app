<template>
  <view class="page">
    <view class="card">
      <view style="font-weight:700; font-size:17px; margin-bottom:4px;">{{ title }}</view>
      <view class="muted">更新日期：{{ updatedAt }}</view>
    </view>

    <view class="card">
      <view v-for="(sec, i) in sections" :key="i" style="margin-bottom:16px;">
        <view style="font-weight:600; font-size:14px; margin-bottom:6px;">{{ i + 1 }}. {{ sec.h }}</view>
        <view class="muted body">{{ sec.p }}</view>
      </view>
    </view>

    <view class="card">
      <view class="muted body">备案号：{{ icp }}</view>
      <view class="muted body" v-if="gongan" style="margin-top:8px;">公安备案号：{{ gongan }}</view>
      <view class="muted body" v-if="organizer" style="margin-top:8px;">主办单位：{{ organizer }}</view>
      <view class="muted body" v-if="contact" style="margin-top:8px;">联系方式：{{ contact }}</view>
      <view class="muted body" style="margin-top:8px;">
        如你对本政策有任何疑问，可通过上述联系方式与我们联系（也可在「我的 - 设置」页查看）。
      </view>
    </view>

    <view style="height:24px;"></view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { SITE } from '../../utils/site.js'

const type = ref('privacy')
const updatedAt = '2026-10-06'
const icp = ref(SITE.icp)
const gongan = SITE.gongan
const organizer = SITE.organizer
const contact = SITE.contact

const PRIVACY = [
  // 注意：文案必须对小程序端也成立（小程序无竞技场），故统一用中性表述，避免出现"竞技场"字样
  { h: '我们收集哪些信息', p: '本应用为个人开发的学习工具。为记录你的学习进度，我们会保存你设置的昵称、做题记录、错题本与成绩统计。除昵称外，我们不强制要求任何个人身份信息，也不需要手机号、通讯录、位置等敏感权限。' },
  { h: '信息如何使用', p: '上述信息仅用于在你本机与服务端之间同步学习数据，用于统计正确率与连续打卡天数。我们不会将你的数据用于广告推送，也不会出售给任何第三方。' },
  { h: '信息的存储与安全', p: '数据存储在开发者自建服务器中，通过加密传输。我们会采取合理措施保护数据安全，但请理解任何技术措施都不能保证绝对安全。' },
  { h: '你的权利', p: '你可以随时在「我的」页面修改昵称，在设置页清除本地数据。如需删除服务端的学习记录，可通过下方联系方式申请，我们会在合理期限内处理。' },
  { h: '昵称内容安全', p: '为维护社区环境，你设置的昵称会经过内容安全校验，含不当内容的昵称将被拒绝使用。我们不会出于商业目的分析你的昵称文本。' },
  { h: '未成年人使用', p: '若你是未满 18 周岁的未成年人，请在监护人陪同下阅读并决定是否使用本应用。' },
]

const TERMS = [
  { h: '服务内容', p: '本应用提供各类考试题目的练习、模考、错题整理与学习数据统计功能。题目由用户自行录入或由开发者整理，仅供学习练习使用。' },
  { h: '内容说明', p: '本应用中的题目均为模拟练习题，不代表任何官方考试机构立场，不保证与真实考试题目一致，也不构成任何考试通过承诺。' },
  { h: '使用规范', p: '请遵守法律法规，勿利用本应用从事违法违规活动。请勿录入侵犯他人知识产权或含有违法内容的题目。' },
  { h: '免责声明', p: '本应用按「现状」提供服务，开发者不对因使用本应用产生的任何间接损失承担责任。因网络、设备故障导致的数据异常，开发者会尽力协助但不保证完全恢复。' },
  { h: '内容安全与违规处理', p: '你设置的昵称、房间号及在本应用中发布的任何内容，均须遵守法律法规与公序良俗。对于违反内容安全规定的内容，我们有权拒绝展示或限制相关功能的使用。' },
  { h: '协议变更', p: '本协议如有更新，我们会在应用内提示。继续使用即视为接受更新后的条款。' },
]

const title = computed(() => (type.value === 'terms' ? '用户协议' : '隐私政策'))
const sections = computed(() => (type.value === 'terms' ? TERMS : PRIVACY))

onLoad((opt) => {
  if (opt && opt.type === 'terms') type.value = 'terms'
  uni.setNavigationBarTitle({ title: title.value })
})
</script>

<style scoped>
.page { padding-top: 16px; }
.body { font-size: 13px; line-height: 1.8; }
</style>
