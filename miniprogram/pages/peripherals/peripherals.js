const app = getApp()
const peripheralApi = require('../../api/peripheral')
const { filterVisibleProducts } = require('../../utils/product')
const { normalizePeripheral } = require('../../utils/peripheralPresentation')
const { openCustomerService } = require('../../service/customerService')

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
    stackRotation: 0
  },

  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || '',
      selectedId: options.id || ''
    })
    wx.setNavigationBarTitle({ title: '影像周边' })
    this.loadPeripherals(true)
  },

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
  },

  contactService() {
    openCustomerService()
  }
})
