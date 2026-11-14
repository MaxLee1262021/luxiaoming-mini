'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const rpc = require('../../luxiaoming-admin-交付包/server/lib/rpc.cjs')

function fixture({ legacy = false } = {}) {
  const points = Array.from({ length: 25 }, (_, index) => ({ id: `point-${index + 1}`, name: `点位${index + 1}`, cityId: 'cs', sort: index + 1, isShow: true }))
  const photo = (id, spotId) => ({ id, name: id, spotId, status: '上架', sampleUrls: [`https://media.test/${id}.jpg`], photoCount: 6, price: 99 })
  const bundle = (id, spotId) => ({ id, name: id, spotId, status: '上架', type: 'photo', price: 299 })
  const peripheral = (id, spotId) => ({ id, name: id, spotId, status: '上架', cover: `https://media.test/${id}.jpg`, price: 29 })
  const rows = {
    cities: [{ id: 'cs', name: '长沙', enabled: true }, { id: 'hz', name: '杭州', enabled: true }],
    spots: [...points, { id: 'hz-point', name: '异城点', cityId: 'hz' }], series: [],
    homeConfig: [{ id: 'homeStats', bannerConfigVersion: 1, banners: [], featuredAlbumIds: ['old-photo-0'], featuredPackageIds: ['old-package-0'] }],
    albums: [
      ...Array.from({ length: 30 }, (_, i) => photo(`old-photo-${i}`, 'point-1')),
      ...Array.from({ length: 22 }, (_, i) => photo(`uploaded-photo-${i}`, 'point-25')),
      { ...photo('multi-photo', 'point-1'), spotIds: ['point-1', 'point-25'] },
      photo('global-photo', ''), { ...photo('hidden-photo', 'point-25'), isShow: false }
    ],
    packages: [
      ...Array.from({ length: 120 }, (_, i) => ({ ...bundle(`old-package-${i}`, 'point-1'), hotScore: 1000 - i, isMainPush: true })),
      ...Array.from({ length: 8 }, (_, i) => bundle(`uploaded-package-${i}`, 'point-25')),
      ...Array.from({ length: 6 }, (_, i) => ({ ...bundle(`uploaded-video-${i}`, 'point-25'), type: 'video', productKind: 'video_single' })),
      { ...bundle('hidden-video', 'point-25'), type: 'video', productKind: 'video_single', status: '下架' }
    ],
    peripherals: [
      ...Array.from({ length: 15 }, (_, i) => peripheral(`old-peripheral-${i}`, 'point-1')),
      ...Array.from({ length: 12 }, (_, i) => peripheral(`uploaded-peripheral-${i}`, 'point-25')),
      peripheral('global-peripheral', ''), peripheral('other-city-peripheral', 'hz-point'),
      { ...peripheral('hidden-peripheral', 'point-25'), isShow: false }
    ], guides: [], samples: []
  }
  const calls = [], navigation = [], bookingCalls = [], peripheralCalls = []
  const source = {
    async list(key) { return structuredClone(rows[key] || []) },
    async get(key, id) { return structuredClone((rows[key] || []).find(row => row.id === id) || null) }
  }
  const filename = path.resolve(__dirname, '../miniprogram/pages/index/index.js')
  const realRequire = createRequire(filename)
  let definition
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value },
    getApp: () => ({ getSource: () => ({}), captureSource: () => ({}) }),
    wx: { navigateTo(options) { navigation.push(options.url) }, showToast() {} },
    require(id) {
      if (id === '../../api/home') return { async getHomeData(params) {
        calls.push(params)
        // Deployed older RPCs return global previews and no scoped endpoint.
        // Reproduce that contract while using the real catalog endpoints.
        return rpc(source, 'getHomeData', legacy ? { ...params, includeSpotProducts: false, spotProductsOnly: false } : params)
      } }
      if (id === '../../api/booking') return { getBookingData(params) {
        bookingCalls.push(params)
        return rpc(source, 'getBookingData', params)
      } }
      if (id === '../../api/peripheral') return { getPeripherals(params) {
        peripheralCalls.push(params)
        return rpc(source, 'getPeripherals', params)
      } }
      if (id === '../../api/collection') return { getPhotoCollection() { throw new Error('complete card metadata must avoid detail hydration') } }
      if (id === '../../api/search') return { getSearchConfig: async () => ({ success: true, data: {} }) }
      if (id === '../../store/cityStore') return { getCity: () => ({ cityId: 'cs', city: '长沙' }) }
      if (id === '../../service/siteConfig') return { setSitePageConfig() {} }
      return realRequire(id)
    },
    console, setTimeout, clearTimeout, setInterval, clearInterval
  }, { filename })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) { Object.assign(this.data, patch) } }
  return { page, rows, calls, navigation, source, bookingCalls, peripheralCalls }
}

const ids = rows => Array.from(rows || [], row => row._id || row.id || row.albumId)

function pointDetail(source, id) {
  const filename = path.resolve(__dirname, '../miniprogram/pages/spotSheet/spotSheet.js')
  const realRequire = createRequire(filename)
  let definition
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value },
    getApp: () => ({}), wx: {}, console,
    require(name) {
      if (name === '../../api/home') return { getHomeData: data => rpc(source, 'getHomeData', data) }
      if (name === '../../api/spot') return { getSpots: data => rpc(source, 'getSpots', data) }
      if (name === '../../api/booking') return { getBookingData: data => rpc(source, 'getBookingData', data) }
      if (name === '../../api/peripheral') return { getPeripherals: data => rpc(source, 'getPeripherals', data) }
      if (name === '../../api/guide') return { getGuides: async data => (await rpc(source, 'getGuides', data)).data }
      return realRequire(name)
    }
  }, { filename })
  return { ...definition, data: { ...JSON.parse(JSON.stringify(definition.data)), id }, setData(patch) { Object.assign(this.data, patch) } }
}

test('home switches all four product shelves in place, including products beyond global preview limits', async () => {
  const { page, calls, navigation } = fixture()
  await page.loadHomeData()
  assert.equal(calls.length, 1)
  assert.notEqual(calls[0].includeSpotProducts, false)
  assert.ok(ids(page.data.filteredAlbums).includes('old-photo-0'))
  await page.onSpotReachEnd()
  assert.equal(page.data.spotTabs.length, 25)
  await page.onSpotTabTap({ currentTarget: { dataset: { id: 'point-25' } } })
  assert.equal(page.data.activeSpotId, 'point-25')
  assert.equal(navigation.length, 0)
  assert.equal(calls.filter(call => call.spotProductsOnly).length, 1)
  assert.equal(calls.find(call => call.spotProductsOnly).spotId, 'point-25')
  assertPoint25Shelves(page)
  const markup = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/index/index.wxml'), 'utf8')
  assert.match(markup, /<lxm-album-card\b/)
  assert.match(markup, /<lxm-video-card\b/)
  assert.match(markup, /<lxm-package-card\b/)
  assert.match(markup, /filteredPeripherals/)
  page.onUnload()
})

function assertPoint25Shelves(page) {
  const albums = ids(page.data.filteredAlbums), videos = ids(page.data.filteredVideos)
  const packages = ids(page.data.filteredPackages), peripherals = ids(page.data.filteredPeripherals)
  for (let i = 0; i < 22; i++) assert.ok(albums.includes('uploaded-photo-' + i))
  assert.ok(albums.includes('multi-photo'))
  assert.ok(albums.includes('global-photo'))
  assert.deepEqual(videos.sort(), Array.from({ length: 6 }, (_, i) => 'uploaded-video-' + i).sort())
  assert.deepEqual(packages.sort(), Array.from({ length: 8 }, (_, i) => 'uploaded-package-' + i).sort())
  for (let i = 0; i < 12; i++) assert.ok(peripherals.includes('uploaded-peripheral-' + i))
  assert.ok(peripherals.includes('global-peripheral'))
  assert.ok(!peripherals.includes('other-city-peripheral'))
  assert.ok(![...albums, ...videos, ...packages, ...peripherals].some(id => id.startsWith('old-') || id.startsWith('hidden-')))
  assert.equal(page.data.spotProductLoading, false)
  assert.equal(page.data.spotProductError, '')
}

test('legacy home RPC loads the full catalog once and still shows all products for a later ranked point', async () => {
  const { page, calls, navigation, bookingCalls, peripheralCalls } = fixture({ legacy: true })
  await page.loadHomeData()
  await page.onSpotReachEnd()
  await page.onSpotTabTap({ currentTarget: { dataset: { id: 'point-25' } } })
  assertPoint25Shelves(page)
  assert.equal(navigation.length, 0)
  assert.equal(bookingCalls.length, 1)
  assert.equal(peripheralCalls.length, 1)
  assert.equal(calls.filter(call => call.spotProductsOnly).length, 0)
  page.onUnload()
})

test('explore point details continue displaying uploaded photos, videos, packages and peripherals', async () => {
  const { source } = fixture()
  const detail = pointDetail(source, 'point-25')
  await detail.loadSpots()
  assert.equal(detail.data.error, '')
  assert.equal(detail.data.selectedSpot._id, 'point-25')
  const products = detail.data.selectedSpotProducts
  for (let i = 0; i < 22; i++) assert.ok(ids(products.photoSingles).includes('uploaded-photo-' + i))
  assert.ok(ids(products.photoSingles).includes('multi-photo'))
  assert.deepEqual(ids(products.videos).sort(), Array.from({ length: 6 }, (_, i) => 'uploaded-video-' + i).sort())
  assert.deepEqual(ids(products.photoPackages).sort(), Array.from({ length: 8 }, (_, i) => 'uploaded-package-' + i).sort())
  assert.ok(ids(products.peripherals).includes('uploaded-peripheral-0'))
  assert.ok(!ids(products.peripherals).some(id => id.startsWith('old-') || id.startsWith('hidden-')))
  detail.onUnload()
})

test('home and guide details reference the same uploaded photo, video and package products', async () => {
  const { page, rows, source } = fixture()
  const products = [['album', 'uploaded-photo-21'], ['video', 'uploaded-video-5'], ['package', 'uploaded-package-7']]
  rows.guides = products.map(([type, id]) => ({ id: 'guide-' + type, title: '同款旅拍', spotId: 'point-25', spotIds: ['point-25'], status: '启用', targetProductSpotId: 'point-25', targetProductType: type, targetProductId: id }))
  await page.loadHomeData()
  await page.onSpotReachEnd()
  await page.onSpotTabTap({ currentTarget: { dataset: { id: 'point-25' } } })
  const shelves = { album: page.data.filteredAlbums, video: page.data.filteredVideos, package: page.data.filteredPackages }
  for (const [type, id] of products) {
    const guide = await rpc(source, 'getGuide', { id: 'guide-' + type })
    assert.equal(guide.success, true)
    assert.equal(guide.data.bookingProduct.id, id)
    assert.ok(ids(shelves[type]).includes(id))
  }
  page.onUnload()
})
