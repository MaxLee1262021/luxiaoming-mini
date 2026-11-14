// 预约配置：约拍定制定价 + 预约须知。
// 自托管后台 `getBookingConfig` RPC 就绪后返回真实配置（读 siteConfig('global') 的 customPrice/bookingNotice）；
// 缺少配置或请求失败时由调用方提示，不能使用本地价格和须知。
const { callCloud } = require('./client')

function getBookingConfig(params = {}) {
  return callCloud('getBookingConfig', params)
}

module.exports = {
  getBookingConfig
}
