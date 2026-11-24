'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { normalizeAlbumPresentation } = require('../miniprogram/utils/albumPresentation')
const { buildBookingAlbums, buildHomeSpotShelf } = require('../miniprogram/service/homeData')
const { buildRelatedPhotoCollections } = require('../miniprogram/service/relatedPhotoCollections')
const { buildPhotoPackageDetail } = require('../miniprogram/service/packageDetail')

function loadDefinition(relative, kind = 'Page') {
  const filename = path.resolve(__dirname, '../miniprogram', relative)
  let definition
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename),
    getApp: () => ({}),
    [kind](value) { definition = value },
    console,
    wx: { getStorageSync() { return '' }, getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } } } }
  }, { filename })
  return { ...definition, ...(definition.methods || {}), data: structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch) } }
}

const base = {
  _id: 'custom-photo', name: '自定义照片留影', spotId: 'spot', seriesId: 'series',
  photoCount: 4, retouchMode: 'count', retouchCount: 3, makeupIncluded: false,
  price: 198, sampleUrls: ['/preview-a.jpg', '/preview-b.jpg'],
  photoCountText: ' 底片全送 ', retouchText: ' AI精修9张，PS精修3张 ', makeupText: ' 含简妆，自备服装 '
}

function serviceText(album) {
  return [album.photoCountText, album.retouchText, album.makeupText]
}

test('custom photo services keep the exact configured wording across repeated normalization without changing quantities or prices', () => {
  const before = JSON.stringify(base)
  const normalized = normalizeAlbumPresentation(base)
  assert.deepEqual(serviceText(normalized), ['底片全送', 'AI精修9张，PS精修3张', '含简妆，自备服装'])
  assert.deepEqual(serviceText(normalizeAlbumPresentation(normalized)), serviceText(normalized))
  assert.equal(normalized.photoCount, 4)
  assert.equal(normalized.retouchCount, 3)
  assert.equal(normalized.makeupIncluded, false)
  assert.equal(normalized.price, 198)
  assert.equal(JSON.stringify(base), before)
  for (const retouchText of ['像素蛋糕', 'AI精修9张', 'PS精修3张', '修9张']) {
    assert.equal(normalizeAlbumPresentation({ ...base, retouchText }).retouchText, retouchText)
  }
  const custom = normalizeAlbumPresentation({ ...base, photoCountText: '交付9张', intro: '交付9 张照片，底片全送。' })
  assert.equal(custom.photoCountText, '交付9张')
  assert.equal(custom.intro, '交付9 张照片，底片全送。', 'Preview counts cannot rewrite a custom delivery promise')
})

test('home shelves, recommendations, detail, cards and booking summaries share custom photo services', () => {
  const expected = ['底片全送', 'AI精修9张，PS精修3张', '含简妆，自备服装']
  const series = [{ _id: 'series', name: '系列', spotIds: ['spot'] }]
  const spots = [{ _id: 'spot', name: '打卡点' }]
  const homeAlbum = buildBookingAlbums([base], series, spots)[0]
  assert.deepEqual(serviceText(homeAlbum), expected)
  const shelf = buildHomeSpotShelf({ albums: [base], series, spots }, 'spot')
  assert.deepEqual(serviceText(shelf.albums[0]), expected)
  const related = buildRelatedPhotoCollections({ _id: 'other' }, [], { albums: [base], allSeries: series, spots })[0]
  assert.deepEqual(serviceText(related), expected)
  const detail = buildPhotoPackageDetail({ currentPackage: { _id: 'bundle', type: 'photo' }, albums: [base] })
  assert.deepEqual(serviceText(detail.albums[0]), expected)
  const card = loadDefinition('components/lxm-album-card/lxm-album-card.js', 'Component')
  card.observers.item.call(card, homeAlbum)
  assert.deepEqual(serviceText(card.data.album), expected)
  const page = loadDefinition('pages/photoCollection/photoCollection.js')
  page.data.pendingAlbumId = base._id
  page.applyCollectionData({ series: series[0], currentCollection: base, collections: [base] })
  assert.deepEqual(serviceText(page.data.currentCollection), expected)
  const booking = loadDefinition('pages/bookingInfo/bookingInfo.js')
  const rows = booking.buildSheetProducts({ allAlbums: [base], allSeries: series, spotOptions: spots })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].meta, '底片全送')
  assert.equal(rows[0].price, 198)
  assert.equal(rows[0].src.photoCount, 4)
})

test('missing and cleared custom service text uses the existing numeric and boolean values', () => {
  for (const blank of [undefined, null, '', '  ']) {
    const legacy = normalizeAlbumPresentation({ ...base, photoCountText: blank, retouchText: blank, makeupText: blank })
    assert.deepEqual(serviceText(legacy), ['4 张照片', '3 张', '不包含'])
  }
  assert.deepEqual(serviceText(normalizeAlbumPresentation({ photoCount: 9, retouchMode: 'included', makeupIncluded: true })), ['9 张照片', '包含', '包含'])
  assert.deepEqual(serviceText(normalizeAlbumPresentation({ photoCount: 0, retouchMode: 'excluded' })), ['0 张照片', '不包含', '不包含'])
  const card = loadDefinition('components/lxm-album-card/lxm-album-card.js', 'Component')
  card.observers.item.call(card, base)
  card.observers.item.call(card, { photoCount: 9, retouchCount: 2, makeupIncluded: true })
  assert.deepEqual(serviceText(card.data.album), ['9 张照片', '2 张', '包含'])
  const packageDetail = buildPhotoPackageDetail({ currentPackage: { _id: 'bundle', type: 'photo' }, albums: [{ _id: 'photo-zero', photoCount: 0, sampleUrls: ['/preview.jpg'] }] })
  assert.equal(packageDetail.albums[0].photoCount, 0, 'Preview images never replace delivery counts')
  assert.equal(packageDetail.albums[0].photoCountText, '0 张照片')
})

test('a reused photo card moves long or multiline delivery promises below the cover and restores short captions', () => {
  const card = loadDefinition('components/lxm-album-card/lxm-album-card.js', 'Component')
  for (const photoCountText of ['底片全送'.repeat(40), '交付9张\n底片全送']) {
    card.observers.item.call(card, { ...base, photoCountText })
    assert.equal(card.data.photoCountBelowCover, true, 'Full delivery promises need space outside the fixed-height image')
    assert.equal(card.data.album.photoCountText, photoCountText)
    assert.equal(card.data.album.name, base.name)
    assert.equal(card.data.album.price, base.price)
  }
  for (const album of [base, { photoCount: 9 }, null]) {
    card.observers.item.call(card, album)
    assert.equal(card.data.photoCountBelowCover, false, 'Card reuse must not leave a stale long-caption layout')
  }
})
