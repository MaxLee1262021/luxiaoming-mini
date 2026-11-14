'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const filename = path.resolve(__dirname, '../miniprogram/pages/index/index.js')
const realRequire = createRequire(filename)

function products(spotId) {
  return {
    spotId, series: [], albumMetadataComplete: true,
    albums: [{ _id: spotId + '-photo', name: '江景照片', spotId, price: 99, photoCount: 6 }],
    packages: [{ _id: spotId + '-package', name: '城市套餐', spotId, type: 'photo', price: 299 }],
    videoSingles: [{ _id: spotId + '-video', name: '江景视频', spotId, type: 'video', productKind: 'video_single', price: 199 }],
    peripherals: [{ _id: spotId + '-peripheral', name: '纪念相框', spotId, price: 29, status: '上架' }]
  }
}
function home() {
  const a = products('a'), b = products('b')
  return {
    cityId: 'cs', city: '长沙',
    spots: [{ _id: 'a', name: '点位A' }, { _id: 'b', name: '点位B' }, { _id: 'c', name: '点位C' }],
    spotPagination: { offset: 0, nextOffset: 3, total: 3, hasMore: false },
    albums: [...a.albums, ...b.albums],
    packages: [...a.packages, ...b.packages],
    videoSingles: [...a.videoSingles, ...b.videoSingles],
    peripherals: [...a.peripherals, ...b.peripherals],
    guides: [{ _id: 'guide', title: '江景灵感', name: '江景灵感' }],
    spotProductsAvailable: true, spotProducts: a
  }
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture() {
  let definition
  const requests = [], navigations = [], bookingRequests = [], peripheralRequests = []
  const state = {
    home: home(), products: { a: products('a'), b: products('b'), c: products('c') },
    respond: null, booking: {}, peripherals: [], bookingRespond: null, peripheralRespond: null
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    getApp: () => ({ captureSource: () => ({}), getSource: () => ({}) }),
    Page: value => { definition = value },
    wx: { getStorageSync: () => '', navigateTo: options => navigations.push(options), showToast() {} },
    require(id) {
      if (id === '../../api/home') return { async getHomeData(params) {
        requests.push(params)
        if (state.respond) return state.respond(params)
        return { success: true, data: params.spotProductsOnly
          ? { cityId: 'cs', city: '长沙', spotProductsAvailable: true, spotProducts: state.products[params.spotId] }
          : structuredClone(state.home) }
      } }
      if (id === '../../api/booking') return { async getBookingData(params) {
        bookingRequests.push(params)
        if (state.bookingRespond) return state.bookingRespond(params)
        return { success: true, data: structuredClone(state.booking) }
      } }
      if (id === '../../api/peripheral') return { async getPeripherals(params) {
        peripheralRequests.push(params)
        if (state.peripheralRespond) return state.peripheralRespond(params)
        return { success: true, data: structuredClone(state.peripherals) }
      } }
      if (id === '../../api/search') return { getSearchConfig: async () => ({ success: true, data: {} }) }
      if (id === '../../api/collection') throw new Error('首页不能补查商品详情')
      if (id === '../../service/siteConfig') return { setSitePageConfig() {} }
      if (id === '../../store/cityStore') return { getCity: () => ({}) }
      return realRequire(id)
    }, console: { warn() {}, error() {} }, setInterval, clearInterval, setTimeout, clearTimeout
  }, { filename })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch) } }
  return { page, requests, navigations, state, bookingRequests, peripheralRequests }
}
const select = (page, id) => page.onSpotTabTap({ currentTarget: { dataset: { id } } })
const ids = rows => Array.from(rows || [], row => row._id || row.id || row.albumId)
function assertShelves(page, spotId) {
  assert.deepEqual(ids(page.data.filteredAlbums), [spotId + '-photo'])
  assert.deepEqual(ids(page.data.filteredVideos), [spotId + '-video'])
  assert.deepEqual(ids(page.data.filteredPackages), [spotId + '-package'])
  assert.deepEqual(ids(page.data.filteredPeripherals), [spotId + '-peripheral'])
}

test('首页热榜下展示四类商品，并保留加载、重试、隐私和搜索入口', () => {
  const wxml = fs.readFileSync(filename.replace(/\.js$/, '.wxml'), 'utf8')
  for (const component of ['album', 'video', 'package']) assert.match(wxml, new RegExp('<lxm-' + component + '-card\\b'))
  for (const field of ['filteredAlbums', 'filteredVideos', 'filteredPackages', 'filteredPeripherals', 'spotProductLoading', 'spotProductError']) {
    assert.ok(wxml.includes(field), 'missing shelf state ' + field)
  }
  assert.match(wxml, /<lxm-privacy-modal/)
  assert.match(wxml, /<lxm-search-panel/)
  assert.match(wxml, /bindscrolltolower="onSpotReachEnd"/)
  assert.match(wxml, /bindtap="onSpotTabTap"/)
  assert.match(wxml, /bindtap="retrySpotProducts"/)
  const config = JSON.parse(fs.readFileSync(filename.replace(/\.js$/, '.json'), 'utf8'))
  for (const name of ['lxm-album-card', 'lxm-video-card', 'lxm-package-card']) assert.ok(config.usingComponents[name])
})

test('首屏一次请求展示第一打卡点的四类商品，点击热榜留在首页切换商品', async () => {
  const { page, requests, navigations } = fixture()
  await page.loadHomeData()
  assert.equal(requests.length, 1)
  assert.notEqual(requests[0].includeSpotProducts, false)
  assert.equal(page.data.activeSpotId, 'a')
  assertShelves(page, 'a')
  await select(page, 'b')
  assert.equal(page.data.activeSpotId, 'b')
  assert.equal(page.data.activeSpotName, '点位B')
  assertShelves(page, 'b')
  const request = requests.find(item => item.spotProductsOnly)
  assert.equal(request.spotId, 'b')
  assert.equal(request.cityId, 'cs')
  assert.equal(navigations.length, 0)
  assert.equal(page.data.spotProductLoading, false)
  assert.equal(page.data.spotProductError, '')
  page.onUnload()
})

test('快速切换打卡点时旧响应不会覆盖最后选中点的商品', async () => {
  const { page, state, navigations } = fixture()
  await page.loadHomeData()
  const b = deferred(), c = deferred()
  state.respond = params => (params.spotId === 'b' ? b : c).promise
  const first = select(page, 'b')
  const last = select(page, 'c')
  c.resolve({ success: true, data: { spotProductsAvailable: true, spotProducts: products('c') } })
  await last
  b.resolve({ success: true, data: { spotProductsAvailable: true, spotProducts: products('b') } })
  await first
  assert.equal(page.data.activeSpotId, 'c')
  assertShelves(page, 'c')
  assert.equal(page.data.spotProductLoading, false)
  assert.equal(navigations.length, 0)
  page.onUnload()
})

test('切点请求失败时清除上一个点的货架，重试后恢复当前点四类商品', async () => {
  const { page, state } = fixture()
  await page.loadHomeData()
  state.respond = async () => { throw new Error('offline') }
  await select(page, 'b')
  assert.equal(page.data.activeSpotId, 'b')
  assert.ok(page.data.spotProductError)
  assert.equal(page.data.spotProductLoading, false)
  for (const field of ['filteredAlbums', 'filteredVideos', 'filteredPackages', 'filteredPeripherals']) {
    assert.deepEqual(ids(page.data[field]), [], field + ' still contains the previous spot')
  }
  state.respond = null
  await page.retrySpotProducts()
  assertShelves(page, 'b')
  assert.equal(page.data.spotProductError, '')
  page.onUnload()
})

test('切回已加载点位后，未完成请求的失败不会覆盖缓存货架或显示错误', async () => {
  const { page, state } = fixture()
  await page.loadHomeData()
  const pending = deferred()
  state.respond = () => pending.promise
  const selection = select(page, 'b')
  await select(page, 'a')
  assertShelves(page, 'a')
  pending.reject(new Error('late failure'))
  await selection
  assertShelves(page, 'a')
  assert.equal(page.data.spotProductError, '')
  assert.equal(page.data.spotProductLoading, false)
  page.onUnload()
})

test('旧服务显式返回空完整目录时，不会复活首页或完整目录里的旧推荐商品', async () => {
  const { page, state, bookingRequests, peripheralRequests } = fixture()
  delete state.home.spotProductsAvailable
  delete state.home.spotProducts
  state.booking = {
    allSeries: [], allAlbums: [], allPackages: [], allPeripherals: [],
    albums: products('a').albums,
    packages: [...products('a').packages, ...products('a').videoSingles]
  }
  state.peripherals = products('a').peripherals
  await page.loadHomeData()
  await select(page, 'b')
  assert.equal(bookingRequests.length, 1)
  assert.equal(peripheralRequests.length, 1)
  for (const field of ['filteredAlbums', 'filteredVideos', 'filteredPackages', 'filteredPeripherals']) assert.deepEqual(ids(page.data[field]), [])
  assert.equal(page.data.spotProductError, '')
  page.onUnload()
})

test('旧服务完整目录请求失败后可重试，成功前不会把局部推荐误当完整商品', async () => {
  const { page, state, bookingRequests, peripheralRequests } = fixture()
  delete state.home.spotProductsAvailable
  delete state.home.spotProducts
  state.bookingRespond = async () => { throw new Error('offline') }
  await page.loadHomeData()
  assert.ok(page.data.spotProductError)
  for (const field of ['filteredAlbums', 'filteredVideos', 'filteredPackages', 'filteredPeripherals']) assert.deepEqual(ids(page.data[field]), [])
  state.bookingRespond = null
  state.booking = {
    allSeries: [], allAlbums: products('a').albums,
    allPackages: [...products('a').packages, ...products('a').videoSingles]
  }
  state.peripherals = products('a').peripherals
  await page.retrySpotProducts()
  assertShelves(page, 'a')
  assert.equal(page.data.spotProductError, '')
  assert.equal(bookingRequests.length, 2)
  assert.equal(peripheralRequests.length, 2)
  page.onUnload()
})

test('旧完整目录按城市和点位筛选，同城通用周边可跨点，异城通用周边不能串入', async () => {
  const { page, state } = fixture()
  delete state.home.spotProductsAvailable
  delete state.home.spotProducts
  const spots = [
    { _id: 'a', name: '长沙A', cityId: 'cs', city: '长沙' },
    { _id: 'b', name: '长沙B', cityId: 'cs', city: '长沙' },
    { _id: 'hz', name: '杭州点', cityId: 'hz-city', city: '杭州' }
  ]
  const photo = (id, extra) => ({ _id: id, name: id, photoCount: 6, ...extra })
  const pkg = (id, extra) => ({ _id: id, name: id, type: 'photo', price: 99, ...extra })
  const peripheral = (id, extra) => ({ _id: id, name: id, price: 29, status: '上架', ...extra })
  state.booking = {
    spots,
    allSeries: [
      { _id: 'cs-series', name: '长沙风格', spotIds: ['a', 'b'] },
      { _id: 'hz-series', name: '杭州风格', spotIds: ['hz'] }
    ],
    allAlbums: [
      photo('local-photo', { spotId: 'a' }),
      photo('inherited-photo', { seriesId: 'cs-series' }),
      photo('other-city-inherited-photo', { seriesId: 'hz-series' }),
      photo('multi-photo', { spotId: 'hz', spotIds: ['hz', 'a'] }),
      photo('other-city-unbound-photo', { cityId: 'hz-city' }),
      photo('global-photo', {})
    ],
    allPackages: [
      pkg('inherited-package', { seriesId: 'cs-series' }),
      pkg('other-city-inherited-package', { seriesId: 'hz-series' }),
      pkg('multi-package', { spotId: 'hz', spotIds: ['hz', 'a'] }),
      pkg('other-city-unbound-package', { cityId: 'hz-city' }),
      pkg('global-package', {}),
      pkg('local-video', { type: 'video', productKind: 'video_single', spotId: 'a' }),
      pkg('other-city-video', { type: 'video', productKind: 'video_single', cityId: 'hz-city' })
    ]
  }
  state.peripherals = [
    peripheral('local-peripheral', { spotId: 'a' }),
    peripheral('same-city-wide-peripheral', { spotId: 'b', mode: '全城通用' }),
    peripheral('other-city-wide-peripheral', { spotId: 'hz', mode: '全城通用' }),
    peripheral('other-city-unbound-peripheral', { cityId: 'hz-city' }),
    peripheral('global-peripheral', {})
  ]
  await page.loadHomeData()
  assert.equal(page.data.cityId, 'cs')
  assert.equal(page.data.activeSpotId, 'a')
  assert.deepEqual(ids(page.data.filteredAlbums).sort(), ['global-photo', 'inherited-photo', 'local-photo', 'multi-photo'].sort())
  assert.deepEqual(ids(page.data.filteredPackages).sort(), ['global-package', 'inherited-package', 'multi-package'].sort())
  assert.deepEqual(ids(page.data.filteredVideos), ['local-video'])
  assert.deepEqual(ids(page.data.filteredPeripherals).sort(), ['global-peripheral', 'local-peripheral', 'same-city-wide-peripheral'].sort())
  assert.equal(page.data.spotProductError, '')
  page.onUnload()
})

test('页面卸载后晚到的商品响应不会修改视图', async () => {
  const { page, state } = fixture()
  await page.loadHomeData()
  const pending = deferred()
  state.respond = () => pending.promise
  const selection = select(page, 'b')
  page.onUnload()
  const before = JSON.stringify(page.data)
  pending.resolve({ success: true, data: { spotProductsAvailable: true, spotProducts: products('b') } })
  await selection
  assert.equal(JSON.stringify(page.data), before)
})

test('仅有周边保留商品并展示专属定制，预约携带当前点位与商家来源', async () => {
  const { page, state, navigations } = fixture()
  state.products.b = { spotId: 'b', albums: [], packages: [], videoSingles: [], peripherals: products('b').peripherals }
  state.products.c = { spotId: 'c', albums: [], packages: [], videoSingles: [], peripherals: [] }
  await page.loadHomeData()
  await select(page, 'b')
  assert.deepEqual(ids(page.data.filteredPeripherals), ['b-peripheral'])
  for (const field of ['filteredAlbums', 'filteredVideos', 'filteredPackages']) assert.deepEqual(ids(page.data[field]), [])
  const markup = fs.readFileSync(filename.replace(/\.js$/, '.wxml'), 'utf8')
  assert.match(markup, /<lxm-custom-booking-card\s+wx:if="\{\{!filteredAlbums.length && !filteredVideos.length && !filteredPackages.length && filteredPeripherals.length\}\}"\s+title="专属定制"/)
  assert.match(markup, /spotId="\{\{activeSpotId\}\}"\s+spotName="\{\{activeSpotName\}\}"\s+bind:booking="goCustomBooking"/)
  const config = JSON.parse(fs.readFileSync(filename.replace(/\.js$/, '.json'), 'utf8'))
  assert.ok(config.usingComponents['lxm-custom-booking-card'])
  page.setData({ shopId: 'source-shop', scene: 'qr' })
  page.goCustomBooking()
  assert.equal(navigations.length, 1)
  const url = new URL(navigations[0].url, 'https://mini.test')
  assert.equal(url.pathname, '/pages/bookingInfo/bookingInfo')
  assert.equal(url.searchParams.get('spotId'), 'b')
  assert.equal(url.searchParams.get('spotName'), '点位B')
  assert.equal(url.searchParams.get('shopId'), 'source-shop')
  assert.equal(url.searchParams.get('scene'), 'qr')
  await select(page, 'c')
  for (const field of ['filteredAlbums', 'filteredVideos', 'filteredPackages', 'filteredPeripherals']) assert.deepEqual(ids(page.data[field]), [])
  assert.equal(page.data.spotProductError, '')
  assert.equal(page.data.spotProductLoading, false)
  page.onUnload()
})

test('刷新保留当前选中点，并重新读取该点商品以显示后台新增内容', async () => {
  const { page, state, requests } = fixture()
  await page.loadHomeData()
  await select(page, 'b')
  state.products.b.albums.push({ _id: 'new-photo', spotId: 'b', photoCount: 8 })
  const before = requests.filter(item => item.spotProductsOnly && item.spotId === 'b').length
  await page.loadHomeData()
  assert.equal(page.data.activeSpotId, 'b')
  assert.ok(ids(page.data.filteredAlbums).includes('new-photo'))
  assert.equal(requests.filter(item => item.spotProductsOnly && item.spotId === 'b').length, before + 1)
  page.onUnload()
})

test('非法打卡点不请求、不导航，也不改变现有选中商品', async () => {
  const { page, requests, navigations } = fixture()
  await page.loadHomeData()
  const before = requests.length
  await select(page, 'missing')
  assert.equal(requests.length, before)
  assert.equal(navigations.length, 0)
  assert.equal(page.data.activeSpotId, 'a')
  assertShelves(page, 'a')
  page.onUnload()
})

test('商品卡片分别打开商品详情，并携带当前打卡点及扫码商家来源', async () => {
  const { page, state, navigations } = fixture()
  // 多点商品的首个绑定点与当前选择不同，详情仍应使用当前热榜点位。
  for (const list of ['albums', 'packages', 'videoSingles', 'peripherals']) {
    state.products.b[list][0].spotId = 'a'
    state.products.b[list][0].spotIds = ['a', 'b']
  }
  await page.loadHomeData()
  page.setData({ shopId: 'source-shop', scene: 'qr' })
  await select(page, 'b')
  page.onAlbumTap({ detail: { id: 'b-photo', albumId: 'b-photo', spotId: 'a' } })
  page.onVideoTap({ detail: { id: 'b-video', item: page.data.filteredVideos[0], spotId: 'a' } })
  page.onPackageTap({ detail: { id: 'b-package' } })
  page.onPeripheralTap({ currentTarget: { dataset: { id: 'b-peripheral' } } })
  assert.equal(navigations.length, 4)
  const urls = navigations.map(item => new URL(item.url, 'https://mini.test'))
  assert.deepEqual(urls.map(item => item.pathname), [
    '/pages/photoCollection/photoCollection', '/pages/videoProductDetail/videoProductDetail',
    '/pages/photoPackageDetail/photoPackageDetail', '/pages/peripherals/peripherals'
  ])
  for (const url of urls) {
    assert.equal(url.searchParams.get('spotId'), 'b')
    assert.equal(url.searchParams.get('shopId'), 'source-shop')
    assert.equal(url.searchParams.get('scene'), 'qr')
  }
  assert.equal(urls[0].searchParams.get('albumId'), 'b-photo')
  assert.equal(urls[1].searchParams.get('productId'), 'b-video')
  assert.equal(urls[2].searchParams.get('packageId'), 'b-package')
  assert.equal(urls[3].searchParams.get('id'), 'b-peripheral')
  page.onUnload()
})

test('展示商品后搜索建议仍保留照片、视频与套餐目录', async () => {
  const { page } = fixture()
  await page.loadHomeData()
  page.updateSuggestions('江景')
  const suggestions = Array.from(page.data.searchSuggestions, item => item.name)
  assert.ok(suggestions.includes('江景照片'))
  assert.ok(suggestions.includes('江景视频'))
  assert.ok(page.data.packages.some(item => item._id === 'a-package'))
  page.onUnload()
})
