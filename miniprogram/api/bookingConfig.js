// 预约配置：约拍定制定价 + 预约须知。
// 自托管后台 `getBookingConfig` RPC 就绪后返回真实配置（读 siteConfig('global') 的 customPrice/bookingNotice）；
// 未接后台 / 请求失败时由 service/bookingConfig 回退内置默认值，页面零回归。
const { callCloud } = require('./client')

function getBookingConfig(params = {}) {
  return callCloud('getBookingConfig', params)
}

module.exports = {
  getBookingConfig
}
