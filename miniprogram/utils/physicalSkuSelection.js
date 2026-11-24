const { money, skuLabel } = require('./physical')

function skuOptions(values = []) {
  return values.map(value => {
    const style = String(value.style || value.skuStyle || '').trim()
    const spec = String(value.spec || value.specSnapshot || value.specLabel || '默认规格').trim()
    return {
      ...value,
      id: String(value.skuId || value.id || ''),
      style, spec,
      specLabel: skuLabel({ style, spec }),
      priceText: money(value.price),
      purchasable: value.purchasable !== false && Number(value.availableQuantity ?? value.available ?? 1) > 0
    }
  })
}

// 样式和规格共同定位一个 SKU；只有可售的真实组合才能提交。
function skuSelection(skus, selected = {}) {
  const style = selected.style ?? null
  const spec = selected.spec ?? null
  const styles = [...new Set(skus.map(sku => sku.style))].map(value => ({
    value, label: value || '默认样式',
    available: skus.some(sku => sku.style === value && sku.purchasable)
  }))
  const specs = [...new Set(skus.map(sku => sku.spec))].map(value => ({
    value, label: value,
    available: style !== null && skus.some(sku => sku.style === style && sku.spec === value && sku.purchasable)
  }))
  const sku = skus.find(row => row.style === style && row.spec === spec && row.purchasable) || null
  return { style, spec, styles, specs, sku, hint: style === null ? '请选择样式' : spec === null ? '请选择规格' : sku ? '' : '该组合暂不可售' }
}

function initialSkuSelection(skus, skuId) {
  const current = skuId && skus.find(sku => sku.id === String(skuId))
  if (current) return skuSelection(skus, current)
  if (skus.length === 1) return skuSelection(skus, skus[0])
  const styles = [...new Set(skus.map(sku => sku.style))]
  return skuSelection(skus, { style: styles.length === 1 ? styles[0] : null })
}

function selectSkuStyle(skus, selected, style) {
  if (!skus.some(sku => sku.style === style && sku.purchasable)) return selected
  const spec = skus.some(sku => sku.style === style && sku.spec === selected.spec && sku.purchasable) ? selected.spec : null
  return skuSelection(skus, { style, spec })
}

function selectSkuSpec(skus, selected, spec) {
  if (!skus.some(sku => sku.style === selected.style && sku.spec === spec && sku.purchasable)) return selected
  return skuSelection(skus, { style: selected.style, spec })
}

module.exports = { skuOptions, skuSelection, initialSkuSelection, selectSkuStyle, selectSkuSpec }
