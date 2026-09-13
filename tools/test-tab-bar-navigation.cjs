const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')

function loadTabBar() {
  let definition
  const context = {
    Component(value) {
      definition = value
    },
    wx: {}
  }
  const source = fs.readFileSync(path.join(root, 'miniprogram/custom-tab-bar/index.js'), 'utf8')
  vm.runInNewContext(source, context, { filename: 'miniprogram/custom-tab-bar/index.js' })
  return { definition, context }
}

function createInstance(definition, selected = 0) {
  return {
    data: {
      selected,
      list: definition.data.list.map(item => ({ ...item }))
    },
    setData(next) {
      Object.assign(this.data, next)
    }
  }
}

function tap(index) {
  return { currentTarget: { dataset: { index } } }
}

function assertPageSelection(page, selected) {
  const source = fs.readFileSync(path.join(root, `miniprogram/pages/${page}/${page}.js`), 'utf8')
  const expected = new RegExp(`getTabBar[\\s\\S]*?setData\\(\\{ selected: ${selected} \\}\\)`, 'm')
  assert.match(source, expected, `${page} must synchronize its active tab on show`)
}

function assertPageRefresh(page, onShowCall, expectedMethods = []) {
  const source = fs.readFileSync(path.join(root, `miniprogram/pages/${page}/${page}.js`), 'utf8')
  const onShow = source.match(/onShow\(\)\s*\{([\s\S]*?)\n\s*\},/)
  assert(onShow, `${page} must define an onShow lifecycle handler`)
  assert.match(onShow[1], onShowCall, `${page} must refresh when its tab is shown`)

  expectedMethods.forEach((method) => {
    assert.match(source, new RegExp(`refreshOnTabShow[\\s\\S]*?this\\.${method}\\(`), `${page} refresh must call ${method}`)
  })
}

function testSuccessfulSwitchAndLock() {
  const { definition, context } = loadTabBar()
  const instance = createInstance(definition)
  const calls = []
  context.wx.switchTab = options => calls.push(options)

  definition.methods.switchTab.call(instance, tap(1))
  definition.methods.switchTab.call(instance, tap(2))

  assert.strictEqual(calls.length, 1)
  assert.strictEqual(calls[0].url, '/pages/explore/explore')
  assert.strictEqual(instance.data.selected, 0)

  calls[0].success()
  assert.strictEqual(instance.data.selected, 1)
  calls[0].complete()

  definition.methods.switchTab.call(instance, tap(2))
  assert.strictEqual(calls.length, 2)
  assert.strictEqual(calls[1].url, '/pages/my/my')
}

function testFailedSwitchRestoresSelectionAndUnlocks() {
  const { definition, context } = loadTabBar()
  const instance = createInstance(definition, 1)
  const calls = []
  context.wx.switchTab = options => calls.push(options)

  definition.methods.switchTab.call(instance, tap(2))
  calls[0].fail()
  assert.strictEqual(instance.data.selected, 1)
  calls[0].complete()

  definition.methods.switchTab.call(instance, tap(0))
  assert.strictEqual(calls.length, 2)
  assert.strictEqual(calls[1].url, '/pages/index/index')
}

function testInvalidSameTabAndThrownSwitchAreSafe() {
  const { definition, context } = loadTabBar()
  const instance = createInstance(definition, 1)
  let callCount = 0
  context.wx.switchTab = () => {
    callCount += 1
    throw new Error('switch failed')
  }

  definition.methods.switchTab.call(instance, tap('invalid'))
  definition.methods.switchTab.call(instance, tap(1))
  assert.strictEqual(callCount, 0)

  definition.methods.switchTab.call(instance, tap(0))
  assert.strictEqual(callCount, 1)
  assert.strictEqual(instance.data.selected, 1)

  definition.methods.switchTab.call(instance, tap(2))
  assert.strictEqual(callCount, 2)
}

function testExploreOverlayLeavesTabBarReachable() {
  const css = fs.readFileSync(path.join(root, 'miniprogram/pages/explore/explore.wxss'), 'utf8')
  const tabBarCss = fs.readFileSync(path.join(root, 'miniprogram/custom-tab-bar/index.wxss'), 'utf8')
  const rule = css.match(/\.guide-overlay\s*\{([\s\S]*?)\}/)
  assert(rule, 'guide overlay rule must exist')
  assert.match(rule[1], /bottom:\s*calc\(80rpx \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(rule[1], /z-index:\s*999/)
  assert.match(tabBarCss, /z-index:\s*1000/)
}

testSuccessfulSwitchAndLock()
testFailedSwitchRestoresSelectionAndUnlocks()
testInvalidSameTabAndThrownSwitchAreSafe()
testExploreOverlayLeavesTabBarReachable()
assertPageSelection('index', 0)
assertPageSelection('explore', 1)
assertPageSelection('my', 2)
assertPageRefresh('index', /refreshOnTabShow\(\)/, ['loadHomeData', 'loadSearchConfig'])
assertPageRefresh('explore', /refreshOnTabShow\(\)/, ['loadExploreBanners', 'reloadContent'])
assertPageRefresh('my', /refreshUserState\(\)/)

console.log('Custom tab bar navigation tests passed')
