const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

const root = path.resolve(__dirname, '../miniprogram')
const componentPath = path.join(root, 'components/lxm-privacy-modal/lxm-privacy-modal.js')

function setup(overrides = {}) {
  let app
  let definition
  const navigations = []
  const results = []
  const wx = {
    showToast() {},
    navigateTo(options) { navigations.push(options); options.success() },
    ...overrides
  }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), {
    App(value) { app = value }, Page() {}, require() { return {} }, wx, console
  }, { filename: 'app.js' })
  const resolve = result => { results.push({ ...result }) }
  Object.assign(app.globalData, { _privacyNeed: true, _privacyResolve: resolve })
  vm.runInNewContext(fs.readFileSync(componentPath, 'utf8'), {
    Component(value) { definition = value }, getApp() { return app }, wx, console
  }, { filename: componentPath })
  const modal = {
    ...definition.methods,
    data: { ...definition.data },
    setData(patch) { Object.assign(this.data, patch) }
  }
  definition.pageLifetimes.show.call(modal)
  return { app, modal, definition, navigations, results, resolve, wx }
}

test('viewing the native privacy contract preserves the pending authorization and dialog', () => {
  let opened = 0
  const { modal, app, results, resolve, navigations } = setup({
    openPrivacyContract(options) { opened++; options.success() }
  })
  modal.onViewPolicy()
  assert.equal(opened, 1)
  assert.equal(navigations.length, 0)
  assert.equal(modal.data.policyOpening, false)
  assert.equal(modal.data.visible, true)
  assert.equal(app.globalData._privacyNeed, true)
  assert.equal(app.globalData._privacyResolve, resolve)
  assert.deepEqual(results, [])
})

test('missing, failed or throwing native reader opens the local policy, and returning restores consent', () => {
  for (const override of [
    {},
    { openPrivacyContract(options) { options.fail({ errMsg: 'unavailable' }) } },
    { openPrivacyContract() { throw new Error('unavailable') } }
  ]) {
    const { modal, app, definition, navigations, results, resolve } = setup(override)
    modal.onViewPolicy()
    assert.equal(navigations.at(-1).url, '/pages/privacy/privacy')
    assert.equal(modal.data.visible, false)
    assert.equal(modal.data.policyOpening, false)
    assert.equal(app.globalData._privacyNeed, true)
    assert.equal(app.globalData._privacyResolve, resolve)
    assert.deepEqual(results, [])
    definition.pageLifetimes.hide.call(modal)
    assert.equal(app._privacyModal, null)
    definition.pageLifetimes.show.call(modal)
    assert.equal(app._privacyModal, modal)
    assert.equal(modal.data.visible, true)
  }
})

test('a failed navigation shows a retryable error and never drops the privacy request', () => {
  for (const navigateTo of [
    options => options.fail({ errMsg: 'page stack full' }),
    () => { throw new Error('unavailable') }
  ]) {
    const { modal, app, results, resolve, wx } = setup({ navigateTo })
    modal.onViewPolicy()
    assert.equal(modal.data.visible, true)
    assert.equal(modal.data.policyOpening, false)
    assert.match(modal.data.policyError, /无法打开/)
    assert.equal(app.globalData._privacyResolve, resolve)
    assert.deepEqual(results, [])
    wx.navigateTo = options => options.success()
    modal.onViewPolicy()
    assert.equal(modal.data.visible, false)
    assert.equal(modal.data.policyError, '')
  }
})

test('repeated taps cannot open multiple contract readers while the first is opening', () => {
  let opened = 0
  let nativeOptions
  const { modal } = setup({ openPrivacyContract(options) { opened++; nativeOptions = options } })
  modal.onViewPolicy()
  modal.onViewPolicy()
  assert.equal(opened, 1)
  assert.equal(modal.data.policyOpening, true)
  nativeOptions.success()
  modal.onViewPolicy()
  assert.equal(opened, 2)
})

test('ordinary taps cannot grant pending consent or remove the native authorization button', () => {
  for (const override of [
    {},
    { getPrivacySetting(options) { options.success({ needAuthorization: true }) } },
    { getPrivacySetting(options) { options.fail({ errMsg: 'unavailable' }) } },
    { getPrivacySetting() { throw new Error('unavailable') } }
  ]) {
    const { modal, app, results, resolve } = setup(override)
    modal.onAgreeTap()
    assert.equal(modal.data.visible, true)
    assert.equal(app.globalData._privacyNeed, true)
    assert.equal(app.globalData._privacyResolve, resolve)
    assert.deepEqual(results, [])
  }
})

test('native consent resolves once while the button is mounted, then closes the dialog', () => {
  const { modal, app } = setup()
  let calls = 0
  app.globalData._privacyResolve = result => {
    calls++
    assert.equal(modal.data.visible, true)
    assert.equal(result.event, 'agree')
    assert.equal(result.buttonId, 'privacy-agree')
  }
  modal.onAgree()
  modal.onAgree()
  assert.equal(calls, 1)
  assert.equal(modal.data.visible, false)
  assert.equal(app.globalData._privacyNeed, false)
  assert.equal(app.globalData._privacyResolve, null)
})

test('already granted consent can reconcile, but a delayed check cannot resolve a newer request', () => {
  const granted = setup({ getPrivacySetting(options) { options.success({ needAuthorization: false }) } })
  granted.modal.onAgreeTap()
  assert.equal(granted.modal.data.visible, false)
  assert.deepEqual(granted.results, [{ event: 'agree', buttonId: 'privacy-agree' }])

  let delayed
  const pending = setup({ getPrivacySetting(options) { delayed = options } })
  pending.modal.onAgreeTap()
  let newerResolved = false
  pending.app.globalData._privacyResolve = () => { newerResolved = true }
  delayed.fail({ errMsg: 'old query failed' })
  assert.equal(pending.modal.data.policyError, '')
  delayed.success({ needAuthorization: false })
  assert.equal(newerResolved, false)
  assert.equal(pending.modal.data.visible, true)
})

test('declining closes without consent, and an SDK rejection leaves the request retryable', () => {
  const declined = setup()
  declined.modal.onDecline()
  assert.deepEqual(declined.results, [{ event: 'disagree' }])
  assert.equal(declined.modal.data.visible, false)

  const rejected = setup()
  rejected.app.globalData._privacyResolve = () => { throw new Error('SDK rejected') }
  rejected.modal.onAgree()
  assert.equal(rejected.modal.data.visible, true)
  assert.equal(rejected.app.globalData._privacyNeed, true)
  assert.match(rejected.modal.data.policyError, /授权未完成/)
})
