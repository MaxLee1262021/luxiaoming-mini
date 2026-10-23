const demo = require('../miniprogram/utils/demoData')
const detail = require('../miniprogram/service/packageDetail')
const pkg = (demo.packages || []).find(p => p.includedItems && p.includedItems.length)
if (!pkg) throw new Error('No package with includedItems')
const built = detail.buildPhotoPackageDetail(demo.getSeriesDetail({ packageId: pkg._id }), { packageId: pkg._id })
const items = built.includedItems || []
if (!items.length || !items.every(item => item.target)) throw new Error('Included item target missing')
console.log(`included item targets PASS (${items.length} items)`)
