// 足迹章册：我的-旅拍足迹（城市集章）配置。
// 自托管后台 `getFootprintConfig` RPC 就绪后返回 siteConfig('global').footprint（stamps 非空才被接受）；
// 未接后台 / 请求失败时由 service/footprint.js 依次回退 siteConfig 页面配置 / 内置默认长沙章册，页面零回归。
const { callCloud } = require('./client')

function getFootprintConfig(params = {}) {
  return callCloud('getFootprintConfig', params)
}

module.exports = {
  getFootprintConfig
}
