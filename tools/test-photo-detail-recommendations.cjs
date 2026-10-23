const assert = require('node:assert/strict')
const { buildRelatedPhotoCollections } = require('../miniprogram/service/relatedPhotoCollections')

const current = { _id: 'album-current', seriesId: 'series-a', spotId: 'spot-a', name: '当前照片', price: 699, photoCount: 6 }
const sameSeries = { _id: 'album-series', seriesId: 'series-a', spotId: 'spot-b', name: '同系列', price: 99 }
const sameSpot = { albumId: 'album-spot', seriesId: 'series-b', spotIds: ['spot-a'], title: '同打卡点', price: 109, coverUrl: '/other.jpg' }
const other = { id: 'album-other', seriesId: 'series-b', name: '其他照片', price: 129 }
const catalog = {
  allSeries: [{ _id: 'series-a', name: '春日' }, { _id: 'series-b', name: '城市' }],
  spots: [{ _id: 'spot-a', name: '城市花园' }],
  albums: [other, sameSpot, sameSeries, current, sameSeries,
    { _id: 'hidden', seriesId: 'series-b', isShow: false },
    { _id: 'offline', seriesId: 'series-b', status: '下架' },
    { _id: 'pending', seriesId: 'series-b', auditStatus: '待审核' },
    { _id: 'hidden-series', seriesId: 'series-hidden' },
    { name: '缺少ID' }]
}

let pageDefinition
const navigations = []
const toasts = []
const calls = []
let recommendationResponse = { success: true, data: catalog }
let collectionResponse = { success: true, data: { series: { _id: 'series-a' }, collections: [current] } }
global.wx = {
  getStorageSync() { return '' },
  getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } } },
  navigateTo(options) { navigations.push(options.url) },
  showToast(options) { toasts.push(options.title) },
  request(options) {
    const name = String(options.url).split('/rpc/').pop()
    calls.push(name)
    options.success({ statusCode: 200, data: name === 'getPhotoCollection' ? collectionResponse : recommendationResponse })
  }
}
global.getApp = () => ({ captureSource: () => ({}) })
global.Page = definition => { pageDefinition = definition }
require('../miniprogram/pages/photoCollection/photoCollection')
const createPage = () => Object.assign({}, pageDefinition, {
  data: JSON.parse(JSON.stringify(pageDefinition.data)),
  setData(patch) { Object.assign(this.data, patch) }
})

async function run() {
  const page = createPage()
  page.setData({ pendingAlbumId: current._id, shopId: 'shop-source' })
  await page.loadCollection('series-a', current._id)
  assert.deepEqual(calls, ['getPhotoCollection', 'getBookingData'])
  assert.equal(page.data.currentCollection._id, current._id)
  assert.equal(page.data.currentCollection.price, 699)
  assert.equal(page.data.currentCollection.photoCount, 6)
  assert.deepEqual(page.data.relatedCollections.map(item => item._id), ['album-series', 'album-spot', 'album-other'])
  const rec = page.data.relatedCollections[1]
  assert.equal(rec.cover, '/other.jpg')
  assert.equal(rec.seriesName, '城市')
  assert.equal(rec.spotName, '城市花园')
  page.goCollectionDetail({ detail: { id: rec._id } })
  const params = new URL(navigations.at(-1), 'https://mini.test').searchParams
  assert.equal(params.get('seriesId'), 'series-b')
  assert.equal(params.get('albumId'), 'album-spot')
  assert.equal(params.get('spotId'), 'spot-a')
  assert.equal(params.get('shopId'), 'shop-source')
  // 原生 tap 的 detail 是坐标，商品参数必须从卡片 dataset 读取。
  toasts.length = 0
  const nativeNavigationCount = navigations.length
  page.goCollectionDetail({
    type: 'tap', detail: { x: 120, y: 540 },
    currentTarget: { dataset: { albumId: rec.albumId, seriesId: rec.seriesId, spotId: rec.spotId } }
  })
  assert.deepEqual(toasts, [], 'Native tap coordinates must not hide the card album ID')
  assert.equal(navigations.length, nativeNavigationCount + 1)
  assert.equal(new URL(navigations.at(-1), 'https://mini.test').searchParams.get('albumId'), rec.albumId)
  assert.equal(new URL(navigations.at(-1), 'https://mini.test').searchParams.get('seriesId'), rec.seriesId)
  page.goBookingFromCollectionBottom()
  assert.equal(new URL(navigations.at(-1), 'https://mini.test').searchParams.get('albumId'), current._id)

  // 目录中的最新下架状态优先于详情中的旧副本。
  assert.deepEqual(buildRelatedPhotoCollections(current, [sameSeries], {
    albums: [{ ...sameSeries, status: '下架' }]
  }), [])
  assert.equal(buildRelatedPhotoCollections(current, [current]).length, 0)

  // 推荐失败不能清空已有同系列推荐，也不能影响详情及预约。
  recommendationResponse = { success: false, error: '推荐暂不可用' }
  collectionResponse.data.collections = [current, sameSeries]
  await page.loadCollection('series-a', current._id)
  assert.equal(page.data.loading, false)
  assert.equal(page.data.isAlbumDetail, true)
  assert.deepEqual(page.data.relatedCollections.map(item => item._id), ['album-series'])

  // 系列列表继续使用原有列表数据，不额外加载单品推荐。
  calls.length = 0
  const seriesPage = createPage()
  await seriesPage.loadCollection('series-a')
  assert.equal(seriesPage.data.isAlbumDetail, false)
  assert.deepEqual(calls, ['getPhotoCollection'])
  console.log('PASS photo detail recommendations, visibility, cross-series navigation, booking, and recommendation failure')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
