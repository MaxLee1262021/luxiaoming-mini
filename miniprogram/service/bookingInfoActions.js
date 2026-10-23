const bookingUtils = require('../utils/booking')
const bookingPicker = require('./bookingPicker')

function resetPickerState() {
  return { pickerCart: [], activePickerPackageId: '', activePickerAlbumId: '' }
}

function openPicker(page) {
  page.setData({ showPicker: true, currentSpotId: '', ...resetPickerState() })
  page.updatePickerLists('')
}

function closePicker(page) {
  page.setData({ showPicker: false, ...resetPickerState() })
}

function switchPickerTab(page, e) {
  page.setData({ currentTab: e.currentTarget.dataset.tab || 'package', activePickerAlbumId: '', activePickerPackageId: '' })
  page.updatePickerLists(page.data.currentSpotId)
}

function onPickerSpotTap(page, e) {
  const spotId = e.currentTarget.dataset.id || ''
  page.setData({ currentSpotId: spotId, selectedSeriesId: '', selectedSeriesName: '', activePickerAlbumId: '', activePickerPackageId: '' })
  page.updatePickerLists(spotId)
}

function onPickerSearch(page, e) {
  page.setData({ pickerKeyword: e.detail.value || '', activePickerPackageId: '', activePickerAlbumId: '' })
  page.updatePickerLists(page.data.currentSpotId)
}

function previewPickerPackage(page, e) {
  const packageId = e.currentTarget.dataset.id || ''
  page.setData({ activePickerPackageId: page.data.activePickerPackageId === packageId ? '' : packageId })
}

function previewPickerPackageSample(page, e) {
  const packageId = e.currentTarget.dataset.id || ''
  const pkg = page.data.filteredPackages.find(item => item._id === packageId) || {}
  const urls = bookingPicker.buildPackagePreviewUrls(pkg, page.data.allAlbums)
  if (urls.length) wx.previewImage({ current: e.currentTarget.dataset.url || urls[0], urls })
}

function togglePickerCart(page, item) {
  if (bookingPicker.hasItem(page.data.items, item)) {
    wx.showToast({ title: '该项目已在预约单中', icon: 'none' })
    return
  }
  page.setData({ pickerCart: bookingPicker.toggleCartItem(page.data.pickerCart, item) })
}

function addPackage(page, e) {
  const packageId = e.currentTarget.dataset.id
  const pkg = page.data.allPackages.find(item => item._id === packageId)
  if (!pkg) return
  const series = page.data.allSeries.find(item => item._id === pkg.seriesId) || {}
  const spotId = pkg.spotId || (Array.isArray(pkg.spotIds) && pkg.spotIds[0]) || page.data.currentSpotId
  const spot = page.data.spotOptions.find(item => item._id === spotId) || {}
  const album = page.data.allAlbums.find(item => item.seriesId === pkg.seriesId) || {}
  togglePickerCart(page, bookingUtils.buildItemFromPackage({ pkg, series, spot, album }))
}

function addSeries(page, e) {
  const seriesId = e.currentTarget.dataset.id
  const series = page.data.allSeries.find(item => item._id === seriesId) || {}
  page.setData({ selectedSeriesId: seriesId, selectedSeriesName: series.name || '', activePickerAlbumId: '', activePickerPackageId: '' })
  page.updatePickerLists(page.data.currentSpotId)
}

function addAlbum(page, e) {
  const albumId = e.currentTarget.dataset.id
  const album = page.data.allAlbums.find(item => item._id === albumId || item.albumId === albumId) || {}
  const series = page.data.allSeries.find(item => item._id === album.seriesId) || {}
  const spotId = album.spotId || page.data.currentSpotId || (Array.isArray(series.spotIds) && series.spotIds[0]) || ''
  const spot = page.data.spotOptions.find(item => item._id === spotId) || {}
  togglePickerCart(page, bookingPicker.buildItemFromAlbum({ album, series, spot }))
}

function previewPickerAlbum(page, e) {
  const albumId = e.currentTarget.dataset.id || ''
  page.setData({ activePickerAlbumId: page.data.activePickerAlbumId === albumId ? '' : albumId })
}

function previewPickerAlbumSample(page, e) {
  const albumId = e.currentTarget.dataset.id || ''
  const album = page.data.allAlbums.find(item => item._id === albumId || item.albumId === albumId) || {}
  const urls = (album.sampleUrls || []).filter(Boolean)
  if (urls.length) wx.previewImage({ current: e.currentTarget.dataset.url || urls[0], urls })
}

function backToSeriesList(page) {
  page.setData({ selectedSeriesId: '', selectedSeriesName: '', activePickerAlbumId: '', activePickerPackageId: '' })
  page.updatePickerLists(page.data.currentSpotId)
}

function removePickerCartItem(page, e) {
  const index = e.currentTarget.dataset.index
  page.setData({ pickerCart: page.data.pickerCart.filter((_, itemIndex) => itemIndex !== index) })
}

function confirmPickerCart(page) {
  if (!page.data.pickerCart.length) {
    wx.showToast({ title: '请先选择拍摄项目', icon: 'none' })
    return
  }
  const combined = [...(page.data.items || []), ...(page.data.pickerCart || [])]
  if (combined.some(item => bookingPicker.isPeripheralItem(item))) {
    wx.showToast({ title: '周边仅支持咨询客服，不能加入预约', icon: 'none' })
    return
  }
  page.setData({
    items: bookingPicker.mergeCartItems(page.data.items, page.data.pickerCart),
    pickerCart: [],
    showPicker: false
  })
  page.updateTotalPrice()
}

function removeItem(page, e) {
  const index = e.currentTarget.dataset.index
  page.setData({ items: page.data.items.filter((_, itemIndex) => itemIndex !== index) })
  page.updateTotalPrice()
}

function useBoundPhone(page) {
  if (!page.data.boundPhone) {
    wx.showToast({ title: '暂无微信绑定手机号', icon: 'none' })
    return
  }
  page.setData({
    phone: page.data.boundPhone,
    phoneMode: 'wechat',
    contactPhones: bookingPicker.mergeContactPhones(page.data.contactPhones, [page.data.boundPhone])
  })
}

function addNewPhone(page) {
  page.setData({ phone: '', phoneMode: 'custom' })
}

function addContactPhone(page) {
  const phone = String(page.data.phone || '').trim()
  if (!bookingUtils.isValidPhone(phone)) {
    wx.showToast({ title: '手机号格式错误', icon: 'none' })
    return
  }
  page.setData({ contactPhones: bookingPicker.mergeContactPhones(page.data.contactPhones, [phone]) })
  wx.showToast({ title: '已添加联系电话', icon: 'none' })
}

function removeContactPhone(page, e) {
  const phone = e.currentTarget.dataset.phone || ''
  const contactPhones = (page.data.contactPhones || []).filter(item => item !== phone)
  const nextPhone = page.data.phone === phone ? (contactPhones[0] || page.data.boundPhone || '') : page.data.phone
  page.setData({
    contactPhones,
    phone: nextPhone,
    phoneMode: nextPhone && nextPhone === page.data.boundPhone ? 'wechat' : 'custom'
  })
}

function useContactPhone(page, e) {
  const phone = e.currentTarget.dataset.phone || ''
  if (!phone) return
  page.setData({ phone, phoneMode: phone === page.data.boundPhone ? 'wechat' : 'custom' })
}

module.exports = {
  addAlbum,
  addContactPhone,
  addNewPhone,
  addPackage,
  addSeries,
  backToSeriesList,
  closePicker,
  confirmPickerCart,
  onPickerSearch,
  onPickerSpotTap,
  openPicker,
  previewPickerAlbum,
  previewPickerAlbumSample,
  previewPickerPackage,
  previewPickerPackageSample,
  removeContactPhone,
  removeItem,
  removePickerCartItem,
  switchPickerTab,
  useBoundPhone,
  useContactPhone
}
