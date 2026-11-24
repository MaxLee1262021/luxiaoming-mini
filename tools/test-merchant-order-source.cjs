'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { test } = require('node:test')

function bookingPage(currentSource) {
  const file = path.join(__dirname, '../miniprogram/pages/bookingInfo/bookingInfo.js')
  const realRequire = createRequire(file)
  const requests = [], toasts = []
  const config = { bookingNotice: 'Configured notice', bookingNoticeVersion: 'notice-current', depositRatio: 0 }
  const dependencies = {
    '../../api/booking': { async createBooking(payload) {
      requests.push(structuredClone(payload))
      return { success: true, data: { orderId: 'order-created', orderNo: 'ORDER-CREATED' } }
    } },
    '../../api/order': {},
    '../../service/bookingConfig': { getConfig: () => config, ensureLoaded: async () => config },
    '../../store/userStore': { saveUser() {} },
    '../../service/siteConfig': {},
    '../../utils/analytics': { track() {} },
    '../../utils/paymentFeedback': {}
  }
  let definition
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    console,
    require: id => Object.hasOwn(dependencies, id) ? dependencies[id] : realRequire(id),
    getApp: () => ({ getSource: () => currentSource }),
    wx: { showToast: value => toasts.push(value) },
    Page: value => { definition = value }
  }, { filename: file })
  const page = {
    ...definition,
    data: {
      ...structuredClone(definition.data),
      shopId: 'old-shop', scene: 'c=old-code', codeId: 'old-code',
      placementType: 'old-placement', placementLabel: 'Old placement',
      name: 'Synthetic customer', phone: '13800000000', agreed: true,
      items: [{ packageId: 'pkg', price: 100, depositRatio: 0 }]
    },
    setData(value) { Object.assign(this.data, value) },
    isPhoneReady: () => true,
    redirectToBookingSuccess() {}
  }
  return { page, requests, toasts }
}

test('booking submits the latest raw merchant scene even when its open form still refers to an older shop', async () => {
  const f = bookingPage({ scene: 'SNEWMERCHANT123', sourceType: 'merchant_qrcode', codeId: '', shopId: '' })
  await f.page.submitBooking()
  assert.equal(f.requests.length, 1)
  assert.equal(f.toasts.length, 0)
  assert.equal(f.requests[0].scene, 'SNEWMERCHANT123')
  assert.equal(f.requests[0].shopId, '')
  assert.equal(f.requests[0].codeId, '')
  assert.equal(f.requests[0].placementType, '')
  assert.equal(f.requests[0].placementLabel, '')
})

test('a direct current entry cannot inherit merchant fields from an old booking form', async () => {
  const f = bookingPage({})
  await f.page.submitBooking()
  assert.equal(f.requests.length, 1)
  for (const field of ['shopId', 'scene', 'codeId', 'placementType', 'placementLabel']) assert.equal(f.requests[0][field], '')
})

test('legacy merchant checkout keeps the current code and placement as one source', async () => {
  const f = bookingPage({ shopId: 'current-shop', scene: 'c=current-code', codeId: 'current-code', placementType: 'counter', placementLabel: 'Front counter' })
  await f.page.submitBooking()
  assert.equal(f.requests.length, 1)
  assert.equal(f.requests[0].scene, 'c=current-code')
  assert.equal(f.requests[0].shopId, 'current-shop')
  assert.equal(f.requests[0].codeId, 'current-code')
  assert.equal(f.requests[0].placementType, 'counter')
  assert.equal(f.requests[0].placementLabel, 'Front counter')
})

function physicalCheckout(createOrder) {
  const file = path.join(__dirname, '../miniprogram/pages/physicalCheckout/physicalCheckout.js')
  const realRequire = createRequire(file)
  const state = { source: { shopId: 'old-shop', scene: 'c=old-code', codeId: 'old-code', cityId: 'old-city' } }
  const requests = []
  let definition
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    console,
    require(id) {
      if (id === '../../api/physical') return { async createPhysicalOrder(payload) {
        requests.push(structuredClone(payload))
        return createOrder ? createOrder(payload, requests.length) : { id: 'physical-order' }
      } }
      if (id === '../../service/physicalPayment') return { async payPhysicalOrder() { return { status: 'cancelled' } } }
      return realRequire(id)
    },
    getApp: () => ({ getSource: () => state.source }),
    wx: { redirectTo() {}, showToast() {} },
    Page: value => { definition = value }
  }, { filename: file })
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(value) { Object.assign(this.data, value) },
    load() {}
  }
  page.onLoad({ checkoutSource: 'direct', productId: 'p1', skuId: 'sku1', quantity: 1 })
  page.setData({ address: { id: 'address', version: 1 }, quote: { quoteVersion: 'quote' }, agreed: true })
  return { page, state, requests }
}

test('physical checkout uses the latest merchant scan when its open form was loaded under another merchant', async () => {
  const f = physicalCheckout()
  f.state.source = { shopId: '', scene: 'SNEWMERCHANT123', codeId: '', cityId: '' }
  await f.page.submit()
  assert.equal(f.requests.length, 1)
  assert.deepEqual(f.requests[0].source, { shopId: '', scene: 'SNEWMERCHANT123', codeId: '', cityId: '' })
})

test('physical creation retries retain the original merchant and request key after a later scan', async () => {
  const f = physicalCheckout((_payload, attempt) => {
    if (attempt === 1) throw new Error('unknown creation result')
    return { id: 'recovered-order' }
  })
  f.state.source = { scene: 'SFIRSTMERCHANT123' }
  await f.page.submit()
  assert.equal(f.page.data.submissionPending, true)
  f.state.source = { scene: 'SNEXTMERCHANT456' }
  await f.page.submit()
  assert.equal(f.requests.length, 2)
  assert.deepEqual(f.requests[1], f.requests[0], 'retries recover the first order instead of altering its attribution')
  assert.equal(f.requests[1].source.scene, 'SFIRSTMERCHANT123')
})
