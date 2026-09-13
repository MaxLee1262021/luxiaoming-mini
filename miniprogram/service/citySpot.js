const { normalizeToGcj02 } = require('../utils/coord')

function idOf(item = {}) {
  return String(item._id || item.id || item.cityId || item.code || item.name || '')
}

function toNumber(value, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

function hasCoordinates(item = {}) {
  return toNumber(item.latitude, -90, 90) !== null && toNumber(item.longitude, -180, 180) !== null
}

function normalizeCityOptions(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter(item => item && item.name)
    .map(item => {
      const name = String(item.name)
      const disabled = item.enabled === false
      return {
        name,
        displayName: disabled ? `${name}（敬请期待）` : name,
        value: idOf(item),
        cityId: String(item._id || item.id || item.cityId || ''),
        code: String(item.code || ''),
        count: Number(item.spotCount || 0),
        disabled,
        latitude: toNumber(item.latitude, -90, 90),
        longitude: toNumber(item.longitude, -180, 180),
        coordType: String(item.coordType || 'gcj02').toLowerCase()
      }
    })
    .filter(item => item.value)
}

function findCity(options = [], value = '') {
  return (options || []).find(item => String(item.value) === String(value)) || null
}

function spotMatchesCity(spot = {}, city = null) {
  if (!city) return false
  const spotCityId = String(spot.cityId || '')
  if (spotCityId && [city.value, city.cityId, city.code].filter(Boolean).map(String).includes(spotCityId)) return true
  const spotCity = String(spot.city || spot.cityName || '')
  return !!spotCity && spotCity === String(city.name || '')
}

function mapCenterForCity(city = null, fallback = {}) {
  if (city && hasCoordinates(city)) {
    return normalizeToGcj02(Number(city.latitude), Number(city.longitude), city.coordType)
  }
  return {
    latitude: Number(fallback.latitude) || 0,
    longitude: Number(fallback.longitude) || 0
  }
}

module.exports = {
  findCity,
  hasCoordinates,
  mapCenterForCity,
  normalizeCityOptions,
  spotMatchesCity
}
