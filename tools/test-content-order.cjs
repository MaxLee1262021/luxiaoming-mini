'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { buildHomeViewData, buildHomeSpotShelf } = require('../miniprogram/service/homeData')
const { publicGuides } = require('../miniprogram/utils/guideContent')

const ids = rows => Array.from(rows, row => row._id || row.id)
const expected = prefix => [1, 2, 3].map(position => `${prefix}-${position}`)
function products(prefix, extra = {}) {
  return [3, 1, 2].map(sort => ({ id: `${prefix}-${sort}`, name: `${prefix} ${sort}`, sort,
    spotId: 'point', hotScore: sort * 100, sampleUrls: [], ...extra }))
}
function catalog() {
  return {
    albums: products('album'), packages: products('package', { type: 'photo', isHot: true }),
    videoSingles: products('video', { type: 'video', productKind: 'video_single' }),
    spots: [{ _id: 'point' }], guides: products('guide', { status: '已发布' }).map(row => ({ ...row,
      title: row.name, isTop: row.sort === 3, readCount: row.sort * 10, score: row.sort,
      updatedAt: `2026-11-0${row.sort}` }))
  }
}

test('mini and admin share the same ordering contract, including legacy fallback and independent category pools', () => {
  const mini = fs.readFileSync(path.resolve(__dirname, '../miniprogram/utils/contentOrder.js'), 'utf8')
  const admin = fs.readFileSync(path.resolve(__dirname, '../../luxiaoming-admin-交付包/src/utils/content-order.js'), 'utf8')
  assert.equal(mini, admin)
})

test('home and point shelves preserve manual positions after normalization, merge, filtering and preview limits', () => {
  const data = catalog()
  const before = JSON.stringify(data)
  const view = buildHomeViewData(data)
  assert.deepEqual(ids(view.bookingAlbums), expected('album'))
  assert.deepEqual(ids(view.hotPackages), expected('package'))
  assert.deepEqual(ids(view.videoPackages), expected('video'))
  assert.deepEqual(ids(view.guides), expected('guide'))
  for (const scoped of [false, true]) {
    const shelf = buildHomeSpotShelf(data, 'point', scoped)
    assert.deepEqual(ids(shelf.albums), expected('album'))
    assert.deepEqual(ids(shelf.packages), expected('package'))
    assert.deepEqual(ids(shelf.videos), expected('video'))
  }
  assert.equal(JSON.stringify(data), before)
})

test('spot detail applies manual order to legacy unsorted catalogues in each product shelf', () => {
  const filename = path.resolve(__dirname, '../miniprogram/pages/spotSheet/spotSheet.js')
  const realRequire = createRequire(filename)
  let page
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: realRequire, getApp: () => ({}), Page: value => { page = value }, console
  }, { filename })
  const data = catalog()
  page.data = { catalog: { allAlbums: data.albums,
    allPackages: [...data.videoSingles, ...data.packages], allSeries: [] } }
  const shelves = page.resolveSpotProducts({ _id: 'point' })
  assert.deepEqual(ids(shelves.photoSingles), expected('album'))
  assert.deepEqual(ids(shelves.videos), expected('video'))
  assert.deepEqual(ids(shelves.photoPackages), expected('package'))
})

test('guide defaults honor manual positions and explicit metric choices still override them', () => {
  const rows = catalog().guides
  assert.deepEqual(ids(publicGuides(rows)), expected('guide'))
  for (const sortBy of ['readCount', 'score']) assert.deepEqual(ids(publicGuides(rows, sortBy)), expected('guide').reverse())
})

test('explicit home recommendation order survives client normalization until manual positions are assigned', () => {
  const data = catalog()
  data.albums.forEach(row => { delete row.sort })
  data.packages.forEach(row => { delete row.sort })
  data.recommendations = { hotPackageIds: data.packages.map(row => row.id) }
  let view = buildHomeViewData(data)
  assert.deepEqual(ids(view.bookingAlbums), ['album-3', 'album-1', 'album-2'])
  assert.deepEqual(ids(view.hotPackages), ['package-3', 'package-1', 'package-2'])
  data.albums.find(row => row.id === 'album-2').sort = 1
  data.packages.find(row => row.id === 'package-2').sort = 1
  view = buildHomeViewData(data)
  assert.equal(view.bookingAlbums[0]._id, 'album-2')
  assert.equal(view.hotPackages[0]._id, 'package-2')
})
