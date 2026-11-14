// 足迹章册：我的-旅拍足迹（城市集章）配置。
// 自托管后台 `getFootprintConfig` RPC 就绪后返回 siteConfig('global').footprint（stamps 非空才被接受）；
// 未配置或加载失败时展示空态或错误，不能填充本地业务内容。
const { callCloud } = require('./client')

function getFootprintConfig(params = {}) {
  return callCloud('getFootprintConfig', params)
}

module.exports = {
  getFootprintConfig
}
