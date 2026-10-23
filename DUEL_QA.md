# 輪流插牌 S0.2 實跑紀錄

2026-10-23，回復基準a5c93b2。原版31單測與11瀏覽器案例保留。

## 本機驗證

- 位置：C:\Users\shung\work\nitian-duel（OneDrive同步目錄外，同一Git repository獨立worktree）。
- `npm.cmd run test:coverage`：4 files、63 tests passed，exit0；Statements98.17%、Branches94.13%、Functions100%、Lines100%。新版storage已納入相同四項80%門檻，未降低原門檻。
- `npm.cmd run build`：TypeScript與Vite production build通過。
- `npm.cmd run test:e2e`：26 passed (1.7m)，exit0。新版15項＋原版11項；原版僅3個入口改為legacy=1，未變案例預期。
- 回歸：演出期間品牌導覽在舊dist回傳1 failed（缺aria-disabled）；新dist同測通過，強制點擊亦不能開重開視窗，略過仍正常結算。
- seed e2e-win-2：真實UI落牌，8回合勝利、玩家2HP、敵0HP，JSON匯出驗證。
- seed 20261023：真實UI落牌，7回合敗北、玩家0HP、敵1HP，新舊紀錄分離驗證。測試以公開資訊AI規劃合法移動，沒有注入React狀態或修改生命。
- 390×844及1366×768無橫向溢出；完整共同軌道、44px觸控、觸控落牌與固定操作列、鍵盤／Escape焦點、正常／略過／減少動態結果一致、本機儲存拒絕降級及PWA離線重載皆通過。
- React、TypeScript與最終程式唯讀審查無未解CRITICAL/HIGH；未以缺少既有lint工具當成新增功能。

## 送達

- 程式來源提交：`40c390337334c5515d5c1002be9be477835adb1e`，2026-10-23 14:25:33 +08:00。後續提交只更新本QA與正式站截圖，不改程式；因此main可能比線上來源多一筆文件提交。
- `npm.cmd run deploy:pages` → `Published`，exit0。
- `git log origin/gh-pages -1 --format='%H %cI %s'` → `97e9e0d4050347186da98d60e929268f8dc171ad 2026-10-23T14:26:03+08:00 Updates`。
- `gh api repos/9gf6p4448m-del/nitian/pages/builds/latest` → `status: built`、`commit: 97e9e0d4050347186da98d60e929268f8dc171ad`、`updated_at: 2026-10-23T06:26:36Z`（台灣14:26:36）、`error: null`。
- 線上 [version.json](https://9gf6p4448m-del.github.io/nitian/version.json) 與本機dist一致：`version: nitian-s0-15897c2737a2`、`commit: 40c390337334c5515d5c1002be9be477835adb1e`、`builtAt: 2026-10-23T06:25:46.846Z`。
- 正式站命令：`$env:TEST_URL='https://9gf6p4448m-del.github.io/nitian/'; npm.cmd run test:e2e` → **26 passed (1.8m)**、exit0。驗的是已發布版本，包含新15項、原版11項、離線重載與完整勝敗。
- 正式站實際截圖：[手機390×844](docs/screenshots/duel-mobile.png)／[桌面1366×768](docs/screenshots/duel-desktop.png)。共同軌道六張完整內容可獨立捲動；截圖為fullPage，固定操作列仍以視窗定位。
- 手機PWA更新：連線重開本站，看到「新版本已備妥」選「更新並重開」。新版首頁為「一招落定，天命未定」，頁尾建置時間為2026-10-23 06:25 UTC（台灣14:25）；舊版比較網址 `?legacy=1`。清除網站資料會刪除本機紀錄，優先使用頁內更新。

## 變更與範圍核對

`git show --stat 40c3903`：18 files changed、1350 insertions、13 deletions。規則主體 `src/game/duel.ts:9`；共用新模式解析器`:86`，有限AI`:218`。介面 `src/DuelApp.tsx:47`、新樣式 `src/duel.css:1`、紀錄 `src/duel-storage.ts:32`；`src/main.tsx:5`切換模式，原版`src/App.tsx:192`只增加返回新版入口。原engine/data/types/rng、舊storage及原卡數值皆未改。

判準檔逐項：新增 `DUEL_ACCEPTANCE.md`、`src/game/duel.test.ts`、`src/duel-storage.test.ts`、`e2e/duel.spec.ts`；`e2e/game.spec.ts`僅3處網址加legacy=1；`vite.config.ts:11`只擴大coverage include至新版storage，四項80%不變。未刪除或放寬舊驗算、案例預期或測試門檻。規格／啟動／更新方式見 `DUEL_SPEC.md`、`README.md`；`S0_SPEC.md`僅加原版標示。

## 限制

有限兩層AI搜尋，不是全局最佳。雙方相同規則不等於先後手已平衡；沒有真人趣味驗證。手機尺寸／觸控模擬不是實體iPhone／Android安裝驗證。沒有中途存檔、三場流程、獎勵、遺物或多人網路對戰。原始美術保留，壓縮舞台以讓軌道與手牌優先可見。
