const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..', 'miniprogram')
const storage = new Map()
const diagnostics = []
const toasts = []
const redirects = []
let invokeError = null
let serverStatus = 'pending'
let statusError = null
let statusCalls = 0
const params = { timeStamp: '1700000000', nonceStr: 'private-nonce', package: 'prepay_id=private-prepay', signType: 'RSA', paySign: 'private-signature' }
const wx = {
  getAccountInfoSync: () => ({ miniProgram: { appId: 'wxefa2b93544724396', envVersion: 'trial', version: 'failure-test' } }),
  getStorageSync: key => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: key => storage.delete(key),
  requestPayment(options) { invokeError ? options.fail(invokeError) : options.success({ errMsg: 'requestPayment:ok' }) },
  showToast(value) { toasts.push(value) },
  redirectTo(value) { redirects.push(value) }
}
const safeConsole = { warn(label, data) { diagnostics.push({ label, data }) }, error() {} }
function evaluate(file, dependencies, globals = {}) {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, require: name => dependencies[name] || {}, wx, console: safeConsole,
    getApp: () => ({}), ...globals
  }, { filename: file })
  return module.exports
}
const feedback = evaluate('utils/paymentFeedback.js', { '../config/env': { API_BASE: 'https://www.cslxm.cn/api' } })
const orderApi = {
  async createPayment() { return { success: true, data: { status: 'pending', depositDue: 3, paymentParams: params } } },
  async getPaymentStatus() {
    statusCalls++
    if (statusError) throw statusError
    return { success: true, data: { status: serverStatus, orderId: serverStatus === 'confirmed' ? 'order-confirmed' : '' } }
  }
}
let bookingDefinition
evaluate('pages/bookingInfo/bookingInfo.js', {
  '../../api/order': orderApi,
  '../../utils/paymentFeedback': feedback,
  '../../utils/query': require('../miniprogram/utils/query'),
  '../../service/bookingConfig': { getConfig: () => ({}) }
}, { Page(definition) { bookingDefinition = definition } })
let orderDefinition
evaluate('pages/orderDetail/orderDetail.js', {
  '../../api/order': orderApi,
  '../../utils/paymentFeedback': feedback,
  '../../service/orderFileActions': { actions: {}, data: {} },
  '../../utils/query': require('../miniprogram/utils/query')
}, { Page(definition) { orderDefinition = definition } })
function pageOf(definition, extra = {}) {
  return {
    ...definition,
    data: { ...JSON.parse(JSON.stringify(definition.data)), ...extra },
    setData(patch) { Object.assign(this.data, patch) },
    async loadOrder() {}
  }
}

async function run() {
  invokeError = { errno: 102, errMsg: 'requestPayment:fail jsapi has no permission' }
  const blocked = pageOf(bookingDefinition, { depositDue: 3 })
  assert.equal(await blocked.startBookingPayment('booking-blocked'), false)
  assert.match(blocked.data.paymentMessage, /微信暂未允许本次支付/)
  assert.doesNotMatch(blocked.data.paymentMessage, /支付结果确认中/)
  assert.equal(blocked.data.paymentSubmitting, false)
  assert.equal(statusCalls, 1, 'Failed invocation must still check for an authoritative payment result')
  assert.equal(redirects.length, 0)
  assert.ok(storage.get('lxm_booking_payment_intent_booking-blocked'), 'Keep pending intent for a safe retry')
  const diagnostic = diagnostics.at(-1)
  assert.equal(diagnostic.label, 'wechat_payment_failure')
  assert.equal(diagnostic.data.errno, 102)
  assert.equal(diagnostic.data.appId, 'wxefa2b93544724396')
  assert.equal(diagnostic.data.envVersion, 'trial')
  assert.equal(diagnostic.data.apiBase, 'https://www.cslxm.cn/api')
  assert.doesNotMatch(JSON.stringify(diagnostics), /private-nonce|private-prepay|private-signature/)

  serverStatus = 'failed'
  const failed = pageOf(bookingDefinition, { depositDue: 3 })
  await failed.startBookingPayment('booking-failed')
  assert.equal(storage.has('lxm_booking_payment_intent_booking-failed'), false, 'A terminal failed payment must allow a new intent')
  serverStatus = 'pending'

  statusError = new Error('status offline')
  const offline = pageOf(bookingDefinition, { depositDue: 3 })
  await offline.startBookingPayment('booking-offline')
  assert.match(offline.data.paymentMessage, /微信暂未允许本次支付/)
  assert.match(offline.data.paymentMessage, /支付状态暂未核实/)
  statusError = null

  serverStatus = 'confirmed'
  const paid = pageOf(bookingDefinition, { depositDue: 3 })
  assert.equal(await paid.startBookingPayment('booking-confirmed'), true)
  assert.equal(redirects.length, 1, 'Server confirmation wins even if the client reports failure')
  assert.ok(redirects[0].url.includes('orderId=order-confirmed'))

  serverStatus = 'pending'
  invokeError = { errMsg: 'requestPayment:fail cancel' }
  const cancelled = pageOf(bookingDefinition, { depositDue: 3 })
  await cancelled.startBookingPayment('booking-cancelled')
  assert.match(cancelled.data.paymentMessage, /已取消本次支付/)

  invokeError = null
  const pending = pageOf(bookingDefinition, { depositDue: 3 })
  await pending.startBookingPayment('booking-pending')
  assert.match(pending.data.paymentMessage, /支付结果确认中/)

  invokeError = { errMsg: 'requestPayment:fail banned' }
  const order = pageOf(orderDefinition, { order: { _id: 'order-1', paymentPhase: 'final' } })
  await order.invokeWechatPayment({ status: 'pending', paymentParams: params })
  assert.match(order.data.paymentMessage, /微信暂未允许本次支付/)
  assert.equal(order.data.paymentStatus, 'pending', 'Do not rewrite the server payment status')
  assert.equal(diagnostics.at(-1).data.stage, 'order_payment')
  serverStatus = 'confirmed'
  await order.invokeWechatPayment({ status: 'pending', paymentParams: params })
  assert.equal(order.data.paymentStatus, 'confirmed')
  assert.match(order.data.paymentMessage, /已确认到账/)
  console.log('Payment failure checks passed: permission denied, cancellation, status failures, server confirmation and safe diagnostics')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
