'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { publicGuides, normalizeGuide, matchesSpot } = require('../miniprogram/utils/guideContent')

function fixture(rows) {
  // Publication order is explicit; identity is now the final stable tie breaker.
  rows = rows.map((row, index) => ({ createTime: 100000 - index, ...row }))
  const filename = path.resolve(__dirname, '../miniprogram/pages/guideList/guideList.js')
  const requireFromFile = createRequire(filename)
  const navigation = []
  const requests = []
  let definition
  const api = { getGuides: async (params = {}) => {
    requests.push(params)
    return publicGuides(rows).filter(guide => matchesSpot(guide, params.spotId))
  } }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require(name) { return name === '../../api/guide' ? api : requireFromFile(name) },
    getApp: () => ({}), Page(value) { definition = value }, console,
    wx: { pageScrollTo() {}, navigateTo(event) { navigation.push(event.url) } }
  }, { filename })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch) } }
  return { page, api, navigation, requests }
}
const ids = rows => Array.from(rows, row => row._id)
const tap = (page, key) => page.onChipTap({ currentTarget: { dataset: { cat: key } } })
const sort = (page, key) => page.onSortTap({ currentTarget: { dataset: { sort: key } } })

test('every public pinned article appears in the carousel once, with working detail navigation', async () => {
  const rows = [
    { id: 'pin-a', isTop: true, category: '穿搭', title: '机位夜景标题' },
    { id: 'pin-b', pinned: true, category: '路线' },
    { id: 'pin-c', isTop: true },
    { id: 'normal', category: '穿搭' },
    { id: 'unpin', isTop: false, pinned: true },
    { id: 'hidden', isTop: true, isShow: false },
    { id: 'draft', isTop: true, status: '草稿' }
  ]
  const before = JSON.stringify(rows)
  const { page, navigation } = fixture(rows)
  await page.loadGuides()
  assert.deepEqual(ids(page.data.featuredGuides), ['pin-a', 'pin-b', 'pin-c'])
  assert.deepEqual(ids(page.data.visibleFeaturedGuides), ['pin-a', 'pin-b', 'pin-c'])
  assert.deepEqual(ids(page.data.filteredGuides), ['normal', 'unpin'])
  assert.equal(new Set([...ids(page.data.featuredGuides), ...ids(page.data.filteredGuides)]).size, 5)
  for (const guide of page.data.featuredGuides) page.goGuideDetail({ currentTarget: { dataset: { id: guide._id } } })
  assert.equal(navigation.length, 3)
  assert.ok(navigation[2].includes('id=pin-c'))
  page.onFeaturedChange({ detail: { current: 2 } })
  assert.equal(page.data.featuredIndex, 2)
  assert.equal(JSON.stringify(rows), before)
})

test('configured categories filter carousel and feed together, including legacy and reserved names', async () => {
  const { page } = fixture([
    { id: 'pin', isTop: true, category: ' 穿搭 ' },
    { id: 'clothes', category: '穿搭', title: '夜景机位' },
    { id: 'route', category: '路线' },
    { id: 'legacy', title: '夜景机位路线' },
    { id: 'named-all', category: '全部' },
    { id: 'named-uncategorized', category: '未分类' }
  ])
  await page.loadGuides()
  const keys = Array.from(page.data.chips, chip => chip.key)
  assert.deepEqual(keys, ['all', 'category:穿搭', 'category:路线', 'category:全部', 'category:未分类', 'uncategorized'])
  assert.ok(!keys.includes('category:夜景'), 'Titles must not infer an unconfigured category')
  tap(page, 'category:穿搭')
  assert.deepEqual(ids(page.data.visibleFeaturedGuides), ['pin'])
  assert.deepEqual(ids(page.data.filteredGuides), ['clothes'])
  assert.equal(page.data.featuredIndex, 0)
  tap(page, 'category:路线')
  assert.deepEqual(ids(page.data.visibleFeaturedGuides), [])
  assert.deepEqual(ids(page.data.leftGuides), ['route'])
  tap(page, 'uncategorized')
  assert.deepEqual(ids(page.data.filteredGuides), ['legacy'])
  tap(page, 'category:未分类')
  assert.deepEqual(ids(page.data.filteredGuides), ['named-uncategorized'])
  tap(page, 'category:全部')
  assert.deepEqual(ids(page.data.filteredGuides), ['named-all'])
  tap(page, 'all')
  assert.equal(page.data.filteredGuides.length, 5)
  tap(page, 'missing')
  assert.equal(page.data.activeChip, 'all')
})

test('unpinned articles stay in the feed, and empty reloads reset stale categories and carousel state', async () => {
  const { page, api } = fixture([{ id: 'first', category: '路线', isFeatured: true }, { id: 'second', category: '穿搭' }])
  await page.loadGuides()
  assert.deepEqual(ids(page.data.featuredGuides), [])
  assert.deepEqual(ids(page.data.filteredGuides), ['first', 'second'])
  tap(page, 'category:穿搭')
  api.getGuides = async () => []
  await page.loadGuides()
  assert.equal(page.data.activeChip, 'all')
  assert.equal(page.data.featuredIndex, 0)
  for (const field of ['guides', 'featuredGuides', 'visibleFeaturedGuides', 'filteredGuides', 'leftGuides', 'rightGuides']) {
    assert.equal(page.data[field].length, 0, field)
  }
  assert.equal(normalizeGuide({ category: null }).category, '')
  assert.equal(normalizeGuide({ category: 12 }).category, '')
})

test('all-pinned content remains available by category even with an empty waterfall', async () => {
  const { page } = fixture([{ id: 'a', isTop: true, category: '穿搭' }, { id: 'b', isTop: true, category: '路线' }])
  await page.loadGuides()
  assert.equal(page.data.feedGuides.length, 0)
  assert.equal(page.data.visibleFeaturedGuides.length, 2)
  tap(page, 'category:路线')
  assert.deepEqual(ids(page.data.visibleFeaturedGuides), ['b'])
  assert.equal(page.data.filteredGuides.length, 0)
})

test('spot entry keeps backend pins above and every associated article in the lower cards', async () => {
  const { page, requests, navigation } = fixture([
    { id: 'global-pin', spotId: 'other-spot', isTop: true, category: '古建' },
    { id: 'related-pin', spotId: 'qiatongxue', isTop: true, category: '路线' },
    { id: 'related', spotId: 'qiatongxue', category: '穿搭' },
    { id: 'multi-spot', spotId: 'other-spot', spotIds: ['other-spot', 'qiatongxue'], category: '路线' },
    { id: 'unrelated', spotId: 'other-spot', category: '其他点位分类' },
    { id: 'hidden', spotId: 'qiatongxue', isTop: true, isShow: false },
    { id: 'draft', spotId: 'qiatongxue', isTop: true, status: '草稿' }
  ])
  // Exercise the same query values passed from the spot detail page.
  let pending
  const loadGuides = page.loadGuides.bind(page)
  page.loadGuides = () => { pending = loadGuides(); return pending }
  page.onLoad({ spotId: 'qiatongxue', spotName: encodeURIComponent('恰同学广场'), shopId: 'source-shop', scene: 'source-scene' })
  await pending
  assert.equal(page.data.title, '恰同学广场·旅拍灵感')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].spotId, undefined, 'The spot entry must fetch global pins too')
  assert.deepEqual(ids(page.data.featuredGuides), ['global-pin', 'related-pin'])
  assert.deepEqual(ids(page.data.filteredGuides), ['related-pin', 'related', 'multi-spot'])
  assert.deepEqual(ids(page.data.leftGuides), ['related-pin', 'multi-spot'])
  assert.deepEqual(ids(page.data.rightGuides), ['related'])
  assert.deepEqual(ids(page.data.guides), ['global-pin', 'related-pin', 'related', 'multi-spot'])
  assert.ok(!page.data.chips.some(chip => chip.category === '其他点位分类'))
  tap(page, 'category:路线')
  assert.deepEqual(ids(page.data.visibleFeaturedGuides), ['related-pin'])
  assert.deepEqual(ids(page.data.filteredGuides), ['related-pin', 'multi-spot'])
  tap(page, 'all')
  assert.deepEqual(ids(page.data.visibleFeaturedGuides), ['global-pin', 'related-pin'])
  page.goGuideDetail({ detail: { id: 'related' } })
  const url = new URL(navigation.at(-1), 'https://mini.test')
  assert.equal(url.searchParams.get('id'), 'related')
  assert.equal(url.searchParams.get('shopId'), 'source-shop')
  assert.equal(url.searchParams.get('scene'), 'source-scene')
})

test('a spot with one related article and no backend pin leaves that article below', async () => {
  const { page } = fixture([
    { id: 'unrelated', spotId: 'other-spot', isFeatured: true, category: '古建' },
    { id: 'related', spotIds: ['qiatongxue'], isFeatured: true, category: '路线' }
  ])
  page.setData({ spotId: 'qiatongxue' })
  await page.loadGuides()
  assert.deepEqual(ids(page.data.featuredGuides), [])
  assert.deepEqual(ids(page.data.filteredGuides), ['related'])
  assert.deepEqual(ids(page.data.leftGuides), ['related'])
  assert.deepEqual(ids(page.data.guides), ['related'])
})

test('a spot without related articles retains global pins while unrelated normal content stays out', async () => {
  const { page, api } = fixture([
    { id: 'global-pin', spotId: 'other-spot', isTop: true },
    { id: 'unrelated', spotId: 'other-spot', category: '路线' }
  ])
  page.setData({ spotId: 'qiatongxue' })
  await page.loadGuides()
  assert.deepEqual(ids(page.data.visibleFeaturedGuides), ['global-pin'])
  assert.deepEqual(ids(page.data.guides), ['global-pin'])
  assert.equal(page.data.filteredGuides.length, 0)
  assert.ok(!page.data.chips.some(chip => chip.category === '路线'))
  api.getGuides = async () => publicGuides([{ id: 'unrelated', spotId: 'other-spot' }])
  await page.loadGuides()
  assert.equal(page.data.guides.length, 0)
  assert.equal(page.data.featuredGuides.length, 0)
  assert.equal(page.data.filteredGuides.length, 0)
})

test('sort controls order numeric views and scores descending, with categories and carousel preserved', async () => {
  const { page } = fixture([
    { id: 'pin-a', isTop: true, category: '路线', readCount: 1, score: 1 },
    { id: 'pin-b', isTop: true, category: '路线', readCount: 99, score: 5 },
    { id: 'recent', category: '路线', readCount: '9', score: '4.9', updatedAt: '2026-11-23' },
    { id: 'popular', category: '路线', readCount: '100', score: '3.5', updatedAt: '2026-11-22' },
    { id: 'rated', category: '穿搭', readCount: 15, score: 5, updatedAt: '2026-11-21' },
    { id: 'missing', category: '路线', updatedAt: '2026-11-20' }
  ])
  await page.loadGuides()
  const originalFeed = ids(page.data.feedGuides)
  sort(page, 'readCount')
  assert.equal(page.data.activeSort, 'readCount')
  assert.deepEqual(ids(page.data.filteredGuides), ['popular', 'rated', 'recent', 'missing'])
  assert.deepEqual(ids(page.data.leftGuides), ['popular', 'recent'])
  assert.deepEqual(ids(page.data.rightGuides), ['rated', 'missing'])
  assert.deepEqual(ids(page.data.visibleFeaturedGuides), ['pin-a', 'pin-b'])
  tap(page, 'category:路线')
  assert.deepEqual(ids(page.data.filteredGuides), ['popular', 'recent', 'missing'])
  sort(page, 'score')
  assert.deepEqual(ids(page.data.filteredGuides), ['recent', 'popular', 'missing'])
  tap(page, 'all')
  assert.deepEqual(ids(page.data.filteredGuides), ['rated', 'recent', 'popular', 'missing'])
  assert.deepEqual(ids(page.data.visibleFeaturedGuides), ['pin-a', 'pin-b'])
  assert.deepEqual(ids(page.data.feedGuides), originalFeed, 'Changing sort must not mutate the default ordering')
  sort(page, 'default')
  assert.deepEqual(ids(page.data.filteredGuides), originalFeed)
  sort(page, 'unknown')
  assert.equal(page.data.activeSort, 'default')
})

test('point feed metric ordering takes priority over pins, persists on refresh, and keeps source scope', async () => {
  const { page, api, requests } = fixture([
    { id: 'related-pin', isTop: true, spotId: 'a', readCount: 2, score: 3 },
    { id: 'related', spotIds: ['b', 'a'], readCount: 50, score: 5 },
    { id: 'unrelated', spotId: 'b', readCount: 999, score: 5 }
  ])
  page.setData({ spotId: 'a' })
  await page.loadGuides()
  assert.deepEqual(ids(page.data.filteredGuides), ['related-pin', 'related'])
  sort(page, 'readCount')
  assert.deepEqual(ids(page.data.filteredGuides), ['related', 'related-pin'])
  assert.deepEqual(ids(page.data.visibleFeaturedGuides), ['related-pin'])
  api.getGuides = async () => publicGuides([
    { id: 'related-pin', isTop: true, spotId: 'a', readCount: 200, score: 3 },
    { id: 'related', spotId: 'a', readCount: 50, score: 5 }
  ])
  await page.loadGuides()
  assert.equal(page.data.activeSort, 'readCount')
  assert.deepEqual(ids(page.data.filteredGuides), ['related-pin', 'related'])
  sort(page, 'score')
  assert.deepEqual(ids(page.data.filteredGuides), ['related', 'related-pin'])
  assert.equal(requests.length, 1, 'Sorting uses already loaded guides')
})

test('legacy numeric metrics sort correctly without reviving views over explicit zero or generating ratings', () => {
  const rows = [
    { id: 'zero', readCount: 0, views: 500, score: 0, updatedAt: '2026-11-23' },
    { id: 'legacy', views: '12', score: '4.9', updatedAt: '2026-11-22' },
    { id: 'numeric', readCount: '100', score: '3.5', updatedAt: '2026-11-21' },
    { id: 'invalid', readCount: 'bad', score: Infinity, updatedAt: '2026-11-20' },
    { id: 'missing', updatedAt: '2026-11-19' },
    { id: 'hidden', isShow: false, readCount: 900, score: 5 }
  ]
  const before = JSON.stringify(rows)
  assert.deepEqual(ids(publicGuides(rows, 'readCount')), ['numeric', 'legacy', 'zero', 'invalid', 'missing'])
  assert.deepEqual(ids(publicGuides(rows, 'score')), ['legacy', 'numeric', 'zero', 'invalid', 'missing'])
  assert.equal(normalizeGuide(rows[0]).readCount, 0)
  assert.equal(normalizeGuide(rows[1]).readCount, 12)
  assert.equal(normalizeGuide(rows[1]).score, 4.9)
  assert.equal(normalizeGuide(rows[4]).score, undefined)
  for (const value of [-1, Infinity, NaN, {}, true, 'bad', 2.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(normalizeGuide({ readCount: value }).readCount, 0)
  }
  assert.equal(JSON.stringify(rows), before)
})
