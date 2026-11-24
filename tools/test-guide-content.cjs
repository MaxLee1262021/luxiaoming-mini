'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')
const guideContent = require('../miniprogram/utils/guideContent')
const { API_BASE } = require('../miniprogram/config/env')
const { publicGuides, normalizeGuide, matchesSpot, guideContentBlocks } = guideContent
const origin = API_BASE.match(/^https?:\/\/[^/]+/)[0]

function readPage(file, stubs = {}, wxOverrides = {}) {
  const filename = path.join(root, file)
  const requireFromFile = createRequire(filename)
  let config
  const navigation = []
  const previews = []
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require(name) { return Object.hasOwn(stubs, name) ? stubs[name] : requireFromFile(name) },
    getApp: () => ({ captureSource: () => ({ shopId: 'shop-source', scene: 'scene-source' }) }),
    Page(value) { config = value },
    wx: { navigateTo: event => navigation.push(event.url), previewImage: event => previews.push(event), pageScrollTo() {}, ...wxOverrides },
    console
  }, { filename })
  const page = { ...config, data: JSON.parse(JSON.stringify(config.data)) }
  page.setData = values => Object.assign(page.data, values)
  return { page, navigation, previews }
}

test('publication and front visibility remain independent; pinned guides sort first without mutating input', () => {
  const input = [
    { id: 'new', status: '已发布', isShow: true, updatedAt: '2026-11-04T10:00:00Z' },
    { id: 'hidden', status: '已发布', isShow: false, isTop: true },
    { id: 'draft', status: '草稿', isShow: true, isTop: true },
    { id: 'deleted', deleted: true },
    { id: 'old-pinned', status: '启用', isTop: true, updatedAt: '2026-11-03T10:00:00Z' },
    { id: 'legacy', createTime: '2020-01-01', content: ['旧正文'], mediaUrls: ['https://cdn.test/old.jpg'] },
    { id: 'draft-legacy', published: false, visible: true },
    { id: 'offline', status: '下架' },
    { id: 'former-pin', isTop: false, pinned: true }
  ]
  const before = JSON.stringify(input)
  const output = publicGuides(input)
  assert.deepEqual(output.map(item => item._id), ['old-pinned', 'new', 'legacy', 'former-pin'])
  assert.equal(output.at(-1).isTop, false)
  assert.equal(output.find(item => item._id === 'legacy').mediaItems[0].type, 'image')
  assert.deepEqual(output.find(item => item._id === 'legacy').content, ['旧正文'])
  assert.equal(output[0].score, undefined, 'no generated score')
  assert.equal(JSON.stringify(input), before)
})

test('multi-spot normalization preserves product origin and independent homepage cover', () => {
  const item = normalizeGuide({ id: 'guide', cover: '/api/media/cover', image: 'https://cdn.test/old.jpg',
    spotId: 'spot-a', spotIds: ['spot-a', 'spot-b', 'spot-a'],
    spots: [{ id: 'spot-a', name: '洱海', cover: '/api/media/a' }, { id: 'spot-b', name: '古城' }],
    targetProductSpotId: 'spot-b', bookingProduct: { id: 'product-b', spotId: 'spot-b', type: 'album' } })
  assert.deepEqual(item.spotIds, ['spot-a', 'spot-b'])
  assert.equal(item.image, origin + '/api/media/cover')
  assert.equal(item.spots[0].cover, origin + '/api/media/a')
  assert.equal(item.spots[1].name, '古城')
  assert.equal(item.targetProductSpotId, 'spot-b')
  assert.equal(matchesSpot(item, 'spot-b'), true)
  assert.equal(matchesSpot(item, 'spot-c'), false)
})

test('historical false-like flags hide guides without treating missing flags as false', () => {
  for (const key of ['isShow', 'visible', 'enabled', 'published']) {
    for (const value of [false, 0, '0', 'false']) {
      assert.equal(guideContent.isPublicGuide({ status: '已发布', [key]: value }), false, `${key}=${JSON.stringify(value)}`)
    }
    for (const value of [true, 1, '1', 'true', undefined]) {
      assert.equal(guideContent.isPublicGuide({ status: '已发布', [key]: value }), true, `${key}=${JSON.stringify(value)}`)
    }
  }
  assert.equal(guideContent.isPublicGuide({}), true, 'legacy records may omit all visibility flags')
})

test('mixed article preserves headings, inline formatting, native image/video order and safe URLs', () => {
  const html = '<h2>机位 &amp; 路线</h2><p>先拍<strong>日落</strong><img src="/api/media/image1" onerror="alert(1)">再看视频<video controls poster="/api/media/poster"><source src="/api/media/video1"></video>继续走</p><blockquote>风很温柔</blockquote><video src="https://cdn.test/video2.mp4"></video><p>最后一张<img src="https://cdn.test/image2.jpg"></p>'
  const blocks = guideContentBlocks(html)
  assert.deepEqual(blocks.map(block => block.type), ['richText', 'image', 'richText', 'video', 'richText', 'video', 'richText', 'image'])
  assert.match(JSON.stringify(blocks[0].nodes), /机位 & 路线/)
  assert.match(JSON.stringify(blocks[0].nodes), /strong/)
  assert.equal(blocks[1].url, origin + '/api/media/image1')
  assert.equal(blocks[3].url, origin + '/api/media/video1')
  assert.equal(blocks[3].poster, origin + '/api/media/poster')
  assert.match(JSON.stringify(blocks[4].nodes), /blockquote/)
  assert.doesNotMatch(JSON.stringify(blocks), /onerror|alert/)
  const unsafe = guideContentBlocks('<script>alert(1)</script><img src="javascript:alert(2)"><video src="blob:local"></video><p onclick="bad()" style="background:url(bad)">安全&#x6587;字</p>')
  assert.equal(unsafe.length, 1)
  assert.match(JSON.stringify(unsafe), /安全文字/)
  assert.doesNotMatch(JSON.stringify(unsafe), /javascript|blob:|onclick|alert|url\(bad\)/)
})

test('uploaded attachment cards keep their position among rich text, images, and video; other links remain text', () => {
  const fileId = 'file_' + 'a'.repeat(40)
  const markup = '<p>出发前<a href="/api/media/' + fileId + '?download=1" data-file-id="' + fileId + '" data-file-name="路线 &amp; 攻略.pdf" data-file-size="2048" data-file-type="application/pdf"><strong>路线攻略</strong></a>看地图<img src="/api/media/image"><video src="/api/media/video"></video>结束</p>'
  const blocks = guideContentBlocks(markup)
  assert.deepEqual(blocks.map(block => block.type), ['richText', 'attachment', 'richText', 'image', 'video', 'richText'])
  assert.equal(blocks[1].fileId, fileId)
  assert.equal(blocks[1].url, origin + '/api/media/' + fileId)
  assert.equal(blocks[1].name, '路线 & 攻略.pdf')
  assert.equal(blocks[1].size, 2048)
  assert.equal(blocks[1].sizeLabel, '2 KB')
  assert.equal(blocks[1].mimeType, 'application/pdf')
  for (const href of [
    'https://outside.test/api/media/' + fileId, '/api/media/' + fileId + '?redirect=evil',
    '/api/media/not-a-file', 'javascript:alert(1)', origin + '.evil.test/api/media/' + fileId
  ]) {
    const rejected = guideContentBlocks('<p>前<a href="' + href + '" data-file-name="伪装.pdf">链接文字</a>后</p>')
    assert.deepEqual(rejected.map(block => block.type), ['richText'])
    assert.match(JSON.stringify(rejected), /链接文字/)
  }
  const mismatch = guideContentBlocks('<a href="/api/media/' + fileId + '" data-file-id="file_' + 'b'.repeat(40) + '">不匹配</a>')
  assert.deepEqual(mismatch.map(block => block.type), ['richText'])
  const fallbackName = guideContentBlocks('<a href="/api/media/' + fileId + '"><strong>中文名称.pdf</strong></a>')
  assert.equal(fallbackName[0].name, '中文名称.pdf')
})

function attachmentService(wx) {
  const filename = path.join(root, 'miniprogram/service/guideAttachments.js')
  const module = { exports: {} }
  const requireFromFile = createRequire(filename)
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, require: requireFromFile, wx }, { filename })
  return module.exports
}

test('document attachments download once, report progress, and preview with fileType despite opaque media URLs', async () => {
  const downloads = []
  const opens = []
  const progress = []
  const fileId = 'file_' + 'c'.repeat(40)
  const service = attachmentService({
    downloadFile(options) {
      downloads.push(options.url)
      options.success({ statusCode: 200, tempFilePath: '/tmp/download' })
      return { onProgressUpdate(callback) { callback({ progress: 55 }) } }
    },
    openDocument(options) { opens.push(options); options.success({}) }
  })
  await service.openAttachment({ fileId, url: '/api/media/' + fileId, name: '中文拍摄指南.pdf', mimeType: 'application/pdf' }, (phase, percent) => progress.push([phase, percent]))
  assert.deepEqual(downloads, [origin + '/api/media/' + fileId + '?download=1'])
  assert.equal(opens.length, 1)
  assert.equal(opens[0].filePath, '/tmp/download')
  assert.equal(opens[0].fileType, 'pdf')
  assert.equal(opens[0].showMenu, true)
  assert.deepEqual(progress, [['downloading', 0], ['downloading', 55], ['opening', 100]])
  for (const extension of ['docx', 'xlsx', 'pptx']) assert.equal(service.documentType({ name: '中文.' + extension }), extension)
  assert.equal(service.documentType({ name: '无扩展名', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'docx')
})

test('TXT/CSV downloads show a clear browser-save prompt and only copy links after confirmation', async () => {
  const fileId = 'file_' + 'd'.repeat(40)
  const modals = []
  const clipboard = []
  let confirm = true
  const service = attachmentService({
    downloadFile(options) { options.success({ statusCode: 200, tempFilePath: '/tmp/text' }) },
    openDocument() { assert.fail('text should not be passed to openDocument') },
    showModal(options) { modals.push(options); options.success({ confirm }) },
    setClipboardData(options) { clipboard.push(options.data); options.success({}) }
  })
  await service.openAttachment({ fileId, url: '/api/media/' + fileId, name: '机位.txt', mimeType: 'text/plain' })
  assert.equal(modals[0].title, '附件已下载')
  assert.match(modals[0].content, /浏览器/)
  assert.deepEqual(clipboard, [origin + '/api/media/' + fileId + '?download=1'])
  confirm = false
  await service.openAttachment({ fileId, url: '/api/media/' + fileId, name: '路线.csv', mimeType: 'text/csv' })
  assert.equal(clipboard.length, 1)
})

test('download HTTP/network/empty-path failures and document-open failures reject visibly and remain retryable', async () => {
  const fileId = 'file_' + 'e'.repeat(40)
  const file = { fileId, url: '/api/media/' + fileId, name: '指南.pdf' }
  for (const response of [{ statusCode: 403, tempFilePath: '/tmp/error' }, { statusCode: 200 }, { tempFilePath: '/tmp/unknown-status' }]) {
    const service = attachmentService({ downloadFile(options) { options.success(response) } })
    await assert.rejects(service.openAttachment(file), /附件下载失败/)
  }
  const network = attachmentService({ downloadFile(options) { options.fail({ errMsg: 'network' }) } })
  await assert.rejects(network.openAttachment(file), /检查网络/)
  const service = attachmentService({
    downloadFile(options) { options.success({ statusCode: 200, tempFilePath: '/tmp/file' }) },
    openDocument(options) { options.fail({ errMsg: 'unsupported' }) }
  })
  await assert.rejects(service.openAttachment(file), error => {
    assert.match(error.message, /打开失败/)
    assert.equal(error.downloadUrl, origin + '/api/media/' + fileId + '?download=1')
    return true
  })
  await assert.rejects(service.openAttachment({ ...file, url: 'https://outside.test/anything' }), /附件链接无效/)
})

test('attachment taps block duplicate actions and reset busy state on failures; document errors offer copy link', async () => {
  const fileId = 'file_' + 'f'.repeat(40)
  const attachment = guideContentBlocks('<a href="/api/media/' + fileId + '" data-file-name="指南.pdf">指南.pdf</a>')[0]
  const toasts = []
  const copied = []
  const modals = []
  let rejectOpen
  let requests = 0
  const service = {
    openAttachment() { requests++; return new Promise((_, reject) => { rejectOpen = reject }) },
    async copyDownloadLink(url) { copied.push(url) }
  }
  const { page } = readPage('miniprogram/pages/guideDetail/guideDetail.js', { '../../service/guideAttachments': service }, {
    showToast(options) { toasts.push(options.title) },
    showModal(options) { modals.push(options); options.success({ confirm: true }) }
  })
  page.setData({ contentBlocks: [attachment] })
  const event = { currentTarget: { dataset: { key: attachment.key } } }
  const pending = page.openGuideAttachment(event)
  await page.openGuideAttachment(event)
  assert.equal(requests, 1)
  assert.equal(page.data.attachmentBusyKey, attachment.key)
  assert.deepEqual(toasts, ['附件处理中，请稍候'])
  rejectOpen(new Error('附件下载失败，请重试'))
  await pending
  assert.equal(page.data.attachmentBusyKey, '')
  assert.equal(page._attachmentBusy, false)
  assert.equal(toasts.at(-1), '附件下载失败，请重试')
  const retry = page.openGuideAttachment(event)
  assert.equal(requests, 2)
  const error = new Error('附件打开失败')
  error.downloadUrl = origin + '/api/media/' + fileId + '?download=1'
  rejectOpen(error)
  await retry
  assert.equal(modals[0].title, '附件打开失败')
  assert.deepEqual(copied, [error.downloadUrl])
  await page.openGuideAttachment({ currentTarget: { dataset: { key: 'forged-key' } } })
  assert.equal(requests, 2)
  assert.equal(toasts.at(-1), '附件不可用，请刷新后重试')
})

test('guide RPC client filters legacy unfiltered results and respects secondary point bindings', async () => {
  const filename = path.join(root, 'miniprogram/api/guide.js')
  const requests = []
  let detail = { id: 'hidden', status: '已发布', isShow: false }
  const module = { exports: {} }
  const fixture = [
    { id: 'route', spotIds: ['a', 'b'], status: '已发布', isShow: true, readCount: '100', score: '4.9' },
    { id: 'pin', spotId: 'b', status: '已发布', isTop: true, readCount: 2, score: 3.5 },
    { id: 'hidden', spotId: 'b', isShow: false }, { id: 'draft', spotId: 'b', status: '草稿' }
  ]
  const requireFromFile = createRequire(filename)
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, require(name) {
    if (name === './client') return { callCloud: async (rpc, params) => {
      requests.push({ rpc, params })
      return { success: true, data: rpc === 'getGuide' ? detail : { list: fixture } }
    } }
    if (name === '../config/env') return { isExplicitDemoMode: () => false }
    return requireFromFile(name)
  } }, { filename })
  const api = module.exports
  const rows = await api.getGuides({ spotId: 'b', shopId: 'shop' })
  assert.deepEqual(rows.map(item => item._id), ['pin', 'route'])
  assert.equal(requests[0].params.shopId, 'shop')
  assert.equal(requests[0].params.spotId, undefined, 'older servers should not discard secondary associations')
  for (const sortBy of ['readCount', 'score']) {
    const sorted = await api.getGuides({ spotId: 'b', sortBy })
    assert.deepEqual(sorted.map(item => item._id), ['route', 'pin'], 'Client normalization must preserve the selected metric ordering')
    assert.equal(requests.at(-1).params.sortBy, sortBy)
    assert.equal(requests.at(-1).params.spotId, undefined)
  }
  assert.equal(await api.getGuideDetail({ id: 'hidden' }), null)
  detail = { id: 'draft', status: '草稿', isShow: true }
  assert.equal(await api.getGuideDetail({ id: 'draft' }), null)
})

test('detail renders every associated point and jumps to the chosen product point with source attribution', async () => {
  const guide = normalizeGuide({ id: 'route', title: '双点路线', status: '已发布', isShow: true,
    cover: '/api/media/cover', contentHtml: '<p>日落<img src="/api/media/a"></p><video src="/api/media/v"></video><img src="/api/media/b">',
    spotId: 'a', spotIds: ['a', 'b'], spots: [{ id: 'a', name: '洱海' }, { id: 'b', name: '古城' }],
    targetProductSpotId: 'b', bookingProduct: { id: 'product', type: 'album', spotId: 'b', seriesId: 'series' } })
  const { page, navigation, previews } = readPage('miniprogram/pages/guideDetail/guideDetail.js', {
    '../../api/guide': { getGuideDetail: async () => guide }
  })
  page.setData({ id: 'route', shopId: 'source-shop', scene: 'source-scene' })
  await page.loadDetail()
  assert.equal(page.data.hasRichContent, true)
  assert.equal(page.data.relatedSpots.length, 2)
  assert.deepEqual(page.data.contentBlocks.filter(item => item.type === 'video').map(item => item.url), [origin + '/api/media/v'])
  page.goSpot({ currentTarget: { dataset: { id: 'b' } } })
  assert.equal(navigation.at(-1), '/pages/spotSheet/spotSheet?id=b&shopId=source-shop&scene=source-scene')
  for (const [type, expectedPath, key] of [
    ['album', 'photoCollection', 'albumId'], ['package', 'photoPackageDetail', 'packageId'], ['video', 'videoProductDetail', 'productId']
  ]) {
    page.setData({ bookingProduct: { id: 'product', type, seriesId: 'series', spotId: 'b' } })
    page.goBookingProduct()
    const url = new URL(navigation.at(-1), 'https://mini.test')
    assert.equal(url.pathname, '/pages/' + expectedPath + '/' + expectedPath)
    assert.equal(url.searchParams.get('spotId'), 'b')
    assert.equal(url.searchParams.get(key), 'product')
    assert.equal(url.searchParams.get('shopId'), 'source-shop')
    assert.equal(url.searchParams.get('scene'), 'source-scene')
  }
  page.previewImage({ currentTarget: { dataset: { url: origin + '/api/media/b' } } })
  assert.deepEqual(Array.from(previews[0].urls), [origin + '/api/media/a', origin + '/api/media/b'])
  assert.equal(previews[0].current, origin + '/api/media/b')
  guide.bookingProduct = null
  await page.loadDetail()
  assert.equal(page.data.bookingProduct, null)
  guide.bookingProduct = { id: 'hidden-product', type: 'album', isShow: false }
  await page.loadDetail()
  assert.equal(page.data.bookingProduct, null)
  guide.bookingProduct = { id: 'wrong-product', type: 'album' }
  guide.targetProductSpotId = 'removed-spot'
  await page.loadDetail()
  assert.equal(page.data.bookingProduct, null)
})

test('homepage and search suggestions share visibility and pin ordering', () => {
  const { buildHomeViewData } = require('../miniprogram/service/homeData')
  const { buildSearchSuggestions } = require('../miniprogram/utils/searchSuggestions')
  const guides = [
    { id: 'normal', title: '普通灵感', status: '已发布' },
    { id: 'draft', title: '草稿灵感', status: '草稿' },
    { id: 'hidden', title: '隐藏灵感', isShow: false },
    { id: 'pin', title: '置顶灵感', isTop: true, status: '已发布' }
  ]
  assert.deepEqual(buildHomeViewData({ guides }).guides.map(item => item._id), ['pin', 'normal'])
  assert.deepEqual(buildSearchSuggestions('灵感', { spots: [], albums: [], packages: [], guides })
    .map(item => item.nav._id), ['pin', 'normal'])
})

test('detail retains legacy photo carousel and plaintext fallback', async () => {
  const guide = normalizeGuide({ id: 'old', title: '旧灵感', content: '第一段\n第二段', mediaUrls: ['https://cdn.test/old.jpg'], spotId: 'a', spotName: '洱海' })
  const { page } = readPage('miniprogram/pages/guideDetail/guideDetail.js', { '../../api/guide': { getGuideDetail: async () => guide } })
  await page.loadDetail()
  assert.equal(page.data.hasRichContent, false)
  assert.deepEqual(page.data.guide.content, ['第一段', '第二段'])
  assert.equal(page.data.mediaItems[0].url, 'https://cdn.test/old.jpg')
  assert.equal(page.data.relatedSpots[0].name, '洱海')
})
