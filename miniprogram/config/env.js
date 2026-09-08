// ============================================================================
// 鹿小鸣旅拍 · 环境配置（上线必看）
// ============================================================================
//
// 【上线前唯一必须修改的地方】
//   把下面的 PROD_API_BASE 换成后台的真实公网 HTTPS 地址。
//   例如：'https://api.luxiaoming.com/api'
//   ⚠️ 必须是 https（微信小程序正式版禁止 http 请求）
//   ⚠️ 末尾必须带 /api（后台 RPC 真实路径是 /api/rpc/{name}）
//   ⚠️ 改完后，还要去【微信公众平台 → 开发 → 开发设置 → 服务器域名】
//      的「request 合法域名」里把这个域名加进去，否则正式版请求会被拦截。
//
// 本文件会根据小程序运行环境自动切换后台地址：
//   · 开发版（微信开发者工具 / 开发版预览）→ 用 DEV_API_BASE（本地联调）
//   · 体验版 / 正式版                      → 用 PROD_API_BASE（线上服务器）
//   这样本地调试和线上发布互不干扰，不用每次手动改。
// ============================================================================

// 线上后台地址 —— ✏️【必须改成你的真实域名，否则线上无法联网】
const PROD_API_BASE = 'https://你的后台域名/api'

// 本地开发后台地址（跑 luxiaoming-admin，npm run server，默认端口 5192）
const DEV_API_BASE = 'http://localhost:5192/api'

// 读取当前小程序运行环境：develop=开发版 / trial=体验版 / release=正式版
function getEnvVersion() {
  try {
    const info = wx.getAccountInfoSync()
    return (info && info.miniProgram && info.miniProgram.envVersion) || 'develop'
  } catch (e) {
    return 'develop'
  }
}

// 体验版和正式版都走线上服务器，只有开发版走本地
const version = getEnvVersion()
const isProduction = version === 'release' || version === 'trial'

// Demo data is opt-in. Network/API failures must never look like a persisted
// order or a successful booking in a normal development, trial, or release build.
function isExplicitDemoMode() {
  try {
    const value = wx.getStorageSync('lxm_demo_mode')
    return value === true || value === 'true'
  } catch (e) {
    return false
  }
}

module.exports = {
  // 当前生效的后台地址
  API_BASE: isProduction ? PROD_API_BASE : DEV_API_BASE,
  isExplicitDemoMode,

  // 当前环境标识，方便排查问题（develop / trial / release）
  ENV_VERSION: version,

  // 旧云开发环境 ID：已全面迁移到自托管后台，云函数不再使用，仅保留备查。
  CLOUD_ENV: 'cloudbase-d0ght9tpm4ee2b8e7',

  // 企业微信客服 ID（corpId）：
  //   填真实值后，全站 8 个客服入口自动生效；留空则点击提示「客服暂未配置」。
  //   也可由运营在管理后台「小程序全局配置」中维护，前端优先使用后台下发值。
  CORP_ID: ''
}
