'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const booking = require('../miniprogram/utils/booking')
const miniRoot = path.resolve(__dirname, '../miniprogram')
const plain = value => JSON.parse(JSON.stringify(value))
const bundle = { _id: 'bundle', name: '旅拍和相册', price: 699, includedItems: [
  { type: 'album', target: { albumId: 'photo' } },
  { type: 'peripheral', name: '精装相册', quantity: 2, target: { peripheralId: 'gift' } }
] }
const photoOnly = { _id: 'photo-only', price: 399, includedItems: [{ type: 'album', albumId: 'photo' }] }
const address = { id: 'saved-address', recipient: '旅客', phone: '13800000000', province: '湖南省', city: '长沙市', district: '天心区', detail: '测试街道一号门' }

function loadPage(relative, dependencies = {}, wx = {}) {
  const file = path.join(miniRoot, relative)
  const realRequire = createRequire(file)
  let definition
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : realRequire(name),
    Page(value) { definition = value }, getApp: () => ({}), wx, console
  }, { filename: file })
  return { ...definition, data: plain(definition.data),
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() } }
}

function bookingPage() {
  const requests = [], toasts = [], navigations = [], cancellations = [], redirects = []
  const storage = new Map()
  const control = {}
  const config = { depositRatio: 0.3, bookingNotice: '预约须知', bookingNoticeVersion: 'notice-1' }
  const page = loadPage('pages/bookingInfo/bookingInfo.js', {
    '../../api/booking': {
      async createBooking(payload) { requests.push(plain(payload)); return control.create ? control.create(payload) : { success: true, data: { orderId: 'service-order' } } },
      async cancelBooking(payload) { cancellations.push(plain(payload)); return control.cancel ? control.cancel(payload) : { success: true, data: { bookingId: payload.bookingId, bookingStatus: 'cancelled' } } }
    },
    '../../service/bookingConfig': { getConfig: () => config, normalizeDepositRatio: value => value, async ensureLoaded() { return config } },
    '../../store/userStore': { hasBoundPhone: () => true, saveUser() {} },
    '../../utils/analytics': { track() {} }
  }, {
    showToast(value) { toasts.push(value) }, navigateTo(value) { navigations.push(value) }, redirectTo(value) { redirects.push(value) },
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key)
  })
  page.setData({ name: '旅客', phone: '13800000000', agreed: true, allPackages: [bundle, photoOnly], items: [{ packageId: 'bundle', price: 699 }] })
  page.updateTotalPrice()
  return { page, requests, toasts, navigations, cancellations, redirects, storage, control }
}

test('only selected packages containing physical products require a shipping address', () => {
  assert.equal(booking.bookingRequiresShipping([{ packageId: bundle._id }], [bundle, photoOnly]), true)
  assert.equal(booking.bookingRequiresShipping([{ packageId: photoOnly._id }], [bundle, photoOnly]), false)
  assert.equal(booking.bookingRequiresShipping([{ albumId: 'photo' }, { custom: true }], [bundle]), false)
  assert.equal(booking.bookingRequiresShipping([{ packageId: 'legacy' }], [{ id: 'legacy', items: [{ productType: 'peripheral', productId: 'gift' }] }]), true)
  assert.equal(booking.bookingRequiresShipping([{ packageId: 'legacy' }], [{ id: 'legacy', includedItems: [], items: [{ target: { page: 'peripheral', id: 'gift' } }] }]), true, 'An empty primary list cannot hide legacy package contents')
  assert.equal(booking.bookingRequiresShipping([{ type: 'package', productId: 'legacy' }], [{ id: 'legacy', includedItems: [{ name: '相册' }], items: [{ type: 'accessory', productId: 'gift' }] }]), true, 'Partial primary records merge with their legacy aliases by index')
  assert.equal(booking.bookingRequiresShipping([{ packageId: 'legacy' }], [{ id: 'legacy', includedItems: [{ type: 'album' }], items: [{ type: 'peripheral' }] }]), false, 'Primary item types take precedence over stale aliases')
  const { page } = bookingPage()
  assert.equal(page.data.requiresShipping, true)
  page.removeItem({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(page.data.requiresShipping, false)
  assert.equal(booking.validateBookingForm({ name: '旅客', phone: '13800000000', agreed: true, items: [{ peripheralId: 'gift' }] }).valid, false, 'Standalone peripherals keep using their separate checkout')
})

test('booking prevents missing addresses and submits the saved selection for the bundled products', async () => {
  const { page, requests, toasts, navigations } = bookingPage()
  await page.submitBooking()
  assert.equal(requests.length, 0)
  assert.equal(toasts.at(-1).title, '请选择套餐周边的收货地址')
  page.chooseShippingAddress()
  assert.equal(navigations[0].url, '/pages/shippingAddresses/shippingAddresses?select=1')
  navigations[0].events.addressSelected()
  navigations[0].events.addressSelected({ address: {} })
  assert.equal(page.data.shippingAddress, null)
  navigations[0].events.addressSelected({ address })
  assert.equal(page.data.shippingAddress.id, address.id)
  assert.equal(page.data.shippingAddressText, '湖南省 长沙市 天心区 测试街道一号门')
  await page.submitBooking()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].shippingAddressId, address.id)
  assert.equal(requests[0].shippingAddress, undefined, 'The server resolves the owned saved address rather than accepting a client address snapshot')
  assert.equal(requests[0].totalPrice, 699, 'Bundled products are already included in the service package price')
})

test('photo-only booking skips address validation and omits a previously selected shipping address', async () => {
  const { page, requests } = bookingPage()
  page.setData({ items: [{ packageId: photoOnly._id, price: 399 }], shippingAddress: address })
  page.updateTotalPrice()
  assert.equal(page.data.requiresShipping, false)
  await page.submitBooking()
  assert.equal(requests.length, 1)
  assert.equal(Object.hasOwn(requests[0], 'shippingAddressId'), false)
})

test('changing the shipping address closes the previous checkout before clearing its key and selecting a new address', async () => {
  const f = bookingPage()
  const nextAddress = { ...address, id: 'next-address', detail: '新收货地址五号门' }
  f.page.setData({ shippingAddress: address, bookingId: 'draft', bookingRequestKey: 'old-request', paymentStatus: 'pending' })
  f.storage.set('lxm_booking_payment_intent_draft', 'old-payment')
  let finish
  f.control.cancel = () => new Promise(resolve => { finish = resolve })
  f.page.chooseShippingAddress()
  const pending = f.navigations[0].events.addressSelected({ address: nextAddress })
  assert.equal(f.page.data.shippingAddress.id, address.id, 'No new address may appear while the old trade may still be payable')
  assert.equal(f.page.data.submitting, true)
  await f.page.submitBooking()
  assert.equal(f.requests.length, 0)
  finish({ success: true, data: { bookingId: 'draft', bookingStatus: 'cancelled' } })
  await pending
  assert.deepEqual(f.cancellations, [{ bookingId: 'draft' }])
  assert.equal(f.page.data.bookingId, '')
  assert.equal(f.page.data.bookingRequestKey, '')
  assert.equal(f.page.data.shippingAddress.id, nextAddress.id)
  assert.equal(f.storage.has('lxm_booking_payment_intent_draft'), false)
  await f.page.submitBooking()
  assert.equal(f.requests[0].shippingAddressId, nextAddress.id)
  assert.notEqual(f.requests[0].idempotencyKey, 'old-request')
})

test('failed or unconfirmed cancellation preserves the frozen shipping address and original retry keys', async () => {
  for (const response of [null, { success: false, error: '支付状态处理中' }, { success: true, data: { bookingId: 'draft', bookingStatus: 'cancelling' } },
    { success: true, data: { bookingStatus: 'cancelled' } }, { success: true, data: { bookingId: 'different-draft', bookingStatus: 'cancelled' } }]) {
    const f = bookingPage()
    f.page.setData({ shippingAddress: address, bookingId: 'draft', bookingRequestKey: 'old-request' })
    f.storage.set('lxm_booking_payment_intent_draft', 'old-payment')
    f.control.cancel = async () => { if (!response) throw new Error('网络异常'); return response }
    await f.page.acceptShippingAddress({ ...address, id: 'next-address' })
    assert.equal(f.page.data.shippingAddress.id, address.id)
    assert.equal(f.page.data.bookingRequestKey, 'old-request')
    assert.equal(f.page.data.bookingId, 'draft')
    assert.equal(f.storage.get('lxm_booking_payment_intent_draft'), 'old-payment')
    assert.equal(f.page.data.submitting, false)
    assert.equal(f.toasts.length, 1)
  }
})

test('a payment discovered while changing address opens the confirmed booking and retains its address', async () => {
  const f = bookingPage()
  f.page.setData({ shippingAddress: address, bookingId: 'draft', bookingRequestKey: 'old-request' })
  f.control.cancel = async () => ({ success: true, data: { bookingId: 'draft', bookingStatus: 'confirmed', orderId: 'paid-order', orderNo: 'PAID1' } })
  await f.page.acceptShippingAddress({ ...address, id: 'next-address' })
  assert.equal(f.page.data.shippingAddress.id, address.id)
  assert.equal(f.page.data.bookingRequestKey, 'old-request')
  assert.equal(f.redirects.length, 1)
  assert.match(f.redirects[0].url, /orderId=paid-order/)
  assert.equal(f.requests.length, 0)
})

test('an uncertain checkout freezes address edits and a confirmed cancelled retry resets without starting payment', async () => {
  const f = bookingPage()
  f.page.setData({ shippingAddress: address, bookingRequestKey: 'uncertain-request' })
  f.page.chooseShippingAddress()
  assert.equal(f.navigations.length, 0)
  assert.equal(f.toasts.at(-1).title, '请先查询预约状态，确认后再修改收货地址')
  let payments = 0
  f.page.startBookingPayment = async () => { payments++ }
  f.control.create = async () => ({ success: true, bookingId: 'expired-draft', bookingStatus: 'cancelled' })
  f.storage.set('lxm_booking_payment_intent_expired-draft', 'old-payment')
  await f.page.submitBooking()
  assert.equal(f.requests[0].idempotencyKey, 'uncertain-request', 'An uncertain checkout must first resolve through its original request')
  assert.equal(payments, 0)
  assert.equal(f.page.data.bookingRequestKey, '')
  assert.equal(f.storage.has('lxm_booking_payment_intent_expired-draft'), false)
  assert.equal(f.toasts.at(-1).title, '原预约已作废，请重新提交')
  await f.page.acceptShippingAddress({ ...address, id: 'next-address' })
  assert.equal(f.page.data.shippingAddress.id, 'next-address')
})

test('service order detail displays linked physical fulfillment and opens its existing logistics page', async () => {
  const navigations = []
  let response = { id: 'service', physicalOrders: [{ id: 'physical&1', orderNo: 'PS1', publicStatus: 'awaiting_shipment', publicStatusText: '待发货', items: [{ id: 'line', name: '精装相册', spec: '6寸', quantity: 2, price: 99 }] }] }
  const page = loadPage('pages/orderDetail/orderDetail.js', {
    '../../api/order': { async getOrderDetail() { return { success: true, data: response } } },
    '../../service/orderFileActions': { data: {}, actions: { loadAfterSales() {} } }
  }, { navigateTo(value) { navigations.push(value) } })
  page.setData({ id: 'service', shopId: 'shop', scene: 'source&1' })
  assert.equal(await page.loadOrder(), true)
  assert.equal(page.data.physicalOrdersDisplay[0].statusText, '待发货')
  assert.equal(page.data.physicalOrdersDisplay[0].items[0].quantity, 2)
  page.openPhysicalOrder({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(navigations[0].url, '/pages/physicalOrderDetail/physicalOrderDetail?id=physical%261&shopId=shop&scene=source%261')
  page.openPhysicalOrder({ currentTarget: { dataset: { index: 99 } } })
  assert.equal(navigations.length, 1)
  response = { id: 'service', physicalOrders: [] }
  await page.loadOrder()
  assert.equal(page.data.physicalOrdersDisplay.length, 0, 'Refresh clears links no longer returned by the server')
})

test('booking and service order templates expose the conditional address and logistics cards', () => {
  const bookingTemplate = fs.readFileSync(path.join(miniRoot, 'pages/bookingInfo/bookingInfo.wxml'), 'utf8')
  assert.match(bookingTemplate, /class="card shipping-address-card" wx:if="{{requiresShipping}}"/)
  assert.match(bookingTemplate, /bindtap="chooseShippingAddress"/)
  assert.match(bookingTemplate, /套餐周边随套餐履约，付清后安排发货/)
  const orderTemplate = fs.readFileSync(path.join(miniRoot, 'pages/orderDetail/orderDetail.wxml'), 'utf8')
  assert.match(orderTemplate, /wx:if="{{physicalOrdersDisplay.length}}"/)
  assert.match(orderTemplate, /bindtap="openPhysicalOrder" data-index="{{physicalIndex}}"/)
})

test('bundled physical fulfillment explains the included amount instead of offering a second payment', async () => {
  const page = loadPage('pages/physicalOrderDetail/physicalOrderDetail.js', {
    '../../api/physical': {
      async getPhysicalOrder() { return { id: 'child', paymentMode: 'package', parentOrderNo: 'SERVICE1', status: 'pending_payment', publicStatusText: '待套餐付清', totalAmount: 0, items: [{ id: 'line', name: '相册', quantity: 2, price: 0 }] } },
      async getPhysicalAfterSales() { return { items: [] } }
    }
  })
  page.setData({ id: 'child' })
  await page.load()
  assert.equal(page.data.order.statusText, '待套餐付清')
  assert.equal(page.data.order.parentOrderNo, 'SERVICE1')
  assert.equal(page.data.canPay, false, 'Package fulfillment cannot offer independent payment even without an actions projection')
  const template = fs.readFileSync(path.join(miniRoot, 'pages/physicalOrderDetail/physicalOrderDetail.wxml'), 'utf8')
  assert.match(template, /关联套餐订单号 {{order.parentOrderNo}}/)
  assert.match(template, /已包含在套餐金额中，无需另行付款/)
  assert.match(template, /order.paymentMode === 'package' \? '套餐包含' : '¥' \+ item.lineAmountText/)
  assert.match(template, /商品金额已包含在套餐中[^<]*<\/text>\s*<block wx:else>[\s\S]*?{{order.totalText}}/)
  const card = fs.readFileSync(path.join(miniRoot, 'components/lxm-order-card/lxm-order-card.wxml'), 'utf8')
  assert.match(card, /item.paymentMode === 'package' \? '套餐包含' : '¥' \+ item.totalText/)
})
