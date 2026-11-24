'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

const filename = path.resolve(__dirname, '../miniprogram/pages/videoProductDetail/videoProductDetail.js')
const samples = [
  { _id: 'photo', type: 'image', url: 'https://example.test/photo.jpg' },
  { _id: 'video-a', type: 'video', url: 'https://example.test/a.mp4', cover: 'https://example.test/a.jpg' },
  { _id: 'video-b', type: 'video', url: 'https://example.test/b.mp4' }
]
const videoEvent = (index, detail = {}) => ({ currentTarget: { dataset: { index } }, detail })
const detailFor = media => ({ product: { _id: 'product' }, spot: {}, samples: media,
  recommendations: [], videoFields: [], packageBenefits: [] })

function loadPage({ legacyPreview = false } = {}) {
  let definition
  const playback = []
  const previews = []
  const toasts = []
  const operations = []
  const wx = {
    createVideoContext(id, page) {
      return {
        play() { playback.push({ action: 'play', id, page }); operations.push('play') },
        pause() { playback.push({ action: 'pause', id, page }); operations.push('pause') },
        requestFullScreen(options) { playback.push({ action: 'fullscreen', id, page, options }); operations.push('fullscreen') }
      }
    },
    previewImage(options) { previews.push(options); operations.push('previewImage') },
    showToast(options) { toasts.push(options) }
  }
  if (!legacyPreview) wx.previewMedia = options => { previews.push(options); operations.push('previewMedia') }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename), getApp() { return {} }, wx, console,
    Page(value) { definition = value }
  }, { filename })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch, done) { Object.assign(this.data, patch); if (done) done() } }
  page.onShow()
  page.applyDetail(detailFor(samples))
  return { page, playback, previews, toasts, operations }
}

test('opening a mixed gallery selects the first playable video and preserves image-only galleries', () => {
  const { page, playback } = loadPage()
  page.applyDetail(detailFor([samples[0], { _id: 'empty-video', type: 'video', url: '' }, samples[2]]))
  assert.equal(page.data.currentSample, 2)
  assert.equal(page.data.samples[page.data.currentSample].url, samples[2].url)
  assert.equal(page.data.isVideoPlaying, false, 'The native play event confirms actual playback')
  assert.equal(playback.length, 0, 'Loading a gallery must not issue pause commands for a missing player')

  page.applyDetail(detailFor([samples[0]]))
  assert.equal(page.data.currentSample, 0)
  page.toggleVideoPlayback()
  page.applyDetail(detailFor([]))
  page.toggleVideoPlayback()
  assert.equal(playback.length, 0, 'Photos and empty galleries must not attempt video playback')
})

test('picture taps pause and continue the current video, and native controls update the same state', () => {
  const { page, playback, previews } = loadPage()
  page.onVideoPlay(videoEvent(1))
  assert.equal(page.data.isVideoPlaying, true)
  page.toggleVideoPlayback()
  assert.equal(playback.at(-1).action, 'pause')
  assert.equal(playback.at(-1).id, 'detail-video')
  assert.equal(playback.at(-1).page, page)
  assert.equal(page.data.isVideoPlaying, false)
  page.onVideoPause(videoEvent(1))
  page.toggleVideoPlayback()
  assert.equal(playback.at(-1).action, 'play')
  assert.equal(page.data.isVideoPlaying, true)

  page.onVideoPause(videoEvent(1))
  assert.equal(page.data.isVideoPlaying, false)
  page.onVideoPlay(videoEvent(1))
  assert.equal(page.data.isVideoPlaying, true)
  assert.deepEqual(playback.map(operation => operation.action), ['pause', 'play'], 'Native events must not toggle playback a second time')
  assert.equal(previews.length, 0, 'Picture taps must stay in the inline player')
})

test('changing samples pauses the old video and ignores its delayed playback and fullscreen events', () => {
  const { page, playback, toasts } = loadPage()
  page.onVideoPlay(videoEvent(1))
  page.onVideoFullscreenChange(videoEvent(1, { fullScreen: true }))
  page.onSampleChange({ detail: { current: 2 } })
  assert.deepEqual(playback.map(operation => operation.action), ['pause'])
  assert.equal(page.data.currentSample, 2)
  assert.equal(page.data.isVideoPlaying, false)
  assert.equal(page.data.isVideoFullscreen, false)

  page.onVideoPlay(videoEvent(2))
  page.onVideoPlay(videoEvent(1))
  page.onVideoPause(videoEvent(1))
  page.onVideoError(videoEvent(1))
  page.onVideoFullscreenChange(videoEvent(1, { fullScreen: true }))
  assert.equal(page.data.isVideoPlaying, true)
  assert.equal(page.data.isVideoFullscreen, false)
  assert.equal(toasts.length, 0)
  page.onSampleChange({ detail: { current: 0 } })
  page.toggleVideoPlayback()
  assert.equal(page.data.isVideoPlaying, false)
  assert.deepEqual(playback.map(operation => operation.action), ['pause', 'pause'])
})

test('invalid or repeated sample-change events do not interrupt the current video', () => {
  const { page, playback } = loadPage()
  page.onVideoPlay(videoEvent(1))
  for (const current of [1, -1, 9, 0.5, 'invalid']) page.onSampleChange({ detail: { current } })
  assert.equal(page.data.currentSample, 1)
  assert.equal(page.data.isVideoPlaying, true)
  assert.equal(playback.length, 0)
})

for (const lifecycle of ['onHide', 'onUnload']) {
  test(`${lifecycle} pauses video and rejects taps or late autoplay while the page is hidden`, () => {
    const { page, playback } = loadPage()
    page.onVideoPlay(videoEvent(1))
    page[lifecycle]()
    assert.equal(page.data.isVideoPlaying, false)
    assert.deepEqual(playback.map(operation => operation.action), ['pause'])
    page.toggleVideoPlayback()
    assert.equal(playback.length, 1)
    page.onVideoPlay(videoEvent(1))
    assert.equal(page.data.isVideoPlaying, false)
    assert.deepEqual(playback.map(operation => operation.action), ['pause', 'pause'])
    if (lifecycle === 'onHide') {
      page.onShow()
      page.toggleVideoPlayback()
      assert.equal(playback.at(-1).action, 'play')
      assert.equal(page.data.isVideoPlaying, true)
    }
  })
}

test('leaving before the first native play event still stops delayed autoplay', () => {
  const { page, playback } = loadPage()
  page.onHide()
  assert.equal(playback.length, 0)
  page.onVideoPlay(videoEvent(1))
  assert.deepEqual(playback.map(operation => operation.action), ['pause'])
  assert.equal(page.data.isVideoPlaying, false)
})

test('fullscreen entry and exit track native state without interrupting playback', () => {
  const { page, playback } = loadPage()
  page.onVideoPlay(videoEvent(1))
  page.onVideoFullscreenChange(videoEvent(1, { fullScreen: true }))
  assert.equal(page.data.isVideoFullscreen, true)
  page.onVideoFullscreenChange(videoEvent(1, { fullScreen: false }))
  assert.equal(page.data.isVideoFullscreen, false)
  assert.equal(page.data.isVideoPlaying, true)
  assert.equal(playback.length, 0)
})

test('the expand action pauses inline playback before opening the selected video in native media preview', () => {
  const { page, playback, previews, operations } = loadPage()
  for (const index of [1, 2]) {
    if (index !== page.data.currentSample) page.onSampleChange({ detail: { current: index } })
    page.onVideoPlay(videoEvent(index))
    page.previewVideo(videoEvent(index))
    assert.equal(previews.at(-1).current, index)
    assert.equal(previews.at(-1).sources[index].type, 'video')
    assert.equal(previews.at(-1).sources[index].url, samples[index].url)
    assert.equal(page.data.isVideoPlaying, false)
  }
  assert.equal(previews[0].sources[1].poster, samples[1].cover)
  assert.deepEqual(playback.map(operation => operation.action), ['pause', 'pause'], 'Expanding must not toggle the inline video back on')
  assert.deepEqual(operations, ['pause', 'previewMedia', 'pause', 'previewMedia'], 'Stop inline sound before opening each video preview')
})

test('older WeChat clients without media preview request fullscreen on the active native player', () => {
  const { page, playback, previews, toasts } = loadPage({ legacyPreview: true })
  page.onVideoPlay(videoEvent(1))
  page.previewVideo(videoEvent(1))
  const request = playback.find(operation => operation.action === 'fullscreen')
  assert.ok(request)
  assert.equal(request.id, 'detail-video')
  assert.equal(request.page, page)
  assert.deepEqual(Object.keys(request.options), [])
  assert.deepEqual(playback.map(operation => operation.action), ['fullscreen'], 'Native fullscreen keeps the current player running')
  assert.equal(page.data.isVideoPlaying, true)
  assert.equal(previews.length, 0, 'A video must never be sent to image-only preview')
  assert.equal(toasts.length, 0)
})

test('playback errors clear playing state and allow a new play attempt', () => {
  const { page, playback, toasts } = loadPage()
  page.onVideoPlay(videoEvent(1))
  page.onVideoError(videoEvent(1))
  assert.equal(page.data.isVideoPlaying, false)
  assert.equal(toasts.length, 1)
  assert.equal(toasts[0].icon, 'none')
  page.toggleVideoPlayback()
  assert.equal(playback.at(-1).action, 'play')
  page.onVideoPlay(videoEvent(1))
  assert.equal(page.data.isVideoPlaying, true)
})

test('refreshing gallery data stops an existing player and resets its playback/fullscreen state', () => {
  const { page, playback } = loadPage()
  page.onVideoPlay(videoEvent(1))
  page.onVideoFullscreenChange(videoEvent(1, { fullScreen: true }))
  page.applyDetail(detailFor([samples[2]]))
  assert.deepEqual(playback.map(operation => operation.action), ['pause'])
  assert.equal(page.data.currentSample, 0)
  assert.equal(page.data.isVideoPlaying, false)
  assert.equal(page.data.isVideoFullscreen, false)
})

test('image preview keeps mixed-media indexes and the legacy image-only fallback', () => {
  const { page, playback, previews } = loadPage()
  page.onSampleChange({ detail: { current: 0 } })
  page.previewVideo(videoEvent(0))
  assert.equal(previews[0].current, 0)
  assert.deepEqual(Array.from(previews[0].sources, source => source.type), ['image', 'video', 'video'])
  assert.equal(previews[0].sources[0].url, samples[0].url)
  assert.equal(previews[0].sources[1].poster, samples[1].cover)
  assert.equal(playback.length, 0)

  const legacy = loadPage({ legacyPreview: true })
  legacy.page.previewVideo(videoEvent(0))
  assert.equal(legacy.previews[0].current, samples[0].url)
  assert.deepEqual(Array.from(legacy.previews[0].urls), [samples[0].url])
})

test('the active inline player wires autoplay, an expand icon, and an independent picture-tap area', () => {
  const template = fs.readFileSync(filename.replace(/\.js$/, '.wxml'), 'utf8')
  const video = template.match(/<video\b[\s\S]*?>/)[0]
  assert.match(video, /wx:if="{{index === currentSample}}"/)
  assert.match(video, /\sautoplay\s/)
  assert.match(video, /\scontrols\s/)
  assert.match(video, /show-fullscreen-btn="{{false}}"/, 'The native fullscreen button must not duplicate the working expand icon')
  assert.doesNotMatch(video, /(?:bind|catch)tap=/, 'Native control taps must not also toggle picture playback')
  assert.match(template, /<cover-view[^>]*catchtap="toggleVideoPlayback"/)
  const expand = template.match(/<cover-view[^>]*class="video-expand"[^>]*>/)[0]
  assert.match(expand, /catchtap="previewVideo"/)
  assert.match(expand, /data-index="{{index}}"/, 'Expand must preview the selected sample, including videos after the first one')
  for (const [event, handler] of Object.entries({ play: 'onVideoPlay', pause: 'onVideoPause', ended: 'onVideoPause', error: 'onVideoError', fullscreenchange: 'onVideoFullscreenChange' })) {
    assert.ok(video.includes(`bind${event}="${handler}"`), `Wire native ${event} events to the state exercised above`)
  }
})
