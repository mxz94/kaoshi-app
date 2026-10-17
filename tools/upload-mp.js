// 小程序自动化上传（miniprogram-ci）
// 前置条件（二选一，必须先在微信公众平台完成）：
//   1. 公众平台 → 管理 → 开发管理 → 开发设置 → 「小程序代码上传密钥」生成私钥，并配置 IP 白名单
//   2. 白名单需填入执行上传机器的公网出口 IP（本机：见下方 PUBLIC_IP 提示）
// 用法：
//   node tools/upload-mp.js [版本号] [备注]
//   node tools/upload-mp.js 1.0.1 "修复统计页显示"
const path = require('path')
const fs = require('fs')

// 兜底：miniprogram-ci 依赖的 npm-conf 在 Windows 下会用 process.env.APPDATA 拼缓存路径；
// 某些 shell（含沙箱执行环境）未注入该变量时会直接抛
// "The paths[0] argument must be of type string. Received undefined"，故在此补齐。
if (!process.env.APPDATA && process.env.USERPROFILE) {
  process.env.APPDATA = path.join(process.env.USERPROFILE, 'AppData', 'Roaming')
}

const APPID = process.env.WX_APPID || 'wx3554649eef1ed7c5'
const KEY_PATH =
  process.env.WX_UPLOAD_KEY ||
  'C:/Users/Administrator/Downloads/private.wx3554649eef1ed7c5.key'
const PROJECT_PATH = path.resolve(__dirname, '..', 'client-uni', 'dist', 'build', 'mp-weixin')

// uni-app 构建产物里 appid 固定为 touristappid，这里改写为真实 AppID，
// 便于微信开发者工具直接导入（CI 上传以 ci.Project 的 appid 为准，此步仅为兼容开发工具）
function patchProjectConfig() {
  const cfgPath = path.join(PROJECT_PATH, 'project.config.json')
  if (!fs.existsSync(cfgPath)) return
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    if (cfg.appid !== APPID) {
      cfg.appid = APPID
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8')
    }
    console.log('project.config.json appid =>', cfg.appid)
  } catch (e) {
    console.warn('跳过 project.config.json 改写：', e.message)
  }
}

async function main() {
  const candidates = [
    'miniprogram-ci',
    path.resolve(__dirname, '..', 'client-uni', 'node_modules', 'miniprogram-ci'),
    path.resolve(__dirname, '..', '..', '_ci-tmp', 'node_modules', 'miniprogram-ci'),
  ]
  let ci = null
  for (const c of candidates) {
    try {
      ci = require(c)
      break
    } catch (e) {
      /* 继续尝试下一个候选路径 */
    }
  }
  if (!ci) {
    console.error('未安装 miniprogram-ci，请先执行：')
    console.error('  cd client-uni && npm install miniprogram-ci --save-dev')
    process.exit(1)
  }

  const version = process.argv[2] || '1.0.0'
  const desc = process.argv[3] || '公考行测刷题 · 自动化上传'

  console.log('appid      :', APPID)
  console.log('privateKey :', KEY_PATH)
  console.log('projectPath:', PROJECT_PATH)
  console.log('version    :', version)
  console.log('desc       :', desc)

  patchProjectConfig()

  const project = new ci.Project({
    appid: APPID,
    type: 'miniProgram',
    projectPath: PROJECT_PATH,
    privateKeyPath: KEY_PATH,
    ignores: ['node_modules/**/*'],
  })

  await ci.upload({
    project,
    version,
    desc,
    setting: {
      es6: true,
      es7: true,
      minify: true,
      autoPrefixWXSS: true,
      // request 合法域名配好后建议改 true，防止请求非法域名
      urlCheck: false,
    },
    onProgressUpdate: (info) => {
      console.log('[ci]', typeof info === 'string' ? info : JSON.stringify(info))
    },
  })

  console.log('UPLOAD_OK')
}

main().catch((e) => {
  const msg = e && e.message ? e.message : String(e)
  console.error('upload failed:', msg)
  if (/白名单|ip/i.test(msg)) {
    console.error('\n提示：该 AppID 未在微信公众平台把当前公网 IP 加入白名单。')
    console.error('公众平台 → 开发管理 → 开发设置 → 小程序代码上传密钥 → IP 白名单，加入当前出口 IP（本机约 1.196.171.84，宽带动态 IP 每次变化都需重加）')
    console.error('（若宽带为动态 IP，每次变化都需重新添加）')
  }
  process.exit(1)
})
