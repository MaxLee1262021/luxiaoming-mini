'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

const navigations = []
global.wx = {
  getStorageSync() { return '' },
  setStorageSync() {},
  getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } } },
  showToast() {},
  navigateTo(options) { navigations.push({ method: 'navigateTo', ...options }) },
  switchTab(options) { navigations.push({ method: 'switchTab', ...options }) }
}
global.getApp = () => ({ captureSource: () => ({}) })

const { buildHomeViewData, getBannerTarget, normalizeBanners } = require('../miniprogram/service/homeData')
const homeApi = require('../miniprogram/api/home')
const definitions = {}
for (const key of ['index', 'explore']) {
  global.Page = definition => { definitions[key] = definition }
  require(`../miniprogram/pages/${key}/${key}.js`)
}
function createPage(key) {
  return { ...definitions[key], data: structuredClone(definitions[key].data),
    setData(patch) { Object.assign(this.data, patch) } }
}

test('首页和探索轮播独立读取、保留顺序并各自限制六张', () => {
  const banners = Array.from({ length: 8 }, (_, index) => ({ _id: `home-${index}`, url: `/home-${index}.jpg`, targetType: 'none' }))
  const exploreBanners = Array.from({ length: 8 }, (_, index) => ({ _id: `explore-${index}`, url: `/explore-${index}.mp4`, type: 'video', cover: '/cover.jpg', targetType: 'guide', targetId: 'guide' }))
  const view = buildHomeViewData({ banners, exploreBanners })
  assert.deepEqual(view.banners.map(row => row._id), banners.slice(0, 6).map(row => row._id))
  assert.deepEqual(view.exploreBanners.map(row => row._id), exploreBanners.slice(0, 6).map(row => row._id))
  assert.equal(view.exploreBanners.every(row => row.type === 'video' && row.cover === '/cover.jpg'), true)
  assert.deepEqual(buildHomeViewData({ banners, exploreBanners: [] }).exploreBanners, [])
  assert.deepEqual(buildHomeViewData({ banners: [], exploreBanners }).banners, [])
})

test('显式清空素材与跳转字段后不会从旧别名恢复，并兼容仅有旧字段的素材', () => {
  const input = [
    { url: '', imageUrl: '/deleted.jpg', cover: '/old-cover.jpg' },
    { url: '/new.jpg', imageUrl: '/old.jpg', targetType: 'package', targetId: '', linkId: 'old-id', linkUrl: '', jumpUrl: '/pages/old/old' },
    { imageUrl: '/legacy.jpg', linkType: 'album', linkId: 'legacy-id' },
    null
  ]
  const normalized = normalizeBanners(input)
  assert.deepEqual(normalized.map(row => row.url), ['/new.jpg', '/legacy.jpg'])
  assert.equal(normalized[0].targetId, '')
  assert.equal(normalized[0].linkUrl, '')
  assert.equal(getBannerTarget(normalized[0]), null)
  assert.equal(getBannerTarget(normalized[1]).path, '/pages/photoCollection/photoCollection')
  assert.deepEqual(getBannerTarget(normalized[1]).params, { albumId: 'legacy-id' })
  assert.equal(input[1].imageUrl, '/old.jpg', '归一化不修改原始响应')
  assert.deepEqual(normalizeBanners({}), [])
})

test('两页明确选择不跳转时，遗留直链也不会触发跳转', () => {
  for (const targetType of ['none', 'static', ' NONE ']) {
    const banner = { _id: 'static', url: '/static.jpg', targetType, linkUrl: '/pages/my/my' }
    assert.equal(getBannerTarget(banner), null)
    for (const key of ['index', 'explore']) {
      const page = createPage(key)
      page.setData({ banners: [banner], exploreBanners: [banner] })
      const count = navigations.length
      page.goBanner({ currentTarget: { dataset: { index: 0 } } })
      assert.equal(navigations.length, count, `${key} 不得跳转`)
    }
  }
})

test('两页相同的详情与 Tab 跳转使用同一套路由', () => {
  const cases = [
    ['package', 'packageId', '/pages/photoPackageDetail/photoPackageDetail'],
    ['album', 'albumId', '/pages/photoCollection/photoCollection'],
    ['video', 'productId', '/pages/videoProductDetail/videoProductDetail'],
    ['spot', 'id', '/pages/spotSheet/spotSheet'],
    ['guide', 'id', '/pages/guideDetail/guideDetail'],
    ['peripheral', 'id', '/pages/peripherals/peripherals']
  ]
  for (const key of ['index', 'explore']) {
    const page = createPage(key)
    for (const [targetType, param, pathname] of cases) {
      const banner = { url: '/banner.jpg', targetType, targetId: 'configured-id' }
      page.setData({ banners: [banner], exploreBanners: [banner] })
      page.goBanner({ currentTarget: { dataset: { index: 0 } } })
      const navigation = navigations.at(-1)
      const url = new URL(navigation.url, 'https://mini.test')
      assert.equal(navigation.method, 'navigateTo')
      assert.equal(url.pathname, pathname)
      assert.equal(url.searchParams.get(param), 'configured-id')
    }
    page.setData({ banners: [{ targetType: 'my' }], exploreBanners: [{ targetType: 'my' }] })
    page.goBanner({ currentTarget: { dataset: { index: 0 } } })
    assert.deepEqual(navigations.at(-1), { method: 'switchTab', url: '/pages/my/my' })
  }
  const explore = createPage('explore')
  assert.doesNotThrow(() => explore.goBanner())
  assert.doesNotThrow(() => explore.goBanner({ currentTarget: { dataset: { index: 99 } } }))
})

test('已配置的商品和旅拍灵感目标不受遗留链接影响，灵感列表不要求内容 ID', () => {
  for (const key of ['index', 'explore']) {
    const page = createPage(key)
    for (const [targetType, pathname, param] of [
      ['package', '/pages/photoPackageDetail/photoPackageDetail', 'packageId'],
      ['album', '/pages/photoCollection/photoCollection', 'albumId'],
      ['video', '/pages/videoProductDetail/videoProductDetail', 'productId'],
      ['guide', '/pages/guideDetail/guideDetail', 'id'],
      ['guides', '/pages/guideList/guideList', '']
    ]) {
      const banner = { targetType, targetId: 'specific&content', linkUrl: '/pages/my/my' }
      page.setData({ banners: [banner], exploreBanners: [banner] })
      page.goBanner({ currentTarget: { dataset: { index: 0 } } })
      const navigation = navigations.at(-1)
      const url = new URL(navigation.url, 'https://mini.test')
      assert.equal(navigation.method, 'navigateTo')
      assert.equal(url.pathname, pathname)
      if (param) assert.equal(url.searchParams.get(param), 'specific&content')
    }
  }
  assert.equal(getBannerTarget({ targetType: 'guides' }).path, '/pages/guideList/guideList')
  assert.equal(getBannerTarget({ targetType: 'package', targetId: '', linkUrl: '/pages/my/my' }), null)
})

test('两页外链通过 web-view 打开，完整保留中文、查询、片段和百分号编码', () => {
  const externalUrl = 'https://activity.example.com/旅拍?name=长沙&next=%2Foffer%3Fa%3D1%26b%3D2&ratio=100%25#详情'
  for (const key of ['index', 'explore']) {
    const page = createPage(key)
    const banner = { targetType: 'external', linkUrl: externalUrl, targetId: 'ignored' }
    page.setData({ banners: [banner], exploreBanners: [banner], shopId: 'source-shop', scene: 'banner' })
    page.goBanner({ currentTarget: { dataset: { index: 0 } } })
    const navigation = navigations.at(-1)
    const url = new URL(navigation.url, 'https://mini.test')
    assert.equal(navigation.method, 'navigateTo')
    assert.equal(url.pathname, '/pages/webview/webview')
    assert.equal(url.searchParams.get('url'), externalUrl)
    assert.equal(url.searchParams.get('shopId'), 'source-shop')
    assert.equal(url.searchParams.get('scene'), 'banner')
  }
})

test('外链只接受完整 HTTPS 链接，失效配置不会跳转，旧直链精确识别 Tab 页面', () => {
  for (const linkUrl of ['', 'http://example.com', 'javascript:alert(1)', 'data:text/html,hello', '//example.com',
    'https://', 'https://user:password@example.com', 'https://bad..example.com', 'https://example.com:99999',
    'https://example.com\\@evil.test', 'https://example.com/\nnext', 'https://example.com/<script>',
    'https://example.com/?q="text"', "https://example.com/?q='text'"]) {
    assert.equal(getBannerTarget({ targetType: 'external', linkUrl }), null, linkUrl)
    for (const key of ['index', 'explore']) {
      const page = createPage(key)
      const banner = { targetType: 'external', linkUrl }
      page.setData({ banners: [banner], exploreBanners: [banner] })
      const count = navigations.length
      page.goBanner({ currentTarget: { dataset: { index: 0 } } })
      assert.equal(navigations.length, count)
    }
  }
  assert.equal(getBannerTarget({ linkUrl: '/pages/index/index?scene=banner' }).method, 'switchTab')
  assert.equal(getBannerTarget({ linkUrl: '/pages/search/search?next=/pages/my/my' }).method, 'navigateTo')
  assert.equal(getBannerTarget({ linkUrl: 'https://activity.example.com/?next=/pages/my/my' }).path, '/pages/webview/webview')
  assert.equal(getBannerTarget({ targetType: 'external', linkUrl: ' HTTPS://ACTIVITY.EXAMPLE.COM/Offer?q=%3Ctext%3E ' }).params.url,
    'https://activity.example.com/Offer?q=%3Ctext%3E')
})

function createWebviewPage() {
  let definition
  const actions = []
  const filename = path.join(__dirname, '../miniprogram/pages/webview/webview.js')
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page: value => { definition = value },
    require: () => require('../miniprogram/utils/externalLink'),
    wx: {
      navigateBack: options => actions.push({ method: 'navigateBack', ...options }),
      switchTab: options => actions.push({ method: 'switchTab', ...options })
    }
  }, { filename })
  return { ...definition, data: { ...definition.data }, actions,
    setData(patch) { Object.assign(this.data, patch) } }
}

test('web-view 解码一次并防止非 HTTPS 地址加载，失败后可重试及返回', () => {
  const externalUrl = 'https://activity.example.com/旅拍?next=%2Foffer%3Fa%3D1%26b%3D2&ratio=100%25#详情'
  const page = createWebviewPage()
  page.onLoad({ url: encodeURIComponent(externalUrl) })
  assert.equal(page.data.url, externalUrl)
  assert.equal(page.data.invalid, false)
  page.onWebError()
  assert.equal(page.data.failed, true)
  page.retry()
  assert.equal(page.data.failed, false)
  assert.equal(page.data.url, externalUrl)
  page.goBack()
  assert.equal(page.actions.at(-1).method, 'navigateBack')
  page.actions.at(-1).fail()
  assert.equal(page.actions.at(-1).url, '/pages/index/index')
  page.onLoad({ url: externalUrl })
  assert.equal(page.data.url, externalUrl, '已解码参数不能再次解码查询中的百分号')
  for (const url of ['%E0%A4%A', encodeURIComponent('javascript:alert(1)'), encodeURIComponent('http://example.com'), '', '/pages/my/my']) {
    page.onLoad({ url })
    assert.equal(page.data.url, '')
    assert.equal(page.data.invalid, true)
  }
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../miniprogram/app.json'), 'utf8'))
  assert.ok(config.pages.includes('pages/webview/webview'))
  const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/webview/webview.wxml'), 'utf8')
  assert.match(wxml, /<web-view[^>]*src="\{\{url\}\}"[^>]*binderror="onWebError"/)
})

test('探索刷新读取独立列表，删除素材后清空且重置失效轮播索引', async () => {
  const original = homeApi.getHomeData
  let payload = { banners: [{ _id: 'home', url: '/home.jpg' }], exploreBanners: [{ _id: 'explore', url: '/explore.mp4', type: 'video', targetType: 'none' }] }
  homeApi.getHomeData = async () => ({ success: true, data: payload })
  try {
    const explore = createPage('explore')
    explore.setData({ bannerIndex: 5 })
    await explore.loadExploreBanners()
    assert.deepEqual(explore.data.exploreBanners.map(row => row._id), ['explore'])
    assert.equal(explore.data.bannerIndex, 0)
    payload = { banners: payload.banners, exploreBanners: [] }
    explore.setData({ bannerIndex: 4 })
    await explore.loadExploreBanners()
    assert.deepEqual(explore.data.exploreBanners, [])
    assert.equal(explore.data.bannerIndex, 0)
    const home = createPage('index')
    home.setData({ bannerIndex: 5 })
    home.applyHomeData({ banners: [{ _id: 'home', url: '/home.jpg', targetType: 'none' }] })
    assert.equal(home.data.bannerIndex, 0)
  } finally {
    homeApi.getHomeData = original
  }
})

test('探索的视频素材与图片素材均绑定配置的点击跳转', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/explore/explore.wxml'), 'utf8')
  assert.match(wxml, /class="banner-click-area"[^>]*bindtap="goBanner"/)
  assert.match(wxml, /<video[^>]*catchtap="goBanner"[^>]*data-index="\{\{index\}\}"/)
})
