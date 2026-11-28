'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..', 'miniprogram')
const query = require('../miniprogram/utils/query')
const plain = value => JSON.parse(JSON.stringify(value))

// Use the real global Page wrapper and real page entry/loading methods. Only
// network responses and presentation builders are replaced with small fixtures.
function fixture() {
  let current = null
  let definition
  const calls = []
  const selectedPackage = { _id: 'resolved-package', seriesId: 'series-a', spotId: 'spot-a' }
  const album = id => ({ _id: id, albumId: id, seriesId: 'series-a', spotId: 'spot-a' })
  const context = vm.createContext({
    console,
    setTimeout() {},
    getCurrentPages: () => current ? [current] : [],
    getApp: () => ({ captureSource: () => ({ shopId: 'local-shop', scene: 'local-scene' }) }),
    App() {},
    Page(config) { definition = config },
    wx: { showToast() {}, pageScrollTo() {} }
  })

  function evaluate(relativePath, stubs = {}) {
    const filename = path.join(root, relativePath)
    const module = { exports: {} }
    const run = vm.runInContext('(function (require, module, exports) {\n' + fs.readFileSync(filename, 'utf8') + '\n})', context, { filename })
    run(name => {
      if (Object.hasOwn(stubs, name)) return stubs[name]
      throw new Error(`Unexpected dependency ${name} in ${relativePath}`)
    }, module, module.exports)
    return module.exports
  }

  const share = evaluate('utils/share.js', { './query': query })
  evaluate('app.js', {
    './store/sourceStore': {}, './utils/query': query, './config/env': {},
    './api/client': {}, './store/userStore': {}, './utils/share': share,
    './utils/analytics': {}, './service/merchantShare': {}, './service/customerService': {}
  })
  const stubs = {
    '../../utils/query': query,
    '../../api/guide': {
      async getGuideDetail(params) {
        calls.push({ name: 'getGuideDetail', params: plain(params) })
        return { _id: params.id, title: 'Fixture inspiration' }
      }
    },
    '../../utils/guideContent': { guideContentBlocks: () => [], isPublicGuide: () => true },
    '../../utils/product': { isPublicProduct: () => true },
    '../../service/guideAttachments': {},
    '../../api/series': {
      async getSeriesDetail(params) {
        calls.push({ name: 'getSeriesDetail', params: plain(params) })
        return { success: true, data: { selectedPackage: { ...selectedPackage, _id: params.packageId || selectedPackage._id } } }
      }
    },
    '../../service/packageDetail': {
      buildPhotoPackageDetail(data, params) {
        return { ...data, seriesId: params.seriesId || selectedPackage.seriesId, spotId: params.spotId || selectedPackage.spotId, seriesInfo: {}, includedItems: [], packageBenefits: [], spots: [] }
      }
    },
    '../../service/siteConfig': { getPageModuleConfig: () => ({}), isPageModuleVisible: () => true },
    '../../service/customerService': {},
    '../../utils/productDisplay': { displayTags: () => [], shootingInstructions: () => [], includedItemStats: () => ({}) },
    '../../api/collection': {
      async getPhotoCollection(params) {
        calls.push({ name: 'getPhotoCollection', params: plain(params) })
        return { success: true, data: {
          series: { _id: params.seriesId || 'series-a' },
          collections: [album(params.albumId || 'album-a')],
          currentCollection: params.albumId ? album(params.albumId) : null
        } }
      }
    },
    '../../api/booking': { getBookingData: async () => ({ success: true, data: {} }) },
    '../../service/relatedPhotoCollections': { buildRelatedPhotoCollections: () => [] },
    '../../utils/albumPresentation': { normalizeAlbumPresentation: item => item },
    '../../api/package': { getPackageBaseData: async () => ({ success: true, data: {} }) },
    '../../api/spot': { getSpots: async () => ({ success: true, data: [] }) },
    '../../service/videoProductDetail': {
      isVideoSingle: () => false,
      buildVideoProductDetail(data, params) {
        calls.push({ name: 'buildVideoProductDetail', params: plain(params) })
        return { product: { _id: params.productId }, spot: {}, samples: [], recommendations: [], videoFields: [], packageBenefits: [] }
      }
    }
  }

  return {
    calls, share, context,
    register: config => context.Page(config),
    get definition() { return definition },
    setCurrent(page) { current = page },
    async open(name, options = {}) {
      evaluate(`pages/${name}/${name}.js`, stubs)
      const page = Object.assign({}, definition, {
        route: `pages/${name}/${name}`,
        options: plain(options),
        data: plain(definition.data),
        setData(patch) { Object.assign(this.data, patch) }
      })
      current = page
      page.onLoad(options)
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(page.data.error, '', `${name} should load the fixture content`)
      return page
    }
  }
}

function serialize(page, mode) {
  if (mode === 'friend') {
    const card = page.onShareAppMessage()
    const url = new URL(card.path, 'https://mini.test')
    assert.equal(url.pathname, '/' + page.route)
    return { card, options: Object.fromEntries(url.searchParams) }
  }
  const card = page.onShareTimeline()
  assert.equal(card.path, undefined, 'timeline only accepts query on the current route')
  return { card, options: Object.fromEntries(new URLSearchParams(card.query || '')) }
}

for (const mode of ['friend', 'timeline']) {
  test(`${mode}: inspiration shares open and re-share the same guide, with URL encoding`, async () => {
    const f = fixture()
    const id = 'guide/长沙 & sunset=100%'
    const page = await f.open('guideDetail', { id, shopId: 'sender-shop', scene: 'sender-scene', token: 'private' })
    const { card, options } = serialize(page, mode)
    assert.deepEqual(options, { id })
    assert.equal(card.title, f.share.BRAND_TITLE)
    const recipient = await f.open('guideDetail', options)
    assert.deepEqual(f.calls.at(-1), { name: 'getGuideDetail', params: { id } })
    assert.deepEqual(serialize(recipient, mode).options, options)
  })

  test(`${mode}: package shares preserve the selected package, series and spot`, async () => {
    const f = fixture()
    const page = await f.open('photoPackageDetail', { packageId: 'package-original', seriesId: 'series-a', spotId: 'spot-a' })
    page.setData({ selectedPackage: { _id: 'package-current' } })
    const { options } = serialize(page, mode)
    assert.deepEqual(options, { packageId: 'package-current', seriesId: 'series-a', spotId: 'spot-a' })
    const recipient = await f.open('photoPackageDetail', options)
    assert.deepEqual(f.calls.at(-1), { name: 'getSeriesDetail', params: options })
    assert.equal(recipient.data.selectedPackage._id, 'package-current')
    assert.deepEqual(serialize(recipient, mode).options, options)
  })

  test(`${mode}: series-only and legacy package links share the package resolved by loading`, async () => {
    for (const options of [{ seriesId: 'series-a' }, { id: 'series-a' }]) {
      const f = fixture()
      const page = await f.open('photoPackageDetail', options)
      const shared = serialize(page, mode).options
      assert.equal(shared.packageId, 'resolved-package')
      assert.equal(shared.seriesId, 'series-a')
      assert.equal(shared.spotId, 'spot-a')
      await f.open('photoPackageDetail', shared)
      assert.equal(f.calls.at(-1).params.packageId, 'resolved-package')
    }
  })

  test(`${mode}: photo album shares retain the current album and spot after selection changes`, async () => {
    const f = fixture()
    const page = await f.open('photoCollection', { albumId: 'album-a', seriesId: 'series-a', spotId: 'spot-a' })
    page.setData({ currentCollection: { _id: 'album-b', albumId: 'album-b', seriesId: 'series-a', spotId: 'spot-b' }, activeCollectionId: 'album-b', currentSpotId: 'spot-b' })
    const { options } = serialize(page, mode)
    assert.equal(options.albumId, 'album-b')
    assert.equal(options.seriesId, 'series-a')
    assert.equal(options.spotId, 'spot-b')
    const recipient = await f.open('photoCollection', options)
    assert.deepEqual(f.calls.at(-1), { name: 'getPhotoCollection', params: { seriesId: 'series-a', albumId: 'album-b', spotId: 'spot-b' } })
    assert.equal(recipient.data.currentCollection._id, 'album-b')
  })

  test(`${mode}: photo series shares stay a series listing and retain a focused album`, async () => {
    const f = fixture()
    const page = await f.open('photoCollection', { seriesId: 'series-a', focusAlbumId: 'album-a', spotId: 'spot-a' })
    page.setData({ currentCollection: { _id: 'album-a', albumId: 'album-a', seriesId: 'series-a', spotId: 'spot-a' } })
    assert.equal(page.data.isAlbumDetail, false)
    const { options } = serialize(page, mode)
    assert.equal(options.seriesId, 'series-a')
    assert.equal(options.albumId, undefined, 'a series listing must not become an album detail')
    assert.equal(options.focusAlbumId, 'album-a')
    const recipient = await f.open('photoCollection', options)
    assert.equal(recipient.data.isAlbumDetail, false)
    assert.equal(recipient.data.focusAlbumId, 'album-a')
  })

  test(`${mode}: legacy video aliases become a canonical product link`, async () => {
    for (const key of ['productId', 'packageId', 'id']) {
      const f = fixture()
      const page = await f.open('videoProductDetail', { [key]: 'video-current', spotId: 'spot-a' })
      const { options } = serialize(page, mode)
      assert.deepEqual(options, { productId: 'video-current', spotId: 'spot-a' })
      const recipient = await f.open('videoProductDetail', options)
      assert.equal(recipient.data.productId, 'video-current')
      assert.deepEqual(f.calls.at(-1), { name: 'buildVideoProductDetail', params: options })
    }
  })
}

test('default shares exclude unrelated private options and leave ordinary routes unchanged', () => {
  const f = fixture()
  const page = { route: 'pages/myOrders/myOrders', options: { orderId: 'private-order', token: 'private-token', phone: 'private-phone' }, data: {} }
  f.register({})
  Object.assign(page, f.definition)
  f.setCurrent(page)
  assert.equal(page.onShareAppMessage().path, '/pages/myOrders/myOrders')
  assert.equal(page.onShareTimeline().query || '', '')
  page.route = 'pages/index/index'
  assert.equal(page.onShareAppMessage().path, '/pages/index/index')
  assert.equal(page.onShareTimeline().query || '', '')
})

test('the global Page wrapper adds missing handlers and preserves page-specific handlers', () => {
  const f = fixture()
  const friend = () => ({ title: 'custom friend', path: '/pages/index/index?custom=1' })
  const timeline = () => ({ title: 'custom timeline', query: 'custom=1' })
  f.register({ onShareAppMessage: friend })
  assert.equal(f.definition.onShareAppMessage, friend)
  assert.equal(f.definition.onShareTimeline, f.share.defaultTimeline)
  f.register({ onShareTimeline: timeline })
  assert.equal(f.definition.onShareAppMessage, f.share.defaultShare)
  assert.equal(f.definition.onShareTimeline, timeline)
  f.register({ onShareAppMessage: friend, onShareTimeline: timeline })
  assert.equal(f.definition.onShareAppMessage, friend)
  assert.equal(f.definition.onShareTimeline, timeline)
})

test('loading pages retain their entry identifiers before detail data has arrived', () => {
  const examples = [
    ['guideDetail', { id: 'guide-loading' }, { guide: {} }, { id: 'guide-loading' }],
    ['photoPackageDetail', { id: 'series-loading', packageId: 'package-loading', spotId: 'spot-loading' },
      { packageId: '', seriesId: '', spotId: '', selectedPackage: null },
      { packageId: 'package-loading', seriesId: 'series-loading', spotId: 'spot-loading' }],
    ['photoCollection', { seriesId: 'series-loading', albumId: 'album-loading', spotId: 'spot-loading' },
      { currentCollection: null, series: {}, pendingAlbumId: '', currentSpotId: '', isAlbumDetail: false },
      { seriesId: 'series-loading', albumId: 'album-loading', spotId: 'spot-loading' }],
    ['videoProductDetail', { packageId: 'video-loading', spotId: 'spot-loading' },
      { product: null, productId: '', spotId: '' },
      { productId: 'video-loading', spotId: 'spot-loading' }]
  ]
  for (const [name, options, data, expected] of examples) {
    const f = fixture()
    f.register({})
    const page = Object.assign({}, f.definition, {
      route: `pages/${name}/${name}`,
      options: { ...options, orderId: 'private-order', shopId: 'private-shop', scene: 'private-scene' },
      data: { ...data, loading: true }
    })
    f.setCurrent(page)
    for (const mode of ['friend', 'timeline']) assert.deepEqual(serialize(page, mode).options, expected, `${mode} ${name}`)
  }
})

test('the default share still falls back to home without a page stack or WeChat page API', () => {
  const f = fixture()
  assert.equal(f.share.defaultShare().path, '/pages/index/index')
  delete f.context.getCurrentPages
  assert.equal(f.share.defaultShare().path, '/pages/index/index')
  assert.equal(f.share.defaultTimeline().query || '', '')
})
