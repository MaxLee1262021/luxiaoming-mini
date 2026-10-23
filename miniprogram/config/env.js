// ============================================================================
// 鹿小鸣旅拍 · 环境配置（上线必看）
// ============================================================================
//
// 【上线前唯一必须配置的地方】
//   复制 private-env.example.js 为 private-env.js，再填写真实公网 HTTPS 地址。
//   例如：'https://api.luxiaoming.com/api'
//   ⚠️ 必须是 https（微信小程序正式版禁止 http 请求）
//   ⚠️ 末尾必须带 /api（后台 RPC 真实路径是 /api/rpc/{name}）
//   ⚠️ 改完后，还要去【微信公众平台 → 开发 → 开发设置 → 服务器域名】
//      的「request 合法域名」里把这个域名加进去，否则正式版请求会被拦截。
//
// 本文件会根据小程序运行环境自动切换后台地址：
//   · 开发版（微信开发者工具 / 开发版预览）→ 用 DEV_API_BASE（线上联调）
//   · 体验版 / 正式版                      → 用 private-env.js 的 PROD_API_BASE（线上服务器）
//   当前开发版和线上版本统一使用 cslxm.cn，避免开发工具继续请求 localhost。
// ============================================================================

// 线上后台地址从本地发布配置读取，避免把部署域名写死在仓库。
// 发布前复制 private-env.example.js 为 private-env.js，并填写真实 HTTPS 地址。
let privateEnv = {}
try {
  privateEnv = require('./private-env')
} catch (e) {}

function normalizeApiBase(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

const PROD_API_BASE = normalizeApiBase(privateEnv.PROD_API_BASE || 'https://www.cslxm.cn/api')

// 开发版联调地址：统一使用公网后台，避免微信开发者工具请求本机 localhost。
const DEV_API_BASE = 'https://www.cslxm.cn/api'

// 读取当前小程序运行环境：develop=开发版 / trial=体验版 / release=正式版
function getEnvVersion() {
  try {
    const info = wx.getAccountInfoSync()
    return (info && info.miniProgram && info.miniProgram.envVersion) || 'develop'
  } catch (e) {
    return 'develop'
  }
}

// 开发版、体验版和正式版统一走线上服务器
const version = getEnvVersion()
const isProduction = version === 'release' || version === 'trial'

const API_BASE = isProduction ? PROD_API_BASE : DEV_API_BASE
const API_ERROR = isProduction && !/^https:\/\//i.test(API_BASE)
  ? '小程序生产接口未配置：请在 miniprogram/config/private-env.js 设置 PROD_API_BASE'
  : ''

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
  API_BASE,
  API_ERROR,
  isExplicitDemoMode,

  // 当前环境标识，方便排查问题（develop / trial / release）
  ENV_VERSION: version,

  // 旧云开发环境 ID：已全面迁移到自托管后台，云函数不再使用，仅保留备查。
  CLOUD_ENV: 'cloudbase-d0ght9tpm4ee2b8e7',

  // 微信客服：企业 ID 与客服链接必须同时配置，并在小程序后台绑定同主体企业。
  CORP_ID: 'wwdb93f79fb79120de',
  CUSTOMER_SERVICE_URL: 'https://work.weixin.qq.com/kfid/kfca77dd81085d687a5'
}
