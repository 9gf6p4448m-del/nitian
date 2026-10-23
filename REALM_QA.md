# 共享神域驗證紀錄

凍結依據：`REALM_ACCEPTANCE.md`（基準d837263）。本檔記錄實際執行結果；尚未執行的欄位不視為通過。

## 覆蓋設計

| 驗收範圍 | 證據 |
| --- | --- |
| 人工數值 | E2E固定檢查完整局2：2、試局5：6，及獨立首步8：0／15：6／9：6／11：6；不以引擎計算取代人工期望值。C2多源更正與保留C1單源例的理由見REALM_SPEC.md |
| 手機操作 | 真正touch事件、預覽取消、重複確認、普通／大壇／神力／逆轉、44px、390與320寬度 |
| 完整流程 | AI完整局、玩家後手、同機合法行動完局、勝負和平手、再玩一局 |
| 可理解性 | 首次教學、供應來源、分數預覽、對話框焦點與暫停AI |
| 紀錄 | 完局JSON內容、每步前後狀態、Storage拒絕仍可下棋與匯出 |
| PWA | Service Worker接管後離線reload、manifest從realm啟動 |
| 裝置 | Chrome390×844／320×700／1366×768與WebKit手機核心旅程 |

## 實際結果

第一輪Chrome發現介面呈現與焦點問題；修正後第二輪Chrome10項、WebKit核心5項全數通過。公開網址結果仍待補記，沒有以推測填入通過數或部署時間。

| 指令／環境 | 實際輸出 | 狀態 |
| --- | --- | --- |
| `npx playwright test e2e/realm.spec.ts --list` | `Total: 10 tests in 1 file`，exit 0 | 測試發現通過，尚非瀏覽器執行 |
| `npx playwright test --config playwright.realm-webkit.config.ts --list` | `Total: 5 tests in 1 file`，exit 0 | 核心案例篩選通過，尚非瀏覽器執行 |
| `npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types node e2e/realm.spec.ts playwright.realm-webkit.config.ts` | 無錯誤輸出，exit 0 | 型別檢查通過 |
| `npx playwright test e2e/realm.spec.ts --reporter=list`，第一輪Chrome | `4 failed, 6 passed (50.6s)`，exit 1 | 未驗證；歷史缺平手標記、勝敗文字無玩家視角、教學Tab焦點逃出 |
| `npx playwright test e2e/realm.spec.ts --reporter=list`，修正後Chrome | `10 passed (39.4s)`，exit 0 | 本機Chrome通過 |
| `npx playwright test --config playwright.realm-webkit.config.ts --reporter=list` | `5 passed (1.1m)`，exit 0 | 本機WebKit核心通過 |
| `npx playwright test --config playwright.realm-webkit.config.ts --reporter=list --output=test-results/realm-webkit-latest`，加嚴後併跑 | `1 failed, 4 passed (1.1m)`，exit 1 | 兩步／底部分數加嚴通過；AI同步觀測讀到ply6，測試錯誤要求必須先看見ply5，修正後待重跑 |
| `npx playwright test --config playwright.realm-webkit.config.ts --reporter=list --output=test-results/realm-webkit-latest`，DOM觀測修正後串行 | `5 passed (1.3m)`，exit 0 | 最新WebKit核心及加嚴斷言通過，捕捉實際human中間態 |
| 公開網址Chrome核心E2E | 尚未執行 | 未驗證 |
| 公開網址WebKit核心E2E | 尚未執行 | 未驗證 |

## 整合驗證

- `npm test`：11 files passed、149 tests passed。
- `npm run test:coverage`：149 passed；statements98.25%、branches94.33%、functions99.50%、lines99.58%，原四項80%門檻不動。coverage-final.json包含realm/ai.ts 23/23、engine.ts 110/110、storage.ts 21/21 statements（均100%）；沒有以console表格省略列作為排除新檔的理由。
- `npm run lint:fire`、`npm run lint:realm`：exit0、無警告。`npm run build`：TypeScript/Vite成功，39 modules，JS362.26kB / gzip114.63kB，無新依賴。
- `npx playwright test --reporter=list --output=test-results/realm-full-regression`：64 passed (4.7m)，含既有54項與realm10項。後加的嚴格DOM序列、試局兩步、底部預覽斷言另由最後WebKit及公開測試覆蓋。
- 舊fire.spec的manifest精確斷言由mode=fire改mode=realm，對應本次授權的新PWA入口；既有奪火的離線重載/走子斷言全保留。其餘舊案例及門檻未改，未跳過失敗案例。
- Fresh code/React/TypeScript審查無HIGH/CRITICAL。獨立真引擎隨機2,000局/16,000步/2,623次逆轉/101平手，卡死及輸入污染均0；另實測modal停AI、換局舊timer、同tick三次確認只一步、完局只存一次、放棄未完局不污染紀錄。
- 焦點與錯誤提示補丁fresh實測：Tab/ShiftTab各8次，tabEscapeCount=0，Escape還原焦點true；錯誤落子不改狀態、不啟用確認，合法逆轉8:0。
- 測試量測器fresh鑑別：humanOnly=PASS、humanAndLegalAI=PASS、missingHuman=REJECT、wrongHuman=REJECT、illegalAI=REJECT、doubleAI=REJECT，exit0。這是量測器證據，不代稱產品E2E。

變更對應：src/realm/engine.ts及ai.ts為規則/AI；各.test.ts驗人工數值、非法/純度及AI；storage.ts及其測試為獨立本機紀錄；RealmApp.tsx/realm.css為手機界面、光流、教學、預覽/提交/紀錄；main.tsx增加獨立路由；manifest/index為新入口及標題；vite/eslint/package設定加入檢查範圍、版本與指令（不改門檻或引入依賴）；e2e與WebKit設定為實機制瀏覽器驗證；README/SPEC/本檔及截圖為交付。`git diff --check` exit0，無無關功能變更；回歸重拍的舊fire兩張截圖已還原，保留既有證據。

Pages送達與公開網址核心測試仍待下方補記，尚不宣稱公開已更新。

## 截圖

已檢視第一輪 `realm-mobile.png`、`realm-supply.png`、`realm-narrow-preview.png`、`realm-desktop-preview.png`。B2橫向與C3縱向的光線在C2交會，格內得分10、頂部分數5→15(+10)、供應欄6+4互相吻合。390與320手機格子及主操作無截字，手機須縱向捲動到操作區；固定footer確認與取消保持可見。後續重跑另存viewport截圖，避免fullPage對固定元素位置的拼接造成誤解。

第二輪另檢視 `realm-mobile-viewport.png`（390×844）、`realm-narrow-preview-viewport.png`（320×700）、`realm-desktop-preview-viewport.png`（1366×768）：當前操作區與底部確認／取消完整可見。後續介面改善已在底部確認列加上當前／預覽雙方分數，手機不必向上捲動才能查分；最新WebKit加嚴斷言已確認，另實看更新後320圖底部「修5→11｜天6→6」與完整操作按鈕。

WebKit另檢視 `realm-mobile-viewport-webkit.png`、`realm-supply-webkit.png`、`realm-draw-result-webkit.png`：光線、得分、殘骸與平手結果可辨識，控制項無截字，實際touch操作通過。WebKit的截圖使用裝置像素比例3，圖檔像素寬度高於CSS的390px。

本機截圖共16張：`realm-mobile*`、`realm-supply*`、`realm-draw-result*`分別保留Chrome與WebKit完整頁／viewport；`realm-narrow-preview*`及`realm-desktop-preview*`保留Chrome完整頁／viewport。公開網址截圖另加`-live`後綴，避免覆蓋本機證據。公開網址仍待部署驗證。

## 加嚴紀錄

2026-10-23：既有`@live`試局案例增加玩法對話框必須寫「雙方各兩步」、不能寫「六步」，及犧牲A2轉B2預覽時底部須列「修5→8／天6→0」；同時確認未落子仍是5：6，取消後狀態不變。未刪案例、未改原本人工期望分數。這組新增斷言已在本機WebKit實跑通過，公開網址核心測試仍待部署。

同日修正AI測試的量測方式：慢速瀏覽器從click返回時，AI可能已回應，原本僅在click返回後讀取state會錯過已發生的人類中間態。AI旅程改在確認前以MutationObserver保存棋盤實際DOM的data-state序列，仍必須捕捉到精確applyAction(before, humanAction)的完整ply+1狀態，並確認其後至多一次合法AI回應；沒有以直接接受ply+2取代中間態。Observer限該action窗口並以finally清理。同機局、重複確認仍維持精確一步，不變更規則、預期結果或回合上限。

## 限制

自動測試確認規則與操作路徑，不評價策略品質、平衡或長期可玩性。瀏覽器模擬手機與WebKit測試不等同於實體iPhone／Android測試；尚無真人遊玩結果。
