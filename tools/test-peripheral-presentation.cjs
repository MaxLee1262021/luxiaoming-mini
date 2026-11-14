const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { normalizePeripheral } = require('../miniprogram/utils/peripheralPresentation')

const root = path.resolve(__dirname, '..')

function createPage(rows = []) {
  const previews = []
  const toasts = []
  let page
  const wx = {
    previewImage(options) { previews.push({ api: 'image', ...options }) },
    previewMedia(options) { previews.push({ api: 'media', ...options }) },
    showToast(options) { toasts.push(options) }
  }
  const dependencies = {
    '../../utils/demoData': { peripherals: [] },
    '../../api/peripheral': { async getPeripherals() { return { success: true, data: rows } } },
    '../../utils/product': require('../miniprogram/utils/product'),
    '../../utils/peripheralPresentation': { normalizePeripheral },
    '../../service/customerService': { openCustomerService() {} }
  }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/peripherals/peripherals.js'), 'utf8'), {
    Page(value) { page = value }, getApp() { return {} }, wx,
    require(name) {
      assert.ok(name in dependencies, `Unexpected page dependency ${name}`)
      return dependencies[name]
    },
    console: { error() {} }
  })
  page.data = JSON.parse(JSON.stringify(page.data))
  page.setData = function(patch) { Object.assign(this.data, patch) }
  return { page, wx, previews, toasts, dependencies }
}

test('周边展示兼容真实字段别名、完整长文及规格，不投影库存', () => {
  const name = '定制纪念相册'.repeat(16)
  const intro = '第一行材质说明\n第二行尺寸与定制方式'
  const view = normalizePeripheral({
    id: 'album', name, cate: '相册', intro, price: '129.50',
    spec: 'A4/A5,硬壳，皮面', tags: '旅拍,纪念，旅拍\n超长标签'.repeat(2),
    images: [{ src: 'https://test/first.jpg' }, { url: 'https://test/second.jpg' }, 'https://test/second.jpg'],
    videos: [{ src: 'https://test/demo.mp4', poster: 'https://test/poster.jpg' }],
    deliveryCycle: '定制后3–5个工作日', retouchIncluded: true, editingIncluded: false,
    stock: 999, stockQty: 999
  })
  assert.equal(view._id, 'album')
  assert.equal(view.name, name)
  assert.equal(view.description, intro)
  assert.equal(view.category, '相册')
  assert.deepEqual(view.specs, ['A4/A5', '硬壳', '皮面'])
  assert.equal(new Set(view.tags).size, view.tags.length)
  assert.equal(view.cover, 'https://test/first.jpg')
  assert.equal(view.priceText, '129.50')
  assert.equal(view.deliveryCycle, '定制后3–5个工作日')
  assert.deepEqual(view.services, ['含精修', '不含精剪'])
  assert.equal(view.gallery.length, 3)
  assert.equal('stock' in view, false)
  assert.equal('stockQty' in view, false)
})

test('缺失、空或非法售价不生成零元；明确配置0与服务false保留', () => {
  for (const price of [undefined, null, '', ' ', NaN, Infinity, -1, '无', false]) {
    const view = normalizePeripheral({ price })
    assert.equal(view.hasPrice, false, `invalid price ${price}`)
    assert.equal(view.priceText, '')
    assert.deepEqual(view.services, [])
  }
  assert.equal(normalizePeripheral({ price: 0 }).priceText, '0')
  assert.equal(normalizePeripheral({ price: 0 }).hasPrice, true)
  assert.deepEqual(normalizePeripheral({ retouchIncluded: false }).services, ['不含精修'])
  assert.deepEqual(normalizePeripheral({ specs: [], spec: '历史规格' }).specs, [])
})

test('多规格商品公开最低价显示起字，单规格与历史商品保留原价文案', () => {
  assert.equal(normalizePeripheral({ specMode: 'multiple', price: 19.9 }).priceText, '19.90起')
  assert.equal(normalizePeripheral({ specMode: 'multiple', price: 0 }).priceText, '0起')
  assert.equal(normalizePeripheral({ specMode: 'multiple' }).priceText, '')
  assert.equal(normalizePeripheral({ specMode: 'single', price: 19.9 }).priceText, '19.90')
  assert.equal(normalizePeripheral({ price: 19.9 }).priceText, '19.90')
})

test('图集去重并识别混入images的视频，视频不作为封面图片', () => {
  const view = normalizePeripheral({
    cover: 'https://test/cover.jpg', image: 'https://test/old.jpg',
    images: ['https://test/cover.jpg', { src: 'https://test/film.mp4?token=x' }, { url: 'https://test/raw', type: 'video' }],
    videos: [{ url: 'https://test/demo.mp4', cover: 'https://test/poster.jpg' }, { url: 'https://test/photo.png?x=1', type: 'video' }]
  })
  assert.equal(view.cover, 'https://test/cover.jpg')
  assert.deepEqual(view.gallery.map(item => item.type), ['image', 'video', 'video', 'video', 'image'])
  assert.equal(normalizePeripheral({ cover: 'https://test/video.mp4' }).cover, '')
})

test('旧链接选择、切换商品、刷新和空结果同步完整信息卡', async () => {
  const fixture = createPage([
    { id: 'frame', name: '相框', price: 88, intro: '实木', images: ['https://test/frame.jpg'] },
    { _id: 'album', name: '相册', specs: ['精装'] },
    { _id: 'hidden', isShow: false }
  ])
  const { page, dependencies } = fixture
  page.data.selectedId = 'album'
  await page.loadPeripherals(true)
  assert.equal(page.data.featuredPeripheral._id, 'album')
  assert.equal(page.data.featuredPeripheral.hasPrice, false)
  page.rotateRing(1)
  assert.equal(page.data.featuredPeripheral._id, 'frame')
  assert.equal(page.data.featuredPeripheral.description, '实木')
  assert.equal(page.data.featuredPeripheral.priceText, '88')
  await page.loadPeripherals()
  assert.equal(page.data.featuredPeripheral._id, 'frame')
  dependencies['../../api/peripheral'].getPeripherals = async () => ({ success: true, data: [] })
  await page.loadPeripherals(true)
  assert.equal(page.data.featuredPeripheral, null)
  assert.equal(page.data.stackLayers.length, 0)
})

test('图片与混合视频预览使用正确微信API，旧SDK不把视频当图片', async () => {
  const { page, wx, previews, toasts } = createPage([{ id: 'mixed', images: ['https://test/a.jpg', { url: 'https://test/b.mp4', poster: 'https://test/p.jpg' }, { src: 'https://test/c.jpg' }] }])
  await page.loadPeripherals(true)
  page.previewPeripheralMedia({ currentTarget: { dataset: { index: 2 } } })
  assert.equal(previews[0].api, 'image')
  assert.equal(previews[0].current, 'https://test/c.jpg')
  assert.deepEqual(Array.from(previews[0].urls), ['https://test/a.jpg', 'https://test/c.jpg'])
  page.previewPeripheralMedia({ currentTarget: { dataset: { index: 1 } } })
  assert.equal(previews[1].api, 'media')
  assert.equal(previews[1].current, 1)
  assert.deepEqual(Array.from(previews[1].sources, item => item.type), ['image', 'video', 'image'])
  assert.equal(previews[1].sources[1].poster, 'https://test/p.jpg')
  previews[1].fail()
  assert.match(toasts.at(-1).title, /无法预览/)
  delete wx.previewMedia
  page.previewPeripheralMedia({ currentTarget: { dataset: { index: 1 } } })
  assert.equal(previews.length, 2)
  assert.match(toasts.at(-1).title, /升级微信/)
  page.previewPeripheralMedia({ currentTarget: { dataset: { index: 99 } } })
  assert.equal(previews.length, 2)
})

test('服务异常时清空商品并提示重试，不生成预览商品', async () => {
  const { page, dependencies } = createPage()
  dependencies['../../api/peripheral'].getPeripherals = async () => ({ success: false })
  await page.loadPeripherals(true)
  assert.equal(page.data.degraded, true)
  assert.equal(page.data.featuredPeripheral, null)
  assert.deepEqual(Array.from(page.data.peripherals), [])
})
