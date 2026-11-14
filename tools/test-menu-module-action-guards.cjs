const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const pageConsole = { log() {}, warn() {}, error() {} }

function loadPage(relativePath, dependencies, wx, app) {
  let definition
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  vm.runInNewContext(source, {
    Page(value) { definition = value },
    getApp() { return app || { globalData: {} } },
    require(request) {
      if (request === '../../service/customerService') {
        const module = { exports: {} }
        const servicePath = 'miniprogram/service/customerService.js'
        vm.runInNewContext(fs.readFileSync(path.join(root, servicePath), 'utf8'), {
          module,
          wx,
          getApp() { return app || { globalData: {} } },
          console: pageConsole
        }, { filename: servicePath })
        return module.exports
      }
      return dependencies[request] || {}
    },
    wx,
    console: pageConsole,
    Promise,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Error
  }, { filename: relativePath })
  return definition
}

function createMyPage(wx, app, overrides = {}) {
  return loadPage('miniprogram/pages/my/my.js', {
    '../../utils/demoData': { orders: [] },
    '../../api/order': {},
    '../../api/client': {},
    '../../store/sourceStore': {},
    '../../store/userStore': {},
    '../../service/footprint': { getEmptyFootprint() { return {} } },
    '../../utils/query': {},
    ...overrides
  }, wx, app)
}

function createExplorePage(wx) {
  return loadPage('miniprogram/pages/explore/explore.js', {
    '../../utils/demoData': { spots: [], exploreBanners: [] },
    '../../api/spot': {},
    '../../api/cities': {},
    '../../service/spotFilter': {},
    '../../utils/query': {},
    '../../utils/product': {},
    '../../api/home': {},
    '../../service/homeData': {},
    '../../utils/searchNav': {},
    '../../utils/searchSuggestions': {},
    '../../config/env': { isExplicitDemoMode() { return false } },
    '../../service/citySpot': {}
  }, wx)
}

function createPeripheralsPage(wx, app, overrides = {}) {
  return loadPage('miniprogram/pages/peripherals/peripherals.js', {
    '../../utils/demoData': { peripherals: [] },
    '../../api/peripheral': {},
    '../../utils/product': require('../miniprogram/utils/product'),
    '../../utils/peripheralPresentation': require('../miniprogram/utils/peripheralPresentation'),
    ...overrides
  }, wx, app)
}

function testMyCustomerServiceGuardsUnavailableSdkAndMissingCorpId() {
  const toasts = []
  const wx = { showToast(options) { toasts.push(options) } }
  const page = createMyPage(wx, { globalData: {} })
  page.openCustomerService.call({ ensureAuth() { return true } })
  assert.strictEqual(toasts.length, 1)
  assert.match(toasts[0].title, /微信版本不支持客服/)

  let opened = 0
  wx.openCustomerServiceChat = () => { opened += 1 }
  page.openCustomerService.call({ ensureAuth() { return true } })
  assert.strictEqual(opened, 0)
  assert.match(toasts[1].title, /客服暂未配置/)

  const missingUrl = createMyPage(wx, { globalData: { corpId: 'ww-corp-id' } })
  missingUrl.openCustomerService.call({ ensureAuth() { return true } })
  assert.strictEqual(opened, 0)
  assert.match(toasts[2].title, /客服暂未配置/)

  const missingCorpId = createMyPage(wx, { globalData: { customerServiceUrl: 'https://work.weixin.qq.com/kfid/test' } })
  missingCorpId.openCustomerService.call({ ensureAuth() { return true } })
  assert.strictEqual(opened, 0)
}

function testMyCustomerServiceOpensOnlyWhenReadyAndHandlesThrows() {
  const toasts = []
  let received
  const wx = {
    showToast(options) { toasts.push(options) },
    openCustomerServiceChat(options) { received = options }
  }
  const customerServiceUrl = 'https://work.weixin.qq.com/kfid/test'
  const page = createMyPage(wx, { globalData: { corpId: 'ww-corp-id', customerServiceUrl } })
  page.openCustomerService.call({ ensureAuth() { return false } })
  assert.strictEqual(received, undefined)
  page.openCustomerService.call({ ensureAuth() { return true } })
  assert.strictEqual(received.corpId, 'ww-corp-id')
  assert.strictEqual(received.extInfo.url, customerServiceUrl)

  received.fail(new Error('request failed'))
  assert.strictEqual(toasts.length, 1)
  assert.match(toasts[0].title, /客服暂时无法打开/)

  wx.openCustomerServiceChat = () => { throw new Error('unsupported') }
  page.openCustomerService.call({ ensureAuth() { return true } })
  assert.strictEqual(toasts.length, 2)
  assert.match(toasts[1].title, /客服暂时无法打开/)
}

function testAllCustomerServiceEntriesUseTheConfiguredAccount() {
  const app = { globalData: { corpId: 'ww-corp-id', customerServiceUrl: 'https://work.weixin.qq.com/kfid/test' } }
  const calls = []
  const wx = {
    openCustomerServiceChat(options) { calls.push(options) },
    showToast() { throw new Error('Configured customer service must not show an error') }
  }
  const pages = ['peripherals', 'photoCollection', 'photoPackageDetail', 'videoProductDetail', 'bookingSuccess', 'orderDetail']
  for (const name of pages) {
    const page = loadPage(`miniprogram/pages/${name}/${name}.js`, {}, wx, app)
    page.contactService()
  }
  createMyPage(wx, app).openCustomerService.call({ ensureAuth() { return true } })
  assert.strictEqual(calls.length, 7)
  for (const call of calls) {
    assert.strictEqual(call.corpId, app.globalData.corpId)
    assert.strictEqual(call.extInfo.url, app.globalData.customerServiceUrl)
    assert.strictEqual(typeof call.fail, 'function')
  }
}

function testAppLoadsBothCustomerServiceSettings() {
  const config = require('../miniprogram/config/env')
  let appDefinition
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/app.js'), 'utf8'), {
    Page() {},
    App(value) { appDefinition = value },
    wx: { showToast() {} },
    require(request) { return request === './config/env' ? config : {} }
  }, { filename: 'miniprogram/app.js' })
  assert.strictEqual(config.CORP_ID, undefined)
  assert.strictEqual(config.CUSTOMER_SERVICE_URL, undefined)
  assert.strictEqual(appDefinition.globalData.corpId, '')
  assert.strictEqual(appDefinition.globalData.customerServiceUrl, '')
  assert.strictEqual(typeof appDefinition.loadCustomerServiceConfig, 'function')
}

function testMyLogoutClearsOnlyAfterConfirmation() {
  let logoutCalls = 0
  let clearUserCalls = 0
  const toasts = []
  const app = { globalData: { openid: 'customer-openid', userInfo: { nickName: '小鸣' } } }
  const wx = {
    showModal(options) { options.success({ confirm: true }) },
    showToast(options) { toasts.push(options) }
  }
  const page = createMyPage(wx, app, {
    '../../api/client': { logout() { logoutCalls += 1 } },
    '../../store/userStore': {
      isAuthed() { return true },
      clearUser() { clearUserCalls += 1 }
    }
  })
  const instance = {
    data: { authReady: true },
    setData(patch) { this.lastPatch = patch }
  }
  page.onLogout.call(instance)
  assert.strictEqual(logoutCalls, 1)
  assert.strictEqual(clearUserCalls, 1)
  assert.strictEqual(app.globalData.openid, null)
  assert.strictEqual(app.globalData.userInfo, null)
  assert.strictEqual(instance.lastPatch.authReady, false)
  assert.match(toasts[0].title, /已退出登录/)

  const cancelWx = { showModal(options) { options.success({ confirm: false }) }, showToast() {} }
  const cancelPage = createMyPage(cancelWx, app, {
    '../../api/client': { logout() { throw new Error('should not log out') } },
    '../../store/userStore': { isAuthed() { return true }, clearUser() { throw new Error('should not clear') } }
  })
  cancelPage.onLogout.call({ data: { authReady: true }, cancelAvatarUpload() {}, setData() {} })
  assert.strictEqual(app.globalData.openid, null)
}

function testMyPhoneAuthReportsMissingPrivacyDeclaration() {
  const modals = []
  const wx = {
    showModal(options) { modals.push(options) },
    showToast() {}
  }
  const page = createMyPage(wx, {}, {
    '../../store/userStore': {
      isAuthed() { return false }
    }
  })
  const instance = {
    setData() {}
  }
  page.onGetPhoneNumber.call(instance, {
    detail: {
      errno: 112,
      errMsg: 'getPhoneNumber:fail api scope is not declared in the privacy agreement'
    }
  })
  assert.strictEqual(modals.length, 1)
  assert.match(modals[0].title, /隐私指引未配置/)
  assert.match(modals[0].content, /手机号/)
}

function testMyUsesFixedAvatarAndDoesNotExposeProfilePicker() {
  const markup = fs.readFileSync(path.join(root, 'miniprogram/pages/my/my.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'miniprogram/pages/my/my.wxss'), 'utf8')
  assert.match(markup, /src="\/images\/default-avatar\.jpg"/)
  assert.match(markup, /<text class="user-nickname">麓小鸣旅拍<\/text>/)
  assert.doesNotMatch(markup, /chooseAvatar|bindchooseavatar|更换头像|refreshAvatar/)
  assert.match(styles, /\.user-avatar-wrap\s*\{[\s\S]*?margin-right:\s*104rpx;/)
  assert.match(styles, /\.user-detail\s*\{[\s\S]*?margin-right:\s*0;[\s\S]*?text-align:\s*left;/)
}

function testExploreLocationGuardHandlesMissingAndFailingMapContexts() {
  const toasts = []
  const wx = { showToast(options) { toasts.push(options) } }
  const page = createExplorePage(wx)
  page.locateMe.call({ mapCtx: null })
  assert.match(toasts[0].title, /地图暂未就绪/)

  page.locateMe.call({ mapCtx: { moveToLocation() { throw new Error('map unavailable') } } })
  assert.match(toasts[1].title, /定位失败/)

  let moved = false
  page.locateMe.call({ mapCtx: { moveToLocation() { moved = true } } })
  assert.strictEqual(moved, true)
}

async function testPeripheralsBrowseWithoutStoreBindingOrDetailNavigation() {
  const wx = {
    setNavigationBarTitle() {},
    navigateTo() { throw new Error('Browsing peripherals must not navigate to a detail or store') }
  }
  const page = createPeripheralsPage(wx, { captureSource() { return { shopId: 'source-shop', scene: 'qr' } } }, {
    '../../api/peripheral': { async getPeripherals() {
      return { success: true, data: [
        { _id: 'frame', name: '相框', price: 88 },
        { _id: 'album', name: '相册', price: 128 },
        { _id: 'hidden', name: '隐藏周边', isShow: false },
        { _id: 'offline', name: '下架周边', status: '下架' }
      ] }
    } }
  })
  page.data = JSON.parse(JSON.stringify(page.data))
  page.setData = function(patch) { Object.assign(this.data, patch) }
  page.onLoad({ id: 'album' })
  await new Promise(resolve => setImmediate(resolve))
  assert.strictEqual(page.data.shopId, 'source-shop')
  assert.strictEqual(page.data.scene, 'qr')
  assert.deepStrictEqual(Array.from(page.data.allPeripherals, item => item._id), ['frame', 'album'])
  assert.strictEqual(page.data.stackFront, 1, 'An old product link selects the requested card')
  page.onStackTap({ currentTarget: { dataset: { index: '0' } } })
  assert.strictEqual(page.data.stackFront, 0)
  page.onStackTap({ currentTarget: { dataset: { index: '0' } } })
  assert.strictEqual(page.data.stackFront, 0, 'Tapping the front card stays in the gallery')
  page.onStackTouchStart({ touches: [{ clientX: 200, clientY: 200 }] })
  page.onStackTouchMove({ touches: [{ clientX: 100, clientY: 205 }] })
  page.onStackTouchEnd({ changedTouches: [{ clientX: 100, clientY: 205 }] })
  assert.strictEqual(page.data.stackFront, 1, 'Swiping left selects the next card')
  page.onStackTap({ currentTarget: { dataset: { index: '0' } } })
  assert.strictEqual(page.data.stackFront, 1, 'The tap following a swipe is ignored')
  page.rotateRing({ currentTarget: { dataset: { dir: 1 } } })
  assert.strictEqual(page.data.stackFront, 0, 'The next arrow wraps around')
  page.onStackTouchStart({ touches: [{ clientX: 100, clientY: 200 }] })
  page.onStackTouchMove({ touches: [{ clientX: 200, clientY: 205 }] })
  page.onStackTouchEnd({ changedTouches: [{ clientX: 200, clientY: 205 }] })
  assert.strictEqual(page.data.stackFront, 1, 'Swiping right selects the previous card')

  const markup = fs.readFileSync(path.join(root, 'miniprogram/pages/peripherals/peripherals.wxml'), 'utf8')
  assert.doesNotMatch(markup, /专属定制|定制你的专属周边|goStackDetail|store-product|库存|立即购买/)
  assert.match(markup, /wx:if="\{\{featuredPeripheral\.hasPrice\}\}"/)
  assert.strictEqual((markup.match(/<button\b/g) || []).length, 1)
  assert.match(markup, /bindtap="contactService">咨询客服/)

  page.data.selectedId = 'missing'
  await page.loadPeripherals(true)
  assert.strictEqual(page.data.stackFront, 0, 'A missing old product falls back to the first card')
  page.data.allPeripherals = []
  page.rotateRing(1)
  page.onStackTap({ currentTarget: { dataset: { index: 0 } } })
}

testMyCustomerServiceGuardsUnavailableSdkAndMissingCorpId()
testMyCustomerServiceOpensOnlyWhenReadyAndHandlesThrows()
testAllCustomerServiceEntriesUseTheConfiguredAccount()
testAppLoadsBothCustomerServiceSettings()
testMyLogoutClearsOnlyAfterConfirmation()
testMyPhoneAuthReportsMissingPrivacyDeclaration()
testMyUsesFixedAvatarAndDoesNotExposeProfilePicker()
testExploreLocationGuardHandlesMissingAndFailingMapContexts()
testPeripheralsBrowseWithoutStoreBindingOrDetailNavigation().then(() => {
  console.log('Explore, My and peripheral browsing action guard tests passed')
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
