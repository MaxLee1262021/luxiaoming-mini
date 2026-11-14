'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')

let definition
let savedSpot
const requests = []

global.wx = {
  getStorageSync() { return '' },
  setStorageSync() {},
  getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } } },
  request(options) {
    const name = String(options.url).split('/rpc/').pop()
    requests.push(name)
    const offset = options.data.data.spotOffset || 0
    const data = name === 'getHomeData'
      ? { spots: [savedSpot], spotPagination: { offset, limit: 20, nextOffset: offset + 1, hasMore: false } }
      : name === 'getSpots' ? [savedSpot] : name === 'getBookingData' ? {} : []
    options.success({ statusCode: 200, data: { success: true, data } })
  }
}
global.getApp = () => ({ captureSource: () => ({}) })
global.Page = value => { definition = value }

require('../miniprogram/pages/index/index')
const homeDefinition = definition
require('../miniprogram/pages/spotSheet/spotSheet')
const detailDefinition = definition
const { API_BASE } = require('../miniprogram/config/env')
const mediaOrigin = new URL(API_BASE).origin

function createPage(config) {
  return Object.assign({}, config, {
    data: JSON.parse(JSON.stringify(config.data)),
    setData(patch, done) {
      Object.assign(this.data, patch)
      if (typeof done === 'function') done()
    }
  })
}

test('saved spot cover reaches home cards and detail hero through the public RPC clients', async () => {
  const cases = [
    { fields: { cover: '/api/media/spot-cover' }, expected: `${mediaOrigin}/api/media/spot-cover` },
    { fields: { cover: '/uploads/spot.jpg', image: 'https://cdn.test/old.jpg' }, expected: `${mediaOrigin}/uploads/spot.jpg` },
    { fields: { coverUrl: 'https://cdn.test/cover-url.jpg' }, expected: 'https://cdn.test/cover-url.jpg' },
    { fields: { coverImage: 'https://cdn.test/cover-image.jpg' }, expected: 'https://cdn.test/cover-image.jpg' },
    { fields: { image: 'https://cdn.test/image.jpg' }, expected: 'https://cdn.test/image.jpg' },
    { fields: { cover: '  ', coverUrl: '', image: 'https://cdn.test/legacy.jpg' }, expected: 'https://cdn.test/legacy.jpg' },
    { fields: {}, expected: '/images/placeholder.png' }
  ]

  for (const { fields, expected } of cases) {
    savedSpot = { _id: 'spot-cover', name: '封面测试打卡点', ...fields }
    const home = createPage(homeDefinition)
    const detail = createPage(detailDefinition)
    detail.data.id = savedSpot._id
    await home.loadHomeData()
    await detail.loadSpots()

    assert.equal(home.data.error, '')
    assert.equal(detail.data.error, '')
    assert.equal(home.data.spotTabs[0].cover, expected, 'home card must display the saved cover')
    assert.equal(detail.data.selectedSpot.cover, expected, 'detail hero must display the same cover')
    assert.equal(home.data.hotSpots[0].cover, detail.data.selectedSpot.cover)
  }
  assert.ok(requests.includes('getHomeData'))
  assert.ok(requests.includes('getSpots'))
  assert.ok(!requests.includes('login'), 'spot covers remain available to public browsing')
})

test('appending a home spot page applies the same cover compatibility rules', async () => {
  savedSpot = { _id: 'spot-page-2', name: '第二页打卡点', coverImage: '/api/media/next-cover' }
  const home = createPage(homeDefinition)
  home.applyHomeData({
    spots: [{ _id: 'spot-page-1', name: '第一页打卡点', cover: 'https://cdn.test/first.jpg' }],
    spotPagination: { nextOffset: 1, hasMore: true }
  })
  await home.onSpotReachEnd()
  assert.equal(home.data.spotTabs[1].cover, `${mediaOrigin}/api/media/next-cover`)
  assert.equal(home.data.spotTabs[0].cover, 'https://cdn.test/first.jpg')
})
