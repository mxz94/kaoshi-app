// 统一请求封装（迁移契约：所有 API 调用只走此文件）
// H5：走 vite 代理（/api → localhost:3399）
// 小程序/App：必须填已备案 HTTPS 域名
import { getUserKey } from './identity.js'

// 接入点：H5 开发态留空走 vite 代理（本机 3399），生产态与小程序直连已备案 HTTPS 域名
const PROD_API = 'https://kaoshi.malanxi.top'

let BASE = ''
// #ifndef H5
BASE = PROD_API
// #endif
// #ifdef H5
// dev（vite dev server）用相对路径走代理；build 产物直连生产域名
if (!(typeof process !== 'undefined' && process.env.NODE_ENV === 'development')) BASE = PROD_API
// #endif

export function request(path, { method = 'GET', data } = {}) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE + path,
      method,
      data,
      timeout: 10000,
      // X-User-Key：免注册的设备身份，后端据此隔离数据（多人不串号）
      header: { 'Content-Type': 'application/json', 'X-User-Key': getUserKey() },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          const msg = (res.data && res.data.error) || 'HTTP ' + res.statusCode
          reject(new Error(msg))
        }
      },
      fail: (e) => reject(new Error((e && e.errMsg) || '网络错误')),
    })
  })
}

export const api = {
  // 题库
  banks: () => request('/api/banks'),
  bankQuestions: (bankId, { mode } = {}) =>
    request(`/api/banks/${bankId}/questions?mode=${encodeURIComponent(mode || 'all')}`),
  addBank: (name, categories) => request('/api/banks', { method: 'POST', data: { name, categories } }),
  // 批量导入：建库 + 整库批量写题（questions 已在前端归一化）
  importBank: (payload) => request('/api/import/bank', { method: 'POST', data: payload }),

  // 模考组卷：行测标准套卷（后端按模块配比跨题库抽题）
  examPresets: () => request('/api/exam/presets'),
  examPaper: (preset = 'xingce', fit = 'scale') =>
    request(`/api/exam/paper?preset=${encodeURIComponent(preset)}&fit=${encodeURIComponent(fit)}`),

  // 题目 / 练习
  addQuestion: (bankId, q) => request(`/api/banks/${bankId}/questions`, { method: 'POST', data: q }),
  submitAnswer: (p) => request('/api/practice/answer', { method: 'POST', data: p }),

  // 错题本
  addWrong: (bankId, questionId) => request('/api/wrong', { method: 'POST', data: { bankId, questionId } }),
  removeWrong: (bankId, questionId) => request('/api/wrong/remove', { method: 'POST', data: { bankId, questionId } }),
  wrongList: () => request('/api/wrong/list'),

  // 收藏 + 笔记（user_key 隔离）
  favoriteIds: (bankId) => request(`/api/favorite/ids?bankId=${encodeURIComponent(bankId)}`),
  noteIds: (bankId) => request(`/api/note/ids?bankId=${encodeURIComponent(bankId)}`),
  favoriteList: () => request('/api/favorite/list'),
  favoriteToggle: (bankId, questionId) =>
    request('/api/favorite/toggle', { method: 'POST', data: { bankId, questionId } }),
  noteGet: (bankId, questionId) =>
    request(`/api/note?bankId=${encodeURIComponent(bankId)}&questionId=${encodeURIComponent(questionId)}`),
  noteSave: (bankId, questionId, content) =>
    request('/api/note', { method: 'POST', data: { bankId, questionId, content } }),

  // 统计
  today: () => request('/api/stats/today'),
  overview: (period = 'month') => request(`/api/stats/overview?period=${period}`),

  // 数据迁移（免注册：换设备时用迁移码搬数据）
  migrateCode: () => request('/api/user/migrate-code', { method: 'POST' }),
  migrateClaim: (code) => request('/api/user/migrate-claim', { method: 'POST', data: { code } }),
  claimLegacy: () => request('/api/user/claim-legacy', { method: 'POST' }),

  // 微信登录（个人主体：openid 即账号，免注册；仅小程序端）
  wechatLogin: (code) => request('/api/auth/wechat-login', { method: 'POST', data: { code } }),
  // 首次登录把本机游客数据合并到微信账号
  bind: (fromKey, toKey) => request('/api/auth/bind', { method: 'POST', data: { fromKey, toKey } }),
  // 账号资料读写
  profileGet: () => request('/api/auth/profile'),
  profileSave: (nickName, avatarUrl) => request('/api/auth/profile', { method: 'POST', data: { nickName, avatarUrl } }),

  // 内容安全：昵称/房间号提交前校验（不通过则前端拦截，后端 ingest 二次拦截）
  checkContent: (text, scene = 'nickname') =>
    request('/api/content/check', { method: 'POST', data: { text, scene } }),

  // #ifdef H5
  // 竞技场（仅 H5；小程序端无竞技场，个人主体合规）
  arenaPlayer: (nickname) => request(`/api/arena/player/${encodeURIComponent(nickname)}`),
  // 开局（配置项可顶层传，也可包在 config 内）
  arenaStart: (p) => request('/api/arena/session/start', { method: 'POST', data: p }),
  // 推题（房主）
  arenaPush: (p) => request('/api/arena/question/push', { method: 'POST', data: p }),
  // 提交答案（body: {roomId, username, option}）
  arenaAnswer: (p) => request('/api/arena/ingest', { method: 'POST', data: p }),
  // 当前态（轮询源：题目/榜单/揭晓/答案分布）
  arenaState: (roomId, viewer = 'viewer') =>
    request(`/api/arena/state?roomId=${encodeURIComponent(roomId)}&viewer=${viewer}`),
  // 结束对局 → 返回最终排名
  arenaEnd: (roomId) => request('/api/arena/session/end', { method: 'POST', data: { roomId } }),
  // #endif
}

export default api
