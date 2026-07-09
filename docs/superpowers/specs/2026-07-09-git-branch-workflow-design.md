# Git 分支流程設計（開發 → 測試 → 正式部署）

> **Status**: 已核准（2026-07-09）
> **Scope**: 分支策略、新 feature SOP、hotfix 流程、測試/正式試算表 env 化切換、release 與 SemVer 對應
> **前提**: 個人開發為主、GitHub Pages 自動部署（push main 觸發）、無額外基建（不加 staging 站台）

## 背景與問題

Ready-mPOS 是純前端 PWA，`main` push 即由 GitHub Actions 自動部署到 GitHub Pages（= 正式站）。
在「第 2 次優化」期間暴露出三個流程問題：

1. **沒有正式的分支流程**——開發、驗收、部署的邊界靠口頭約定。
2. **測試 vs 正式資料靠手改常數**——feature 分支把 `AUTO_SHEET_NAME` 手動改成
   `Ready-mPOS 記帳（逐筆交易測試）` 以隔離真實資料，併 main 前須記得改回
   `Ready-mPOS 記帳`。這是人為風險：忘記改回 = 正式站連到測試表；忘記改掉 = 開發環境污染真實帳目。
3. **release 與版本號沒有掛鉤**——已導入 SemVer（`2.0.0-beta.1`），但沒有 tag、
   沒有「什麼時候 bump」的固定時點。

## 決策摘要

- 採**輕量 GitHub Flow**（個人開發，不用 GitFlow 的長命 `develop` 分支）。
- 測試階段 = **本機驗收 + 可選的 `verify/*` 預發分支**（不加 staging 部署基建）。
- **試算表名改由 Vite env 控制**（`VITE_SHEET_NAME`），取代手改常數；
  dev/staging mode 固定連測試表、production build 固定連正式表，並加防呆。
- 每次併 main = 一次 release：bump `package.json` 版本 + 打 annotated tag `vX.Y.Z`。

## 1. 分支結構

```
main ──────●───────●──────●──→  正式分支（= production）
            \       \    ↑
             \       \  merge --no-ff + tag vX.Y.Z
              \       feature/bbb（短命）
               feature/aaa（短命）

verify/<feature>  ←（可選）驗收快照分支，給另一台裝置/瀏覽器安裝驗收用
```

| 分支 | 角色 | 規則 |
|---|---|---|
| `main` | **正式** | push 即自動部署 GitHub Pages。只接受驗收完成的合併；每次合併打 tag `vX.Y.Z` |
| `feature/*` | **新功能開發** | 從 main 切出，短命，合併後刪除 |
| `fix/*` | **修正／hotfix** | 同上，流程更短 |
| `verify/*` | **預發驗收**（可選） | feature 到驗收點時 push 過去；驗收裝置拉這個分支本機跑，開發端可繼續動 feature 分支不互相干擾 |

**不採用**的替代方案與理由：

- **GitFlow（長命 develop + release 分支）**：個人開發下只增加合併次數與心智負擔，無收益。
- **獨立 staging 站台（第二個 Pages / Netlify）**：要多管一套部署與 OAuth origin 設定；
  本機 dev server + 真機拉 verify 分支已滿足驗收需求。

## 2. 測試 vs 正式試算表：env 化（核心變更）

### 機制

- `useSyncService.ts` 的表名改讀 build-time 常數：
  `const AUTO_SHEET_NAME = import.meta.env.VITE_SHEET_NAME`。
- 新增**可提交**的 env 檔（表名非機密；機密的 `VITE_GOOGLE_CLIENT_ID` 留在被 gitignore 的 `.env`，Vite 會在所有 mode 疊加載入 `.env` + `.env.[mode]`）：

| 檔案 | mode | `VITE_SHEET_NAME` |
|---|---|---|
| `frontend/.env.development` | `npm run dev` | `Ready-mPOS 記帳（逐筆交易測試）` |
| `frontend/.env.staging` | `npm run build:staging` | `Ready-mPOS 記帳（逐筆交易測試）` |
| `frontend/.env.production` | `npm run build`（CI 亦同） | `Ready-mPOS 記帳` |

- `package.json` 新增 `"build:staging": "tsc -b && vite build --mode staging"`，
  供本機驗收 build 版（`build:staging` + `preview`）而不誤連正式表。

### 防呆（紅線）

- **開發／staging mode 絕不允許連正式表**：非 production build（`import.meta.env.MODE !== 'production'`）
  時，表名必須含「測試」字樣，否則同步入口直接拒絕並 `console.error`。
  保證任何開發環境設定錯誤都 fail-safe 成「不同步」，而不是碰到真實帳目。
- 表名為空（env 檔缺失）同樣拒絕同步。

### 效果

- 本機開發／驗收**永遠**連測試表；main 上 CI build 出來的正式站**永遠**連正式表。
- cutover 不再需要改程式碼——併 main 後 production build 自動使用正式名。
- 「併 main 前須改回正式名」這條人工檢查項從此作廢。

## 3. 新 feature 標準流程（SOP）

1. `git switch main && git pull` → 切 `feature/<名稱>`（大改動可開 git worktree 隔離）。
2. 開發：維持 `npx tsc -b` / `npm test`（Vitest）/ `npm run build` 綠；照慣例逐 task commit + push。
3. **本機驗收**：`npm run dev`（自動連測試表）手動走過關鍵流程；UI 變更跑 Playwright E2E；
   需要 build 版驗收時用 `npm run build:staging` + `npm run preview`。
4. （可選）真機／跨裝置驗收 → push 到 `verify/<名稱>` 分支，驗收裝置拉該分支跑。
5. 驗收通過 → bump `frontend/package.json` 版本：
   - 新功能 → **MINOR**；修正 → **PATCH**；資料模型／架構破壞性變更 → **MAJOR**；
   - 尚未上正式資料的大改掛 `-beta.N` 預發尾碼。
6. 併回 main：`git merge --no-ff feature/<名稱>`（或開 PR 自我 review）→
   `git tag -a vX.Y.Z -m "..."` → `git push origin main --tags` → CI 自動部署。
7. 刪除 `feature/*` 與對應 `verify/*` 分支（本地 + 遠端）。

## 4. Hotfix 流程（正式站出 bug）

1. 從 main 切 `fix/<名稱>`。
2. 修復並本機驗證（dev mode 連測試表重現 + 確認修復）。
3. bump **PATCH**（例 `2.0.0` → `2.0.1`）→ 併 main + tag → 自動部署。

與 feature 流程同構，只是更短——不設額外的 hotfix 分支規則。

## 5. 本次逐筆交易改造的落地對應

- **cutover 前（現在）**：env 化已在 `feature/line-item-transactions-redesign` 分支實作；
  驗收流程照舊，dev/staging 沿用既有測試表 `Ready-mPOS 記帳（逐筆交易測試）`（彩排資料延續可用）。
- **cutover 當天（使用者核准的硬停）**：
  1. 移除暫時的 `[sync-diag]` 診斷 log（遷移阻擋層保留）。
  2. 版本轉正 `2.0.0`（去 `-beta.1`）。
  3. 併 main → `git tag -a v2.0.0` → push → CI 以 production mode 部署，自動採用正式表名。
  4. 真實使用者開啟 App 後，由已驗證的自動遷移（備份 → 改寫 → 阻擋層）完成資料轉換。
- 資料保護紅線不變：舊格式分頁改寫前 `backupSpreadsheet` 必須成功，失敗則該輪跳過所有改寫。
