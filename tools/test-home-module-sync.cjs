'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { buildHomeViewData } = require('../miniprogram/service/homeData')
const { normalizeModuleConfig } = require('../miniprogram/service/pageConfig')

const homeKeys = ['features', 'bookingAlbums', 'videoProducts', 'hotPackages']

test('首页接收到后台关闭的板块时，显隐映射保留 false', () => {
  const modules = homeKeys.map((key, index) => ({ key, visible: false, enabled: false, sort: index + 1 }))
  const view = buildHomeViewData({ modules })
  for (const key of homeKeys) {
    assert.equal(view.moduleConfig[key].visible, false, `${key} 应传递关闭状态给首页模板`)
    assert.equal(view.homeModules.some(item => item.key === key), false)
  }
})

test('首页重新开启板块后恢复可见，并保留独立开关状态', () => {
  const hidden = buildHomeViewData({ modules: homeKeys.map(key => ({ key, visible: false })) })
  const mixed = buildHomeViewData({ modules: homeKeys.map((key, index) => ({ key, visible: index % 2 === 0 })) })
  for (const [index, key] of homeKeys.entries()) {
    assert.equal(hidden.moduleConfig[key].visible, false)
    assert.equal(mixed.moduleConfig[key].visible, index % 2 === 0)
  }
  const enabled = buildHomeViewData({ modules: homeKeys.map(key => ({ key, visible: true, enabled: true })) })
  for (const key of homeKeys) assert.equal(enabled.moduleConfig[key].visible, true)
})

test('兼容 enabled:false，且 visible:false 优先于 enabled:true', () => {
  const view = buildHomeViewData({ modules: [
    { key: 'features', enabled: false },
    { key: 'bookingAlbums', visible: true, enabled: false },
    { key: 'videoProducts', visible: false, enabled: true },
    { key: 'hotPackages', enabled: true }
  ] })
  for (const key of homeKeys.slice(0, 3)) assert.equal(view.moduleConfig[key].visible, false)
  assert.equal(view.moduleConfig.hotPackages.visible, true)
})

test('本地预览配置不能覆盖真实接口模块', () => {
  const preview = { modules: homeKeys.map(key => ({ key, visible: false })) }
  const view = buildHomeViewData({}, preview)
  for (const key of homeKeys) assert.equal(view.moduleConfig[key].visible, true)
  const live = buildHomeViewData({ modules: [{ key: 'features', visible: true }] }, preview)
  assert.equal(live.moduleConfig.features.visible, true)
  assert.equal(live.moduleConfig.bookingAlbums.visible, true)
})

test('刷新后缺少显隐配置恢复默认值，不沿用上次关闭状态或修改输入', () => {
  const modules = homeKeys.map(key => Object.freeze({ key, visible: false }))
  Object.freeze(modules)
  const hidden = buildHomeViewData({ modules })
  hidden.moduleConfig.features.title = '不会污染下一次响应'
  const defaults = buildHomeViewData({ modules: [] })
  for (const key of homeKeys) {
    assert.equal(defaults.moduleConfig[key].visible, true)
    assert.equal(modules.find(item => item.key === key).visible, false)
  }
  assert.equal(defaults.moduleConfig.features.title, '特色专区')
})

test('其他页面共用的模块归一化仍返回可见列表', () => {
  const normalized = normalizeModuleConfig([
    { key: 'features', visible: false },
    { key: 'bookingAlbums', visible: true }
  ])
  assert.equal(normalized.some(item => item.key === 'features'), false)
  assert.equal(normalized.some(item => item.key === 'bookingAlbums'), true)
})
