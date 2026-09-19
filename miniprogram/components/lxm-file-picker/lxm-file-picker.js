const upload = require('../../service/fileUpload')

Component({
  properties: { orderId: String, disabled: Boolean },
  data: { items: [], selecting: false },
  lifetimes: {
    attached() { this._jobs = {}; this._checkpoints = {}; this._disposed = false },
    detached() { this._disposed = true; Object.values(this._jobs || {}).forEach(job => job.cancel()) }
  },
  methods: {
    emitFiles() {
      this.triggerEvent('change', {
        files: this.data.items.filter(item => item.status === 'done').map(item => item.file),
        pending: this.data.selecting || this.data.items.some(item => item.status !== 'done')
      })
    },
    updateItem(key, patch) {
      if (this._disposed || !this.data.items.some(item => item.key === key)) return
      this.setData({ items: this.data.items.map(item => item.key === key ? { ...item, ...patch } : item) })
      this.emitFiles()
    },
    async choose() {
      if (this.properties.disabled || this.data.selecting || this.data.items.length >= 9) return
      this.setData({ selecting: true })
      this.emitFiles()
      try {
        const files = await upload.chooseImages(9 - this.data.items.length)
        if (this._disposed) return
        const items = files.slice(0, 9 - this.data.items.length).map((file, index) => ({
          key: Date.now() + '-' + index, path: file.path, size: file.size, status: 'uploading', progress: 0
        }))
        this.setData({ items: [...this.data.items, ...items] })
        items.forEach(item => this.startUpload(item))
      } catch (error) {
        if (!upload.isCancelled(error)) wx.showToast({ title: error.message, icon: 'none' })
      } finally {
        if (!this._disposed) { this.setData({ selecting: false }); this.emitFiles() }
      }
    },
    async startUpload(item) {
      this.updateItem(item.key, { status: 'uploading', error: '', progress: 0 })
      const checkpoint = this._checkpoints[item.key] || (this._checkpoints[item.key] = {})
      const job = upload.uploadImage(item, { purpose: 'after-sale', orderId: this.properties.orderId, checkpoint,
        onProgress: progress => this.updateItem(item.key, { progress }) })
      this._jobs[item.key] = job
      try {
        const file = await job.promise
        this.updateItem(item.key, { status: 'done', file, progress: 100 })
      } catch (error) {
        this.updateItem(item.key, { status: 'failed', error: error.message })
      } finally {
        delete this._jobs[item.key]
      }
    },
    retry(e) {
      if (this.properties.disabled) return
      const item = this.data.items.find(row => row.key === e.currentTarget.dataset.key)
      if (item && item.status === 'failed') this.startUpload(item)
    },
    remove(e) {
      if (this.properties.disabled) return
      const key = e.currentTarget.dataset.key
      if (this._jobs[key]) this._jobs[key].cancel()
      delete this._checkpoints[key]
      this.setData({ items: this.data.items.filter(item => item.key !== key) })
      this.emitFiles()
    },
    preview(e) {
      const urls = this.data.items.map(item => item.path)
      wx.previewImage({ current: e.currentTarget.dataset.path, urls })
    }
  }
})
