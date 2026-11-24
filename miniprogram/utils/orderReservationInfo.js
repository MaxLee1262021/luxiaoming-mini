const { displayText, itemQuantity } = require('./productDisplay')

const FIELDS = ['projectName', 'priceText', 'date', 'timePeriod', 'spotNamesText', 'seriesName', 'contactName', 'contactPhone', 'contactWechat', 'message']

function firstText(...values) {
  return values.map(displayText).find(Boolean) || ''
}

function uniqueText(values = []) {
  return [...new Set(values.map(displayText).filter(Boolean))].join('、')
}

function priceNumber(value) {
  const text = displayText(value)
  return text !== '' && Number.isFinite(Number(text)) && Number(text) >= 0 ? Number(text) : null
}

function reservationPrice(snapshot = {}, items = [], order = {}) {
  for (const value of [snapshot.totalPrice, snapshot.totalAmount]) {
    const price = priceNumber(value)
    if (price !== null) return `¥${price}`
  }
  if (items.length) {
    const prices = items.map(item => priceNumber(item.unitPrice ?? item.price))
    if (prices.every(price => price !== null)) {
      const total = prices.reduce((sum, price, index) => sum + price * itemQuantity(items[index]), 0)
      return `¥${Math.round((total + Number.EPSILON) * 100) / 100}`
    }
    return ''
  }
  for (const value of [snapshot.price, order.packagePrice]) {
    const price = priceNumber(value)
    if (price !== null) return `¥${price}`
  }
  return ''
}

function buildOrderReservationInfo(order = {}, rawItems = [], applicableSpots = []) {
  // normalizeOrder replaces packageSnapshot with the confirmed service view.
  // Preserve this separate submission view when normalizing its result again.
  const saved = order.reservationInfo
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    const info = FIELDS.reduce((result, key) => {
      result[key] = displayText(saved[key])
      return result
    }, {})
    return { ...info, timeText: [info.date, info.timePeriod].filter(Boolean).join(' ') }
  }

  const snapshot = order.packageSnapshot && typeof order.packageSnapshot === 'object' && !Array.isArray(order.packageSnapshot)
    ? order.packageSnapshot : {}
  const snapshotItems = Array.isArray(snapshot.items) ? snapshot.items : []
  const items = (snapshotItems.length ? snapshotItems : rawItems).filter(item => item && typeof item === 'object')
  const date = firstText(order.intentDate, order.expectedDate, order.requestedDate)
  const timePeriod = firstText(order.intentTimePeriod, order.expectedTimePeriod, order.requestedTimePeriod)
  const submittedSpots = items.filter(item => item.custom === true || item.productType === 'custom' || item.type === 'custom')
    .map(item => item.requestedSpot)

  return {
    projectName: uniqueText(items.map(item => firstText(item.name, item.title, item.packageName, item.albumName, item.peripheralName)))
      || firstText(snapshot.name, snapshot.packageName, order.packageName),
    priceText: reservationPrice(snapshot, items, order),
    date,
    timePeriod,
    timeText: [date, timePeriod].filter(Boolean).join(' '),
    spotNamesText: uniqueText([...applicableSpots.map(spot => spot.name), ...submittedSpots]),
    seriesName: uniqueText(items.map(item => item.seriesName)) || firstText(snapshot.seriesName, order.seriesName),
    contactName: firstText(order.contactName, order.name),
    contactPhone: firstText(order.contactPhone, order.phone),
    contactWechat: firstText(order.contactWechat, order.wechat),
    message: displayText(order.message ?? order.customerRemark ?? order.remark)
  }
}

module.exports = { buildOrderReservationInfo }
