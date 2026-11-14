const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { normalizeAlbumPresentation } = require('../miniprogram/utils/albumPresentation')
const { buildBookingAlbums } = require('../miniprogram/service/homeData')
const { buildRelatedPhotoCollections } = require('../miniprogram/service/relatedPhotoCollections')

const photo = {
  _id: 'photo-garden', name: '春日花园照片单品', seriesId: 'spring', seriesName: '春日清新系列',
  photoCount: 6, price: 699, originalPrice: 899,
  cover: '/selected-cover.jpg', sampleUrls: ['/preview.jpg', '/selected-cover.jpg'],
  tags: ['自然光', '清新'], styleTags: ['清新', '花园'],
  retouchMode: 'count', retouchCount: 3, makeupIncluded: true,
  shootingNotes: '提前沟通拍摄时间。\n请按约定时间到达。',
  spotBindingExplicit: true, spotId: '', spotIds: []
}
const series = [{ _id: 'spring', name: '春日清新系列', spotIds: ['series-spot'] }]
const spots = [{ _id: 'series-spot', name: '系列打卡点' }]
const normalized = normalizeAlbumPresentation(photo)
assert.equal(normalized.photoCount, 6, 'Delivery count must remain independent from previews')
assert.equal(normalized.retouchText, '3 张')
assert.equal(normalized.makeupText, '包含')
assert.deepEqual(normalized.displayTags, ['自然光', '清新', '花园'])
assert.deepEqual(normalized.sampleUrls, ['/selected-cover.jpg', '/preview.jpg'])
assert.equal(normalized.cover, normalized.sampleUrls[0], 'Card cover and initial detail image must match')
assert.equal(normalizeAlbumPresentation({ sampleUrls: ['/a.jpg', '/b.jpg'], sampleCount: 2 }).photoCount, 0)
assert.equal(normalizeAlbumPresentation({ photoCount: 0, sampleUrls: ['/a.jpg'] }).photoCount, 0)
assert.equal(normalizeAlbumPresentation({ retouchMode: 'included', retouchCount: 9 }).retouchText, '包含')
assert.equal(normalizeAlbumPresentation({ retouchMode: 'excluded', retouchCount: 9 }).retouchText, '不包含')
assert.equal(normalizeAlbumPresentation({ retouchCount: 9 }).retouchText, '9 张')
assert.equal(normalizeAlbumPresentation({ retouchCount: 0 }).retouchText, '不包含')
assert.equal(normalizeAlbumPresentation({ retouchIncluded: true }).retouchText, '包含')
assert.equal(normalizeAlbumPresentation({ makeupIncluded: false }).makeupText, '不包含')
assert.deepEqual(normalizeAlbumPresentation({ samples: [{ url: '/object-preview.jpg' }] }).sampleUrls, ['/object-preview.jpg'])
assert.deepEqual(normalizeAlbumPresentation({ sampleUrls: [], samples: ['/deleted.jpg'] }).sampleUrls, [], 'Deleted previews must not reappear through a legacy image field')

const homeAlbum = buildBookingAlbums([photo], series, spots)[0]
assert.equal(homeAlbum.photoCount, 6)
assert.equal(homeAlbum.sampleCount, 6)
assert.equal(homeAlbum.cover, normalized.cover)
assert.equal(homeAlbum.spotId, '', 'An explicitly unlinked product cannot inherit its series location')
const related = buildRelatedPhotoCollections({ _id: 'other' }, [], { albums: [photo], allSeries: series, spots })[0]
assert.equal(related.spotId, '')
assert.equal(related.cover, normalized.cover)

let cardDefinition
global.Component = definition => { cardDefinition = definition }
require('../miniprogram/components/lxm-album-card/lxm-album-card')
const card = { data: {}, setData(patch) { Object.assign(this.data, patch) } }
cardDefinition.observers.item.call(card, photo)
assert.equal(card.data.album.photoCount, 6)
assert.equal(card.data.album.cover, normalized.cover)

let pageDefinition
global.wx = {
  getStorageSync() { return '' },
  getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } } }
}
global.getApp = () => ({ captureSource: () => ({}) })
global.Page = definition => { pageDefinition = definition }
require('../miniprogram/pages/photoCollection/photoCollection')
const page = Object.assign({}, pageDefinition, {
  data: { ...JSON.parse(JSON.stringify(pageDefinition.data)), pendingAlbumId: photo._id },
  setData(patch) { Object.assign(this.data, patch) }
})
page.applyCollectionData({ series: series[0], currentCollection: photo, collections: [photo] })
assert.equal(page.data.isAlbumDetail, true)
assert.equal(page.data.currentCollection.retouchText, '3 张')
assert.equal(page.data.currentCollection.makeupText, '包含')
assert.equal(page.data.currentCollection.price, 699)
assert.equal(page.data.currentCollection.seriesName, '春日清新系列')
assert.deepEqual(page.data.currentCollection.sampleUrls, normalized.sampleUrls)
assert.deepEqual(page.data.instructions, ['提前沟通拍摄时间。', '请按约定时间到达。'])
assert.deepEqual(page.data.spots, [])
const markup = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/photoCollection/photoCollection.wxml'), 'utf8')
assert.match(markup, /currentCollection\.retouchText/)
assert.match(markup, /currentCollection\.makeupText/)
assert.match(markup, /currentCollection\.displayTags/)
assert.doesNotMatch(markup, /currentCollection\.originalPrice/)
console.log('PASS photo product fields, delivery count, cover parity, service states, tags, notes and optional spot binding')
