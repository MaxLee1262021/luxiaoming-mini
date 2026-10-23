const { API_BASE } = require('../config/env')

function paymentFailure(error = {}) {
  const errMsg = String(error && (error.errMsg || error.message) || '')
  if (/cancel/i.test(errMsg)) {
    return { kind: 'cancelled', toast: '已取消支付', message: '已取消本次支付，可重新发起支付。' }
  }
  if (Number(error && error.errno) === 102 || /no permission|access[_ ]denied|banned|违规|权限.*限|支付功能暂时无法使用/i.test(errMsg)) {
    return {
      kind: 'restricted',
      toast: '微信支付权限受限',
      message: '微信暂未允许本次支付（错误 102）。未发布小程序可能只允许测试额度，超过期限会停止收款；请在商户平台“账户中心→经营场景管理”检查该 AppID 的限额状态。'
    }
  }
  return { kind: 'failed', toast: '支付未完成，请重试', message: '本次支付未完成，可稍后重试或联系客服。' }
}

function logPaymentFailure(error = {}, stage = '') {
  let runtime = {}
  try { runtime = (wx.getAccountInfoSync() || {}).miniProgram || {} } catch (err) {}
  // Log only runtime identity and error fields. Never log payment signatures,
  // prepay IDs, session tokens, contact information or the payment parameters.
  console.warn('wechat_payment_failure', {
    stage,
    appId: runtime.appId || '',
    envVersion: runtime.envVersion || '',
    version: runtime.version || '',
    apiBase: API_BASE,
    errno: error && error.errno,
    errCode: error && (error.errCode ?? error.err_code ?? error.code),
    errMsg: String(error && (error.errMsg || error.message) || '')
  })
}

module.exports = { paymentFailure, logPaymentFailure }
