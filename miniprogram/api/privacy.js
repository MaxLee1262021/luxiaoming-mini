// 隐私政策：隐私页正文。
// 自托管后台 `getPrivacyPolicy` RPC 就绪后返回真实内容（读 siteConfig('global').privacyPolicy）；
// 未接后台 / 请求失败时由 pages/privacy/privacy.js 回退内置默认正文，页面零回归。
const { callCloud } = require('./client')

function getPrivacyPolicy(params = {}) {
  return callCloud('getPrivacyPolicy', params)
}

module.exports = {
  getPrivacyPolicy
}
