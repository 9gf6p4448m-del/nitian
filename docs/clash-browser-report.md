# 奪勢 0.6 瀏覽器驗證紀錄

時間：2026-10-24，Asia/Taipei。基準：`b01bcb26d178c4a4abeef0ca8e0effaecb155ed5`。測試檔：`e2e/clash.spec.ts`，14 個具鑑別力案例，零重試、單 worker；WebKit 設定：`playwright.clash-webkit.config.ts`。

本報告涵蓋本機 production preview，非 dev server。手機為 Playwright 390×844 觸控模擬，另有 1366×768 桌面與 320×740 窄螢幕；不代表真實 iPhone/Safari 安裝或已驗證耐玩。沒有修改舊模式測試與 manifest、沒有注入遊戲狀態。遊戲操作使用 click/tap/keyboard/selectOption；`data-state` 僅讀取並與純函式解析器比對。

## 案例與已取得的結果

| 範圍 | 驗證內容 |
| --- | --- |
| 手機 | 16 格、輪內/次輪順序、觸控操作、無水平溢出、確認列最小高度 |
| 預覽 | 點卡→落點→方向→實際傷害/路徑；預覽與取消不改狀態；真實 double click 只提交一手 |
| 雷泉 | B4 置泉→啟動 B3 槍將向東→3 傷害移除 C3 敵軍→2:0 勝局 |
| 變陣 | B3 修方與 C3 天方換位，只有指定棋子向北攻擊，換位者 HP/方向保留 |
| 桌面/320 | 桌面棋盤不被固定列遮住；祭壇非法落點拒絕；320 寬選牌/方向/預覽無水平溢出 |
| 同機 | 換手無手牌按鈕；Escape、Tab、背景點擊均無法跳過遮罩 |
| 對話框 | 鍵盤開啟、Escape 關閉、焦點歸還；help/settings 開啟超過 AI 延遲後仍無 AI 行動 |
| 結果 | 試局勝、敗、和各一條 UI 路線；同種子/新種子重開；完整六輪 12 手先手交替，6:6 和局 |
| AI | 每個實際行動都在合法集合內，使用相同解析器重放，牌量守恆；同 seed/相同人類動作產生同 AI 動作 |
| 紀錄 | 實際 JSON 下載與解析；完整終局 state/逐手；回饋保存一次，重載仍保留；未終局 export 不含 hands/decks |
| PWA | 新 clash manifest 獨立 identity；舊 manifest 與基準內容相同（僅正規化 Git Windows CRLF）；舊入口保留 |
| 離線 | 正式 service worker active/controller 後斷網，重新載入可操作並確認一手，保留圖集 |

AI 的 UI 驗證證明實際動作合法及重現性，不單獨宣稱它足以證明內部從未讀取隱藏資訊；資訊邊界仍由純函式測試及程式覆審補足。

## 執行指令與實際輸出

Agent Browser 不在 PATH，使用專案既有 Playwright 1.64.1。Chrome 由既有設定指定 `channel: 'chrome'`，WebKit 由新設定指定。無新依賴。

預覽 server（4173 原先無 listener，由本工作啟動）：

```powershell
npm run preview -- --port 4173 --strictPort
```

輸出：`Local: http://127.0.0.1:4173/nitian/`。server session：1692。

初版 build：`nitian-s0-b88272d099f1`，`builtAt=2026-10-23T17:57:59.670Z`。

```powershell
$env:TEST_URL='http://127.0.0.1:4173/nitian/'; npx playwright test e2e/clash.spec.ts --workers=1 --retries=0
```

首例發現 `getByLabel('局型', exact:true)` 未能定位含 option 文字的巢狀 label；45.4 秒超時後中止，改用畫面可存取名稱一致的 `getByRole('combobox')`，未改產品與驗收。

```powershell
$env:TEST_URL='http://127.0.0.1:4173/nitian/'; npx playwright test e2e/clash.spec.ts --workers=1 --retries=0 --max-failures=1
```

實際：`4 passed (10.1s)`；`1 failed`，`9 did not run`。失敗為桌面棋盤底部 `763.65625`、固定列頂部 `699`，最下一列被遮住。主線修正 CSS，未移除斷言。

```powershell
$env:TEST_URL='http://127.0.0.1:4173/nitian/'; npx playwright test e2e/clash.spec.ts --workers=1 --retries=0 --grep '320 width|hotseat handoff|help and settings|study loss|full six|AI actions|completed study|clash manifest|production service'
```

實際：`7 passed (1.2m)`、`2 failed`。兩項為測試腳本問題：JSON 重載後未先揭開合法同機遮罩；Git 基準 LF 與本機 checkout CRLF 的逐位元比較。補正操作步驟並僅正規化換行，未降低內容驗收。

```powershell
$env:TEST_URL='http://127.0.0.1:4173/nitian/'; npx playwright test e2e/clash.spec.ts --workers=1 --retries=0 --grep 'clash manifest'
```

實際：`1 passed (2.8s)`。

修正版 build：`nitian-s0-c74a3ec5c944`，`builtAt=2026-10-23T18:02:44.809Z`。主線 build 後重跑受影響 Chrome 範圍，未無謂重跑已通過的不受影響案例。

```powershell
$env:TEST_URL='http://127.0.0.1:4173/nitian/'; npx playwright test e2e/clash.spec.ts --workers=1 --retries=0 --grep 'desktop 1366|help and settings|completed study|clash manifest|production service'
```

實際：`5 passed (13.6s)`。桌面遮擋已修正，JSON 新增確認保存局型及未終局公開視圖，對話框與新版本離線流程皆通過。

```powershell
$env:TEST_URL='http://127.0.0.1:4173/nitian/'; npx playwright test --config=playwright.clash-webkit.config.ts --workers=1 --retries=0
```

實際：`14 passed (59.6s)`，零失敗、零跳過、零重試。

## 實際畫面檢視與後續

已用 `view_image` 實看 Chrome 手機初盤/攻擊預覽/終局與修正版桌面 viewport；也實看 WebKit 手機初盤 viewport/預覽/終局。紅銅與象牙棋子、HP、方向、傷害射線、輪次與勝負均可辨認。

WebKit 全綠後的人工檢視發現手機棋盤縮至約218px：實測 `innerWidth=390`、`min-width:701px=false`、`arena max-width=350px`、`arena width=218.1875px`。已回報主線將全域 `justify-self:center` 限定在桌面 media，等待最終版對受影響手機範圍重驗。這項視覺問題不因測試全綠而略過。

主線同意把390手機棋盤加嚴為寬度至少340px；320原標準不變。對仍有問題的舊dist執行：

```powershell
$env:TEST_URL='http://127.0.0.1:4173/nitian/'; npx playwright test --config=playwright.clash-webkit.config.ts --workers=1 --retries=0 --grep 'phone initial board'
```

實際：`1 failed (1.9s)`，`Expected: >= 340 / Received: 218.1875`，證明新斷言能擋下本次已看見的視覺退化。修正 source 後尚待正式 build/公開版重驗；不把先前14綠當作該新斷言已通過。

截圖位於 `docs/screenshots/clash-*`；`-viewport` 是實際視窗，無該字樣是 full-page。公開版本另用 `-live` 避免覆蓋本機證據。HTML 報告與失敗 trace 在忽略的 `playwright-report/`、`test-results/`，後續執行可能更新；上述輸出摘要保留失敗軌跡。

上述為本機階段；下列追加公開 Pages 結果。preview session1692 已用 Ctrl+C 結束（exit1），其後 `Get-NetTCPConnection -LocalPort 4173 -State Listen` 無輸出，確認無殘留 listener。

## 公開最終版送達與驗證

公開入口：`https://9gf6p4448m-del.github.io/nitian/?mode=clash`。執行 `Invoke-RestMethod 'https://9gf6p4448m-del.github.io/nitian/version.json' | ConvertTo-Json`，實際取得：

```json
{
  "version": "nitian-s0-6b82fddf0a6a",
  "commit": "71c485444d615262fe3cd501c9db081039e17dc6",
  "builtAt": "2026-10-23T18:11:11.417Z"
}
```

主線另核對 Pages 部署 commit `1bacf30e24689f8f6130ffa2ce389b9c34b70af9`、`updated_at=2026-10-23T18:12:34Z`。瀏覽器實跑前先核對同一公開版本，不把本機通過當作已送達。

```powershell
$env:TEST_URL='https://9gf6p4448m-del.github.io/nitian/'; npx playwright test e2e/clash.spec.ts --workers=1 --retries=0
```

實際：`14 passed (48.3s)`，Chrome 全範圍零重試。

首張遠端圖片截圖時，兩張既有圖集（2,491,675 bytes/3,138,457 bytes，HEAD 均200）仍在下載，畫面有文字/HP但未出現美術。保留原圖 `clash-phone-initial-viewport-chromium-loading-live.png`、`clash-phone-initial-chromium-loading-live.png`。新 `capture` helper 先等待 CSS 背景兩張圖集的 Image.onload/onerror，再拍攝；沒有 sleep，也不修改遊戲狀態。Chrome 補拍僅跑五個有畫面產物的相關案例。

```powershell
$env:TEST_URL='https://9gf6p4448m-del.github.io/nitian/'; npx playwright test --config=playwright.clash-webkit.config.ts --workers=1 --retries=0
```

初次公開 WebKit：`12 passed (1.5m)`、`2 failed`。JSON 重載案例暴露 `reveal()` 用即時 `.count()` 判斷對話框的 race：React showModal effect 尚未完成時被漏過，之後手牌仍被正確遮蔽。修為先等「可點手牌或已開啟交接對話框」之一，再操作遮罩。另一項為 SW active 的5秒 poll 在5.6MB遠端預快取完成前超時，並非已快取後的離線操作失敗；保留失敗結果，待以明確 ready 事件重驗。

公開 WebKit 390×844 額外唯讀量測實際輸出：`{ viewport: 390, boardWidth: 350 }`。新340px斷言通過；相較問題版218.1875px，修正版恢復350px。已用 `view_image` 實看公開 WebKit 初盤 viewport、攻擊 preview、勝局與桌面 viewport：圖集完整、射線與傷害2可見、棋盤無桌面遮擋。手機完整頁含固定操作列；操作列在實際視窗底部，頁面可垂直捲動查看預覽。

```powershell
$env:TEST_URL='https://9gf6p4448m-del.github.io/nitian/'; npx playwright test e2e/clash.spec.ts --workers=1 --retries=0 --grep 'phone initial|spear preview|spring placement|desktop 1366|320 width'
```

Chrome 圖集條件等待後補拍實際：`5 passed (16.6s)`。已用 `view_image` 再看初盤 viewport、預覽 viewport 與終局，棋子、卡圖、射線傷害與固定確認列皆有顯示。`-live` 是補拍後完整載圖，`-loading-live` 保留最早未載圖階段；本機截圖未覆寫。

主線確認凍結要求是「SW確實active且離線可出牌」，沒有5秒安裝商業門檻，允許改成 `navigator.serviceWorker.ready` 真正事件等待，仍受原 WebKit 整體90秒上限。事件返回後明確斷言 `active.state === 'activated'`，再重載、斷網與出牌，不跳過錯誤、不加sleep。

依主線要求，在共用reveal/helper修正後再完整跑公開WebKit14（指令同上）。實際：`13 passed (1.4m)`、`1 failed`；JSON重載/下載與其餘13項通過。離線案例於3.7秒失敗：`navigator.serviceWorker.ready` 已返回，但立即讀取 `active.state` 為 `activating`，與斷言 `activated` 不同。這是ready與activated的不同生命週期時點，並非安裝逾90秒，也不是離線後操作失敗；已回報主線，未自行再加超時或把activating當作通過。

主線同意修正驗證程式對ready的API語意：ready後先註冊statechange listener，再立即check當前state；activated才resolve並移除listener，redundant reject，沒有active則throw。保留原 `activated` 斷言與90秒整體上限。只重跑此一案例：

```powershell
$env:TEST_URL='https://9gf6p4448m-del.github.io/nitian/'; npx playwright test --config=playwright.clash-webkit.config.ts --workers=1 --retries=0 --grep 'production service'
```

實際：`1 passed (6.2s)`，案例執行5.3秒。確認activated/controller後斷網重新載入，經UI選槍將/落點/方向/確認，history確實變成一手，並保存有圖集的離線截圖。

最終公開證據：Chrome單輪14項通過（48.3s），另5項補拍通過（16.6s）；WebKit最後為13項＋離線1項分次通過，**不是單輪14綠**。全部14項現已各有最終版本通過證據，無跳過、無重試；上面保留所有故障與測試等待修正軌跡。公開runtime仍為 `71c4854` / `nitian-s0-6b82fddf0a6a`，後續只修改E2E等待邏輯與報告、圖片。沒有宣稱真實手機安裝或玩家體驗已通過。
