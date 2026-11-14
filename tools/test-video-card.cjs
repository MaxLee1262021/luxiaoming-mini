const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

const componentDir = path.resolve(__dirname, '../miniprogram/components/lxm-video-card')
let definition
const playback = []
vm.runInNewContext(fs.readFileSync(path.join(componentDir, 'lxm-video-card.js'), 'utf8'), {
  require: createRequire(path.join(componentDir, 'lxm-video-card.js')),
  wx: {
    createVideoContext(id, component) {
      return {
        pause() { playback.push({ action: 'pause', id, component }) },
        play() { playback.push({ action: 'play', id, component }) }
      }
    }
  },
  Component(value) { definition = value }
}, { filename: 'lxm-video-card.js' })

const events = []
const card = {
  data: { ...definition.data, item: {}, index: 2 },
  setData(patch, done) { Object.assign(this.data, patch); if (done) done() },
  triggerEvent(name, detail) { events.push({ name, detail }) },
  ...definition.methods
}
function update(item) {
  card.data.item = item
  definition.observers.item.call(card, item)
}

// Missing fields must never invent deliverables, duration, or delivery promises.
update({ _id: 'unconfigured', name: '未配置短视频' })
assert.equal(card.data.videoMetaText, '')
assert.equal(card.data.previewVideoUrl, '')
card.onVideoTap()
assert.equal(events.length, 0)

update({ videoDuration: ' 45 秒 ', finishedVideoCount: 2, deliveryCycle: ' 5 个工作日 ' })
assert.equal(card.data.videoMetaText, '45 秒 · 2 条成片 · 5 个工作日')
update({ finishedVideoCount: '3 条成片', deliveryCycle: '次日交付' })
assert.equal(card.data.videoMetaText, '3 条成片 · 次日交付')
update({ videoDuration: '60 秒', finishedVideoCount: ' 1 ', deliveryCycle: '' })
assert.equal(card.data.videoMetaText, '60 秒 · 1 条成片')
update({ durationText: ' 60秒 ' })
assert.equal(card.data.videoMetaText, '60秒', 'Use the duration field actually configured in the admin form')
update({ videoDuration: ' ', durationText: '45秒' })
assert.equal(card.data.videoMetaText, '45秒')
update({ videoDuration: '30秒', durationText: '45秒' })
assert.equal(card.data.videoMetaText, '30秒', 'A configured videoDuration takes precedence')
update({ videoDuration: 30, durationText: '45秒' })
assert.equal(card.data.videoMetaText, '30 秒', 'Numeric admin durations are seconds')
update({ videoDuration: '1 分钟' })
assert.equal(card.data.videoMetaText, '1 分钟', 'Existing duration units must not be duplicated')
update({ videoDuration: 0, durationText: '45秒' })
assert.equal(card.data.videoMetaText, '0 秒', 'Zero must not fall through to durationText')

// A configured zero is preserved; empty strings and nullish/non-text values are omitted.
update({ videoDuration: 0, finishedVideoCount: 0, deliveryCycle: ' ' })
assert.equal(card.data.videoMetaText, '0 秒 · 0 条成片')
update({ videoDuration: null, finishedVideoCount: '0', deliveryCycle: undefined })
assert.equal(card.data.videoMetaText, '0 条成片')
update({ videoDuration: NaN, finishedVideoCount: false, deliveryCycle: {} })
assert.equal(card.data.videoMetaText, '')

// Whitespace-only primary URLs may fall back to a configured preview URL.
update({ _id: 'video-a', videoUrl: ' ', previewVideoUrl: ' https://example.test/preview.mp4 ', url: 'other', cover: 'cover.jpg' })
assert.equal(card.data.previewVideoUrl, 'https://example.test/preview.mp4')
card.onVideoTap()
assert.equal(events.length, 0, 'Video controls must not dispatch the card navigation event')
card.onVideoPlay()
assert.equal(card.data.isPlaying, true)
card.onVideoPause()
assert.equal(card.data.isPlaying, false)
update({ videoUrl: 'https://example.test/main.mp4', previewVideoUrl: 'https://example.test/lightweight.mp4' })
assert.equal(card.data.previewVideoUrl, 'https://example.test/lightweight.mp4')
update({ url: 'https://example.test/video.mp4', isMainPush: true })
assert.equal(card.data.previewVideoUrl, 'https://example.test/video.mp4')
assert.equal(card.data.marketingBadge, '主推')
update({ videoUrl: 'https://example.test/photo.jpg', videos: [{ url: 'https://example.test/opaque-photo', mimeType: 'image/jpeg' }, { url: 'https://example.test/extra.mp4' }], tags: ['自然', '自然', '电影感'] })
assert.equal(card.data.previewVideoUrl, 'https://example.test/extra.mp4', 'Image media must not expose a video preview action')
assert.deepEqual(Array.from(card.data.displayTags), ['自然', '电影感'])
update({ isHotSale: true, isMainPush: true, isHot: true })
assert.equal(card.data.marketingBadge, '爆款')

// Admin-authored marketing labels remain available beside the card copy during playback.
for (const label of ['主推', '爆款', '新品', '热门']) {
  update({ tags: [label, '电影感', label] })
  assert.equal(card.data.marketingBadge, label)
  assert.deepEqual(Array.from(card.data.displayTags), ['电影感'], 'Do not repeat the highlighted label')
  card.onVideoPlay()
  assert.equal(card.data.marketingBadge, label, 'Playback must retain configured marketing labels')
  card.onVideoPause()
}
update({ tag: '新品', tags: ['热门', '电影感'], serviceTags: ['电影感'], isHotSale: true })
assert.equal(card.data.marketingBadge, '新品', 'Explicit admin labels take precedence over derived legacy flags')
assert.deepEqual(Array.from(card.data.displayTags), ['热门', '电影感'])
update({ tag: '视频摄像', styleTags: '主推，旅途限定', tags: ['主推'] })
assert.equal(card.data.marketingBadge, '主推')
assert.deepEqual(Array.from(card.data.displayTags), ['旅途限定'])
update({ tags: ['热门夜景', '新品质感'] })
assert.equal(card.data.marketingBadge, '', 'Only exact marketing labels are highlighted')
assert.deepEqual(Array.from(card.data.displayTags), ['热门夜景', '新品质感'])
for (const value of [false, 0, '0', 'false', 'off', '', null]) {
  update({ isHotSale: value, isMainPush: value, mainPush: value, isNew: value, isHot: value, hot: value })
  assert.equal(card.data.marketingBadge, '', `Disabled flag ${JSON.stringify(value)} must not invent a label`)
}
for (const value of [true, 1, '1', ' true ']) {
  update({ isNew: value })
  assert.equal(card.data.marketingBadge, '新品')
  assert.equal(card.data.marketingBadgeClass, 'is-new')
}
update({ mainPush: 'true' })
assert.equal(card.data.marketingBadge, '主推')

// Reusing a card for a record without a video must clear both UI state and preview actions.
update(null)
assert.equal(card.data.videoMetaText, '')
assert.equal(card.data.previewVideoUrl, '')
assert.equal(card.data.marketingBadge, '')
card.onVideoTap()
assert.equal(events.length, 0)

// No cover is necessary. Only one card plays at once, and hidden/detached
// pages pause playback so an offscreen card cannot keep its audio playing.
update({ _id: 'no-cover', videoUrl: 'https://example.test/no-cover.mp4' })
card.onVideoPlay()
const second = {
  ...card,
  data: { ...definition.data, item: {}, previewVideoUrl: 'https://example.test/second.mp4' }
}
second.onVideoPlay()
assert.equal(card.data.isPlaying, false)
assert.equal(second.data.isPlaying, true)
assert.equal(playback.at(-1).component, card)
assert.equal(playback.at(-1).action, 'pause')
definition.pageLifetimes.hide.call(second)
assert.equal(second.data.isPlaying, false)
assert.equal(playback.at(-1).component, second)
card.onVideoPlay()
definition.lifetimes.detached.call(card)
assert.equal(card.data.isPlaying, false)

card.onVideoError()
assert.equal(card.data.videoError, true)
assert.equal(card.data.isPlaying, false)
card.retryVideo()
assert.equal(card.data.videoError, false)
assert.equal(playback.at(-1).action, 'play')
assert.equal(playback.at(-1).id, 'product-video')
assert.equal(playback.at(-1).component, card)
card.onVideoPlay()
update({ videoUrl: 'https://example.test/replaced.mp4' })
assert.equal(card.data.isPlaying, false, 'Changing a reused card source stops the old video')
card.onVideoError()
update(null)
assert.equal(card.data.videoError, false, 'A replaced record must not inherit an old playback error')
const operationCount = playback.length
card.retryVideo()
assert.equal(playback.length, operationCount, 'No source must not attempt playback')

update({ _id: 'card-id', spotId: 'spot-a' })
card.onTap()
assert.equal(events.at(-1).name, 'tap')
assert.equal(events.at(-1).detail.id, 'card-id')
assert.equal(events.at(-1).detail.spotId, 'spot-a')
assert.equal(events.at(-1).detail.index, 2)
card.onBook()
assert.equal(events.at(-1).name, 'book')

// The template consumes the states exercised above, including visibility guards.
const template = fs.readFileSync(path.join(componentDir, 'lxm-video-card.wxml'), 'utf8')
assert.match(template, /^<view[^>]+class="video-card[^>]+catchtap="onTap"/, 'The native tap must stop at the card, which emits its own detail event')
assert.match(template, /<video[^>]+src="{{previewVideoUrl}}"/)
assert.ok(template.includes('poster="{{item.cover || \'\'}}"'))
assert.ok(template.includes('class="video-cover-wrap" catchtap="onVideoTap"'))
assert.ok(template.includes('controls show-center-play-btn="{{true}}"'))
assert.ok(template.includes('binderror="onVideoError"'))
assert.ok(template.includes('catchtap="retryVideo"'))
assert.match(template, /<button[^>]+class="video-detail"[^>]+catchtap="onTap"[^>]*>[\s\S]*?查看详情/)
assert.match(template, /class="video-marketing-badge[^>]+wx:if="{{marketingBadge}}"/)
assert.doesNotMatch(template, /marketingBadge && !isPlaying/)
assert.ok(!template.includes('/images/placeholder.png'))
assert.ok(template.includes('wx:if="{{videoMetaText}}">{{videoMetaText}}</text>'))

console.log('PASS video card metadata, configured marketing labels, detail action, native playback, navigation isolation, lifecycle, and retries')
