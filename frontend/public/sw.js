'use strict'

// ── IndexedDB KV store (SW context) ──────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mpos-reminder', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv', { keyPath: 'k' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function kvGet(key) {
  try {
    const db = await openDB()
    return new Promise(resolve => {
      const req = db.transaction('kv').objectStore('kv').get(key)
      req.onsuccess = () => resolve(req.result?.v ?? null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

async function kvSet(key, value) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const req = db.transaction('kv', 'readwrite').objectStore('kv').put({ k: key, v: value })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {}
}

// ── 通知邏輯 ──────────────────────────────────────────────────
async function checkAndNotify() {
  const config = await kvGet('config')
  if (!config?.enabled || !config?.time) return

  const now = new Date()
  const [h, m] = config.time.split(':').map(Number)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const targetMin = h * 60 + m

  // 在提醒時間起算 30 分鐘視窗內才觸發，避免補發過期通知
  if (nowMin < targetMin || nowMin > targetMin + 30) return

  const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  const lastShown = await kvGet('lastShown')
  if (lastShown === todayKey) return

  await kvSet('lastShown', todayKey)
  await self.registration.showNotification('Ready-mPOS 打烊提醒', {
    body: '記得記錄今日帳目！',
    tag: 'closing-reminder',
    requireInteraction: false,
    data: { url: self.registration.scope },
  })
}

// ── SW 生命週期 ───────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', e =>
  e.waitUntil(self.clients.claim().then(checkAndNotify))
)

// ── 來自主線程的訊息 ──────────────────────────────────────────
self.addEventListener('message', async e => {
  if (e.data?.type === 'REMINDER_UPDATE') {
    await kvSet('config', { enabled: e.data.enabled, time: e.data.time })
    if (e.data.enabled) await checkAndNotify()
  }
})

// ── Periodic Background Sync（安裝為 PWA 時可用）────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'reminder') e.waitUntil(checkAndNotify())
})

// ── 點擊通知 → 開啟 / 聚焦 App ───────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const appUrl = e.notification.data?.url || self.registration.scope
      for (const c of list) {
        if ('focus' in c) return c.focus()
      }
      return clients.openWindow(appUrl)
    })
  )
})
