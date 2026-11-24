'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

const root = path.resolve(__dirname, '../miniprogram')
const response = bookingNotice => ({ success: true, data: { bookingNotice } })

function fixture(responses, { authed = true } = {}) {
  const requests = []
  const refreshes = []
  const modals = []
  const toasts = []
  const events = []
  const configModule = { exports: {} }
  const configPath = path.join(root, 'service/bookingConfig.js')
  vm.runInNewContext(fs.readFileSync(configPath, 'utf8'), {
    module: configModule,
    require(id) {
      assert.equal(id, '../api/bookingConfig')
      return { async getBookingConfig(params) {
        const result = responses[requests.length]
        requests.push(params)
        if (result instanceof Error) throw result
        return result
      } }
    }
  }, { filename: configPath })
  const config = configModule.exports
  const bookingConfig = {
    ...config,
    ensureLoaded(refresh) {
      refreshes.push(refresh)
      return config.ensureLoaded(refresh)
    }
  }
  const dependencies = {
    '../../service/bookingConfig': bookingConfig,
    '../../service/customerService': {},
    '../../api/client': {},
    '../../api/order': {},
    '../../api/physical': {},
    '../../store/sourceStore': {},
    '../../store/userStore': {
      isAuthed() { return authed },
      hasBoundPhone() { return false },
      getBoundPhone() { return '' },
      getLastContactPhone() { return '' }
    },
    '../../utils/query': {},
    '../../utils/orderStatusFilters': { ORDER_STATUS_FILTERS: [] },
    '../../utils/physical': { PHYSICAL_FILTERS: [] }
  }
  let definition
  const pagePath = path.join(root, 'pages/my/my.js')
  vm.runInNewContext(fs.readFileSync(pagePath, 'utf8'), {
    Page(value) { definition = value },
    getApp() { return {} },
    console: { warn() {}, error() {} },
    require(id) {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`)
      return dependencies[id]
    },
    wx: {
      showLoading(options) { events.push({ type: 'loading', ...options }) },
      hideLoading() { events.push({ type: 'hidden' }) },
      showModal(options) { modals.push(options); events.push({ type: 'modal' }) },
      showToast(options) { toasts.push(options) }
    }
  }, { filename: pagePath })
  const page = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch) }
  }
  return { page, config, requests, refreshes, modals, toasts, events }
}

test('My booking notice displays the complete backend body with its line breaks', async () => {
  const body = '麓小鸣约拍｜预约须知\n下单支付定金，即代表您已阅读并同意以下全部预约规则：\n' +
    Array.from({ length: 12 }, (_, index) => `${index + 1}. 后台配置的预约规则，含档期确认、改期、定金及尾款说明。`).join('\n')
  const f = fixture([response(body)])
  await f.page.goToNotice()

  assert.equal(f.requests.length, 1)
  assert.deepEqual(f.refreshes, [true])
  assert.equal(f.modals.length, 1)
  assert.equal(f.modals[0].title, '预约须知')
  assert.equal(f.modals[0].content, body)
  assert.equal(f.modals[0].showCancel, false)
  assert.deepEqual(f.events.map(event => event.type), ['loading', 'hidden', 'modal'])
  assert.equal(f.events[0].mask, true)
})

test('reopening the notice fetches backend updates despite an existing shared config cache', async () => {
  const f = fixture([response('旧版后台须知'), response('新版后台须知\n2. 更新后的改期规则')])
  await f.page.goToNotice()
  assert.equal(f.config.getConfig().bookingNotice, '旧版后台须知')
  await f.page.goToNotice()

  assert.equal(f.requests.length, 2)
  assert.deepEqual(f.refreshes, [true, true])
  assert.equal(f.modals[1].content, '新版后台须知\n2. 更新后的改期规则')
})

test('failed or empty backend responses never show stale notice text and allow another attempt', async () => {
  const failures = [new Error('offline'), { success: false }, response(''), response('  \n '), response(null), response([])]
  for (const failure of failures) {
    const f = fixture([response('旧版后台须知'), failure, response('重试后最新后台须知')])
    await f.page.goToNotice()
    await f.page.goToNotice()

    assert.equal(f.modals.length, 2)
    assert.equal(f.modals[1].title, '预约须知')
    assert.match(f.modals[1].content, /暂未配置|加载失败|稍后重试|重新/)
    assert.doesNotMatch(f.modals[1].content, /旧版后台须知|建议提前预约|拍摄当天请准时到达/)
    assert.equal(f.events.filter(event => event.type === 'hidden').length, 2)

    await f.page.goToNotice()
    assert.equal(f.requests.length, 3)
    assert.equal(f.modals[2].content, '重试后最新后台须知')
    assert.equal(f.events.filter(event => event.type === 'hidden').length, 3)
  }
})

test('repeated taps while loading open only one request and one notice', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const f = fixture([pending])
  const first = f.page.goToNotice()
  const second = f.page.goToNotice()
  await Promise.resolve()

  assert.equal(f.requests.length, 1)
  assert.equal(f.events.filter(event => event.type === 'loading').length, 1)
  assert.equal(f.modals.length, 0)
  resolve(response('后台须知'))
  await Promise.all([first, second])
  assert.equal(f.modals.length, 1)
  assert.equal(f.modals[0].content, '后台须知')
})

test('the notice keeps the existing authentication guard', async () => {
  const f = fixture([response('后台须知')], { authed: false })
  await f.page.goToNotice()

  assert.equal(f.requests.length, 0)
  assert.equal(f.modals.length, 0)
  assert.equal(f.events.length, 0)
  assert.equal(f.toasts.length, 1)
  assert.match(f.toasts[0].title, /请先授权/)
})
