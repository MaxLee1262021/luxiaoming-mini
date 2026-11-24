'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const booking = require('../miniprogram/utils/booking')
const bookingData = require('../miniprogram/service/bookingData')
const bookingActions = require('../miniprogram/service/bookingInfoActions')

const spots = [{ _id: 'ifs', name: 'IFS 国金中心' }, { _id: 'island', name: '橘子洲' }, { _id: 'other', name: '未关联地点' }]
const pkg = { _id: 'bundle', name: '城市旅拍套餐', type: 'photo', productKind: 'package', price: 499,
  spotIds: ['ifs', 'island'], applicableSpots: spots.slice(0, 2) }

function pageFixture() {
  const filename = path.resolve(__dirname, '../miniprogram/pages/bookingInfo/bookingInfo.js')
  let definition
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename), getApp: () => ({}), wx: {}, console,
    Page: value => { definition = value }
  }, { filename })
  return { ...definition, data: structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch) }, updateTotalPrice() {} }
}

test('prefilled packages retain every applicable point separately from the selected shooting point', () => {
  const { item } = bookingData.findPrefillSelection({
    data: { allPackages: [pkg], spots, allAlbums: [], allSeries: [] },
    prefill: { packageId: pkg._id, spotId: 'island' }
  })
  assert.equal(item.spotId, 'island')
  assert.equal(item.spotName, '橘子洲')
  assert.deepEqual(item.applicableSpots.map(spot => spot._id), ['ifs', 'island'])
  assert.deepEqual(booking.buildBookingPayload({ items: [item] }).items[0].applicableSpots, item.applicableSpots)
})

test('legacy prefill resolves all package product bindings without adding unrelated spots', () => {
  const legacy = { ...pkg, applicableSpots: undefined, spotIds: [], includedItems: [
    { type: 'album', target: { albumId: 'photo' } }
  ] }
  const { item } = bookingData.findPrefillSelection({
    data: { allPackages: [legacy], spots, allAlbums: [{ _id: 'photo', spotIds: ['ifs', 'island'] }], allSeries: [] },
    prefill: { packageId: pkg._id, spotId: 'island' }
  })
  assert.deepEqual(item.applicableSpots.map(spot => spot.name), ['IFS 国金中心', '橘子洲'])
})

test('adding a package from the sheet keeps its full applicable list and selected shooting point', () => {
  const page = pageFixture()
  const rows = page.buildSheetProducts({ allPackages: [pkg], spotOptions: spots })
  const row = rows.find(item => item.spotId === 'island')
  assert.ok(row)
  page.onSheetConfirm({ detail: { items: [row] } })
  assert.equal(page.data.items[0].spotId, 'island')
  assert.deepEqual(page.data.items[0].applicableSpots.map(spot => spot._id), ['ifs', 'island'])
})

test('older picker add-package path also resolves all point bindings', () => {
  const page = { data: { allPackages: [{ ...pkg, applicableSpots: undefined }], allSeries: [],
    allAlbums: [], spotOptions: spots, currentSpotId: 'island', items: [], pickerCart: [] },
    setData(patch) { Object.assign(this.data, patch) } }
  bookingActions.addPackage(page, { currentTarget: { dataset: { id: pkg._id } } })
  assert.deepEqual(page.data.pickerCart[0].applicableSpots.map(spot => spot._id), ['ifs', 'island'])
})

test('an authoritative empty package list stays empty instead of turning the selected spot into package coverage', () => {
  const item = booking.buildItemFromPackage({ pkg: { ...pkg, applicableSpots: [] }, spot: spots[0], context: { spots } })
  assert.equal(item.spotId, 'ifs')
  assert.deepEqual(item.applicableSpots, [])
})

test('legacy peripheral-only bindings survive prefill and both add-package paths', () => {
  const legacy = { ...pkg, applicableSpots: undefined, spotIds: [], includedItems: [
    { type: 'peripheral', target: { peripheralId: 'souvenir' } }
  ] }
  const allPeripherals = [{ _id: 'souvenir', spotIds: ['ifs', 'island'] }]
  const page = pageFixture()
  page.data.prefillPackageId = legacy._id
  page.data.prefillSpotId = 'island'
  page.updatePickerLists = () => {}
  page.applyBookingData({ allPackages: [legacy], spots, allPeripherals })
  assert.deepEqual(page.data.items[0].applicableSpots.map(spot => spot._id), ['ifs', 'island'])
  const row = page.data.sheetProducts.find(item => item.spotId === 'island')
  page.data.items = []
  page.onSheetConfirm({ detail: { items: [row] } })
  assert.deepEqual(page.data.items[0].applicableSpots.map(spot => spot._id), ['ifs', 'island'])
  page.data.items = []
  page.data.pickerCart = []
  bookingActions.addPackage(page, { currentTarget: { dataset: { id: legacy._id } } })
  assert.deepEqual(page.data.pickerCart[0].applicableSpots.map(spot => spot._id), ['ifs', 'island'])
})
