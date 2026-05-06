const SW_URL   = `${import.meta.env.BASE_URL}sw.js`
const SW_SCOPE = import.meta.env.BASE_URL

export const notifySupported = (): boolean =>
  'Notification' in window && 'serviceWorker' in navigator

export const getPermission = (): NotificationPermission | 'unsupported' =>
  notifySupported() ? Notification.permission : 'unsupported'

export async function requestPermission(): Promise<boolean> {
  if (!notifySupported()) return false
  const r = await Notification.requestPermission()
  return r === 'granted'
}

export async function registerSW(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
  } catch (err) {
    console.warn('[SW] register failed', err)
  }
}

export async function sendReminderToSW(enabled: boolean, time: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    reg.active?.postMessage({ type: 'REMINDER_UPDATE', enabled, time })

    // 嘗試註冊 Periodic Background Sync（Chrome Android 安裝 PWA 後可用）
    if (enabled && 'periodicSync' in reg) {
      const ps = (reg as any).periodicSync
      try {
        const status = await navigator.permissions.query({
          name: 'periodic-background-sync' as PermissionName,
        })
        if (status.state === 'granted') {
          await ps.register('reminder', { minInterval: 60 * 60 * 1000 })
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[SW] sendReminder failed', err)
  }
}
