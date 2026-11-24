const app = getApp()
const peripheralApi = require('../../api/peripheral')
const { filterVisibleProducts } = require('../../utils/product')
const { normalizePeripheral } = require('../../utils/peripheralPresentation')
const physicalApi = require('../../api/physical')
const { rows: physicalRows, money, newKey } = require('../../utils/physical')
const { skuOptions, initialSkuSelection, selectSkuStyle, selectSkuSpec } = require('../../utils/physicalSkuSelection')

const PURCHASE_REASON_TEXT = {
  '商品购买暂未开放': '商城暂未开放购买，请稍后再来。',
  '定制商品请咨询客服': '该商品需要照片定制，请联系客服确认制作要求。',
  '商品暂不可购买': '该商品尚未开放购买，请联系客服了解。',
  '库存或销售参数未就绪': '该商品的库存或配送信息待商家确认，请联系客服。'
}

Page({
  data: {
    shopId: '',
    scene: '',
    selectedId: '',
    peripherals: [],
    featuredPeripheral: null,
    currentCate: '',
    loading: true,
    degraded: false, // 周边数据拉取失败、显示加载失败提示
    allPeripherals: [],
    stackLayers: [],
    stackFront: 0,
    stackRotation: 0,
    cartNavTopPx: 26,
    cartQuantity: 0,
    purchaseVisible: false,
    purchaseProduct: null,
    purchaseSkus: [],
    purchaseSelection: { style: null, spec: null, styles: [], specs: [], hint: '' },
    purchasePriceText: '',
    selectedSku: null,
    purchaseQuantity: 1,
    purchaseMode: 'cart',
    purchaseBusy: false,
    purchaseError: ''
  },

  onLoad(options = {}) {
    this.initCartPosition()
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || '',
      selectedId: options.id || ''
    })
    wx.setNavigationBarTitle({ title: '影像周边' })
    this.loadPeripherals(true)
  },

  onShow() { this.loadCartCount() },

  initCartPosition() {
    try {
      const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
      const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      this.setData({ cartNavTopPx: menu && menu.top ? menu.top : (system.statusBarHeight || 20) + 8 })
    } catch (_) {
      // 与导航栏使用相同的默认位置。
    }
  },

  async loadCartCount() {
    const { getOpenid, isLoggedOut } = require('../../api/client')
    const request = this._cartCountRequest = (this._cartCountRequest || 0) + 1
    const openid = getOpenid()
    if (this._cartCountOpenid !== openid || !openid || isLoggedOut()) {
      this._cartCountOpenid = openid
      this.setData({ cartQuantity: 0 })
    }
    if (!openid || isLoggedOut()) return
    try {
      const cart = await physicalApi.getPhysicalCart()
      if (request !== this._cartCountRequest) return
      if (getOpenid() !== openid || isLoggedOut()) {
        this.setData({ cartQuantity: 0 })
        return
      }
      const total = cart && cart.totalQuantity
      const quantity = Number(total)
      const cartQuantity = total !== undefined && total !== null && total !== '' && Number.isInteger(quantity) && quantity >= 0
        ? quantity
        : physicalRows(cart).reduce((sum, row) => {
          const count = Number(row.quantity)
          return sum + (Number.isInteger(count) && count > 0 ? count : 0)
        }, 0)
      this.setData({ cartQuantity })
    } catch (_) {
      if (request === this._cartCountRequest && (getOpenid() !== openid || isLoggedOut())) this.setData({ cartQuantity: 0 })
    }
  },

  goCart() { wx.navigateTo({ url: '/pages/physicalCart/physicalCart' }) },

  async openPurchase(e) {
    if (this.data.purchaseBusy || !this.data.featuredPeripheral) return
    const mode = e.currentTarget.dataset.mode || 'cart'
    const featured = this.data.featuredPeripheral
    this.setData({ purchaseBusy: true, purchaseError: '' })
    try {
      const result = await physicalApi.getPhysicalCatalog({ id: featured._id || featured.id })
      const featuredId = String(featured._id || featured.id)
      const candidates = [...physicalRows(result), result.product, result]
      const product = candidates.find(row => row && String(row.id || row.productId || row._id) === featuredId)
      const skus = skuOptions(physicalRows(product && product.skus))
      if (!product || product.purchasable === false || !skus.some(sku => sku.purchasable)) {
        const reason = product && (product.disabledReason || product.unavailableReason || product.reason)
        const message = PURCHASE_REASON_TEXT[reason] || reason || (result.enabled === false
          ? '商城暂未开放购买，请稍后再来。'
          : !product ? '该商品已下架或不再出售，请选择其他商品。' : '该商品暂时无法购买，请联系客服了解详情。')
        wx.showModal({
          title: mode === 'direct' ? '暂时无法购买' : '暂时无法加入购物车',
          content: message,
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }
      const prices = skus.filter(sku => sku.purchasable && sku.price !== null && sku.price !== undefined && Number.isFinite(Number(sku.price))).map(sku => Number(sku.price))
      const minPrice = Math.min(...prices), maxPrice = Math.max(...prices)
      const purchasePriceText = !prices.length ? '—' : minPrice === maxPrice ? money(minPrice) : `${money(minPrice)}–${money(maxPrice)}`
      const purchaseSelection = initialSkuSelection(skus)
      this.setData({ purchaseVisible: true, purchaseProduct: { ...product, id: product.id || product.productId || featured._id, cover: product.cover || featured.cover || '/images/placeholder.png' }, purchaseSkus: skus, purchaseSelection, purchasePriceText, selectedSku: purchaseSelection.sku, purchaseQuantity: 1, purchaseMode: mode })
    } catch (error) { wx.showToast({ title: error.message || '购买信息暂不可用', icon: 'none' }) }
    finally { this.setData({ purchaseBusy: false }) }
  },

  selectPurchaseStyle(e) {
    if (this.data.purchaseBusy) return
    this.applyPurchaseSelection(selectSkuStyle(this.data.purchaseSkus, this.data.purchaseSelection, e.currentTarget.dataset.value))
  },
  selectPurchaseSpec(e) {
    if (this.data.purchaseBusy) return
    this.applyPurchaseSelection(selectSkuSpec(this.data.purchaseSkus, this.data.purchaseSelection, e.currentTarget.dataset.value))
  },
  applyPurchaseSelection(purchaseSelection) {
    const sku = purchaseSelection.sku
    const available = sku ? Number(sku.availableQuantity ?? sku.available) : NaN
    const quantity = Number.isFinite(available) ? Math.min(this.data.purchaseQuantity, available) : this.data.purchaseQuantity
    this.setData({ purchaseSelection, selectedSku: sku, purchaseQuantity: quantity, purchaseError: '' })
  },
  purchaseQuantityChange(e) {
    if (this.data.purchaseBusy) return
    const quantity = e.detail && e.detail.value !== undefined ? Number(e.detail.value) : this.data.purchaseQuantity + Number(e.currentTarget.dataset.delta)
    const sku = this.data.selectedSku
    const available = sku ? Number(sku.availableQuantity ?? sku.available) : NaN
    if (!Number.isInteger(quantity) || quantity < 1 || (Number.isFinite(available) && quantity > available)) {
      this.setData({ purchaseQuantity: this.data.purchaseQuantity, purchaseError: quantity < 1 ? '数量至少为1' : Number.isFinite(available) && quantity > available ? '购买数量超过当前可售数量' : '请输入有效的购买数量' })
      return
    }
    this.setData({ purchaseQuantity: quantity, purchaseError: '' })
  },
  closePurchase() { if (!this.data.purchaseBusy) this.setData({ purchaseVisible: false }) },
  async confirmPurchase() {
    if (this.data.purchaseBusy) return
    const sku = this.data.selectedSku
    if (!sku) return this.setData({ purchaseError: this.data.purchaseSelection.hint || '请选择样式和规格' })
    const quantity = this.data.purchaseQuantity
    const available = Number(sku.availableQuantity ?? sku.available)
    if (!Number.isInteger(quantity) || quantity < 1 || (Number.isFinite(available) && quantity > available)) return this.setData({ purchaseError: '购买数量超过当前可售数量' })
    this.setData({ purchaseBusy: true, purchaseError: '' })
    try {
      const { login, isLoggedOut } = require('../../api/client')
      if (isLoggedOut()) throw new Error('当前已退出登录，请到“我的”重新授权')
      await login()
      const selection = { productId: this.data.purchaseProduct.id, skuId: sku.id, quantity }
      if (this.data.purchaseMode === 'direct') {
        wx.navigateTo({ url: '/pages/physicalCheckout/physicalCheckout?checkoutSource=direct&productId=' + encodeURIComponent(selection.productId) + '&skuId=' + encodeURIComponent(selection.skuId) + '&quantity=' + quantity })
      } else {
        await physicalApi.updatePhysicalCart({ operation: 'add', ...selection, idempotencyKey: newKey() })
        wx.showToast({ title: '已加入购物车', icon: 'success' })
        await this.loadCartCount()
      }
      this.setData({ purchaseVisible: false })
    } catch (error) { this.setData({ purchaseError: error.message || '操作未完成，请重试' }) }
    finally { this.setData({ purchaseBusy: false }) }
  },

  noop() {},

  initialStack(list, keepCurrent = false) {
    const selectedId = keepCurrent && this.data.featuredPeripheral ? this.data.featuredPeripheral._id : this.data.selectedId
    const selected = list.findIndex(item => String(item._id) === String(selectedId))
    const front = selected < 0 ? 0 : selected
    return {
      allPeripherals: list,
      stackRotation: front,
      stackFront: front,
      stackLayers: this.buildStack(list, front),
      featuredPeripheral: list[front] || null
    }
  },

  async loadPeripherals(initRing = false) {
    this.setData({ loading: true })
    try {
      const res = await peripheralApi.getPeripherals({ cate: this.data.currentCate || undefined })
      if (res && res.success) {
        const list = filterVisibleProducts(res.data || []).map(normalizePeripheral)
        const patch = { peripherals: list, loading: false, degraded: false }
        Object.assign(patch, this.initialStack(list, !initRing))
        this.setData(patch)
      } else {
        this.applyLoadFailure(initRing)
      }
    } catch (err) {
      console.error(err)
      // 请求失败时清空商品并提示重试。
      this.applyLoadFailure(initRing)
    } finally {
      if (!initRing) this.setData({ loading: false })
    }
  },

  // 降级提示条「重新加载」：重新拉真实周边数据，成功后提示条自动消失
  onRetryLoad() {
    this.loadPeripherals(true)
  },

  applyLoadFailure(initRing = false) {
    const patch = { peripherals: [], loading: false, degraded: true }
    Object.assign(patch, this.initialStack([], !initRing))
    this.setData(patch)
  },


  buildStack(list, rotation) {
    const n = list.length
    if (!n) return []
    const front = ((rotation % n) + n) % n
    // 偏移走 margin(rpx, 真机100%可靠); transform 只留 scale+rotate(无单位兼容问题)
    const baseW = 460
    const baseH = 580
    const cfg = [
      { scale: 1,    dx: 0,   dy: 0,   rot: 0, op: 1    },
      { scale: 0.80, dx: -52, dy: -72, rot: -4, op: 0.80 },
      { scale: 0.64, dx: 66,  dy: -150, rot: 5, op: 0.50 }
    ]
    const layers = []
    const layerCount = Math.min(3, n)
    for (let layer = 0; layer < layerCount; layer++) {
      const idx = (front + layer) % n
      const item = list[idx]
      const c = cfg[layer]
      const ml = Math.round(-baseW / 2 + c.dx)
      const mt = Math.round(-baseH / 2 + c.dy)
      layers.push(Object.assign({}, item, {
        _index: idx,
        isFront: layer === 0,
        layer,
        stackStyle: `margin-left:${ml}rpx;margin-top:${mt}rpx;transform:scale(${c.scale}) rotate(${c.rot}deg);opacity:${c.op};z-index:${30 - layer * 10};`
      }))
    }
    return layers
  },

  refreshStack() {
    const n = this.data.allPeripherals.length
    if (!n) return
    const rot = ((this.data.stackRotation % n) + n) % n
    this.setData({
      stackFront: rot,
      stackLayers: this.buildStack(this.data.allPeripherals, this.data.stackRotation),
      featuredPeripheral: this.data.allPeripherals[rot]
    })
  },

  rotateRing(e) {
    const dir = Number(typeof e === 'number' ? e : e.currentTarget.dataset.dir) || 1
    const n = this.data.allPeripherals.length
    if (!n) return
    const rot = ((this.data.stackRotation + dir) % n + n) % n
    this.setData({ stackRotation: rot })
    this.refreshStack()
  },

  // 手指轻扫即切换：卡片不跟手，松手超过阈值才切，与按钮同一套动效
  onStackTouchStart(e) {
    const t = e.touches[0]
    this._sx = t.clientX
    this._sy = t.clientY
    this._swiping = false
    this._suppressTap = false
  },

  onStackTouchMove(e) {
    const t = e.touches[0]
    const dx = t.clientX - this._sx
    const dy = t.clientY - this._sy
    // 仅当水平位移占主导时标记为滑动，避免与竖向滚动/点按冲突
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      this._swiping = true
    }
  },

  onStackTouchEnd(e) {
    const t = e.changedTouches[0]
    const dx = t.clientX - this._sx
    const dy = t.clientY - this._sy
    if (this._swiping && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      // 抑制紧随滑动而来的 tap，避免误触后层卡片置前
      this._suppressTap = true
      this.rotateRing(dx < 0 ? 1 : -1) // 左滑看下一件，右滑看上一件
    }
    this._swiping = false
  },

  onStackTap(e) {
    if (this._suppressTap) {
      this._suppressTap = false
      return
    }
    const index = Number(e.currentTarget.dataset.index)
    const n = this.data.allPeripherals.length
    if (!n || !Number.isInteger(index) || index < 0 || index >= n) return
    this.setData({ stackRotation: index })
    this.refreshStack()
  },

  previewPeripheralMedia(e) {
    const gallery = this.data.featuredPeripheral && this.data.featuredPeripheral.gallery || []
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !gallery[index]) return
    const current = gallery[index]
    const fail = () => wx.showToast({ title: '素材暂时无法预览，请稍后重试', icon: 'none' })
    if (current.type === 'image') {
      wx.previewImage({ current: current.url, urls: gallery.filter(item => item.type === 'image').map(item => item.url), fail })
    } else if (typeof wx.previewMedia === 'function') {
      wx.previewMedia({
        current: index,
        sources: gallery.map(item => ({ url: item.url, type: item.type, ...(item.poster ? { poster: item.poster } : {}) })),
        fail
      })
    } else {
      wx.showToast({ title: '请升级微信后预览视频', icon: 'none' })
    }
  }
})
