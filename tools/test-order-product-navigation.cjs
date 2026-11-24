'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { orderItemDisplay } = require('../miniprogram/utils/productDisplay')

function fixture(lookup = async () => { throw new Error('unexpected catalogue lookup') }) {
  const filename = path.resolve(__dirname, '../miniprogram/service/orderProductNavigation.js')
  const nativeRequire = createRequire(filename)
  const navigations = []
  const toasts = []
  const lookups = []
  const context = {
    module: { exports: {} },
    wx: {
      navigateTo(options) { navigations.push(options) },
      showToast(options) { toasts.push(options) }
    },
    require(id) {
      if (id === '../api/series') return {
        async getSeriesDetail(params) {
          lookups.push(params)
          return lookup(params)
        }
      }
      return nativeRequire(id)
    }
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename })
  return { ...context.module.exports, navigations, toasts, lookups }
}

test('recorded item IDs and legacy types resolve without mistaking package context for an album', () => {
  const rows = [
    { productType: 'package', productId: 'bundle', albumId: 'context-album' },
    { productType: 'photo_single', packageId: 'legacy-bundle', albumId: 'context-album' },
    { productType: 'photo_single', albumId: 'photo' },
    { productType: 'video_package', packageId: 'video' },
    { productType: 'sample', albumId: 'sample' },
    { productType: 'addon', peripheralId: 'gift' },
    { productType: 'photo', packageId: 'bundle-photo' },
    { packageId: 'legacy', albumId: 'context-album' },
    { productType: 'custom', productId: 'custom' }
  ]
  const items = orderItemDisplay(rows)
  assert.deepEqual(items.map(item => [item.targetType, item.targetId]), [
    ['package', 'bundle'], ['package', 'legacy-bundle'], ['album', 'photo'],
    ['video', 'video'], ['album', 'sample'], ['peripheral', 'gift'],
    ['package', 'bundle-photo'], ['package', 'legacy'], ['', '']
  ])
  assert.equal(items[7].typeLabel, '旅拍套餐')
})

test('order links use the correct product parameter and encode IDs and source attribution', async () => {
  const expected = {
    album: ['/pages/photoCollection/photoCollection', 'albumId'],
    video: ['/pages/videoProductDetail/videoProductDetail', 'productId'],
    peripheral: ['/pages/peripherals/peripherals', 'id']
  }
  for (const [targetType, [page, idKey]] of Object.entries(expected)) {
    const f = fixture()
    const item = Object.freeze({ targetType, targetId: '商品&1', spotId: '点&位', seriesId: '风 格', priceText: '¥0' })
    const source = Object.freeze({ shopId: '商&家', scene: 'a=1&b=2' })
    assert.equal(await f.openOrderProduct(item, source), true)
    const url = new URL(f.navigations[0].url, 'https://mini.test')
    assert.equal(url.pathname, page)
    assert.equal(url.searchParams.get(idKey), item.targetId)
    assert.equal(url.searchParams.get('shopId'), source.shopId)
    assert.equal(url.searchParams.get('scene'), source.scene)
    assert.equal(url.searchParams.get('spotId'), targetType === 'peripheral' ? null : item.spotId)
    assert.equal(url.searchParams.get('seriesId'), targetType === 'peripheral' ? null : item.seriesId)
    assert.equal(f.lookups.length, 0)
    assert.equal(f.toasts.length, 0)
    assert.equal(item.priceText, '¥0')
  }
})

test('generic package snapshots resolve legacy videos while keeping recorded item data unchanged', async () => {
  for (const video of [false, true]) {
    const f = fixture(async ({ packageId }) => ({
      success: true,
      data: { currentPackage: { _id: packageId, type: video ? 'video' : 'photo', price: 999, name: 'Current catalogue name' } }
    }))
    const item = Object.freeze({ targetType: 'package', targetId: 'package&1', spotId: 'spot', seriesId: 'series', name: 'Recorded name', priceText: '¥0.3' })
    assert.equal(await f.openOrderProduct(item, { shopId: 'source' }), true)
    assert.equal(f.lookups.length, 1)
    assert.deepEqual({ ...f.lookups[0] }, { packageId: 'package&1', spotId: 'spot', seriesId: 'series' })
    const url = new URL(f.navigations[0].url, 'https://mini.test')
    assert.equal(url.pathname, video ? '/pages/videoProductDetail/videoProductDetail' : '/pages/photoPackageDetail/photoPackageDetail')
    assert.equal(url.searchParams.get(video ? 'productId' : 'packageId'), item.targetId)
    assert.equal(url.searchParams.get('shopId'), 'source')
    assert.equal(item.name, 'Recorded name')
    assert.equal(item.priceText, '¥0.3')
  }
})

test('missing IDs and unknown or custom rows never open a list or unrelated product', async () => {
  const f = fixture()
  for (const item of [
    {}, { targetType: 'video', targetId: '' }, { targetType: 'peripheral', targetId: ' ' },
    { targetType: 'album', targetId: {} }, { targetType: 'custom', targetId: 'custom-id' },
    { targetType: 'explore', targetId: 'unknown' }
  ]) {
    assert.equal(await f.openOrderProduct(item), false)
  }
  assert.equal(f.navigations.length, 0)
  assert.equal(f.lookups.length, 0)
  assert.equal(f.toasts.length, 6)
})

test('unavailable or mismatched catalogue results keep the order open for retry', async () => {
  const outcomes = [
    async () => { throw new Error('offline') },
    async () => ({ success: false, error: '商品已下架' }),
    async () => ({ success: true, data: {} }),
    async () => ({ success: true, data: { currentPackage: { _id: 'another-product', type: 'video' } } })
  ]
  for (const lookup of outcomes) {
    const f = fixture(lookup)
    assert.equal(await f.openOrderProduct({ targetType: 'package', targetId: 'recorded-product' }), false)
    assert.equal(f.navigations.length, 0)
    assert.equal(f.toasts.length, 1)
  }
})

test('a native navigation failure shows a retryable message', async () => {
  const f = fixture()
  await f.openOrderProduct({ targetType: 'album', targetId: 'album-id' })
  f.navigations[0].fail()
  assert.equal(f.toasts.length, 1)
  assert.match(f.toasts[0].title, /重试/)
})
