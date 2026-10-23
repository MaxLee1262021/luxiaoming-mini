'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')

let responseData = {}
global.wx = {
  getStorageSync() { return '' },
  setStorageSync() {},
  getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } } },
  request(options) { options.success({ statusCode: 200, data: { success: true, data: responseData } }) }
}
global.getApp = () => ({ captureSource: () => ({}) })

const { isVideo, isVideoSingle, normalizePackage } = require('../miniprogram/utils/product')
const { buildHomeViewData } = require('../miniprogram/service/homeData')
const { buildVideoProductDetail } = require('../miniprogram/service/videoProductDetail')
const { buildSearchSuggestions } = require('../miniprogram/utils/searchSuggestions')
const { filterPackages } = require('../miniprogram/service/bookingPicker')
const searchApi = require('../miniprogram/api/search')
const legacy = { _id: 'pkg3', name: '街区短视频', type: 'video', price: 1199, status: '上架', isShow: true, spotId: 'spot-1' }
const single = { _id: 'video-1', name: '江景短片', type: 'video', productKind: 'video_single', price: 299, status: '上架', spotId: 'spot-1' }
const photo = { _id: 'photo-1', name: '江景套餐', type: 'photo', price: 699, status: '上架', spotId: 'spot-1' }
const hidden = [
  { ...single, _id: 'video-offline', status: '下架' },
  { ...single, _id: 'video-draft', status: '草稿' },
  { ...single, _id: 'video-deleted', deleted: true },
  { ...single, _id: 'video-rejected', auditStatus: 'rejected' },
  { ...single, _id: 'video-invisible', isShow: false }
]
const ids = list => list.map(item => item._id)

test('视频媒介与后台已配置的独立单品分开识别', () => {
  assert.equal(isVideo(legacy), true, '保留旧视频的媒介识别，避免误入照片套餐')
  assert.equal(isVideoSingle(legacy), false)
  assert.equal(isVideoSingle(normalizePackage(legacy)), false, '归一化不能把旧套餐升级成单品')
  assert.equal(isVideoSingle(single), true)
  assert.equal(isVideoSingle({ type: 'video', isVideoSingle: true }), true)
  assert.equal(isVideoSingle({ type: 'video', isVideoSingle: 'false' }), false)
  assert.equal(isVideoSingle({ type: 'photo', isVideoSingle: true }), false)
  assert.equal(isVideoSingle(null), false)
})

test('真实空单品列表隐藏视频区，不能补入演示单品或旧套餐', () => {
  const result = buildHomeViewData(
    { packages: [legacy, photo], videoSingles: [] },
    {},
    { videoProducts: [single] }
  )
  assert.deepEqual(result.videoPackages, [])
  assert.deepEqual(ids(result.hotPackages), ['photo-1'])
  assert.deepEqual(buildHomeViewData({ videoProducts: [legacy] }).videoPackages, [])
})

test('首页只展示上架独立单品，兼容两个字段与packages并去重', () => {
  const data = {
    packages: [legacy, photo, single, ...hidden],
    videoSingles: [single, ...hidden],
    videoProducts: [single]
  }
  assert.deepEqual(ids(buildHomeViewData(data).videoPackages), ['video-1'])
  assert.deepEqual(ids(buildHomeViewData({ packages: [single] }).videoPackages), ['video-1'])
  assert.deepEqual(ids(buildHomeViewData({ videoProducts: [single] }).videoPackages), ['video-1'])
})

test('搜索与共用搜索建议不再暴露旧套餐及下架单品', async () => {
  responseData = { packages: [legacy, photo, single, ...hidden], videoProducts: [legacy, single, ...hidden] }
  const legacyResult = await searchApi.search({ keyword: '街区' })
  assert.deepEqual(legacyResult.data.videos, [])
  assert.deepEqual(legacyResult.data.packages, [])
  const result = await searchApi.search({ keyword: '江景' })
  assert.deepEqual(ids(result.data.videos), ['video-1'])
  const suggestions = buildSearchSuggestions('', {
    spots: [], albums: [], guides: [], packages: [legacy, photo], videos: [legacy, single, ...hidden]
  })
  assert.deepEqual(suggestions.filter(item => item.type === 'video').map(item => item.nav._id), ['video-1'])
})

test('旧详情链接和下架链接被拒绝，正常详情没有虚构规格', () => {
  const data = { allPackages: [legacy, single, ...hidden], spots: [] }
  assert.equal(buildVideoProductDetail(data, { productId: 'pkg3' }), null)
  assert.equal(buildVideoProductDetail(data, { productId: 'video-offline' }), null)
  const detail = buildVideoProductDetail(data, { productId: 'video-1' })
  assert.equal(detail.product._id, 'video-1')
  assert.equal(detail.samples[0].url, '')
  assert.equal(detail.samples[0].durationText, '')
  assert.deepEqual(detail.videoFields, [])
  assert.deepEqual(detail.recommendations, [])
  assert.equal(buildVideoProductDetail({ videoSingles: [single] }, { productId: 'video-1' }).product._id, 'video-1')
})

test('预约选择器只接收上架单品，照片套餐不受影响', () => {
  const packages = [legacy, photo, single, ...hidden]
  assert.deepEqual(ids(filterPackages({ packages, type: 'video' })), ['video-1'])
  assert.deepEqual(ids(filterPackages({ packages, type: 'photo' })), ['photo-1'])
})

function loadPage(relativePath) {
  let definition
  global.Page = value => { definition = value }
  const filename = path.resolve(__dirname, '../miniprogram', relativePath)
  delete require.cache[filename]
  require(filename)
  assert.ok(definition)
  return Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch, done) { Object.assign(this.data, patch); if (done) done() }
  })
}

test('打卡点视频货架与预约添加项目遵守同一单品规则', () => {
  const packages = [legacy, photo, single, ...hidden]
  const spotPage = loadPage('pages/spotSheet/spotSheet.js')
  spotPage.applyCatalog({ success: true, data: { allPackages: packages } })
  assert.deepEqual(ids(spotPage.resolveSpotProducts({ _id: 'spot-1' }).videos), ['video-1'])
  const bookingPage = loadPage('pages/bookingInfo/bookingInfo.js')
  const rows = bookingPage.buildSheetProducts({ allPackages: packages, spotOptions: [{ _id: 'spot-1' }] })
  assert.deepEqual(rows.filter(row => row.cat === 'video').map(row => row.src._id), ['video-1'])
  assert.deepEqual(rows.filter(row => row.cat === 'package').map(row => row.src._id), ['photo-1'])
})

test('首页实际加载空单品响应后清空视频区，后续上架响应可恢复', async () => {
  const homePage = loadPage('pages/index/index.js')
  responseData = { packages: [legacy, photo], videoSingles: [] }
  await homePage.loadHomeData()
  assert.deepEqual(homePage.data.videoPackages, [])
  assert.deepEqual(homePage.data.filteredVideos, [])
  responseData = { packages: [legacy, photo], videoSingles: [single] }
  await homePage.loadHomeData()
  assert.deepEqual(ids(homePage.data.videoPackages), ['video-1'])
  assert.deepEqual(ids(homePage.data.filteredVideos), ['video-1'])
})
