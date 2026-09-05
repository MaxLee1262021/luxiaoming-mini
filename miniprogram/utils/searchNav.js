// 搜索建议直达路由：首页 / 探索页共用同一份「点击建议项 → 直达详情」逻辑，
// 找不到直达目标时兜底跳搜索结果页。buildUrl 由各页面传入（携带渠道溯源参数）。
function routeSearchSuggestion(item, buildUrl) {
  const it = item || {}
  const nav = it.nav || {}
  const url = buildUrl || function (p) { return p }

  if (it.type === 'spot' && nav._id) {
    wx.navigateTo({ url: url('/pages/spotSheet/spotSheet', { id: nav._id }) })
    return
  }
  if (it.type === 'package' && nav._id) {
    wx.navigateTo({
      url: url('/pages/photoPackageDetail/photoPackageDetail', {
        id: nav.seriesId,
        packageId: nav._id,
        productId: nav._id,
        spotId: nav.spotId
      })
    })
    return
  }
  if (it.type === 'video' && nav._id) {
    wx.navigateTo({
      url: url('/pages/videoProductDetail/videoProductDetail', {
        productId: nav._id,
        packageId: nav._id,
        id: nav.seriesId,
        seriesId: nav.seriesId,
        spotId: nav.spotId
      })
    })
    return
  }
  if (it.type === 'photo' && nav._id) {
    wx.navigateTo({
      url: url('/pages/photoCollection/photoCollection', {
        albumId: nav._id,
        seriesId: nav.seriesId,
        spotId: nav.spotId
      })
    })
    return
  }
  if (it.type === 'guide' && nav._id) {
    wx.navigateTo({ url: url('/pages/guideDetail/guideDetail', { id: nav._id }) })
    return
  }

  // 兜底：无直达目标（如未匹配到真实数据）→ 跳搜索结果页
  wx.navigateTo({ url: url('/pages/search/search', { keyword: it.name || '' }) })
}

module.exports = { routeSearchSuggestion }
