// security.js —— 用户可见文本内容安全校验（昵称 / 房间号等）
//
// 设计：
//   1) 默认走「本地敏感词 + 规则」兜底，零依赖、零外网，必定可用；
//   2) 若配置了微信小程序/公众号 WX_APPID + WX_APPSECRET 环境变量，
//      则额外尝试调用微信 security.msgSecCheck 做服务端内容安全检测。
//
// ⚠️ 合规重点（务必理解）：
//   微信 security.msgSecCheck（/wxa/msg_sec_check）在「需要用户上下文」时
//   要求传 openid。本应用 H5 端为游客模式、无微信 openid，因此真实微信校验
//   仅在「已配置 AppID/Secret 且调用方能提供 openid」的场景才生效
//   （如未来接入公众号网页授权 / 小程序端）。
//   当前默认路径 = 本地敏感词 + 规则，已满足「昵称内容安全」上线要求；
//   微信调用为可配置增强，未配置或调用失败时一律降级本地，绝不阻断业务。

// 基础违规词（占位：上线可按需扩充；保持精简，避免误伤正常昵称）
// 含政治人物、明显色情赌博诈骗、考试作弊等违规语义，昵称严格禁止出现。
const BANNED_WORDS = [
  '习近平', '李强', '李克强', '胡锦涛', '江泽民',
  'fuck', 'shit', 'sb', '草泥马', '法轮', '台独', '港独', '疆独', '藏独',
  '色情', '裸聊', '赌博', '博彩', '诈骗', '代考', '枪手', '出售答案', '作弊',
  '黄赌毒', '约炮',
]

// 仅本地规则（同步，不触外网）
function localCheck(text, scene) {
  const t = String(text || '').trim()
  if (!t) return { ok: false, reason: 'empty' }
  // 控制字符 / 零宽字符 / BOM（用显式 \u 转义，避免源文件混入不可见字符）
  if (/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/.test(t)) return { ok: false, reason: 'invalid_char' }
  const max = scene === 'nickname' ? 20 : 30
  if (t.length > max) return { ok: false, reason: 'too_long' }
  const lower = t.toLowerCase()
  for (const w of BANNED_WORDS) {
    if (lower.includes(w.toLowerCase())) return { ok: false, reason: 'banned_word' }
  }
  return { ok: true }
}

// 微信 access_token 缓存（7000s 安全余量）
let _token = null
let _tokenExpire = 0
async function getAccessToken() {
  const appid = process.env.WX_APPID
  const secret = process.env.WX_APPSECRET
  if (!appid || !secret) return null
  if (_token && Date.now() < _tokenExpire) return _token
  try {
    const r = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`,
      { signal: AbortSignal.timeout(6000) }
    )
    const j = await r.json()
    if (!j.access_token) return null
    _token = j.access_token
    _tokenExpire = Date.now() + (Number(j.expires_in) || 7200) * 1000 - 10000
    return _token
  } catch (e) {
    return null
  }
}

// 微信内容安全检测。返回 {ok:false,reason:'wechat_risk'} 表示命中；
// 返回 null 表示「未配置或调用失败」，交由本地规则兜底。
async function wechatCheck(text) {
  const token = await getAccessToken()
  if (!token) return null
  const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `content=${encodeURIComponent(text)}`,
    })
    const j = await r.json()
    // 87014 = 内容命中违规风险
    if (j.errcode === 87014) return { ok: false, reason: 'wechat_risk' }
    // 其他错误码（含缺少 openid 的 40130 / 40003 等）或网络异常 → 降级本地
    if (j.errcode && j.errcode !== 0) return null
    return { ok: true }
  } catch (e) {
    return null
  }
}

// 对外主函数（async）
async function checkTextSecurity(text, scene = 'nickname') {
  const local = localCheck(text, scene)
  if (!local.ok) return { ...local, source: 'local' }
  const wx = await wechatCheck(String(text || ''))
  if (wx === null) return { ok: true, source: 'local' } // 无微信配置/失败，本地已通过
  return { ...wx, source: 'wechat' }
}

module.exports = { checkTextSecurity, localCheck }
