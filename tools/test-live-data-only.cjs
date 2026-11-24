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
    require: id => Object.prototype.hasOwnProperty.call(dependencies, id) ? dependencies[id] : realRequire(id),
    ...globals
  }, { filename: file })
  return module.exports
}

test('empty live catalogs never merge local preview rows or construct unavailable products', () => {
  const { buildHomeViewData } = require('../miniprogram/service/homeData')
  const { buildSearchSuggestions } = require('../miniprogram/utils/searchSuggestions')
  const booking = require('../miniprogram/service/bookingData')
  const preview = { spots: [{ _id: 'local-spot' }], albums: [{ _id: 'local-photo' }], packages: [{ _id: 'local-package', price: 20 }] }
  const home = buildHomeViewData({}, preview, preview)
  for (const key of ['spots', 'bookingAlbums', 'packages', 'peripherals', 'guides']) assert.deepEqual(home[key], [], key)
  assert.deepEqual(buildSearchSuggestions(''), [])
  const catalog = booking.mergeBookingData({}, { allowFallback: true })
  assert.ok(Object.values(catalog).every(list => list.length === 0))
  assert.deepEqual(booking.findPrefillSelection({ prefill: { albumId: 'missing', albumPrice: 9, seriesId: 'missing' } }).item, {})
})

test('booking configuration failures remain retryable and missing values cannot create a local quote or notice', async () => {
  let response
  let requests = 0
  const config = load('service/bookingConfig.js', { '../api/bookingConfig': { async getBookingConfig() { requests++; if (!response) throw new Error('offline'); return response } } })
  assert.equal(config.singlePrice(), null)
  assert.equal(config.calcCustomPrice(2), null)
  assert.equal(config.getConfig().bookingNoticeVersion, '')
  await assert.rejects(config.ensureLoaded(), /offline/)
  assert.equal(config.getConfig().bookingNotice, '')
  response = { success: true, data: { customPrice: { single: 300, extraPerPerson: 80 }, depositRatio: 0, bookingNotice: '真实配置的须知', bookingNoticeVersion: 'notice-live' } }
  await config.ensureLoaded()
  assert.equal(requests, 2)
  assert.equal(config.calcCustomPrice(2), 380)
  assert.equal(config.getConfig().depositRatio, 0)
  assert.equal(config.getConfig().bookingNoticeVersion, 'notice-live')

  const missing = load('service/bookingConfig.js', { '../api/bookingConfig': { async getBookingConfig() { return { success: true, data: {} } } } })
  const empty = await missing.ensureLoaded()
  assert.equal(empty.depositRatio, null)
  assert.equal(empty.customPrice.single, null)
  assert.equal(empty.bookingNotice, '')
})

test('guide and search errors propagate even when a retired demo flag exists', async () => {
  const client = { async callCloud() { throw new Error('real API unavailable') } }
  const wx = { getStorageSync: () => true, getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }) }
  const guide = load('api/guide.js', { './client': client }, { wx })
  await assert.rejects(guide.getGuides(), /real API unavailable/)
  await assert.rejects(guide.getGuideDetail({ id: 'missing' }), /real API unavailable/)
  const search = load('api/search.js', { './client': client, './home': { async getHomeData() { throw new Error('real API unavailable') } } }, { wx })
  await assert.rejects(search.getSearchHome(), /real API unavailable/)
  await assert.rejects(search.search({ keyword: 'missing' }), /real API unavailable/)
  const env = load('config/env.js', {}, { wx })
  assert.equal(env.isExplicitDemoMode, undefined)
})

test('legacy local profile and page configuration cannot be displayed as current database state', () => {
  const storage = new Map([
    ['lxm_user_profile', { phone: '13800000000', openid: 'local-preview-user' }],
    ['lxm_site_page_config', { pageModules: { my: { footprint: { stamps: [{ name: 'local-city' }] } } } }],
    ['lxm_selected_city', { selectionVersion: 1, cityId: 'local-city', city: 'local' }]
  ])
  const wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) }
  const users = load('store/userStore.js', { '../api/user': {}, '../api/client': { isLoggedOut: () => false } }, { wx })
  assert.equal(users.getBoundPhone(), '')
  const config = load('service/siteConfig.js', {}, { wx, getApp: () => null })
  assert.equal(Object.keys(config.getSitePageConfig()).length, 0)
  const cities = load('store/cityStore.js', {}, { wx })
  assert.equal(Object.keys(cities.getCity()).length, 0)
})

test('simulated provider responses cannot be accepted as real payment receipts', async () => {
  const api = load('api/order.js', { './client': { async callCloud() { return { success: true, data: { status: 'confirmed', simulatedPayment: true, provider: 'mock_payment' } } } } })
  await assert.rejects(api.createPayment({ orderId: 'fixture-order' }), /支付通道不可用/)
  await assert.rejects(api.getPaymentStatus({ orderId: 'fixture-order' }), /支付通道不可用/)
  assert.equal(api.testPayment, undefined)
})

test('missing real notice prevents submission and a cached basket cannot restore unavailable catalog rows', async () => {
  let definition
  let created = 0
  const notices = []
  const emptyConfig = { customPrice: { single: null, extraPerPerson: null }, bookingNotice: '', bookingNoticeVersion: '', depositRatio: null }
  const wx = {
    showToast: value => notices.push(value.title),
    getStorageSync: () => [{ albumId: 'retired-album', albumName: '旧本地商品', price: 20 }],
    removeStorageSync() {}
  }
  load('pages/bookingInfo/bookingInfo.js', {
    '../../api/booking': { async createBooking() { created++; return { success: true } } },
    '../../service/bookingConfig': { getConfig: () => emptyConfig, ensureLoaded: async () => emptyConfig }
  }, { wx, getApp: () => ({}), Page: value => { definition = value } })
  const page = {
    ...definition,
    data: { ...definition.data, name: '合成测试用户', phone: '13900139000', agreed: true, items: [{ packageId: 'live-id', price: 20 }] },
    isPhoneReady: () => true,
    setData(value) { Object.assign(this.data, value) }
  }
  await page.submitBooking()
  assert.equal(created, 0)
  assert.match(notices.at(-1), /预约须知暂未配置/)
  page.data.prefillBasket = '1'
  page.updateTotalPrice = () => {}
  page.initPrefill()
  assert.equal(page.data.items.length, 0)
})

test('unconfigured footprints do not invent local stamps or reward promises', () => {
  const footprint = load('service/footprint.js', {
    './siteConfig': { getPageModuleConfig: () => ({}) },
    '../api/footprintConfig': {}
  })
  const result = footprint.buildFootprint([{ spotName: '任意城市', status: 'completed' }], { authReady: true })
  assert.equal(result.total, 0)
  assert.equal(result.stamps.length, 0)
  assert.equal(result.subText, '')
})

test('customer service loads the enterprise ID without replacing the pinned link on refresh or failure', async () => {
  let app
  let fail = false
  let requests = 0
  load('app.js', {
    './api/client': { async callCloud(name) { requests++; assert.equal(name, 'getCorpConfig'); if (fail) throw new Error('offline'); return { success: true, data: { corpId: 'database-corp', customerServiceUrl: 'https://work.weixin.qq.com/kfid/database' } } } }
  }, { Page() {}, App: value => { app = value }, wx: { showToast() {} } })
  assert.equal(app.globalData.corpId, '')
  assert.equal(app.globalData.customerServiceUrl, 'https://work.weixin.qq.com/kfid/kfc39a3180cff84adda')
  const request = app.loadCustomerServiceConfig()
  assert.strictEqual(app.loadCustomerServiceConfig(), request)
  await request
  assert.equal(requests, 1)
  assert.equal(app.globalData.corpId, 'database-corp')
  assert.equal(app.globalData.customerServiceUrl, 'https://work.weixin.qq.com/kfid/kfc39a3180cff84adda')
  fail = true
  await app.loadCustomerServiceConfig()
  assert.equal(requests, 2)
  assert.equal(app.globalData.corpId, '')
  assert.equal(app.globalData.customerServiceUrl, 'https://work.weixin.qq.com/kfid/kfc39a3180cff84adda')
  fail = false
  await app.loadCustomerServiceConfig()
  assert.equal(requests, 3)
  assert.equal(app.globalData.corpId, 'database-corp')
})

test('production dependency graph contains no sample catalog or demo mode entry point', () => {
  assert.equal(fs.existsSync(path.join(root, 'utils/demoData.js')), false)
  const scan = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? scan(path.join(directory, entry.name)) : [path.join(directory, entry.name)])
  for (const file of scan(root).filter(file => file.endsWith('.js'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /require\([^\n]*(?:demoData|mockData)|isExplicitDemoMode|applyDemo\w*\(/, path.relative(root, file))
  }
})
