'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { buildVideoProductDetail } = require('../miniprogram/service/videoProductDetail')
const { buildPhotoPackageDetail } = require('../miniprogram/service/packageDetail')
const { orderItemDisplay, displayVideoDuration } = require('../miniprogram/utils/productDisplay')

function loadDefinition(relative, kind = 'Page', wx = {}) {
  const filename = path.resolve(__dirname, '../miniprogram', relative)
  let definition
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename), getApp() { return {} }, wx, console,
    [kind](value) { definition = value }
  }, { filename })
  return { ...definition, ...(definition.methods || {}), data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch) } }
}

test('numeric video durations display seconds while configured units and zero retain their meaning', () => {
  for (const [input, expected] of [[30, '30 秒'], ['30', '30 秒'], [0, '0 秒'], ['45秒', '45秒'], ['1 分钟', '1 分钟'], [null, '']]) {
    assert.equal(displayVideoDuration(input), expected)
  }
  for (const seconds of [0, 30]) {
    const product = { _id: 'video-duration', type: 'video', productKind: 'video_single', videoUrl: 'https://example.test/video.mp4', videoDuration: seconds, durationText: '旧的45秒', finishedVideoCount: 3 }
    const detail = buildVideoProductDetail({ videoSingles: [product] }, { productId: product._id })
    assert.equal(detail.samples[0].durationText, `${seconds} 秒`)
    assert.ok(detail.videoFields.some(item => item.label === '视频时长' && item.value === `${seconds} 秒`))
    assert.ok(detail.videoFields.some(item => item.label === '成片数量' && item.value === '3 条'))
  }
})

test('video detail consumes configured notes, all style tags, makeup, and correctly typed product media', () => {
  const product = { _id: 'video-1', type: 'video', productKind: 'video_single', name: '长标题'.repeat(20),
    price: 699, videoUrl: 'https://example.test/main.mp4', cover: 'https://example.test/cover.jpg',
    tags: ['电影感', '很长的标签'.repeat(12)], serviceTags: ['电影感', '自然'],
    makeupIncluded: true, hasAerial: false, fullEdit: true, finishedVideoCount: 2, deliveryCycle: '3 个工作日',
    shootingNotes: ['请提前沟通；确认拍摄时间', 'https://example.test/' + 'long'.repeat(30)],
    images: ['https://example.test/photo.jpg'],
    videos: ['https://example.test/extra.mp4', { type: 'video', url: 'https://example.test/misplaced.webp' }]
  }
  const detail = buildVideoProductDetail({ videoSingles: [product], spots: [] }, { productId: product._id })
  assert.deepEqual(detail.samples.map(item => item.type), ['video', 'image', 'video', 'image'])
  assert.equal(detail.samples[3].videoUrl, '')
  assert.equal(new Set(detail.samples.map(item => item._id)).size, 4)
  assert.deepEqual(detail.displayTags, product.tags.concat('自然'))
  assert.deepEqual(detail.instructions, ['请提前沟通', '确认拍摄时间', product.shootingNotes[1]])
  assert.ok(detail.videoFields.some(item => item.label === '妆造服务' && item.value === '包含'))
  assert.ok(detail.videoFields.some(item => item.label === '航拍服务' && item.value === '不含'))
  const previews = []
  const page = loadDefinition('pages/videoProductDetail/videoProductDetail.js', 'Page', { previewMedia: value => previews.push(value) })
  page.applyDetail(detail)
  assert.deepEqual(Array.from(page.data.instructions), detail.instructions)
  page.previewVideo({ currentTarget: { dataset: { index: 3 } } })
  assert.equal(previews[0].current, 3)
  assert.deepEqual(Array.from(previews[0].sources, item => item.type), ['video', 'image', 'video', 'image'])
  assert.equal(previews[0].sources[3].url, product.videos[1].url)
})

test('package quantities survive normalization and page/card summaries count units, separately from types', () => {
  const bundle = { _id: 'pkg-1', type: 'photo', productKind: 'package', name: '组合套餐', price: 100, originalPrice: 200,
    description: '套餐的真实说明', serviceTags: ['可选风格'], tags: ['可选风格', '双人'],
    includedItems: [
      { type: 'album', name: '照片', quantity: 2, price: 30, target: { page: 'photoCollection', albumId: 'photo' } },
      { type: 'video', name: '视频', qty: 3, price: 40, target: { page: 'videoProductDetail', productId: 'video' } },
      { type: 'album', name: '另一照片', price: 20, target: { page: 'photoCollection', albumId: 'photo-2' } }
    ] }
  const detail = buildPhotoPackageDetail({ currentPackage: bundle, spots: [], albums: [], videoProducts: [], peripherals: [] }, { packageId: bundle._id })
  assert.deepEqual(detail.includedItems.map(item => item.quantity), [2, 3, 1])
  assert.deepEqual(detail.includedItems.map(item => item.qty), [2, 3, 1])
  assert.equal(detail.includedItems[0].target.albumId, 'photo')
  const page = loadDefinition('pages/photoPackageDetail/photoPackageDetail.js')
  page.data.packageId = bundle._id
  page.applyDetailData({ currentPackage: bundle, spots: [], albums: [], videoProducts: [], peripherals: [] })
  assert.equal(page.data.packageStats.itemCount, 6)
  assert.equal(page.data.packageStats.typeCount, 2)
  assert.equal(page.data.packageDescription, bundle.description)
  assert.deepEqual(Array.from(page.data.serviceTags), ['可选风格', '双人'])
  const card = loadDefinition('components/lxm-package-card/lxm-package-card.js', 'Component')
  card.observers.item.call(card, bundle)
  assert.equal(card.data.itemCount, 6)
  assert.equal(card.data.typeCount, 2)
  assert.deepEqual(Array.from(card.data.tags), ['可选风格', '双人'])
})

test('cleared notes/descriptions stay cleared while legacy records may use their older aliases', () => {
  const video = { _id: 'video-clear', type: 'video', productKind: 'video_single', shootingNotes: '', intro: '旧商品说明', description: '旧商品说明' }
  let detail = buildVideoProductDetail({ videoSingles: [video] }, { productId: video._id })
  assert.deepEqual(detail.instructions, [])
  const videoPage = loadDefinition('pages/videoProductDetail/videoProductDetail.js')
  videoPage.applyDetail(detail)
  assert.equal(videoPage.data.instructions.length, 0, '未配置拍摄说明时保持空，不填充默认文案')
  assert.ok(!videoPage.data.instructions.includes('旧商品说明'))
  const legacyVideo = { ...video }
  delete legacyVideo.shootingNotes
  detail = buildVideoProductDetail({ videoSingles: [legacyVideo] }, { productId: video._id })
  assert.deepEqual(detail.instructions, ['旧商品说明'])

  const bundle = { _id: 'package-clear', type: 'photo', description: '', intro: '旧套餐说明', shootingNotes: '' }
  const page = loadDefinition('pages/photoPackageDetail/photoPackageDetail.js')
  page.data.packageId = bundle._id
  page.applyDetailData({ currentPackage: bundle })
  assert.equal(page.data.packageDescription, '')
  const legacyBundle = { ...bundle }
  delete legacyBundle.description
  page.applyDetailData({ currentPackage: legacyBundle })
  assert.equal(page.data.packageDescription, '旧套餐说明')
  const card = loadDefinition('components/lxm-package-card/lxm-package-card.js', 'Component')
  card.observers.item.call(card, bundle)
  assert.equal(card.data.description, '')
  card.observers.item.call(card, legacyBundle)
  assert.equal(card.data.description, '旧套餐说明')
})

test('package cover labels use configured tags while prices and explicit contextual badges stay available', () => {
  const card = loadDefinition('components/lxm-package-card/lxm-package-card.js', 'Component')
  card.data.badge = '已选推荐'
  const bundle = { _id: 'package-tagged', price: 199, minPrice: 99, isMainPush: true, isHotSale: true,
    tags: [' 测试爆款 ', '旅途限定', '测试爆款'], serviceTags: ['旧服务标签'], displayTags: ['旧展示标签'] }
  card.observers.item.call(card, bundle)
  assert.deepEqual(Array.from(card.data.tags), ['测试爆款', '旅途限定'])
  assert.equal(card.data.badge, '已选推荐', 'A caller-provided contextual badge remains independent from product labels')
  assert.equal(bundle.price, 199)
  for (const count of [4, 6]) {
    const tags = Array.from({ length: count }, (_, index) => `八字标签测试${index}号`)
    card.observers.item.call(card, { ...bundle, tags })
    assert.deepEqual(Array.from(card.data.tags), tags, 'All configured labels remain available on the cover')
  }
  for (const tags of [[], '', '   ']) {
    card.observers.item.call(card, { ...bundle, tags })
    assert.deepEqual(Array.from(card.data.tags), [], 'Cleared admin labels cannot return through stale service or display fields')
  }
  card.observers.item.call(card, { serviceTags: ['旧服务标签'], isMainPush: true })
  assert.deepEqual(Array.from(card.data.tags), ['旧服务标签'])
  card.observers.item.call(card, { isMainPush: true, isHotSale: true, isHot: true })
  assert.deepEqual(Array.from(card.data.tags), [], 'Recommendation switches do not supply package labels')
  card.observers.item.call(card, null)
  assert.deepEqual(Array.from(card.data.tags), [])
  const template = fs.readFileSync(path.resolve(__dirname, '../miniprogram/components/lxm-package-card/lxm-package-card.wxml'), 'utf8')
  const cover = template.split('<view class="card-body">')[0]
  const body = template.split('<view class="card-body">')[1]
  assert.doesNotMatch(cover, /item\.price|item\.minPrice|起/)
  assert.match(template, /class="price-value">{{item\.price}}/)
  assert.match(template, /class="card-badge" wx:if="{{badge}}">{{badge}}/)
  assert.match(cover, /class="card-tags" wx:if="{{tags.length}}"/)
  assert.match(cover, /class="tag"[^>]*wx:for="{{tags}}"/)
  assert.doesNotMatch(body, /class="card-tags"|wx:for="{{tags}}"/)
  assert.doesNotMatch(template, /marketingBadge/)
})

test('order detail displays only order-provided line data without inventing catalog contents or prices', () => {
  const source = [
    { productId: 'photo', productType: 'album', name: '照片商品', qty: 2, unitPrice: 0, spotName: '打卡点' },
    { packageId: 'package', name: '组合套餐', quantity: 3 },
    { name: '历史商品', price: 'unknown', quantity: -1 }
  ]
  const items = orderItemDisplay(source)
  assert.deepEqual(items.map(item => item.quantity), [2, 3, 1])
  assert.deepEqual(items.map(item => item.priceText), ['¥0', '', ''])
  assert.equal(items[1].typeLabel, '旅拍套餐')
  assert.equal(items[1].includedItems, undefined)
  const page = loadDefinition('pages/orderDetail/orderDetail.js')
  page.loadAfterSales = () => {}
  const order = { productItems: source, totalAmount: 777, depositDue: 20, finalDue: 757 }
  page.applyOrder(order)
  assert.equal(page.data.productItemsDisplay.length, 3)
  assert.equal(page.data.order, order)
  assert.equal(page.data.order.totalAmount, 777)
  assert.equal(source[2].price, 'unknown')
})
