// A city selected in Explore is shared by Home and survives tab caching.
// Scanning a new merchant code establishes a fresh city context.
const STORAGE_KEY = 'lxm_selected_city'
// Older values also contained automatic defaults. Only explicit selections
// written with this version may override the current first enabled city.
const SELECTION_VERSION = 2

function getCity() {
  try {
    const value = wx.getStorageSync(STORAGE_KEY)
    return value && typeof value === 'object' && value.selectionVersion === SELECTION_VERSION ? value : {}
  } catch (_) { return {} }
}

function setCity(value = {}) {
  const city = {
    cityId: String(value.cityId || value.value || ''),
    city: String(value.city || value.name || ''),
    selectionVersion: SELECTION_VERSION
  }
  try { wx.setStorageSync(STORAGE_KEY, city) } catch (_) {}
  return city
}

module.exports = { getCity, setCity }
