'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const root = path.resolve(__dirname, '../miniprogram')

function load(relative, dependencies = {}, globals = {}) {
  const file = path.join(root, relative)
  const module = { exports: {} }
  const realRequire = createRequire(file)
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, console,
    require: id => Object.hasOwn(dependencies, id) ? dependencies[id] : realRequire(id),
    ...globals
  }, { filename: file })
  return module.exports
}

const response = tips => ({ success: true, data: { bookingSuccessTips: tips } })

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture(responses = [], override) {
  const requests = [], refreshes = [], navigation = []
  const config = load('service/bookingConfig.js', {
    '../api/bookingConfig': { async getBookingConfig(params) {
      const result = responses[requests.length]
      requests.push(params)
      if (result instanceof Error) throw result
      return result
    } }
  })
  let definition
  load('pages/bookingSuccess/bookingSuccess.js', {
    '../../api/order': { async getOrderDetail() {
      return { success: true, data: { id: 'order-live', orderNo: 'LXM-LIVE', packageName: '已预约商品' } }
    } },
    '../../service/bookingConfig': override || { ensureLoaded(refresh) {
      refreshes.push(refresh)
      return config.ensureLoaded(refresh)
    } },
    '../../service/customerService': {}
  }, {
    Page: value => { definition = value }, getApp: () => ({}),
    wx: { navigateTo: value => navigation.push(value.url) }
  })
  const updates = []
  const page = {
    ...definition, data: structuredClone(definition.data),
    setData(patch) { updates.push(patch); Object.assign(this.data, patch) }
  }
  return { page, config, requests, refreshes, navigation, updates, defaultTips: page.data.bookingSuccessTips }
}

test('success page reads current backend tips on each show despite shared cached configuration', async () => {
  const f = fixture([response('旧版后台提示'), response('新版后台提示\n第二行')])
  assert.match(f.defaultTips, /预约成功后订单为“已预约”/)
  assert.match(f.defaultTips, /无需支付尾款的订单/)
  await f.page.onShow()
  assert.equal(f.page.data.bookingSuccessTips, '旧版后台提示')
  assert.equal(f.config.getConfig().bookingSuccessTips, '旧版后台提示')
  await f.page.onShow()
  assert.equal(f.page.data.bookingSuccessTips, '新版后台提示\n第二行')
  assert.equal(f.requests.length, 2)
  assert.deepEqual(f.refreshes, [true, true])
})

test('multiline tips remain plain text with normalized line endings and paragraph breaks', async () => {
  const body = '  第一段\r\n\r\n第二段\r第三行 <view>按原样展示</view>  '
  const f = fixture([response(body)])
  await f.page.onShow()
  assert.equal(f.page.data.bookingSuccessTips, '第一段\n\n第二段\n第三行 <view>按原样展示</view>')
  assert.equal(f.config.getConfig().bookingNotice, '', 'success tips must not become consent terms')
  assert.equal(f.config.getConfig().bookingNoticeVersion, '')
  const markup = fs.readFileSync(path.join(root, 'pages/bookingSuccess/bookingSuccess.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'pages/bookingSuccess/bookingSuccess.wxss'), 'utf8')
  assert.match(markup, /<view class="tips-content">\{\{bookingSuccessTips\}\}<\/view>/)
  assert.match(styles, /\.tips-content\s*\{[^}]*white-space:\s*pre-wrap;/)
})

test('missing, cleared and invalid settings restore the existing default instead of stale tips', async () => {
  for (const value of [undefined, null, '', ' \r\n ', [], ['array is not a tips string'], {}, 123]) {
    const f = fixture([response('即将清空的后台提示'), response(value)])
    await f.page.onShow()
    await f.page.onShow()
    assert.equal(f.page.data.bookingSuccessTips, f.defaultTips)
    assert.equal(f.config.getConfig().bookingSuccessTips, '')
  }
})

test('network and rejected API responses leave a usable success page and recover on next show', async () => {
  for (const failure of [new Error('offline'), { success: false }, { success: true }, null]) {
    const f = fixture([response('旧版后台提示'), failure, response('恢复后的后台提示')])
    await f.page.onShow()
    await assert.doesNotReject(f.page.onShow())
    assert.equal(f.page.data.bookingSuccessTips, f.defaultTips)
    assert.equal(f.page.data.loadError, '', 'tips failures must not become order failures')
    await f.page.onShow()
    assert.equal(f.page.data.bookingSuccessTips, '恢复后的后台提示')
    assert.equal(f.requests.length, 3)
  }
})

test('an older page request cannot overwrite a newer configured value or a newer default', async () => {
  for (const latestTips of ['最新提示', '']) {
    for (const rejectOld of [false, true]) {
      const requests = []
      const f = fixture([], { ensureLoaded() {
        const request = deferred()
        requests.push(request)
        return request.promise
      } })
      const old = f.page.onShow()
      const current = f.page.onShow()
      requests[1].resolve({ bookingSuccessTips: latestTips })
      await current
      if (rejectOld) requests[0].reject(new Error('late failure'))
      else requests[0].resolve({ bookingSuccessTips: '过期提示' })
      await old
      assert.equal(f.page.data.bookingSuccessTips, latestTips || f.defaultTips)
    }
  }
})

test('the shared configuration cache and success page both keep the latest overlapping refresh', async () => {
  const first = deferred(), second = deferred()
  const f = fixture([first.promise, second.promise])
  const old = f.page.onShow()
  await Promise.resolve()
  const current = f.page.onShow()
  await Promise.resolve()
  second.resolve(response('后台新提示'))
  await current
  first.resolve(response('后台旧提示'))
  await old
  assert.equal(f.page.data.bookingSuccessTips, '后台新提示')
  assert.equal(f.config.getConfig().bookingSuccessTips, '后台新提示')
})

test('unloaded success pages ignore pending tips responses and failures', async () => {
  for (const reject of [false, true]) {
    const pending = deferred()
    const f = fixture([], { ensureLoaded: () => pending.promise })
    const request = f.page.onShow()
    f.page.onUnload()
    const updatesBeforeCompletion = f.updates.length
    if (reject) pending.reject(new Error('late failure'))
    else pending.resolve({ bookingSuccessTips: '已离开页面的提示' })
    await request
    assert.equal(f.updates.length, updatesBeforeCompletion)
  }
})

test('tips loading remains independent of order details and order navigation', async () => {
  const f = fixture([response('后台提示')])
  f.page.onLoad({ orderNo: 'LXM-LIVE' })
  await f.page.onShow()
  assert.equal(f.page.data.orderNo, 'LXM-LIVE')
  assert.equal(f.page.data.orderId, 'order-live')
  assert.equal(f.page.data.packageName, '已预约商品')
  assert.equal(f.page.data.loading, false)
  f.page.goOrderDetail()
  assert.match(f.navigation[0], /\/pages\/orderDetail\/orderDetail\?id=order-live/)
})

const reservedOrder = {
  id: 'service-order', orderNo: 'LXM-SERVICE', orderType: 'service',
  packageName: '旅拍预约', status: 'deposit_paid', totalAmount: 300,
  depositDue: 50, depositPaid: 50, depositFinanceStatus: 'confirmed', finalDue: 250
}
const orderResponse = order => ({ success: true, data: order })

function customerServiceFixture(initialResponse = orderResponse(reservedOrder)) {
  let currentResponse = initialResponse
  let definition, page
  const detailRequests = [], contactCalls = [], updates = []
  load('pages/bookingSuccess/bookingSuccess.js', {
    '../../api/order': { async getOrderDetail(params) {
      detailRequests.push(params)
      const result = typeof currentResponse === 'function' ? currentResponse(params) : currentResponse
      if (result instanceof Error) throw result
      return result
    } },
    '../../service/bookingConfig': { async ensureLoaded() { return { bookingSuccessTips: '后台预约提示' } } },
    '../../service/customerService': { openCustomerService() {
      contactCalls.push({ modalVisible: page.data.showCustomerServiceModal })
    } }
  }, {
    Page: value => { definition = value },
    getApp: () => ({ globalData: { corpId: 'configured-corp' } }),
    wx: {}, console: { error() {} }
  })
  page = {
    ...definition, data: structuredClone(definition.data),
    setData(patch) { updates.push(patch); Object.assign(this.data, patch) }
  }
  page.onLoad({})
  return {
    page, detailRequests, contactCalls, updates,
    setResponse(value) { currentResponse = value }
  }
}

test('paid, deposit-free and scheduled service bookings offer dedicated customer service after server confirmation', async () => {
  for (const order of [
    reservedOrder,
    { ...reservedOrder, status: 'confirmed', depositDue: 0, depositPaid: 0, finalDue: 300 },
    { ...reservedOrder, photographerId: 'assigned-photographer' }
  ]) {
    const f = customerServiceFixture(orderResponse(order))
    assert.equal(f.page.data.showCustomerServiceModal, false)
    await f.page.loadOrderDetail('', order.id)
    assert.equal(f.page.data.showCustomerServiceModal, true)
    assert.equal(f.page.data.loading, false)
    assert.deepEqual(JSON.parse(JSON.stringify(f.detailRequests)), [{ orderId: order.id }])
  }
})

test('a success-like query alone cannot show the prompt while order confirmation is pending', async () => {
  const pending = deferred()
  const f = customerServiceFixture(pending.promise)
  f.page.onLoad({ orderNo: 'LXM-SERVICE', workflowStage: 'awaiting_dispatch' })
  assert.equal(f.page.data.showCustomerServiceModal, false)
  pending.resolve(orderResponse({ ...reservedOrder, status: 'pending', depositPaid: 0, depositFinanceStatus: 'pending' }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.page.data.showCustomerServiceModal, false)
})

test('unpaid, cancelled, later-stage, physical and held orders do not receive a booking-success prompt', async () => {
  for (const order of [
    { ...reservedOrder, status: 'pending', depositPaid: 0, depositFinanceStatus: 'pending' },
    { ...reservedOrder, status: 'cancelled' },
    { ...reservedOrder, status: 'shooting' },
    { ...reservedOrder, status: 'completed' },
    { ...reservedOrder, orderType: 'physical' },
    { ...reservedOrder, afterSaleStatus: 'processing' },
    { ...reservedOrder, paymentReviewRequired: true, businessStatus: 'reserved' }
  ]) {
    const f = customerServiceFixture(orderResponse(order))
    await f.page.loadOrderDetail(order.orderNo)
    assert.equal(f.page.data.showCustomerServiceModal, false, JSON.stringify(order))
  }
})

test('failed order verification leaves the contact button usable without claiming booking success', async () => {
  for (const result of [null, { success: false }, { success: true }, new Error('offline')]) {
    const f = customerServiceFixture(result)
    await f.page.loadOrderDetail('LXM-SERVICE')
    assert.equal(f.page.data.showCustomerServiceModal, false)
    assert.ok(f.page.data.loadError)
    f.page.contactService()
    assert.equal(f.contactCalls.length, 1)
  }
})

test('dismissed customer service prompts stay closed on refresh and when returning from customer service', async () => {
  const f = customerServiceFixture()
  await f.page.loadOrderDetail('LXM-SERVICE')
  assert.equal(f.page.data.showCustomerServiceModal, true)
  f.page.closeCustomerServiceModal()
  await f.page.onShow()
  await f.page.loadOrderDetail('LXM-SERVICE')
  assert.equal(f.page.data.showCustomerServiceModal, false)
  const nextBooking = customerServiceFixture()
  await nextBooking.page.loadOrderDetail('LXM-SERVICE')
  assert.equal(nextBooking.page.data.showCustomerServiceModal, true, 'a new booking-success page can offer customer service again')
})

test('the prompt closes if refreshed order facts invalidate the successful booking', async () => {
  const f = customerServiceFixture()
  await f.page.loadOrderDetail('LXM-SERVICE')
  assert.equal(f.page.data.showCustomerServiceModal, true)
  f.setResponse(orderResponse({ ...reservedOrder, status: 'cancelled' }))
  await f.page.loadOrderDetail('LXM-SERVICE')
  assert.equal(f.page.data.showCustomerServiceModal, false)
  assert.equal(f.page.data.businessStatusKey, 'cancelled')
})

test('contacting dedicated customer service dismisses the prompt and delegates to the shared entry once', async () => {
  const f = customerServiceFixture()
  await f.page.loadOrderDetail('LXM-SERVICE')
  f.page.contactService()
  assert.equal(f.page.data.showCustomerServiceModal, false)
  assert.deepEqual(f.contactCalls, [{ modalVisible: false }])
  await f.page.onShow()
  assert.equal(f.page.data.showCustomerServiceModal, false)
})

test('contacting customer service before order details arrive prevents a redundant prompt on return', async () => {
  const pending = deferred()
  const f = customerServiceFixture(pending.promise)
  const request = f.page.loadOrderDetail('LXM-SERVICE')
  f.page.contactService()
  pending.resolve(orderResponse(reservedOrder))
  await request
  await f.page.onShow()
  assert.equal(f.page.data.showCustomerServiceModal, false)
  assert.equal(f.contactCalls.length, 1)
})

test('late older order responses cannot replace a cancellation or reopen the customer service prompt', async () => {
  const first = deferred(), second = deferred()
  const responses = [first.promise, second.promise]
  const f = customerServiceFixture(() => responses.shift())
  const old = f.page.loadOrderDetail('LXM-SERVICE')
  const current = f.page.loadOrderDetail('LXM-SERVICE')
  second.resolve(orderResponse({ ...reservedOrder, status: 'cancelled' }))
  await current
  first.resolve(orderResponse(reservedOrder))
  await old
  assert.equal(f.page.data.showCustomerServiceModal, false)
  assert.equal(f.page.data.businessStatusKey, 'cancelled')
  assert.equal(f.page.data.loading, false)
})

test('leaving the success page prevents delayed order results and failures from changing the page', async () => {
  for (const reject of [false, true]) {
    const pending = deferred()
    const f = customerServiceFixture(pending.promise)
    const request = f.page.loadOrderDetail('LXM-SERVICE')
    f.page.onUnload()
    const count = f.updates.length
    if (reject) pending.reject(new Error('late failure'))
    else pending.resolve(orderResponse(reservedOrder))
    await request
    assert.equal(f.updates.length, count)
    assert.equal(f.page.data.showCustomerServiceModal, false)
  }
})
