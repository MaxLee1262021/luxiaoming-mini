const app = getApp()
const demoData = require('../../utils/demoData')
const peripheralApi = require('../../api/peripheral')
const { buildUrlWithSource } = require('../../utils/query')

Page({
  data: {
    shopId: '',
    scene: '',
    peripherals: [],
    featuredPeripheral: null,
    categories: [
      { label: '全部', value: '' },
      { label: '相册', value: '相册' },
      { label: '相框', value: '相框' },
      { label: '打印', value: '打印' },
      { label: '冰箱贴', value: '冰箱贴' },
      { label: '亚克力', value: '亚克力' },
      { label: '3D', value: '3D' }
    ],
    currentCate: '',
    loading: true,
    degraded: false, // 周边数据拉取失败、正在展示预览数据时置 true（降级提示条）
    allPeripherals: [],
    stackLayers: [],
    stackFront: 0,
    stackRotation: 0
  },

  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || ''
    })
    wx.setNavigationBarTitle({ title: '周边' })
    this.loadPeripherals(true)
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadPeripherals(initRing = false) {
    this.setData({ loading: true })
    try {
      const res = await peripheralApi.getPeripherals({ cate: this.data.currentCate || undefined })
      if (res && res.success) {
        const list = res.data || []
        const patch = { peripherals: list, loading: false, degraded: false }
        if (initRing) {
          patch.allPeripherals = list
          patch.stackRotation = 0
          patch.stackFront = 0
          patch.stackLayers = this.buildStack(list, 0)
        }
        this.setData(patch)
      } else {
        // 后台响应缺少成功标记（罕见，防御分支）：回退演示数据，不算失败
        this.applyDemoPeripherals(initRing)
      }
    } catch (err) {
      console.error(err)
      // 请求失败（网络异常或后台未接通）：回退预览数据兜底 + 顶部降级提示条，客人可重试
      this.applyDemoPeripherals(initRing, true)
    } finally {
      if (!initRing) this.setData({ loading: false })
    }
  },

  // 降级提示条「重新加载」：重新拉真实周边数据，成功后提示条自动消失
  onRetryLoad() {
    this.loadPeripherals(true)
  },

  applyDemoPeripherals(initRing = false, degraded = false) {
    const cate = this.data.currentCate || ''
    const peripherals = cate ? demoData.peripherals.filter(item => item.cate === cate || item.category === cate) : demoData.peripherals
    const patch = { peripherals, loading: false, degraded }
    if (initRing) {
      patch.allPeripherals = demoData.peripherals
      patch.stackRotation = 0
      patch.stackFront = 0
      patch.stackLayers = this.buildStack(demoData.peripherals, 0)
    }
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
      stackLayers: this.buildStack(this.data.allPeripherals, this.data.stackRotation)
    })
  },

  rotateRing(e) {
    const dir = Number(e.currentTarget.dataset.dir) || 1
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
      // 抑制紧随滑动而来的 tap，避免误触卡片详情/置前
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
    const index = e.currentTarget.dataset.index
    const n = this.data.allPeripherals.length
    if (!n) return
    if (index === this.data.stackFront) {
      this.goStackDetail(this.data.allPeripherals[index]._id)
    } else {
      this.setData({ stackRotation: index })
      this.refreshStack()
    }
  },

  goStackDetail(id) {
    wx.navigateTo({ url: this.buildUrl('/pages/peripheralDetail/peripheralDetail', { id }) })
  },

})
