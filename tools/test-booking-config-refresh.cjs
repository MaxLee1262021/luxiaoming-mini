'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const root = path.resolve(__dirname, '../miniprogram')
const booking = require('../miniprogram/utils/booking')
const bookingData = require('../miniprogram/service/bookingData')
const bookingPicker = require('../miniprogram/service/bookingPicker')

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

function configFixture() {
  const requests = []
  const config = load('service/bookingConfig.js', { '../api/bookingConfig': { getBookingConfig() {
    return new Promise((resolve, reject) => requests.push({ resolve, reject }))
  } } })
  return { config, requests }
}

const response = (ratio, version = 'notice-new') => ({ success: true, data: {
  depositRatio: ratio, customPrice: { single: 100, extraPerPerson: 30 },
  bookingNotice: 'Configured notice', bookingNoticeVersion: version
} })
const tick = () => Promise.resolve()

function pageFixture(config) {
  let definition
  load('pages/bookingInfo/bookingInfo.js', {
    '../../api/booking': {}, '../../api/order': {},
    '../../service/bookingConfig': config,
    '../../store/userStore': {},
    '../../service/siteConfig': {},
    '../../utils/analytics': { track() {} },
    '../../utils/paymentFeedback': {}
  }, { getApp: () => ({}), wx: { showToast() {} }, Page: value => { definition = value } })
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(value, callback) { Object.assign(this.data, value); if (callback) callback() }
  }
}

test('refresh reloads configured values after a cached missing deposit and notice', async () => {
  const { config, requests } = configFixture()
  const first = config.ensureLoaded()
  await tick()
  requests[0].resolve({ success: true, data: {} })
  await first
  assert.equal(config.getConfig().depositRatio, null)
  await config.ensureLoaded()
  assert.equal(requests.length, 1)
  const refreshed = config.ensureLoaded(true)
  await tick()
  requests[1].resolve(response(0.3))
  await refreshed
  assert.equal(config.getConfig().depositRatio, 0.3)
  assert.equal(config.getConfig().bookingNoticeVersion, 'notice-new')
})

test('an explicit refresh supersedes an in-flight request without allowing stale results to replace it', async () => {
  const { config, requests } = configFixture()
  const stale = config.ensureLoaded()
  await tick()
  const current = config.ensureLoaded(true)
  await tick()
  assert.equal(requests.length, 2)
  requests[0].resolve(response(0.1, 'notice-old'))
  await tick()
  assert.equal(config.ensureLoaded(), current, 'older completion must not clear the current in-flight request')
  requests[1].resolve(response(0.4))
  assert.equal((await current).depositRatio, 0.4)
  assert.equal((await stale).depositRatio, 0.4)
  assert.equal(config.getConfig().bookingNoticeVersion, 'notice-new')
})

test('late stale responses and errors cannot restore a superseded configuration', async () => {
  for (const rejectStale of [false, true]) {
    const { config, requests } = configFixture()
    const stale = config.ensureLoaded()
    await tick()
    const current = config.ensureLoaded(true)
    await tick()
    requests[1].resolve(response(0))
    await current
    if (rejectStale) requests[0].reject(new Error('old network failure'))
    else requests[0].resolve(response(0.3, 'notice-old'))
    assert.equal((await stale).depositRatio, 0)
    assert.equal(config.getConfig().depositRatio, 0)
    assert.equal(config.getConfig().bookingNoticeVersion, 'notice-new')
  }
})

test('each new booking page explicitly refreshes the backend configuration', () => {
  const { config } = configFixture()
  const page = pageFixture(config)
  const refreshes = []
  page.applyPageConfig = () => {}
  page.refreshAuthState = () => {}
  page.loadBookingData = () => {}
  page.loadBookingConfig = refresh => refreshes.push(refresh)
  page.onLoad()
  assert.deepEqual(refreshes, [true])
})

test('page refresh disables stale consent and recomputes custom and inherited deposit with the latest global value', async () => {
  const { config, requests } = configFixture()
  const initial = config.ensureLoaded()
  await tick()
  requests[0].resolve(response(0.3, 'notice-old'))
  await initial
  const page = pageFixture(config)
  page.data.agreed = true
  page.data.depositRatio = 0.3
  page.data.items = [{ custom: true, price: 100, depositRatio: 0.3 }, { albumId: 'photo', price: 100, depositRatio: null }]
  const refreshed = page.loadBookingConfig(true)
  assert.equal(page.data.bookingConfig.bookingNoticeVersion, '')
  assert.equal(page.data.agreed, false)
  assert.equal(page.data.depositUnavailable, true)
  await tick()
  requests[1].resolve(response(0.4))
  await refreshed
  assert.equal(page.data.items[0].depositRatio, 0.4)
  assert.equal(page.data.depositDue, 80)
  assert.equal(page.data.depositUnavailable, false)
  assert.equal(page.data.bookingConfig.bookingNoticeVersion, 'notice-new')

  const removed = page.loadBookingConfig(true)
  await tick()
  requests[2].resolve({ success: true, data: {} })
  await removed
  assert.equal(page.data.depositRatio, null)
  assert.equal(page.data.depositUnavailable, true)
})

test('photo and video prefill and add-item paths use the product override before the global ratio', () => {
  const series = { _id: 'series', depositRatio: 0.9 }
  const spot = { _id: 'spot' }
  for (const [ratio, expected] of [[0.3, 30], [0, 0], [0.01, 1], [null, 40], [undefined, 40]]) {
    const album = { _id: 'photo', name: 'Photo', price: 100, seriesId: 'series', depositRatio: ratio }
    const video = { _id: 'video', name: 'Video', price: 100, seriesId: 'series', depositRatio: ratio }
    const data = { allPackages: [video], allAlbums: [album], allSeries: [series], spots: [spot] }
    const items = [
      bookingData.findPrefillSelection({ data, prefill: { albumId: 'photo' } }).item,
      bookingData.findPrefillSelection({ data, prefill: { packageId: 'video' } }).item,
      bookingPicker.buildItemFromAlbum({ album, series, spot }),
      booking.buildItemFromPackage({ pkg: video, series, spot, album }),
      booking.buildPrefillItem({ album, series, spot })
    ]
    for (const item of items) assert.equal(booking.sumDepositDue([item], 0.4), expected)
  }
  assert.equal(booking.sumDepositDue([{ price: 100, depositRatio: null, depositRate: 30 }], 0.4), 40)
  assert.equal(booking.sumDepositDue([{ price: 100, depositRate: 30 }], 0.4), 30)
})

test('small booking deposits round each line to fen consistently with the server', () => {
  assert.equal(booking.sumDepositDue([{ price: 0.1, depositRatio: 0.3 }]), 0.03)
  assert.equal(booking.sumDepositDue([{ price: 0.1, depositRatio: 0.01 }]), 0)
  assert.equal(booking.sumDepositDue(Array.from({ length: 10 }, () => ({ price: 0.1, depositRatio: 0.01 }))), 0)
  assert.equal(booking.sumDepositDue([{ price: 0.1, quantity: 10, depositRatio: 0.01 }]), 0.01)
  assert.equal(booking.sumDepositDue([{ price: 1.005, depositRatio: 0.5 }]), 0.51)
  assert.equal(booking.sumDepositDue([{ price: 0.1, depositRatio: 0 }, { price: 0.1, depositRatio: 0.3 }]), 0.03)
})

test('zero deposit copy submits a booking without promising a zero-yuan WeChat payment', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/bookingInfo/bookingInfo.wxml'), 'utf8')
  assert.match(wxml, /depositDue === 0 \? '本次无需定金'/)
  assert.match(wxml, /wx:if="\{\{!depositUnavailable && depositDue > 0\}\}"[^\n]*调起定金支付/)
  assert.match(wxml, /wx:elif="\{\{!depositUnavailable && depositDue === 0\}\}"[^\n]*本次无需支付定金，提交后生成预约单/)
  assert.match(wxml, /depositDue === 0 \? '提交预约' : '提交预约并支付定金 ¥'/)
})
