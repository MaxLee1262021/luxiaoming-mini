const filesApi = require('../api/files')
const { isCancelled } = require('./fileUpload')

function normalizeFile(file, index = 0) {
  const item = typeof file === 'string' ? { url: file } : (file || {})
  const video = item.type === 'video' || item.mediaType === 'video' || /^video\//.test(item.mimeType || item.type || '') || /\.mp4(?:\?|$)/i.test(item.name || '') || /\.mp4(?:\?|$)/i.test(item.url || '')
  return { ...item, fileId: item.fileId || '', id: item.fileId || item.id || item._id || String(index),
    name: item.name || item.title || (video ? '视频成片' : '照片'), type: video ? 'video' : 'image' }
}

async function getUrl(file, download) {
  if (file.fileId) {
    // Re-authorize every user action so resumed pages never reuse expired URLs.
    const result = await filesApi.access(file.fileId, download)
    if (!result.url) throw new Error('文件暂不可用，请稍后重试')
    return result.url
  }
  const url = filesApi.normalizeMediaUrls(download ? file.downloadUrl || file.url : file.url || file.downloadUrl)
  if (!/^https?:\/\//i.test(url || '')) throw new Error('文件暂不可用，请联系客服')
  return url
}

async function previewFile(input) {
  const file = normalizeFile(input)
  for (let attempt = 0; attempt < 2; attempt++) {
    const url = await getUrl(file, false)
    try {
      await new Promise((resolve, reject) => {
        const callbacks = { success: resolve, fail: reject }
        if (file.type === 'video') {
          if (!wx.previewMedia) return reject(new Error('请升级微信后预览视频，或保存到相册观看'))
          wx.previewMedia({ sources: [{ url, type: 'video' }], current: 0, ...callbacks })
        } else wx.previewImage({ urls: [url], current: url, ...callbacks })
      })
      return
    } catch (error) {
      if (isCancelled(error) || !file.fileId || attempt === 1 || /升级微信/.test(error.message || '')) {
        throw new Error(error.message || error.errMsg || '预览失败，请重试')
      }
    }
  }
}

function downloadToAlbum(input, onProgress = () => {}) {
  const file = normalizeFile(input)
  let cancelled = false
  let task
  const check = () => {
    if (cancelled) { const error = new Error('已取消下载'); error.cancelled = true; throw error }
  }
  const promise = (async () => {
    let filePath
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = await getUrl(file, true)
      check()
      const result = await new Promise((resolve, reject) => {
        task = wx.downloadFile({ url, success: resolve, fail: reject })
        if (task && task.onProgressUpdate) task.onProgressUpdate(event => { if (!cancelled) onProgress(event.progress) })
        if (cancelled && task && task.abort) task.abort()
      })
      check()
      if (result.statusCode >= 200 && result.statusCode < 300) { filePath = result.tempFilePath; break }
      if (!file.fileId || ![401, 403].includes(result.statusCode) || attempt === 1) throw new Error('下载失败，请重试')
    }
    check()
    if (!filePath) throw new Error('下载失败，请重试')
    try {
      await new Promise((resolve, reject) => {
        const action = file.type === 'video' ? wx.saveVideoToPhotosAlbum : wx.saveImageToPhotosAlbum
        if (!action) return reject(new Error('请升级微信后保存到相册'))
        action.call(wx, { filePath, success: resolve, fail: reject })
      })
    } catch (error) {
      if (/auth|denied|deny|permission/i.test(error.errMsg || error.message || '')) {
        const denied = new Error('未获得相册保存权限，请在设置中开启后重试')
        denied.permissionDenied = true
        throw denied
      }
      throw error
    }
    return filePath
  })()
  return { promise, cancel() { cancelled = true; if (task && task.abort) task.abort() } }
}

module.exports = { normalizeFile, previewFile, downloadToAlbum, getUrl }
