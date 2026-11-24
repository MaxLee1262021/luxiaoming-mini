// 预约配置：约拍定制定价、预约须知及预约成功页温馨提示。
// 自托管后台 `getBookingConfig` RPC 返回 siteConfig('global') 的公开预约配置；
// 价格和预约须知缺失时由调用方提示；成功页提示兼容旧后台的默认文案。
const { callCloud } = require('./client')

function getBookingConfig(params = {}) {
  return callCloud('getBookingConfig', params)
}

module.exports = {
  getBookingConfig
}
