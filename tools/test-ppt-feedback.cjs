const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..', 'miniprogram')
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')
const checks = [
  ['S1 首页无城市切换且搜索滚动收缩', () => {
    const wxml = read('pages/index/index.wxml')
    const js = read('pages/index/index.js')
    const css = read('pages/index/index.wxss')
    return !/home-city|cityOptions|城市切换/.test(wxml) && /headerCompact/.test(js) && /scrollTop > 104/.test(js) && /home-top\.compact/.test(css)
  }],
  ['S2 热榜数字/图片/名称及点位联动', () => {
    const wxml = read('pages/index/index.wxml')
    const js = read('pages/index/index.js')
    return /rank-num/.test(wxml) && /rank-cover/.test(wxml) && /rank-name/.test(wxml) && /strip-sub[^>]*wx:if="\{\{activeSpotName\}\}"/.test(wxml) && /activeSpotName/.test(js)
  }],
  ['S3 卡片标签和套餐容器', () => {
    const album = read('components/lxm-album-card/lxm-album-card.wxml')
    const video = read('components/lxm-video-card/lxm-video-card.wxss')
    const index = read('pages/index/index.wxss')
    return /class="album-type"/.test(album) && /\.album-type[\s\S]*left:\s*10rpx[\s\S]*top:\s*10rpx/.test(read('components/lxm-album-card/lxm-album-card.wxss')) && /\.video-marketing-badge[\s\S]*left:\s*24rpx/.test(video) && /height:\s*540rpx/.test(index)
  }],
  ['S4 照片单图预览和相关推荐', () => {
    const wxml = read('pages/photoCollection/photoCollection.wxml')
    const gallery = read('components/lxm-sample-gallery/lxm-sample-gallery.wxml')
    const js = read('pages/photoCollection/photoCollection.js')
    return !wxml.includes('点击查看完整样片') && !/album-hero-stage|album-sample-swiper/.test(wxml) && /related-section/.test(wxml) && /wx\.previewImage/.test(js) && /lxm-sample-gallery__stage/.test(gallery)
  }],
  ['S5 视频详情顶部视频大屏', () => {
    const wxml = read('pages/videoProductDetail/videoProductDetail.wxml')
    const css = read('pages/videoProductDetail/videoProductDetail.wxss')
    const js = read('pages/videoProductDetail/videoProductDetail.js')
    return /hero-swiper/.test(wxml) && /hero-video/.test(wxml) && /height:\s*660rpx/.test(css) && /previewVideo/.test(js)
  }],
  ['S6 套餐隐藏服务和规格并保留清单跳转', () => {
    const wxml = read('pages/photoPackageDetail/photoPackageDetail.wxml')
    const service = read('service/packageDetail.js')
    return !/套餐服务|item-card__specs|serviceTags|packageBenefits/.test(wxml) && !service.includes('resolveItemSpecs') && /goIncludedItem/.test(wxml)
  }],
  ['S7 打卡点横滑卡片留出安全空间', () => {
    const css = read('pages/spotSheet/spotSheet.wxss')
    return /\.package-scroll[\s\S]*height:\s*520rpx/.test(css) && /padding-right:\s*28rpx/.test(css) && /vertical-align:\s*top/.test(css)
  }],
  ['S8 热度位置、标签层级和立即定制', () => {
    const wxml = read('pages/spotSheet/spotSheet.wxml')
    const css = read('pages/spotSheet/spotSheet.wxss')
    const card = read('components/lxm-custom-booking-card/lxm-custom-booking-card.js')
    return /sheet-hero-hot/.test(wxml) && /sheet-tags/.test(wxml) && /margin-top:\s*10rpx/.test(css) && /buttonText:.*立即定制/.test(card)
  }],
  ['S9 日期和具体时间选择', () => {
    const wxml = read('pages/bookingInfo/bookingInfo.wxml')
    const js = read('pages/bookingInfo/bookingInfo.js')
    const booking = read('utils/booking.js')
    return /<picker mode="date"/.test(wxml) && /<picker mode="time"/.test(wxml) && /onTimeChange/.test(js) && /timePeriod/.test(booking)
  }],
  ['S10 阴影和悬浮质感', () => {
    const css = read('app.wxss')
    return /--lxm-shadow-card/.test(css) && /--lxm-shadow-card-hover/.test(css) && /\.lxm-card-lift/.test(css)
  }]
]
let failed = 0
for (const [name, fn] of checks) {
  let ok = false
  try { ok = !!fn() } catch (err) { ok = false }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failed++
}
if (failed) process.exitCode = 1
else console.log(`All ${checks.length} PPT feedback checks passed.`)
