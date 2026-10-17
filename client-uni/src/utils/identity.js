// 身份适配层 —— 迁移契约②：全项目身份/偏好只经此文件读写存储
// H5 用 localStorage（uni 抹平），小程序用 wx storage，换端零改动
const KEY = 'kaoshi_identity'

export function getIdentity() {
  try {
    const v = uni.getStorageSync(KEY)
    return v && typeof v === 'object' ? v : null
  } catch (e) {
    return null
  }
}

export function setIdentity(identity) {
  uni.setStorageSync(KEY, { ...identity, ts: Date.now() })
}

export function clearIdentity() {
  try {
    uni.removeStorageSync(KEY)
  } catch (e) { /* ignore */ }
}

/**
 * 设备身份 key（user_key）：免注册方案①
 * 本地生成一次、长期保存，所有请求带 X-User-Key，后端据此隔离刷题记录/错题/统计。
 * 换设备 = 新 key（数据看似"丢失"），可用迁移码把旧 key 名下的数据搬过来（方案②）。
 */
function genUserKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '')
    }
  } catch (e) { /* 环境不支持则走 fallback */ }
  return (
    'k' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  )
}

/** 确保存在本地身份（游客模式，无感） */
export function ensureIdentity() {
  let id = getIdentity()
  if (!id) {
    id = {
      id: 'web-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      userKey: genUserKey(),
      nickname: '',
      remember: true,
      ts: Date.now(),
    }
    setIdentity(id)
  } else if (!id.userKey) {
    // 兼容升级前已存在的身份：补一个 key，老数据用「认领历史数据」找回
    id = { ...id, userKey: genUserKey() }
    setIdentity(id)
  }
  return id
}

/** 取当前设备身份 key（供请求头使用），确保一定存在 */
export function getUserKey() {
  return ensureIdentity().userKey
}

/** 认领他人/历史数据后覆盖 key（数据已在服务端搬过来，本地跟着换身份） */
export function setUserKey(key) {
  const id = getIdentity() || {}
  setIdentity({ ...id, userKey: key })
}

/** 展示用昵称（未设置返回空串，由页面引导填写） */
export function displayName() {
  const id = getIdentity()
  return (id && id.nickname) || ''
}
