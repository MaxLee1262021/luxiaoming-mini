const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const query = require('../miniprogram/utils/query')
function load(relativePath, dependencies, globals = {}) {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), {
    module, exports: module.exports,
    require(name) {
      assert.ok(Object.prototype.hasOwnProperty.call(dependencies, name), `Unexpected dependency: ${name}`)
      return dependencies[name]
    },
    console, ...globals
  }, { filename: relativePath })
  return module.exports
}
function instantiate(definition, data = {}) {
  return {
    ...(definition.methods || definition),
    data: { ...JSON.parse(JSON.stringify(definition.data)), ...data },
    setData(patch) { Object.assign(this.data, patch) },
    events: [],
    triggerEvent(name, detail) { this.events.push({ name, detail }) }
  }
}

async function run() {
  const saved = new Map()
  const api = {
    async addFavorite({ type, itemId, item }) {
      saved.set(`${type}:${itemId}`, { ...item, type, itemId })
      return { success: true, data: { favorite: true } }
    },
    async removeFavorite({ type, itemId }) {
      saved.delete(`${type}:${itemId}`)
      return { success: true, data: { favorite: false } }
    },
    async checkFavorite({ type, itemId }) {
      return { success: true, data: { favorite: saved.has(`${type}:${itemId}`) } }
    },
    async getMyFavorites({ page, pageSize }) {
      const rows = [...saved.values()].slice((page - 1) * pageSize, page * pageSize)
      return { success: true, data: { items: rows, hasMore: saved.size > page * pageSize } }
    }
  }
  const service = load('miniprogram/service/favorites.js', { '../api/favorite': api, '../utils/query': query })
  const types = ['photo_single', 'photo_package', 'video_single', 'peripheral', 'guide', 'spot']
  for (const type of types) {
    await service.setFavorite(type, 'id&1', true, { name: `收藏 ${type}`, cover: '/images/placeholder.png', price: 0 })
    assert.equal(await service.checkFavorite(type, 'id&1'), true)
    // Retrying an add must not toggle a saved record off.
    await service.setFavorite(type, 'id&1', true, { name: `收藏 ${type}` })
  }
  const result = await service.getMyFavorites()
  assert.equal(result.items.length, types.length)
  for (const row of result.items) {
    const url = service.getFavoriteUrl(row, { shopId: 'shop&1', scene: 'merchant' })
    assert.ok(url.startsWith('/pages/'))
    assert.ok(url.includes('id%261'))
    assert.ok(url.includes('shopId=shop%261'))
  }
  assert.ok(service.getFavoriteUrl({ type: 'photo_single', itemId: 'album', seriesId: 'series', url: 'https://example.invalid' })
    .startsWith('/pages/photoCollection/photoCollection?albumId=album&seriesId=series'))
  assert.equal(service.getFavoriteUrl({ type: 'unsupported', itemId: 'bad' }), '')
  await service.setFavorite('photo_single', 'id&1', false)
  assert.equal(await service.checkFavorite('photo_single', 'id&1'), false)
  assert.equal((await service.getMyFavorites()).items.length, types.length - 1)
  const originalList = api.getMyFavorites
  api.getMyFavorites = async () => ({ success: false, error: '请重新登录' })
  await assert.rejects(service.getMyFavorites(), /请重新登录/)
  api.getMyFavorites = originalList
  console.log('PASS favorites persist through add/list/remove, retry safely, and route all six types')

  let componentDefinition
  let resolveOldRead
  const toasts = []
  const componentService = {
    checkFavorite: () => new Promise(resolve => { resolveOldRead = resolve }),
    setFavorite: service.setFavorite
  }
  load('miniprogram/components/lxm-favorite-button/lxm-favorite-button.js', {
    '../../service/favorites': componentService
  }, { Component(value) { componentDefinition = value }, wx: { showToast(value) { toasts.push(value) } } })
  const button = instantiate(componentDefinition, { type: 'photo_single', itemId: 'new-photo', item: { name: '新照片' } })
  const oldRead = button.loadState('photo_single', 'new-photo')
  await button.onTap()
  assert.equal(button.data.active, true)
  resolveOldRead(false)
  await oldRead
  assert.equal(button.data.active, true, 'An old read must not overwrite a confirmed save')
  const oldSet = componentService.setFavorite
  componentService.setFavorite = async () => { throw new Error('网络不可用') }
  await button.onTap()
  assert.equal(button.data.active, true, 'Failed removal must preserve the saved state')
  assert.equal(toasts.at(-1).title, '网络不可用')
  componentService.setFavorite = oldSet
  await button.onTap()
  assert.equal(button.data.active, false)
  componentService.checkFavorite = () => service.checkFavorite('photo_single', 'new-photo')
  await service.setFavorite('photo_single', 'new-photo', true, { name: '新照片' })
  await button.loadState('photo_single', 'new-photo')
  assert.equal(button.data.active, true, 'Returning to a detail must refresh its saved state')
  console.log('PASS favorite button handles stale responses, failures, and return-to-detail refresh')

  let pageDefinition
  const navigations = []
  load('miniprogram/pages/myFavorites/myFavorites.js', {
    '../../service/favorites': service,
    '../../utils/query': query
  }, {
    Page(value) { pageDefinition = value },
    getApp() { return { captureSource: () => ({ shopId: 'source-shop' }) } },
    wx: { showToast() {}, navigateTo(value) { navigations.push(value.url) }, switchTab() {} }
  })
  for (let index = 0; index < 25; index++) {
    await service.setFavorite('photo_single', `photo-${index}`, true, { name: `照片 ${index}` })
  }
  const page = instantiate(pageDefinition)
  page.onLoad({})
  await page.loadFavorites(true)
  assert.equal(page.data.items.length, 20)
  assert.equal(page.data.hasMore, true)
  await page.loadFavorites(false)
  assert.equal(page.data.items.length, saved.size)
  assert.equal(page.data.hasMore, false)
  const first = page.data.items[0]
  page.openFavorite({ currentTarget: { dataset: { key: first.key } } })
  assert.ok(navigations[0].includes('shopId=source-shop'))
  await page.removeFavorite({ currentTarget: { dataset: { key: first.key } } })
  assert.equal(saved.has(first.key), false)
  assert.equal(page.data.items.some(item => item.key === first.key), false)
  assert.equal(page.data.page, 2, 'Removal must reset paging to avoid skipping shifted rows')
  api.getMyFavorites = async () => { throw new Error('加载失败') }
  const count = page.data.items.length
  await page.loadFavorites(true)
  assert.equal(page.data.items.length, count, 'A failed refresh must not erase visible favorites')
  assert.equal(page.data.error, '加载失败')
  console.log('PASS favorites page loads multiple pages, opens details, removes items, and shows load errors')

  const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  assert.ok(app.pages.includes('pages/myFavorites/myFavorites'))
  const myMarkup = fs.readFileSync(path.join(root, 'miniprogram/pages/my/my.wxml'), 'utf8')
  assert.match(myMarkup, /bindtap="goToMyFavorites"[\s\S]*?我的收藏/)
  for (const pageName of ['photoCollection', 'photoPackageDetail', 'videoProductDetail', 'peripheralDetail', 'guideDetail', 'spotSheet']) {
    const config = JSON.parse(fs.readFileSync(path.join(root, `miniprogram/pages/${pageName}/${pageName}.json`), 'utf8'))
    const markup = fs.readFileSync(path.join(root, `miniprogram/pages/${pageName}/${pageName}.wxml`), 'utf8')
    assert.equal(config.usingComponents['lxm-favorite-button'], '/components/lxm-favorite-button/lxm-favorite-button')
    assert.match(markup, /<lxm-favorite-button[^>]+item-id=/)
    assert.doesNotMatch(markup, /itemId=/)
    if (['photoCollection', 'photoPackageDetail', 'videoProductDetail', 'peripheralDetail'].includes(pageName)) {
      assert.match(markup, /class="lxm-foot-bar"[^>]*>[\s\S]*?<view class="lxm-foot-favorite">[\s\S]*?<lxm-favorite-button/)
    }
  }
  console.log('PASS delivery-package profile entry, page registration, component bindings, and footer placement')
}

run().catch(error => { console.error(error); process.exitCode = 1 })
