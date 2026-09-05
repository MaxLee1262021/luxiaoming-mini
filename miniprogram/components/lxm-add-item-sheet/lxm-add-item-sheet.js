// components/lxm-add-item-sheet/lxm-add-item-sheet.js
// 添加拍摄项目 半截弹窗：搜索打卡点 → 打卡点面板（类目横排 + 弹窗内展开 + 约拍定制兜底）
// 对外属性：visible / spots / products
// 对外事件：bind:confirm（detail={items}） / bind:close
Component({
  properties: {
    visible: { type: Boolean, value: false },
    spots: { type: Array, value: [] },
    products: { type: Array, value: [] }
  },

  data: {
    kw: '',
    activeSpotId: '',
    expanded: '',
    suggestList: [],
    spotsView: [],
    panel: null,
    cart: [],
    cartMap: {}
  },

  observers: {
    'visible, spots, products': function (visible, spots, products) {
      this.setData({ spotsView: this.buildSpotView() })
      if (visible) {
        this.setData({
          kw: '',
          activeSpotId: '',
          expanded: '',
          cart: [],
          cartMap: {},
          suggestList: [],
          panel: null
        })
      }
    }
  },

  methods: {
    noop() {},

    // 列表页：为每个打卡点标注「专属可拍项目数」（周边全城通用，不计入此数）
    buildSpotView() {
      const products = this.data.products || []
      const spots = this.data.spots || []
      const map = {}
      products.forEach(p => {
        if (p.spotId && p.cat !== 'peripheral') map[p.spotId] = (map[p.spotId] || 0) + 1
      })
      // 默认列表只列「有真实可拍项目」的打卡点；无专属项目的点不在默认列表沉底，
      // 客人搜索命中或无结果时再走「约拍定制」兜底（见 buildSuggest / 面板 showCustom）
      return spots
        .map(s => Object.assign({}, s, { count: map[s._id] || 0 }))
        .filter(s => s.count > 0)
    },

    onInput(e) {
      const kw = (e.detail.value || '').trim()
      this.setData({ kw })
      if (this.data.activeSpotId) this.setData({ activeSpotId: '' })
      this.refresh()
    },

    onClear() {
      this.setData({ kw: '', activeSpotId: '', expanded: '' })
      this.refresh()
    },

    onSearchConfirm() {
      if (this.data.activeSpotId) return
      const list = this.data.suggestList.length
        ? this.data.suggestList
        : (this.data.spots || []).filter(s => (s.name || '').indexOf(this.data.kw) > -1)
      if (list.length) this.openSpot({ currentTarget: { dataset: { id: list[0]._id } } })
    },

    refresh() {
      const kw = this.data.kw.trim()
      if (this.data.activeSpotId) {
        this.buildPanel(this.data.activeSpotId)
      } else if (kw) {
        this.buildSuggest(kw)
      } else {
        this.setData({ suggestList: [], panel: null })
      }
    },

    // 搜索下拉：显示相关打卡点（按名称 / 地址 / 标签匹配）
    buildSuggest(kw) {
      const key = kw.toLowerCase()
      const list = (this.data.spots || []).filter(s => {
        const tags = Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || '')
        const source = [s.name, s.address, tags].filter(Boolean).join(' ').toLowerCase()
        return source.indexOf(key) > -1
      }).map(s => {
        // 关键词高亮（跟首页 lxm-search-panel 同款：前 / 命中 / 后 三段）
        const name = s.name || ''
        const idx = name.toLowerCase().indexOf(key)
        let nameBefore = name, nameMatch = '', nameAfter = ''
        if (idx >= 0) {
          nameBefore = name.slice(0, idx)
          nameMatch = name.slice(idx, idx + key.length)
          nameAfter = name.slice(idx + key.length)
        }
        return Object.assign({}, s, { nameBefore, nameMatch, nameAfter })
      })
      this.setData({ suggestList: list, panel: null })
    },

    openSpot(e) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      this.setData({ activeSpotId: id, kw: '', expanded: '' })
      this.buildPanel(id)
    },

    backToList() {
      this.setData({ activeSpotId: '', expanded: '', panel: null, kw: '' })
    },

    // 打卡点面板：信息头 + 类目横排 row（周边全城通用，出现于每个面板）
    buildPanel(spotId) {
      const spots = this.data.spots || []
      const spot = spots.find(s => s._id === spotId) || {}
      const products = this.data.products || []
      const expanded = this.data.expanded
      const own = products.filter(p => p.spotId === spotId && p.cat !== 'peripheral')
      const peri = products.filter(p => p.cat === 'peripheral')
      const groups = {
        package: own.filter(p => p.cat === 'package'),
        album: own.filter(p => p.cat === 'album'),
        video: own.filter(p => p.cat === 'video')
      }
      const catTitles = { package: '旅拍套餐', album: '照片留影', video: '视频摄像', peripheral: '影像周边' }
      const allCats = [
        { cat: 'package', items: groups.package },
        { cat: 'album', items: groups.album },
        { cat: 'video', items: groups.video },
        { cat: 'peripheral', items: peri }
      ]
      const sections = allCats
        .filter(c => c.items.length)
        .map(c => ({
          cat: c.cat,
          title: catTitles[c.cat],
          items: c.items,
          expanded: expanded === c.cat
        }))
      const hasOwn = own.length > 0
      // 该打卡点无专属拍摄项目（且未展开任何类目）→ 约拍定制转化入口
      const showCustom = !hasOwn && !expanded
      this.setData({
        panel: { spot, sections, hasOwn, showCustom, spotName: spot.name || '' }
      })
    },

    toggleExpand(e) {
      const cat = e.currentTarget.dataset.cat
      if (!cat) return
      this.setData({ expanded: this.data.expanded === cat ? '' : cat })
      this.buildPanel(this.data.activeSpotId)
    },

    toggleCart(e) {
      const uid = e.currentTarget.dataset.uid
      if (!uid) return
      const cart = this.data.cart.slice()
      const cartMap = Object.assign({}, this.data.cartMap)
      const i = cart.findIndex(c => c.uid === uid)
      if (i >= 0) {
        cart.splice(i, 1)
        delete cartMap[uid]
      } else {
        const item = (this.data.products || []).find(p => p.uid === uid)
        if (!item) return
        cart.push(item)
        cartMap[uid] = true
      }
      this.setData({ cart, cartMap })
    },

    // 约拍定制（打卡点面板兜底）
    addCustom() {
      const spot = (this.data.panel && this.data.panel.spot) || {}
      this.pushCustom('custom_' + (spot._id || 'any'), spot.name || '', '这个打卡点')
    },

    // 约拍定制（搜索无结果兜底，spotName 用搜索词）
    addCustomFromSearch(e) {
      const kw = (e.currentTarget.dataset.kw || '').trim()
      this.pushCustom('custom_search_' + (kw || 'any'), kw, kw || '这个地方')
    },

    pushCustom(uid, spotName, label) {
      const row = {
        uid,
        kind: 'custom',
        cat: 'custom',
        spotId: '',
        spotName: spotName || '',
        name: '约拍定制',
        cover: '',
        price: 0,
        meta: '专属规划 · 客服沟通后定价',
        catLabel: '约拍定制',
        custom: true
      }
      const cart = this.data.cart.slice()
      const cartMap = Object.assign({}, this.data.cartMap)
      if (!cart.find(c => c.uid === uid)) {
        cart.push(row)
        cartMap[uid] = true
      }
      this.setData({ cart, cartMap, kw: '', activeSpotId: '', panel: null })
      wx.showToast({ title: '已加入约拍定制', icon: 'none' })
    },

    onConfirm() {
      if (!this.data.cart.length) return
      this.triggerEvent('confirm', { items: this.data.cart })
    },

    onClose() {
      this.triggerEvent('close')
    },

    onMaskTap() {
      this.triggerEvent('close')
    }
  }
})
