// site.js —— 站点/备案统一配置（上线前只改这里即可全局生效）
// 说明：值为空字符串的字段，页面会自动隐藏对应行（不会显示占位文字）。
// 公安备案号需在「全国互联网安全管理服务平台」申请后下发（上线 30 日内办理）。
export const SITE = {
  appName: '考试刷题',
  version: '1.0.0',
  // ICP 备案号（已备案）
  icp: '豫ICP备2024091146号',
  // 公安备案号：暂未办理 → 留空，页面自动隐藏该行
  gongan: '',
  // 主办单位名称（个人主体填姓名）
  organizer: '马杏争',
  // 联系邮箱（隐私政策承诺了本反馈入口）
  contact: '836323493@qq.com',
  // 工信部备案查询入口
  beianUrl: 'https://beian.miit.gov.cn',
}

// 内容安全校验失败原因 → 中文提示
export function reasonText(reason) {
  const m = {
    empty: '昵称不能为空',
    too_long: '昵称过长（最多20字）',
    invalid_char: '昵称含非法字符',
    banned_word: '昵称含不当内容',
    wechat_risk: '昵称未通过内容安全检测',
  }
  return m[reason] || '昵称不合规'
}
