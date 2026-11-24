const fixturePackage = { _id: 'fixture-package', name: '合成测试套餐', includedItems: [
  { type: 'album', name: '合成照片', price: 10, target: { page: 'photoCollection', albumId: 'fixture-album' } },
  { type: 'peripheral', name: '精装相册', price: '99.9', quantity: 2, target: { page: 'peripheral', id: 'gift&1' } },
  { type: 'peripheral', name: '纪念相框', target: { page: 'peripheral', peripheralId: 'frame&1' } }
] }
const detail = require('../miniprogram/service/packageDetail')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const pkg = fixturePackage
const built = detail.buildPhotoPackageDetail({ currentPackage: pkg, peripherals: [{ _id: 'frame&1', price: 29.9 }] }, { packageId: pkg._id })
const items = built.includedItems || []
if (!items.length || !items.every(item => item.target)) throw new Error('Included item target missing')
assert.deepEqual(items.map(item => item.priceText), ['¥10', '¥99.9', '¥29.9'], 'Package peripherals expose their declared or catalog unit price')
assert.equal(items[1].quantity, 2, 'The unit price remains independent from the included quantity')
console.log(`included item targets PASS (${items.length} items)`)

const pagePath = path.resolve(__dirname, '../miniprogram/pages/photoPackageDetail/photoPackageDetail.js')
let definition
const navigations = []
vm.runInNewContext(fs.readFileSync(pagePath, 'utf8'), {
  require: createRequire(pagePath),
  getApp() { return {} },
  Page(value) { definition = value },
  wx: { navigateTo(options) { navigations.push(options.url) } },
  console
}, { filename: pagePath })
const page = {
  ...definition,
  data: { ...definition.data, shopId: 'source-shop', scene: 'source-scene', spotId: 'spot-a' }
}
for (const targetPage of ['peripheral', 'peripheralDetail', 'peripherals']) {
  page.data.includedItems = [{ type: 'peripheral', target: { page: targetPage, id: 'gift&1' } }]
  page.goIncludedItem({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(navigations.at(-1), '/pages/peripherals/peripherals?id=gift%261&shopId=source-shop&scene=source-scene')
}
page.data.includedItems = [{ type: 'peripheral', target: { page: 'peripheral' } }]
page.goIncludedItem({ currentTarget: { dataset: { index: 0 } } })
assert.equal(navigations.at(-1), '/pages/peripherals/peripherals?shopId=source-shop&scene=source-scene')
page.data.includedItems = [{ type: 'album', target: { page: 'photoCollection', albumId: 'album-a' } }]
page.goIncludedItem({ currentTarget: { dataset: { index: 0 } } })
assert.equal(navigations.at(-1), '/pages/photoCollection/photoCollection?albumId=album-a&spotId=spot-a&shopId=source-shop&scene=source-scene')
const markup = fs.readFileSync(pagePath.replace(/\.js$/, '.wxml'), 'utf8')
assert.match(markup, /<text class="item-card__price">\{\{item\.priceText\}\}<\/text>/, 'Every included item displays its unit price, including peripherals')
assert.match(markup, /selectedPackage\.price/, 'Photography package prices must remain visible')
console.log('included peripheral links preserve source and display their prices PASS')
