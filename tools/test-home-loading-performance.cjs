'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const filename = path.resolve(__dirname, '../miniprogram/pages/index/index.js')
const realRequire = createRequire(filename)
const turn = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function payload(complete = true) {
  const albums = [{ _id: 'album-1', name: '上传的照片', photoCount: 6 }]
  return {
    albumMetadataComplete: complete,
    banners: [{ _id: 'hero', url: 'https://cdn.test/hero.jpg' }],
    spots: [{ _id: 'spot-1', name: '点位一' }],
    albums,
    spotProductsAvailable: true,
    spotProducts: { spotId: 'spot-1', series: [], albums, packages: [], videoSingles: [], peripherals: [], albumMetadataComplete: complete },
    spotPagination: { offset: 0, nextOffset: 1, hasMore: false, total: 1 }
  }
}
function fixture() {
  let definition
  const requests = [], catalogRequests = [], timers = new Set()
  const state = { data: payload(), home: null, search: null, refreshStops: 0, legacyCatalog: { allSeries: [], allAlbums: [], allPackages: [], allPeripherals: [] } }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page: value => { definition = value },
    getApp: () => ({ captureSource: () => ({}) }),
    wx: {
      getStorageSync: () => '', getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 20 }),
      stopPullDownRefresh() { state.refreshStops++ }
    },
    require(id) {
      if (id === '../../api/home') return { async getHomeData(params) {
        requests.push(params)
        return { success: true, data: state.home ? await state.home.promise : state.data }
      } }
      if (id === '../../api/collection') throw new Error('首页不能加载相册详情API')
      if (id === '../../api/booking') return { async getBookingData() {
        catalogRequests.push('booking')
        return { success: true, data: state.legacyCatalog }
      } }
      if (id === '../../api/peripheral') return { async getPeripherals() {
        catalogRequests.push('peripherals')
        return { success: true, data: state.legacyCatalog.allPeripherals || [] }
      } }
      if (id === '../../api/search') return {
        getSearchConfig: () => state.search ? state.search.promise : Promise.resolve({ success: true, data: { hotWords: [] } })
      }
      if (id === '../../store/cityStore') return { getCity: () => ({}), setCity() {} }
      if (id === '../../service/siteConfig') return { setSitePageConfig() {} }
      return realRequire(id)
    },
    console: { warn() {}, error() {} },
    setInterval() { const timer = {}; timers.add(timer); return timer },
    clearInterval(timer) { timers.delete(timer) }, setTimeout, clearTimeout
  }, { filename })
  let updates = 0
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { updates++; Object.assign(this.data, patch) } }
  return { page, state, requests, catalogRequests, timers, updates: () => updates }
}

test('首页一次读取即可退场骨架并展示内嵌点位商品，无需补查目录和详情', async () => {
  const { page, requests, catalogRequests } = fixture()
  await page.loadHomeData()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].includeSpotProducts, true)
  assert.equal(requests[0].spotProductsOnly, undefined)
  assert.equal(page.data.loading, false)
  assert.equal(page.data.spotTabs[0].name, '点位一')
  assert.equal(page.data.filteredAlbums[0]._id, 'album-1')
  assert.equal(page.data.spotProductLoading, false)
  assert.deepEqual(catalogRequests, [])
  page.onUnload()
})

test('内嵌目录缺元数据标记和返回多本相册时也不发详情请求', async () => {
  const { page, state, requests } = fixture()
  state.data = payload(false)
  state.data.albums = Array.from({ length: 50 }, (_, index) => ({ _id: `album-${index}`, name: `照片${index}` }))
  state.data.spotProducts.albums = state.data.albums
  await page.loadHomeData()
  await turn()
  assert.equal(requests.length, 1)
  assert.equal(page.data.loading, false)
  assert.equal(typeof page.hydrateHomeAlbumMetadata, 'undefined')
  assert.ok(page.data.bookingAlbums.length, '相册目录继续用于搜索建议')
  assert.equal(page.data.filteredAlbums.length, 50, '商品货架保留完整点位相册')
  page.onUnload()
})

test('旧后端只返回推荐列表时补取完整目录，切换打卡点复用目录且不补查相册详情', async () => {
  const { page, state, requests, catalogRequests } = fixture()
  delete state.data.spotProductsAvailable
  delete state.data.spotProducts
  state.data.spots.push({ _id: 'spot-2', name: '点位二' })
  state.legacyCatalog = {
    allSeries: [],
    allAlbums: Array.from({ length: 50 }, (_, index) => ({ _id: `full-album-${index}`, spotId: 'spot-1', name: `照片${index}` })),
    allPackages: [{ _id: 'bundle-2', spotId: 'spot-2', type: 'photo' }],
    allPeripherals: [{ _id: 'gift-2', spotId: 'spot-2', name: '影像周边' }]
  }
  await page.loadHomeData()
  assert.equal(requests.length, 1)
  assert.deepEqual(catalogRequests.sort(), ['booking', 'peripherals'])
  assert.equal(page.data.filteredAlbums.length, 50)
  await page.onSpotTabTap({ currentTarget: { dataset: { id: 'spot-2' } } })
  assert.equal(requests.length, 1)
  assert.equal(catalogRequests.length, 2)
  assert.equal(page.data.filteredAlbums.length, 0)
  assert.equal(page.data.filteredPackages[0]._id, 'bundle-2')
  assert.equal(page.data.filteredPeripherals[0]._id, 'gift-2')
  assert.equal(page.data.spotProductError, '')
  page.onUnload()
})

test('旧首页慢响应不能覆盖较新的刷新', async () => {
  const { page, state } = fixture()
  const old = deferred()
  state.home = old
  const first = page.loadHomeData()
  state.home = null
  state.data = payload()
  state.data.spots[0].name = '后台最新点位名'
  await page.loadHomeData()
  old.resolve(payload())
  await first
  assert.equal(page.data.spotTabs[0].name, '后台最新点位名')
  page.onUnload()
})

test('搜索配置慢请求不阻塞首屏，首次onLoad和onShow共用首页请求', async () => {
  const { page, state, requests } = fixture()
  state.search = deferred()
  const loading = page.onLoad()
  page.onShow()
  await turn()
  assert.equal(requests.length, 1)
  assert.equal(page.data.loading, false)
  state.search.resolve({ success: true, data: { hotWords: ['城市旅拍'] } })
  await loading
  assert.equal(page.data.activeSearchKeyword, '城市旅拍')
  page.onUnload()
})

test('隐藏首页停止定时更新，卸载后的搜索和首页慢响应不再更新页面', async () => {
  const { page, state, timers, updates } = fixture()
  await page.onLoad()
  assert.equal(timers.size, 1)
  page.onHide()
  assert.equal(timers.size, 0)
  page.onShow()
  await page._tabRefreshPromise
  assert.equal(timers.size, 1)
  state.search = deferred()
  const searching = page.loadSearchConfig()
  state.home = deferred()
  const loading = page.loadHomeData()
  page.onUnload()
  const lastUpdates = updates()
  state.search.resolve({ success: true, data: { hotWords: ['晚到响应'] } })
  state.home.resolve(payload())
  await Promise.all([searching, loading])
  assert.equal(updates(), lastUpdates)
  assert.equal(timers.size, 0)
})

test('下拉刷新完成后关闭刷新圈，首张轮播图保持立即加载', async () => {
  const { page, state } = fixture()
  await page.onPullDownRefresh()
  assert.equal(state.refreshStops, 1)
  const wxml = fs.readFileSync(filename.replace(/\.js$/, '.wxml'), 'utf8')
  assert.match(wxml, /class="banner-img"[^>]*lazy-load="\{\{index > 0\}\}"/)
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../miniprogram/app.json'), 'utf8'))
  assert.equal(config.pages[0], 'pages/index/index')
  page.onUnload()
})
