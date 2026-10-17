// 本地偏好设置（答题偏好存本地，零后端成本）
const KEY = 'kaoshi_settings'

const DEFAULTS = {
  dailyGoal: 50,           // 每日目标题数
  shuffleQuestions: false, // 题目乱序
  // 答对后自动进入下一题；答错一律停留看解析（默认关，保持原有手动节奏）
  autoNextQuestion: false,
}

export function getSettings() {
  try {
    const v = uni.getStorageSync(KEY)
    return { ...DEFAULTS, ...(v && typeof v === 'object' ? v : {}) }
  } catch (e) {
    return { ...DEFAULTS }
  }
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch }
  uni.setStorageSync(KEY, next)
  return next
}
