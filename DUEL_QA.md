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

此段於正式部署後補入實際來源提交、Pages提交時間、version.json與正式站26項實跑結果。補入前不宣稱送達驗證完成。

## 限制

有限兩層AI搜尋，不是全局最佳。雙方相同規則不等於先後手已平衡；沒有真人趣味驗證。手機尺寸／觸控模擬不是實體iPhone／Android安裝驗證。沒有中途存檔、三場流程、獎勵、遺物或多人網路對戰。原始美術保留，壓縮舞台以讓軌道與手牌優先可見。
