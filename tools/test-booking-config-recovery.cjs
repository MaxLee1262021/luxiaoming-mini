'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const root = path.resolve(__dirname, '../miniprogram')
const markup = fs.readFileSync(path.join(root, 'pages/bookingInfo/bookingInfo.wxml'), 'utf8')
const submit = markup.match(/<button class="submit-btn"([\s\S]*?)>([\s\S]*?)<\/button>/)
assert.ok(submit, 'the page must expose the booking submit action')
const disabledExpression = submit[1].match(/disabled="\{\{([\s\S]*?)\}\}"/)[1]
const labelExpression = submit[2].trim().match(/^\{\{([\s\S]*?)\}\}$/)[1]

function renderSubmit(data) {
  return {
    disabled: !!vm.runInNewContext(disabledExpression, data),
    label: vm.runInNewContext(labelExpression, data)
  }
}

function load(relative, dependencies = {}, globals = {}) {
  const file = path.join(root, relative)
  const module = { exports: {} }
  const realRequire = createRequire(file)
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, console: { warn() {}, error() {} },
    require: id => Object.hasOwn(dependencies, id) ? dependencies[id] : realRequire(id),
    ...globals
  }, { filename: file })
  return module.exports
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const response = (overrides = {}) => ({ success: true, data: {
  depositRatio: 0.3, customPrice: { single: 100, extraPerPerson: 30 },
  bookingNotice: '已发布的预约须知', bookingNoticeVersion: 'notice-from-server', ...overrides
} })
const tick = () => Promise.resolve()

function fixture(configOverride) {
  const requests = []
  const config = configOverride || load('service/bookingConfig.js', {
    '../api/bookingConfig': { getBookingConfig() {
      const request = deferred()
      requests.push(request)
      return request.promise
    } }
  })
  let definition
  load('pages/bookingInfo/bookingInfo.js', {
    '../../api/booking': {}, '../../api/order': {},
    '../../service/bookingConfig': config,
    '../../store/userStore': {
      getDisplayUserInfo: () => ({}), getBoundPhone: () => '', hasBoundPhone: () => false
    },
    '../../service/siteConfig': {},
    '../../utils/analytics': { track() {} }, '../../utils/paymentFeedback': {}
  }, { getApp: () => ({}), wx: { showToast() {} }, Page: value => { definition = value } })
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(value, callback) { Object.assign(this.data, value); if (callback) callback() }
  }
  page.data.items = [{ packageId: 'package-live', price: 1, depositRatio: 0.2 }]
  page.data.loading = false
  return { page, config, requests }
}

test('missing notice body or version explains a disabled deposit and a real configuration retry restores it', async () => {
  for (const missing of [{ bookingNoticeVersion: '' }, { bookingNotice: '' }]) {
    const { page, requests } = fixture()
    const initial = page.loadBookingConfig(true)
    assert.equal(renderSubmit(page.data).disabled, true)
    assert.match(renderSubmit(page.data).label, /加载中/)
    await tick()
    requests[0].resolve(response(missing))
    await initial
    page.toggleAgree()
    assert.equal(page.data.agreed, true)
    assert.equal(page.data.depositDue, 0.2, 'a product deposit override can quote a deposit without a ready notice')
    assert.equal(page.data.depositUnavailable, false)
    assert.match(page.data.bookingConfigError, /预约须知.*重试.*客服/)
    assert.deepEqual(renderSubmit(page.data), { disabled: true, label: '预约信息未就绪' })

    const retry = page.retryBookingConfig()
    assert.equal(page.data.agreed, false, 'the refreshed notice requires consent again')
    await tick()
    requests[1].resolve(response())
    await retry
    assert.equal(page.data.bookingConfigError, '')
    assert.equal(page.data.bookingConfig.bookingNoticeVersion, 'notice-from-server')
    assert.deepEqual(renderSubmit(page.data), { disabled: false, label: '提交预约并支付定金 ¥0.2' })
  }
  assert.match(markup, /wx:if="\{\{bookingConfigLoading \|\| bookingConfigError\}\}"/)
  assert.match(markup, /bindtap="retryBookingConfig"[^>]*>重新加载<\/button>/)
})

test('network failure exposes a recoverable error instead of payment copy', async () => {
  const { page, requests } = fixture()
  const initial = page.loadBookingConfig(true)
  await tick()
  requests[0].reject(new Error('network failure'))
  await initial
  assert.equal(page.data.bookingConfigLoading, false)
  assert.match(page.data.bookingConfigError, /加载失败.*重新加载/)
  assert.deepEqual(renderSubmit(page.data), { disabled: true, label: '预约信息未就绪' })
  const retry = page.retryBookingConfig()
  await tick()
  requests[1].resolve(response())
  await retry
  assert.equal(page.data.bookingConfigError, '')
  assert.equal(renderSubmit(page.data).disabled, false)
})

test('initial show shares the initial request and returning to a missing notice refreshes once', async () => {
  for (const completeBeforeShow of [false, true]) {
    const { page, requests } = fixture()
    page.applyPageConfig = () => {}
    page.loadBookingData = () => {}
    let initial
    const loadConfig = page.loadBookingConfig.bind(page)
    page.loadBookingConfig = refresh => { initial = loadConfig(refresh); return initial }
    page.onLoad()
    await tick()
    if (completeBeforeShow) {
      requests[0].resolve(response({ bookingNoticeVersion: '' }))
      await initial
    }
    page.onShow()
    await tick()
    assert.equal(requests.length, 1, 'initial onShow never duplicates onLoad, even after a fast incomplete response')
    if (!completeBeforeShow) {
      requests[0].resolve(response({ bookingNoticeVersion: '' }))
      await initial
    }
    const returned = page.onShow()
    await tick()
    page.onShow()
    await page.retryBookingConfig()
    assert.equal(requests.length, 2, 'return/retry events share the running refresh')
    requests[1].resolve(response())
    await returned
    page.onShow()
    await tick()
    assert.equal(requests.length, 2, 'ready configuration does not refresh on every show')
    assert.equal(renderSubmit(page.data).disabled, false)
  }
})

test('superseded responses and failures cannot replace the current page configuration or clear its loading state', async () => {
  for (const failStale of [false, true]) {
    const requests = []
    const cfg = response().data
    const config = {
      EMPTY_CONFIG: {}, getConfig: () => cfg,
      normalizeDepositRatio: value => value,
      ensureLoaded() { const request = deferred(); requests.push(request); return request.promise }
    }
    const { page } = fixture(config)
    const stale = page.loadBookingConfig(true)
    const current = page.loadBookingConfig(true)
    if (!failStale) {
      requests[0].resolve({ ...cfg, bookingNoticeVersion: '' })
      await stale
      assert.equal(page.data.bookingConfigLoading, true)
      assert.equal(page.data.bookingConfigError, '')
    }
    requests[1].resolve(cfg)
    await current
    if (failStale) {
      requests[0].reject(new Error('stale failure'))
      await stale
    }
    assert.equal(page.data.bookingConfig.bookingNoticeVersion, 'notice-from-server')
    assert.equal(page.data.bookingConfigError, '')
    assert.equal(page.data.bookingConfigLoading, false)
    assert.equal(renderSubmit(page.data).disabled, false)
  }
})

test('show and all recovery actions preserve consent while submitting or paying', async () => {
  for (const busy of ['submitting', 'paymentSubmitting']) {
    const { page, requests } = fixture()
    let dataReloads = 0
    page.loadBookingData = () => { dataReloads++ }
    page.data[busy] = true
    page.data.agreed = true
    page.data.bookingConfigError = '预约须知暂不可用'
    page.onShow()
    await page.retryBookingConfig()
    await page.onRetryLoad()
    await page.loadBookingConfig(true)
    await tick()
    assert.equal(requests.length, 0)
    assert.equal(dataReloads, 0)
    assert.equal(page.data.agreed, true)
    assert.equal(page.data.bookingConfigError, '预约须知暂不可用')
  }
})
