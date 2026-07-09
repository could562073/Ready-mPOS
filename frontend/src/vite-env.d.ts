/// <reference types="vite/client" />

// 編譯期由 vite.config.ts 的 define 注入（單一事實來源＝package.json version）
declare const __APP_VERSION__: string

// 自訂 Vite env 變數型別（值來自 frontend/.env / .env.development / .env.staging / .env.production）
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** 同步試算表名稱：dev/staging=測試表、production=正式表（見 git workflow spec） */
  readonly VITE_SHEET_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
