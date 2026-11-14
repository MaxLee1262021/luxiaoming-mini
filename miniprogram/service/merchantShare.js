const { callCloud, isLoggedOut } = require('../api/client')
const { parseScene } = require('../utils/query')
const KEY = 'lxm_share_pending_events'
let flushing = null
let recent = { key: '', at: 0 }
let coldEntryKey = ''
let firstShowPending = false
let appEntryKey = ''

function decode(value) {
  try { return decodeURIComponent(String(value || '')) } catch (_) { return String(value || '') }
}

function incomingEvents(options = {}, launchType = 1) {
  const query = options.query || options
  const rawScene = decode(query.scene || '')
  const parameters = { ...parseScene(rawScene), ...query }
  const events = []
  // A customer-service landing is never a merchant scan, even when somebody
  // appends a merchant scene parameter to the same URL.
  const staffWecomId = String(parameters.staffWecomId || parameters.staff_id || parameters.s || '').trim()
  const linkId = String(parameters.linkId || parameters.link_id || parameters.l || '').trim()
  if (staffWecomId || linkId) {
    events.push({ name: 'reportShareClick', data: { staffWecomId, linkId, channel: 'WECOM', rawParam: JSON.stringify({ staffWecomId, linkId }).slice(0, 255) } })
  } else if (/^S[A-Za-z0-9]{2,31}$/.test(rawScene)) {
    events.push({ name: 'reportShareScan', data: { scene: rawScene, launchType, clientScanAt: new Date().toISOString() } })
  }
  return events
}

function readPending() {
  try { const value = wx.getStorageSync(KEY); return Array.isArray(value) ? value : [] } catch (_) { return [] }
}
function writePending(rows) { try { wx.setStorageSync(KEY, rows) } catch (_) {} }

function capture(options, launchType = 1, stage = '') {
  const events = incomingEvents(options, launchType)
  const firstShow = stage === 'show' && firstShowPending
  if (stage === 'launch') firstShowPending = true
  if (stage === 'show') firstShowPending = false
  for (const event of events) {
    const key = `${event.name}:${event.data.scene || `${event.data.staffWecomId}:${event.data.linkId}`}`
    // The app callbacks and landing page describe the same entry. A slow
    // launch must not become another scan just because five seconds elapsed.
    if (stage === 'launch') { coldEntryKey = key; appEntryKey = key }
    if (stage === 'show') {
      appEntryKey = key
      if (firstShow && key === coldEntryKey) continue
    }
    if (stage === 'landing' && key === appEntryKey) continue
    if (recent.key === key && Date.now() - recent.at < 5000) continue
    recent = { key, at: Date.now() }
    const pending = readPending()
    pending.push({ ...event, id: `${Date.now()}_${Math.random().toString(36).slice(2)}` })
    writePending(pending.slice(-20))
  }
  return events.length > 0
}

function flush() {
  if (isLoggedOut()) return Promise.resolve()
  if (flushing) return flushing
  const attempted = new Set()
  let disabledCodeNotified = false
  // Defer the drain until flushing is assigned. Clear the marker inside the
  // drain, before its promise resolves, so a finishing drain cannot swallow
  // a newly requested flush. Each queued ID is tried at most once per drain.
  flushing = Promise.resolve().then(async () => {
    try {
      while (!isLoggedOut()) {
        const event = readPending().find((value) => !attempted.has(value.id))
        if (!event) break
        attempted.add(event.id)
        try {
          // Derive the same key for retries and pending events saved by an
          // older client, including a timeout after the server committed.
          await callCloud(event.name, { ...event.data, requestKey: event.data.requestKey || `entry_${event.id}` })
          writePending(readPending().filter((value) => value.id !== event.id))
        } catch (error) {
          const code = String(error && error.code || '').toUpperCase()
          const status = Number(error && (error.statusCode || error.status) || 0)
          const retryableStatus = status === 401 || status === 429 || status >= 500
          if (!retryableStatus && ['SHARE_4001', 'SHARE_4002', 'SHARE_4003', 'SHARE_4004'].includes(code)) {
            writePending(readPending().filter((value) => value.id !== event.id))
            if (code === 'SHARE_4004' && !disabledCodeNotified) {
              disabledCodeNotified = true
              try { wx.showToast({ title: '该码已停用，请联系门店', icon: 'none' }) } catch (_) {}
            }
          }
          // Auth, rate limiting, server and network failures remain queued.
          // The next loop still sees new events captured while awaiting HTTP.
        }
      }
    } finally { flushing = null }
  })
  return flushing
}

module.exports = { incomingEvents, capture, flush }
