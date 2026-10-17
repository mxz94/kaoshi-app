<script>
import { ensureIdentity } from './utils/identity.js'

export default {
  onLaunch: function () {
    // 确保本地身份存在（迁移契约：身份读写只走 utils/identity.js）
    ensureIdentity()
  },
  onShow: function () {},
  onHide: function () {},
}
</script>

<style>
/* ===== 全局设计 token（明亮酷炫主题：浅底 + 蓝紫渐变点缀）===== */
page {
  background: #f5f7fb;
  color: #1f2937;
  font-size: 15px;
  font-family: -apple-system, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

/* 输入框 / 文本域 placeholder（H5 生效；小程序端另用 placeholder-style） */
input::placeholder,
textarea::placeholder {
  color: #9ca3af;
}

/* 卡片 / 面板 */
.card {
  background: #ffffff;
  border: 1px solid #e9edf5;
  border-radius: 16px;
  padding: 16px;
  margin: 0 16px 12px;
  box-shadow: 0 4px 16px rgba(17, 24, 39, 0.05);
}

/* 主按钮 / 次按钮 */
.btn-primary {
  background: linear-gradient(135deg, #2f6bff, #7c3aed);
  color: #ffffff;
  border-radius: 10px;
  height: 48px;
  line-height: 48px;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  box-shadow: 0 6px 20px rgba(47, 107, 255, 0.22);
}
.btn-primary.disabled { opacity: 1; background: #e4e9f5; color: #5b6472; box-shadow: none; }
.btn-plain {
  background: #ffffff;
  color: #4f46e5;
  border: 1px solid #dfe5f0;
  border-radius: 10px;
  height: 48px;
  line-height: 46px;
  text-align: center;
  font-size: 15px;
}

/* 语义色（浅底可读版） */
.good { color: #16a34a; }
.bad { color: #dc2626; }
.gold { color: #d97706; }
.brand { color: #2563eb; }
.muted { color: #6b7280; font-size: 12px; }

/* 进度条底 */
.progress-track {
  height: 8px;
  border-radius: 4px;
  background: #e8ecf4;
  overflow: hidden;
}
.progress-fill {
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, #2f6bff, #7c3aed);
}

/* 列表行 */
.row {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.spread {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
</style>
