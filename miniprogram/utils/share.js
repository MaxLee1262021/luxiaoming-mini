// 全站分享统一配置
// 用法：页面如需专属分享文案，可在 Page() 中自行定义 onShareAppMessage / onShareTimeline；
// 未定义的页面由 app.js 全局兜底注入，保证右上角菜单「转发 / 分享到朋友圈」全站可用。
// 注意：onShareAppMessage 必须返回 { title, path }，path 建议带来源参数以便溯源。

const BRAND_TITLE = '鹿小鸣旅拍｜把城市拍成你的旅行封面'

function getCurrentRoute() {
  try {
    const pages = getCurrentPages()
    const current = pages && pages.length ? pages[pages.length - 1] : null
    return current && current.route ? '/' + current.route : '/pages/index/index'
  } catch (e) {
    return '/pages/index/index'
  }
}

// 默认分享卡片：统一品牌口吻，路径指回当前页
function defaultShare() {
  return {
    title: BRAND_TITLE,
    path: getCurrentRoute()
  }
}

// 默认朋友圈分享（朋友圈仅支持 title + query，不传 path）
function defaultTimeline() {
  return {
    title: BRAND_TITLE
  }
}

module.exports = { defaultShare, defaultTimeline, getCurrentRoute, BRAND_TITLE }
