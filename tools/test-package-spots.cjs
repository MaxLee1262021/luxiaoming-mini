'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { normalizeSpots, resolvePackageSpots } = require('../miniprogram/utils/packageSpots')
const { buildPhotoPackageDetail } = require('../miniprogram/service/packageDetail')

const spots = [
  { id: 'ifs', name: 'IFS 国金中心' },
  { _id: 'orange', name: '橘子洲' },
  { _id: 'old-street', name: '老街' },
  { _id: 'unrelated', name: '无关点位' }
]

test('package detail displays the full authoritative point list across product series', () => {
  const currentPackage = {
    _id: 'bundle', name: '跨点套餐', type: 'photo',
    spotIds: ['unrelated'],
    includedItems: [{ type: 'album', albumId: 'photo' }, { type: 'video', productId: 'video' }],
    applicableSpots: [spots[0], spots[1], spots[0]]
  }
  // The series detail catalog contains just its own point; the package's
  // server projection also includes the product from another series.
  const detail = buildPhotoPackageDetail({ currentPackage, spots: [spots[0]], albums: [] }, { packageId: 'bundle' })
  assert.deepEqual(detail.spots.map(spot => [spot._id, spot.name]), [
    ['ifs', 'IFS 国金中心'], ['orange', '橘子洲']
  ])
})

test('explicitly cleared or missing package bindings cannot become all series points', () => {
  const currentPackage = { _id: 'bundle', type: 'photo', spotIds: ['ifs'], applicableSpots: [] }
  assert.deepEqual(buildPhotoPackageDetail({ currentPackage, spots }, { packageId: 'bundle' }).spots, [])
  assert.deepEqual(resolvePackageSpots({ _id: 'global', type: 'photo' }, { spots }), [])
  assert.deepEqual(resolvePackageSpots({ includedItems: [{ type: 'album', albumId: 'missing' }] }, { spots }), [])
})

test('older APIs resolve every included product point rather than just the navigation target', () => {
  const pkg = {
    includedItems: [
      { type: 'album', target: { albumId: 'photo', spotId: 'ifs' } },
      { type: 'video', target: { productId: 'video', spotId: 'orange' } },
      { type: 'peripheral', target: { peripheralId: 'gift' } }
    ]
  }
  const result = resolvePackageSpots(pkg, {
    spots,
    albums: [{ id: 'photo', spotIds: ['ifs', 'orange'], seriesId: 'series' }],
    videoProducts: [{ productId: 'video', spotIds: ['orange', 'old-street'] }],
    peripherals: [{ peripheralId: 'gift', spotId: 'ifs' }],
    series: { id: 'series', spotIds: ['unrelated'] }
  })
  assert.deepEqual(result.map(spot => spot._id), ['ifs', 'orange', 'old-street'])
})

test('legacy series inheritance respects explicit unbinding and supports all referenced series', () => {
  const pkg = {
    spotIds: ['unrelated'],
    includedItems: [
      { type: 'album', target: { albumId: 'photo' } },
      { type: 'video', target: { productId: 'cleared', spotId: 'unrelated' } }
    ]
  }
  const data = {
    spots,
    albums: [{ albumId: 'photo', seriesId: 'second' }],
    videoSingles: [{ id: 'cleared', seriesId: 'first', spotBindingExplicit: true, spotIds: [] }],
    allSeries: [{ id: 'first', spotIds: ['unrelated'] }, { id: 'second', spotIds: ['orange'] }]
  }
  assert.deepEqual(resolvePackageSpots(pkg, data).map(spot => spot._id), ['orange'])
  assert.deepEqual(resolvePackageSpots({ seriesId: 'second' }, data).map(spot => spot._id), ['orange'])
})

test('spot normalization preserves link identities, deduplicates and never invents point names', () => {
  const normalized = normalizeSpots([
    null, 'ifs', { id: 2, spotName: ' 数字 ID 点位 ' }, { _id: '2', name: '重复' },
    { _id: 'unknown' }, { name: '缺少 ID' }
  ])
  assert.deepEqual(normalized.map(spot => [spot._id, spot.id, spot.name]), [['2', '2', '数字 ID 点位']])
})

test('mixed administrator productId references retain photo and peripheral points in older API responses', () => {
  const pkg = { includedItems: [
    { type: 'album', productId: 'photo-flat' },
    { type: 'album', target: { page: 'photoCollection', productId: 'photo-target' } },
    { type: 'peripheral', productId: 'gift-flat' },
    { type: 'peripheral', target: { page: 'peripheral', productId: 'gift-target' } }
  ] }
  const result = resolvePackageSpots(pkg, {
    spots,
    albums: [{ _id: 'photo-flat', spotIds: ['ifs'] }, { id: 'photo-target', spotId: 'orange' }],
    peripherals: [{ _id: 'gift-flat', spotId: 'old-street' }, { productId: 'gift-target', spotIds: ['unrelated'] }]
  })
  assert.deepEqual(result.map(spot => spot._id), ['ifs', 'orange', 'old-street', 'unrelated'])
})
