const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const componentDir = path.resolve(__dirname, '../miniprogram/components/lxm-video-card')
let definition
vm.runInNewContext(fs.readFileSync(path.join(componentDir, 'lxm-video-card.js'), 'utf8'), {
  Component(value) { definition = value }
}, { filename: 'lxm-video-card.js' })

const events = []
const card = {
  data: { ...definition.data, item: {}, index: 2 },
  setData(patch) { Object.assign(this.data, patch) },
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
card.onPreview()
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
update({ videoDuration: 0, durationText: '45秒' })
assert.equal(card.data.videoMetaText, '0', 'Zero must not fall through to durationText')

// A configured zero is preserved; empty strings and nullish/non-text values are omitted.
update({ videoDuration: 0, finishedVideoCount: 0, deliveryCycle: ' ' })
assert.equal(card.data.videoMetaText, '0 · 0 条成片')
update({ videoDuration: null, finishedVideoCount: '0', deliveryCycle: undefined })
assert.equal(card.data.videoMetaText, '0 条成片')
update({ videoDuration: NaN, finishedVideoCount: false, deliveryCycle: {} })
assert.equal(card.data.videoMetaText, '')

// Whitespace-only primary URLs may fall back to a configured preview URL.
update({ _id: 'video-a', videoUrl: ' ', previewVideoUrl: ' https://example.test/preview.mp4 ', url: 'other', cover: 'cover.jpg' })
assert.equal(card.data.previewVideoUrl, 'https://example.test/preview.mp4')
card.onPreview()
assert.equal(events.length, 1)
assert.equal(events[0].name, 'preview')
assert.equal(events[0].detail.id, 'video-a')
assert.equal(events[0].detail.url, 'https://example.test/preview.mp4')
assert.equal(events[0].detail.cover, 'cover.jpg')
update({ url: 'https://example.test/video.mp4', isMainPush: true })
assert.equal(card.data.previewVideoUrl, 'https://example.test/video.mp4')
assert.equal(card.data.marketingBadge, '主推')
update({ isHotSale: true, isMainPush: true, isHot: true })
assert.equal(card.data.marketingBadge, '爆款')

// Reusing a card for a record without a video must clear both UI state and preview actions.
update(null)
assert.equal(card.data.videoMetaText, '')
assert.equal(card.data.previewVideoUrl, '')
assert.equal(card.data.marketingBadge, '')
card.onPreview()
assert.equal(events.length, 1)

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
assert.ok(template.includes('wx:if="{{previewVideoUrl}}" catchtap="onPreview"'))
assert.ok(template.includes('wx:if="{{videoMetaText}}">{{videoMetaText}}</text>'))

console.log('PASS video card configured metadata, empty values, URL fallback, preview guards, and existing events')
