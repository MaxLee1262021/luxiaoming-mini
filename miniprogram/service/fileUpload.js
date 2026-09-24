const filesApi = require('../api/files')

const LIMITS = { 'after-sale': 20 * 1024 * 1024 }
const MIME_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

function cancelledError() {
  const error = new Error('已取消上传')
  error.cancelled = true
  return error
}

function isCancelled(error) { return !!(error && (error.cancelled || /cancel|abort/i.test(error.errMsg || error.message || ''))) }

function chooseImages(count) {
  return new Promise((resolve, reject) => {
    const fail = err => reject(isCancelled(err) ? cancelledError() : new Error(err.errMsg || '无法选择照片，请检查相册权限'))
    if (wx.chooseMedia) {
      wx.chooseMedia({ count, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['original'],
        success: result => resolve((result.tempFiles || []).map(file => ({ path: file.tempFilePath, size: file.size }))), fail })
    } else {
      wx.chooseImage({ count, sourceType: ['album', 'camera'], sizeType: ['original'],
        success: result => resolve((result.tempFiles || []).map(file => ({ path: file.path, size: file.size }))), fail })
    }
  })
}

async function imageMetadata(file, purpose) {
  if (!LIMITS[purpose]) throw new Error('上传用途无效')
  if (!file || !file.path) throw new Error('请选择图片')
  const info = await new Promise((resolve, reject) => wx.getImageInfo({ src: file.path, success: resolve,
    fail: () => reject(new Error('无法读取图片，请重新选择 JPG、PNG 或 WebP 图片')) }))
  const ext = String(info.type || '').toLowerCase()
  if (!MIME_TYPES[ext]) throw new Error('仅支持 JPG、PNG、WebP 图片')
  // The selected path is the source of truth, even when a picker supplies size.
  const stat = await new Promise((resolve, reject) => wx.getFileInfo({ filePath: file.path, success: resolve,
    fail: () => reject(new Error('图片已失效，请重新选择')) }))
  const size = Number(stat.size)
  if (!(size > 0) || size > LIMITS[purpose]) throw new Error('每张凭证需小于 20 MB')
  return { fileName: 'image.' + (ext === 'jpeg' ? 'jpg' : ext), mimeType: MIME_TYPES[ext], size }
}

// checkpoint survives a failed completion request so retry does not upload a
// second copy. Cancellation stops OSS transfer and suppresses later completion.
function uploadImage(file, { purpose, orderId, onProgress = () => {}, checkpoint = {} }) {
  let cancelled = false
  let task
  const check = () => { if (cancelled) throw cancelledError() }
  const promise = (async () => {
    if (!checkpoint.uploaded) {
      const metadata = await imageMetadata(file, purpose)
      check()
      const intent = await filesApi.createIntent({ purpose, ...(orderId ? { orderId } : {}), ...metadata })
      check()
      if (!intent.fileId || !/^https:\/\//i.test(intent.uploadUrl || '')) throw new Error('上传地址无效，请重试')
      checkpoint.fileId = intent.fileId
      await new Promise((resolve, reject) => {
        // The OSS form carries its own short-lived authorization. Never forward
        // the application Bearer token to object storage.
        task = wx.uploadFile({ url: intent.uploadUrl, filePath: file.path, name: 'file', formData: intent.fields || {},
          success(res) { res.statusCode >= 200 && res.statusCode < 300 ? resolve() : reject(new Error('图片上传失败，请重试')) },
          fail(err) { reject(isCancelled(err) ? cancelledError() : new Error('图片上传失败，请重试')) } })
        if (task && task.onProgressUpdate) task.onProgressUpdate(event => { if (!cancelled) onProgress(event.progress) })
        if (cancelled && task && task.abort) task.abort()
      })
      check()
      checkpoint.uploaded = true
    }
    check()
    const result = await filesApi.complete(checkpoint.fileId)
    check()
    if (!result.fileId && !result.id) throw new Error('文件尚未确认，请重试')
    return { ...result, fileId: result.fileId || result.id }
  })()
  return { promise, cancel() { cancelled = true; if (task && task.abort) task.abort() } }
}

module.exports = { chooseImages, uploadImage, imageMetadata, isCancelled, LIMITS }
