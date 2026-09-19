const upload = require('./fileUpload')
const userStore = require('../store/userStore')

module.exports = {
  async onChooseAvatar(e) {
    if (this.data.avatarUploading) return
    const path = e.detail && e.detail.avatarUrl
    if (!path) return
    this._avatarFile = { path }
    this._avatarCancelled = false
    this._avatarCheckpoint = {}
    this._avatarCompleted = null
    return this.uploadAvatar()
  },
  async uploadAvatar() {
    if (this.data.avatarUploading || !this._avatarFile) return
    this.setData({ avatarUploading: true, avatarError: '', avatarProgress: 0 })
    try {
      if (!this._avatarCompleted) {
        this._avatarJob = upload.uploadImage(this._avatarFile, { purpose: 'avatar', checkpoint: this._avatarCheckpoint,
          onProgress: progress => this.setData({ avatarProgress: progress }) })
        this._avatarCompleted = await this._avatarJob.promise
      }
      if (this._avatarCancelled) return
      this.setData({ avatarSaving: true })
      const user = await userStore.updateAvatar(this._avatarCompleted.fileId)
      getApp().globalData.userInfo = user.userInfo
      this._avatarRefreshAttempted = false
      this.loadUserInfo()
      this._avatarFile = null
      wx.showToast({ title: '头像已更新', icon: 'success' })
    } catch (error) {
      if (!upload.isCancelled(error)) this.setData({ avatarError: error.message || '头像更新失败，请重试' })
    } finally {
      this._avatarJob = null
      this._avatarCancelled = false
      this.setData({ avatarUploading: false, avatarSaving: false })
    }
  },
  cancelAvatarUpload() {
    if (this.data.avatarSaving) return
    this._avatarCancelled = true
    if (this._avatarJob) this._avatarJob.cancel()
  },
  async refreshAvatar() {
    const url = this.data.userInfo && this.data.userInfo.avatarUrl
    if (!url || this._refreshingAvatar || this._avatarRefreshAttempted) return
    this._avatarRefreshAttempted = true
    this._refreshingAvatar = true
    try { await userStore.syncUserProfile(); this.loadUserInfo() } catch (_) {}
    finally { this._refreshingAvatar = false }
  }
}
