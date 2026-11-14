'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const storage = new Map()
const homeRequests = []
let definition

global.wx = {
  getStorageSync(key) { return storage.get(key) || '' },
  setStorageSync(key, value) { storage.set(key, value) },
  removeStorageSync(key) { storage.delete(key) },
  getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } } },
  showToast() {},
  navigateTo() {},
  request(options) {
    const name = String(options.url || '').split('/rpc/').pop()
    if (name === 'getHomeData') {
      homeRequests.push({ options, params: options.data.data, settled: false })
    } else {
      options.success({ statusCode: 200, data: { success: true, data: {} } })
    }
  }
}
global.getApp = () => ({ captureSource: () => ({}) })
global.Page = value => { definition = value }

const pagePath = path.resolve(__dirname, '../miniprogram/pages/index/index.js')
require(pagePath)

function createPage() {
  let updatesAfterUnload = 0
  const page = Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch, done) {
      if (this.testUnloaded) updatesAfterUnload += 1
      Object.assign(this.data, patch || {})
      if (typeof done === 'function') done()
    }
  })
  page.getUpdatesAfterUnload = () => updatesAfterUnload
  return page
}

function spots(count = 55, prefix = 'spot') {
  return Array.from({ length: count }, (_, index) => ({
    _id: `${prefix}-${index + 1}`,
    name: `打卡点${index + 1}`,
    // Deliberately differ from server order: configured recommendations win.
    hotScore: index % 7,
    cover: `https://cdn.test/${prefix}-${index + 1}.jpg`
  }))
}

function unresolvedHomes() {
  return homeRequests.filter(request => !request.settled)
}

function respond(request, source, extra = {}) {
  assert.ok(request && !request.settled, 'request must still be pending')
  request.settled = true
  const offset = request.params.spotOffset || 0
  const limit = request.params.spotLimit || 20
  const page = source.slice(offset, offset + limit)
  request.options.success({
    statusCode: 200,
    data: {
      success: true,
      data: {
        banners: [{ _id: 'banner', url: 'https://cdn.test/banner.jpg' }],
        spots: page,
        spotPagination: {
          offset, limit, nextOffset: offset + page.length,
          hasMore: offset + page.length < source.length,
          total: source.length
        },
        ...extra
      }
    }
  })
}

function reject(request) {
  request.settled = true
  request.options.fail({ errMsg: 'request:fail simulated pagination outage' })
}

async function turn() {
  await new Promise(resolve => setImmediate(resolve))
}

async function initial(page, source = spots()) {
  assert.equal(unresolvedHomes().length, 0)
  const loading = page.loadHomeData()
  const request = unresolvedHomes()[0]
  assert.ok(request)
  assert.equal(request.params.spotOffset, 0)
  assert.equal(request.params.spotLimit, 20)
  respond(request, source)
  await loading
  return source
}

async function nextPage(page, source) {
  const loading = page.onSpotReachEnd()
  const pending = unresolvedHomes()
  assert.equal(pending.length, 1)
  assert.equal(pending[0].params.spotsOnly, true)
  assert.equal(pending[0].params.spotLimit, 20)
  respond(pending[0], source)
  await loading
}

async function refresh(page, source) {
  let complete = false
  const loading = page.loadHomeData().finally(() => { complete = true })
  for (let attempt = 0; attempt < 12 && !complete; attempt += 1) {
    unresolvedHomes().forEach(request => respond(request, source))
    await turn()
  }
  assert.equal(complete, true, 'refresh should settle after restoring the loaded pages')
  await loading
}

const ids = rows => rows.map(row => row._id)

test('首页首批 20 条，右滑依次追加 20 条并在最后一页停止', async () => {
  const page = createPage()
  const source = await initial(page)
  assert.deepEqual(ids(page.data.spotTabs), ids(source.slice(0, 20)))
  assert.equal(page.data.spotHasMore, true)
  const banners = page.data.banners
  await nextPage(page, source)
  assert.deepEqual(ids(page.data.spotTabs), ids(source.slice(0, 40)))
  assert.deepEqual(page.data.spotTabs.map(row => row.rank), Array.from({ length: 40 }, (_, i) => i + 1))
  assert.deepEqual(page.data.banners, banners, 'spot pages must preserve the other home sections')
  assert.equal(page.data.activeSpotId, source[0]._id)
  await nextPage(page, source)
  assert.deepEqual(ids(page.data.spotTabs), ids(source))
  assert.equal(page.data.spotHasMore, false)
  const requestCount = homeRequests.length
  await page.onSpotReachEnd()
  assert.equal(homeRequests.length, requestCount, 'no request after the last page')
  page.onUnload()
})

test('连续触底合并并发请求，失败后保留列表并从原 offset 重试', async () => {
  const page = createPage()
  const source = await initial(page)
  page.onSpotTabTap({ currentTarget: { dataset: { id: 'spot-15' } } })
  const first = page.onSpotReachEnd()
  const repeated = page.onSpotReachEnd()
  assert.equal(unresolvedHomes().length, 1)
  assert.equal(page.data.spotLoadingMore, true)
  assert.equal(unresolvedHomes()[0].params.spotOffset, 20)
  reject(unresolvedHomes()[0])
  await Promise.all([first, repeated])
  assert.equal(page.data.spotTabs.length, 20)
  assert.equal(page.data.activeSpotId, 'spot-15')
  assert.equal(page.data.spotLoadingMore, false)
  assert.ok(page.data.spotLoadError)
  const retry = page.onSpotReachEnd()
  assert.equal(unresolvedHomes()[0].params.spotOffset, 20)
  respond(unresolvedHomes()[0], source)
  await retry
  assert.equal(page.data.spotTabs.length, 40)
  assert.equal(page.data.spotLoadError, '')
  assert.equal(page.data.activeSpotId, 'spot-15')
  page.onUnload()
})

test('刷新已加载的窗口后保留第二页所选点位，删除后才退回第一名', async () => {
  const page = createPage()
  const source = await initial(page)
  await nextPage(page, source)
  page.onSpotTabTap({ currentTarget: { dataset: { id: 'spot-35' } } })
  const updated = source.map(row => row._id === 'spot-35' ? { ...row, name: '更新后的打卡点35' } : row)
  await refresh(page, updated)
  assert.deepEqual(ids(page.data.spotTabs), ids(updated.slice(0, 40)))
  assert.equal(page.data.activeSpotId, 'spot-35')
  assert.equal(page.data.activeSpotName, '更新后的打卡点35')
  await refresh(page, updated.filter(row => row._id !== 'spot-35'))
  assert.equal(page.data.activeSpotId, 'spot-1')
  assert.equal(page.data.spotTabs.length, 40)
  page.onUnload()
})

test('恢复后续页失败时保留旧列表与所选点位，并从原有末尾继续加载', async () => {
  const page = createPage()
  const source = await initial(page)
  await nextPage(page, source)
  page.onSpotTabTap({ currentTarget: { dataset: { id: 'spot-35' } } })
  const oldTabs = JSON.parse(JSON.stringify(page.data.spotTabs))
  const updated = source.map(row => ({ ...row, name: `未完成刷新-${row.name}` }))
  const refreshing = page.loadHomeData()
  respond(unresolvedHomes()[0], updated)
  await turn()
  const secondPage = unresolvedHomes()[0]
  assert.equal(secondPage.params.spotOffset, 20)
  const originalConsoleError = console.error
  console.error = () => {}
  try {
    reject(secondPage)
    await refreshing
  } finally {
    console.error = originalConsoleError
  }
  assert.deepEqual(page.data.spotTabs, oldTabs, 'a partial refresh must not replace the visible list')
  assert.equal(page.data.activeSpotId, 'spot-35')
  assert.equal(page.data.activeSpotName, '打卡点35')
  assert.match(page.data.error, /刷新失败/)
  assert.equal(page.data.spotHasMore, true)
  const loading = page.onSpotReachEnd()
  const request = unresolvedHomes()[0]
  assert.equal(request.params.spotOffset, 40, 'continue after the preserved list, not the failed refresh page')
  respond(request, source)
  await loading
  assert.deepEqual(ids(page.data.spotTabs), ids(source))
  assert.equal(page.data.activeSpotId, 'spot-35')
  page.onUnload()
})

test('旧分页响应不能覆盖刷新内容，也不能解开新分页的并发锁', async () => {
  const page = createPage()
  const source = await initial(page)
  const oldLoading = page.onSpotReachEnd()
  const oldRequest = unresolvedHomes()[0]
  const refreshedSource = source.map(row => ({ ...row, name: `刷新-${row.name}` }))
  const refreshing = page.loadHomeData()
  const refreshRequest = unresolvedHomes().find(request => request !== oldRequest)
  respond(refreshRequest, refreshedSource)
  await refreshing
  assert.equal(page.data.spotTabs.length, 20)
  const newLoading = page.onSpotReachEnd()
  const newRequest = unresolvedHomes().find(request => request !== oldRequest)
  respond(oldRequest, source)
  await oldLoading
  const countBeforeRepeatedEnd = homeRequests.length
  const repeated = page.onSpotReachEnd()
  assert.equal(homeRequests.length, countBeforeRepeatedEnd)
  respond(newRequest, refreshedSource)
  await Promise.all([newLoading, repeated])
  assert.equal(page.data.spotTabs.length, 40)
  assert.ok(page.data.spotTabs.every(row => row.name.startsWith('刷新-')))
  page.onUnload()
})

test('刷新前已返回的旧分页，在刷新成功后不能再次保留下来', async () => {
  const page = createPage()
  const source = await initial(page)
  const oldLoading = page.onSpotReachEnd()
  const oldRequest = unresolvedHomes()[0]
  const refreshing = page.loadHomeData()
  const refreshRequest = unresolvedHomes().find(request => request !== oldRequest)
  respond(oldRequest, source)
  await oldLoading
  const updated = source.map(row => ({ ...row, name: `最新-${row.name}` }))
  respond(refreshRequest, updated)
  await refreshing
  assert.equal(page.data.spotTabs.length, 20)
  assert.ok(page.data.spotTabs.every(row => row.name.startsWith('最新-')))
  page.onUnload()
})

test('已删除或下架导致下一页为空时停止继续加载', async () => {
  const page = createPage()
  const source = await initial(page)
  await nextPage(page, source.slice(0, 20))
  assert.equal(page.data.spotTabs.length, 20)
  assert.equal(page.data.spotHasMore, false)
  const requestCount = homeRequests.length
  await page.onSpotReachEnd()
  assert.equal(homeRequests.length, requestCount)
  page.onUnload()
})

test('跨页重复点位只展示一次，并继续使用服务器提供的 offset', async () => {
  const page = createPage()
  const source = await initial(page)
  const shifted = [...source.slice(0, 20), source[19], ...source.slice(20)]
  await nextPage(page, shifted)
  assert.equal(page.data.spotTabs.length, 39)
  assert.equal(new Set(ids(page.data.spotTabs)).size, 39)
  const loading = page.onSpotReachEnd()
  const request = unresolvedHomes()[0]
  assert.equal(request.params.spotOffset, 40, 'offset must not come from the deduplicated list length')
  respond(request, shifted)
  await loading
  assert.deepEqual(ids(page.data.spotTabs), ids(source))
  assert.equal(page.data.spotHasMore, false)
  page.onUnload()
})

test('无进展的分页响应显示重试，不能反复自动请求或跳过当前页', async () => {
  const page = createPage()
  const source = await initial(page)
  const loading = page.onSpotReachEnd()
  respond(unresolvedHomes()[0], source, {
    spots: [],
    spotPagination: { offset: 20, limit: 20, nextOffset: 20, hasMore: true, total: 55 }
  })
  await loading
  assert.equal(page.data.spotTabs.length, 20)
  assert.ok(page.data.spotLoadError)
  assert.equal(unresolvedHomes().length, 0)
  const retry = page.onSpotReachEnd()
  assert.equal(unresolvedHomes()[0].params.spotOffset, 20)
  respond(unresolvedHomes()[0], source)
  await retry
  assert.equal(page.data.spotTabs.length, 40)
  assert.equal(page.data.spotLoadError, '')
  page.onUnload()
})

test('旧演示开关不能启用本地商品或绕过真实分页请求', async () => {
  storage.set('lxm_demo_mode', true)
  const page = createPage()
  assert.equal(typeof page.applyDemoHomeData, 'undefined')
  const source = await initial(page)
  const next = page.onSpotReachEnd()
  assert.equal(unresolvedHomes()[0].params.spotOffset, 20)
  respond(unresolvedHomes()[0], source)
  await next
  assert.equal(page.data.spotTabs.length, 40)
  storage.delete('lxm_demo_mode')
  page.onUnload()
})

test('页面卸载后未完成的分页不能再更新页面', async () => {
  const page = createPage()
  const source = await initial(page)
  const loading = page.onSpotReachEnd()
  const request = unresolvedHomes()[0]
  page.onUnload()
  page.testUnloaded = true
  respond(request, source)
  await loading
  assert.equal(page.data.spotTabs.length, 20)
  assert.equal(page.getUpdatesAfterUnload(), 0)
})

test('热榜横向滚动绑定自动加载，移除更多按钮并以点位 ID 保持卡片', () => {
  const wxml = fs.readFileSync(pagePath.replace(/\.js$/, '.wxml'), 'utf8')
  const start = wxml.indexOf('<view class="spot-tabs"')
  const end = wxml.indexOf('</scroll-view>', start) + '</scroll-view>'.length
  assert.ok(start >= 0 && end > start)
  const rankSection = wxml.slice(start, end)
  assert.match(rankSection, /<scroll-view[^>]*class="spot-tabs-scroll"[^>]*scroll-x[^>]*(?:bindscrolltolower|bind:scrolltolower)="onSpotReachEnd"/)
  assert.doesNotMatch(rankSection, /goAllSpots|section-more|更多/)
  assert.match(rankSection, /wx:key="_id"/)
})
