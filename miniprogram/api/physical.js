const { callCloud } = require('./client')

const actions = [
  'getPhysicalCatalog', 'getPhysicalCart', 'updatePhysicalCart',
  'getShippingAddresses', 'saveShippingAddress', 'deleteShippingAddress', 'setDefaultShippingAddress',
  'previewPhysicalCheckout', 'createPhysicalOrder', 'getPhysicalOrders', 'getPhysicalOrder',
  'getPhysicalOrderCounts', 'createPhysicalPayment', 'getPhysicalPaymentStatus',
  'cancelPhysicalOrder', 'confirmPhysicalReceipt', 'requestPhysicalAddressChange',
  'createPhysicalAfterSale', 'getPhysicalAfterSales', 'getPhysicalLogistics', 'updatePhysicalReturnShipment'
]
const api = {}
actions.forEach(name => {
  api[name] = async (data = {}) => {
    if (name === 'createPhysicalPayment') await require('../service/merchantShare').ensureScanSynced()
    const result = await callCloud(name, data)
    if (!result || result.success === false) throw new Error(result && result.error || '请求失败，请重试')
    return result.data === undefined ? result : result.data
  }
})
module.exports = api
