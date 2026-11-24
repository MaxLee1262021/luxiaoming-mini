'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { normalizeOrder } = require('../miniprogram/utils/order')

const names = order => normalizeOrder(order).applicableSpots.map(spot => spot.name)
const spots = [{ _id: 'ifs', name: 'IFS 国金中心' }, { _id: 'orange', name: '橘子洲' }]

test('the complete server package scope survives order normalization and refresh', () => {
  const order = { id: 'o1', applicableSpots: spots, spotName: 'IFS 国金中心', totalPrice: 99 }
  const normalized = normalizeOrder(order)
  assert.deepEqual(names(order), ['IFS 国金中心', '橘子洲'])
  assert.deepEqual(names(normalized), ['IFS 国金中心', '橘子洲'])
  assert.equal(normalized.spotName, 'IFS 国金中心')
  assert.equal(normalized.totalPrice, 99)
})

test('confirmation of one shooting location preserves the saved package coverage', () => {
  const order = {
    confirmationSnapshot: { name: '已确认套餐', spotName: 'IFS 国金中心' },
    packageSnapshot: { applicableSpots: spots, items: [{ packageId: 'package-1' }] }
  }
  assert.deepEqual(names(order), ['IFS 国金中心', '橘子洲'])
  assert.equal(normalizeOrder(order).spotName, 'IFS 国金中心')
})

test('legacy order lines retain all named spots with stable ID deduplication', () => {
  const order = { items: [
    { packageId: 'one', applicableSpots: [spots[0], { id: 'orange', name: '橘子洲' }] },
    { packageId: 'two', applicableSpots: [spots[1], { _id: 'unknown' }] }
  ] }
  assert.deepEqual(names(order), ['IFS 国金中心', '橘子洲'])
  assert.equal(normalizeOrder(order).applicableSpots.length, 2)
})

test('explicit empty scope cannot revive a stale package or line binding', () => {
  assert.deepEqual(names({ applicableSpots: [], packageSnapshot: { applicableSpots: spots } }), [])
  assert.deepEqual(names({ packageSnapshot: { applicableSpots: [], items: [{ applicableSpots: spots }] } }), [])
})

test('a lone confirmed shooting point is not treated as package applicability', () => {
  assert.deepEqual(names({ confirmedSpotName: '拍摄集合地点', spotId: 'meetup' }), [])
  assert.deepEqual(names({}), [])
})
