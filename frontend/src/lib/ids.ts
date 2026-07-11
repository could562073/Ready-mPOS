// 產生穩定 ID：優先用 crypto.randomUUID，環境不支援時退回 時間戳+亂數
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
