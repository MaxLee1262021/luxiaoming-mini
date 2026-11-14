// 隐私政策：隐私页正文。
// 自托管后台 `getPrivacyPolicy` RPC 就绪后返回真实内容（读 siteConfig('global').privacyPolicy）；
// 未配置或加载失败时展示空态或错误，不能填充本地业务内容。
const { callCloud } = require('./client')

function getPrivacyPolicy(params = {}) {
  return callCloud('getPrivacyPolicy', params)
}

module.exports = {
  getPrivacyPolicy
}
