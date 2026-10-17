# 微信登录用户体系 + 多端云同步 · 交付说明

> 用户：「有了这个用户体系你看看还能做些什么，还是做吧」→ 已落地并部署。

## 做了什么（一条主线贯通）
把「微信登录」做成账号体系，并顺手解锁它才能支撑的能力：

1. **微信登录（个人主体免 300 认证）**：小程序端 `wx.login` 拿 code → 服务端 `code2Session` 换 `openid`。密钥仅在服务端（`.env` 的 `WX_APPID/WX_APPSECRET`），绝不下发前端。
2. **多端云同步（核心收益）**：账号即 `wx:<openid>`，直接作为全站已有的 `X-User-Key`。刷题/错题/收藏/笔记全部按它隔离 → **换手机自动同步，数据不再丢**。
3. **游客数据不丢（方案②）**：首次微信登录时，把本机游客历史整体合并进微信账号（`UPDATE IGNORE` 四表），老记录无缝继承。
4. **「我的」页升级**：☁ 云端同步状态、昵称编辑（过内容安全）、退出微信登录。
5. **账号资料接口**：`/api/auth/profile` 读写昵称/头像。

H5 端无 `wx.login`，保持游客模式，逻辑向后兼容。

## 改动文件
- 后端 `server.js`：新增 `/api/auth/wechat-login`、`/api/auth/bind`、`/api/auth/profile`（GET/POST）。
- 后端 `schema.sql`：新增 `users` 表（openid UNIQUE）。
- 前端 `client-uni/src/utils/identity.js`：`getUserKey()` 优先返回 `wx:<openid>`；新增 `setWxOpenid/getWxOpenid/isWechatBound/clearWxOpenid`。
- 前端 `client-uni/src/App.vue`：onLaunch 小程序端静默登录 + 首登合并游客数据。
- 前端 `client-uni/src/utils/api.js`：新增 `wechatLogin/bind/profileGet/profileSave`。
- 前端 `client-uni/src/pages/mine/mine.vue`：登录态 UI、☁ 同步卡、昵称编辑、退出微信登录。
- 部署镜像 `deploy-backend/` 同步；`tools/upload-mp.js` 的 `miniprogram-ci` 候选补 `D:/clean/_mpci/node_modules`。

## 验证结果
- 后端启动 `SYNTAX_OK`；生产部署后 `/api/banks` 本地+公网均 `200`；`.env` 未被覆盖；pm2 `kaoshi-api` online。
- `/api/auth/profile` 游客态 → `400 当前不是微信登录状态`（守卫正确，未碰库）。
- 生产探测 `wechat-login`：无 code → `400`；假 code → 真实打到微信返回 `invalid code`（证明密钥已配、网络链路通、`code2Session` 路径对；真机 `wx.login` 即可登录）。
- `bind` 空 body → `ok` 零变更、不写库。
- 小程序构建 1.0.3 成功，`arena` 残留 = 0，新鉴权代码已打入包；上传 `UPLOAD_OK`。

## 待你真机验收（我无法在真机点登录）
1. 小程序体验版 1.0.3 打开「我的」→ 应显示「微信登录 · 多端同步刷题记录」。
2. 点一下 → 静默登录成功，出现 ☁ 云端同步状态与昵称（可改）。
3. 此前作为游客刷过的题，登录后应自动合并到账号（在另一台手机登录同一微信，数据应一致）。
4. 退出微信登录 → 本机回游客模式；重新登录 → 数据恢复。

## 合规提示（上线前）
个人主体微信登录需在公众平台「设置 → 服务内容/用户隐私」补充《隐私保护指引》说明使用微信 openid 做账号与同步。本功能未使用 `getPhoneNumber`（个人主体禁用），合规。
