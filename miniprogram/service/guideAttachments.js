const { guideAttachmentUrl } = require('../utils/guideContent')

const DOCUMENT_TYPES = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])
const MIME_TYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
}

function documentType(file = {}) {
  const extension = (String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1]
  return DOCUMENT_TYPES.has(extension) ? extension : (MIME_TYPES[String(file.mimeType || '').toLowerCase()] || '')
}

function downloadAttachment(file, onProgress = () => {}) {
  const attachment = guideAttachmentUrl(file.url)
  if (!attachment || (file.fileId && file.fileId !== attachment.fileId)) return Promise.reject(new Error('附件链接无效，请刷新后重试'))
  return new Promise((resolve, reject) => {
    const task = wx.downloadFile({
      url: attachment.url + '?download=1',
      success(result) {
        if (!(result.statusCode >= 200 && result.statusCode < 300) || !result.tempFilePath) {
          reject(new Error('附件下载失败，请重试'))
          return
        }
        resolve({ filePath: result.tempFilePath, url: attachment.url + '?download=1' })
      },
      fail() { reject(new Error('附件下载失败，请检查网络后重试')) }
    })
    if (task && task.onProgressUpdate) task.onProgressUpdate(event => onProgress(Math.max(0, Math.min(100, Number(event.progress) || 0))))
  })
}

function copyDownloadLink(url) {
  return new Promise((resolve, reject) => wx.setClipboardData({ data: url,
    success: resolve, fail: () => reject(new Error('下载链接复制失败，请重试')) }))
}

async function openAttachment(file, onState = () => {}) {
  onState('downloading', 0)
  const downloaded = await downloadAttachment(file, progress => onState('downloading', progress))
  const fileType = documentType(file)
  if (fileType) {
    onState('opening', 100)
    if (typeof wx.openDocument !== 'function') {
      const error = new Error('当前微信版本无法预览，请升级微信或复制下载链接')
      error.downloadUrl = downloaded.url
      throw error
    }
    return new Promise((resolve, reject) => wx.openDocument({
      filePath: downloaded.filePath,
      fileType,
      showMenu: true,
      success: resolve,
      fail() {
        const error = new Error('附件打开失败，请重试；也可复制下载链接在浏览器打开')
        error.downloadUrl = downloaded.url
        reject(error)
      }
    }))
  }
  onState('downloaded', 100)
  const answer = await new Promise((resolve, reject) => wx.showModal({
    title: '附件已下载',
    content: '当前文件格式暂不支持在微信中预览。可复制下载链接，在浏览器中打开并保存。',
    confirmText: '复制链接', cancelText: '关闭',
    success: resolve, fail: () => reject(new Error('无法显示附件下载提示，请重试'))
  }))
  if (answer.confirm) await copyDownloadLink(downloaded.url)
}

module.exports = { documentType, downloadAttachment, openAttachment, copyDownloadLink }
