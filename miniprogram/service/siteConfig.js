const STORAGE_KEY = 'lxm_site_page_config'

function normalizePageModules(pageModules = {}) {
  return pageModules && typeof pageModules === 'object' ? pageModules : {}
}

function setSitePageConfig(pageConfig = {}) {
  const config = {
    homeModules: Array.isArray(pageConfig.homeModules) ? pageConfig.homeModules : [],
    recommendations: pageConfig.recommendations || {},
    pageModules: normalizePageModules(pageConfig.pageModules)
  }

  try {
    wx.setStorageSync(STORAGE_KEY, config)
  } catch (err) {
    console.warn('save site page config failed', err)
  }

  const app = getApp({ allowDefault: true })
  if (app && app.globalData) {
    app.globalData.sitePageConfig = config
  }
  return config
}

function getSitePageConfig() {
  const app = getApp({ allowDefault: true })
  if (app && app.globalData && app.globalData.sitePageConfig) {
    return app.globalData.sitePageConfig
  }

  try {
    return wx.getStorageSync(STORAGE_KEY) || {}
  } catch (err) {
    console.warn('read site page config failed', err)
    return {}
  }
}

function getPageModuleConfig(pageKey = '') {
  const config = getSitePageConfig()
  return (config.pageModules || {})[pageKey] || {}
}

function isPageModuleVisible(pageKey = '', moduleKey = '') {
  const config = getPageModuleConfig(pageKey)
  const modules = config.enabledModules || []
  if (!moduleKey || !modules.length) return true
  return modules.includes(moduleKey)
}

module.exports = {
  getPageModuleConfig,
  getSitePageConfig,
  isPageModuleVisible,
  setSitePageConfig
}
