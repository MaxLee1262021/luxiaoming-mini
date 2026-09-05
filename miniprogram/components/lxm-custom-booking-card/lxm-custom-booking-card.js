const bookingConfig = require('../../service/bookingConfig')

Component({
  properties: {
    // 溯源/跳转所需信息
    spotId: { type: String, value: '' },
    spotName: { type: String, value: '' },
    keyword: { type: String, value: '' },
    // 可选：无商品时的补充说明（如“该打卡点暂未上架…”），不传则不显示
    context: { type: String, value: '' },
    // 文案覆写（默认即统一母版文案）
    title: { type: String, value: '约拍定制' },
    subtitle: { type: String, value: '记录城市与你的故事' },
    buttonText: { type: String, value: '立即定制' }
  },
  data: {
    // 价格展示（默认与内置配置一致；后台 getBookingConfig 就绪后自动跟随，不阻塞渲染）
    priceMain: '¥200',
    priceAdd: '每加1人 +¥100/小时'
  },
  lifetimes: {
    attached() {
      // 展示价跟随后台配置：拉取成功则更新，失败/未接后台保留默认，零回归
      bookingConfig.ensureLoaded().then(cfg => {
        const { single, extraPerPerson } = (cfg && cfg.customPrice) || {}
        if (!single && single !== 0) return
        this.setData({
          priceMain: '¥' + single,
          priceAdd: '每加1人 +¥' + extraPerPerson + '/小时'
        })
      })
    }
  },
  methods: {
    onTap() {
      // 仅透传信息，由页面统一用 buildUrl 携带渠道/门店溯源后跳转
      this.triggerEvent('booking', {
        spotId: this.data.spotId || '',
        spotName: this.data.spotName || '',
        keyword: this.data.keyword || ''
      })
    }
  }
})
