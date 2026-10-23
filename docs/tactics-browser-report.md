# 神壇交鋒瀏覽器驗證紀錄

日期：2026-10-23。驗收來源為凍結的 `TACTICS_ACCEPTANCE.md`，未改原案例、遊戲狀態 fixture、既有測試或門檻。Agent Browser CLI 不在本機 PATH，依既有專案採 Playwright 的實際 Chrome 與 WebKit。

## 範圍與限制

以 390×844／touch 與 1366×768 操作真實 UI。使用網址的公開 `seed`／`scenario`／`opponent`、新局表單與實際按鈕；不向頁面注入局面。Node 引擎只產生預期序列，每次預覽必須保持 serial 不變，確認後逐步比對 serial、回合、位置及 AP，終局下載 JSON 與整份預期狀態比對。

自動化並非實體 iPhone、Safari 安裝成功證明，亦非真人已確認好玩或平衡。公開網址與來源提交核對的實測結果見最後一節，與本機結果分開記錄。

## 首輪失敗與處置

`npx vitest run src/tactics/storage.test.ts`：`Test Files 1 passed (1)`、`Tests 5 passed (5)`。

`npx playwright test e2e/tactics.spec.ts --reporter=list` 首輪：`5 failed`、`12 passed (4.5m)`。四個新局／AI 計時器案例卡在 `getByLabel('局面', { exact: true })`。包住 select 的 label 包含 option 文字；透過實際瀏覽器重現後改用 `getByRole('combobox', { name: '局面', exact: true })`。第五個舊 duel smoke 原本未先點「開始交手」即找局內 `duel-turn`，補回正常入口操作。未跳過任何案例，未改手牌或種子以遷就失敗。

首輪定位失敗截圖：`screenshots/tactics-first-run-new-game-selector-failure.png`。追加 handoff 鍵盤與取消換局回歸、最新兩張 atlas 後，再跑同命令為 `19 passed (1.6m)`。

## 固定種子與決策

- `nitian-browser-05` 練習盤：正常規則會給阿修羅疾步、迷霧、月刃、血誓，驗證 D3 傷害3、取消、實際扣血、月刃換裝後不能直打／可斜打、疾步、迷霧、血誓失壇與後續占壇。
- `nitian-cards-0` 完整局：首手固定為 `spear,dash,blood,spring`，公開 seed 初掃後即固定；從新局 UI 輸入，實際施放雷泉B3與裝備長槍。先後手與玩家陣營也透過表單切換。
- `nitian-complete-05` 完整八輪：雙方的每一手都透過 UI 選擇、預覽與確認，沒有空過。30 次決策包含9移動、6占壇、7攻擊、疾步3／長槍2／雷泉3次用牌。2次擊倒；終局壇數2:2、擊倒0:2，天眾依擊倒數勝出。每次 run 的 `seed-decision-record` attachment 保存完整 decisions 與 log；下載 JSON 必須與該序列的完整 state 相等。

完整局的30手依序：移C4、占D4、天眾疾步A1、占A1、修羅疾步C2、移C1、天眾長槍、攻C1、占D1、修羅長槍、天眾雷泉A2、攻C1、修羅雷泉C2、攻A1、攻C1、移B1、移B3、天眾疾步D1、占D1、移B2、移B1、天眾雷泉D2、攻B1、占A1、攻D1、攻B1、移C1、移B3、移B1、占A1。

## 視覺實看

已實看手機預覽及首屏截圖：紅銅修羅／白金天眾剪影、主將「修／天」生命標籤、角落祭壇、藍色雷泉及霧格能分辨，並非只靠色彩。攻擊預覽同時顯示「預估傷害3」及「長槍2＋雷泉1」。固定確認列在螢幕內且觸控目標達44px；390寬文件沒有水平溢出。

較小手機棋盤使角色細節與格內8–9px標籤偏細；外圍座標及主將狀態仍可辨。首屏可見前三張手牌，第四張需要滑動手牌列；自動化實際可滑到並使用血誓。桌面若同時出現更新提示，棋盤下排需垂直捲動才完整露出固定確認列上方；實際占D4仍可操作。這些是實看結果，仍應以實體手機確認閱讀舒適度。

圖檔名稱含 `phone|desktop`、`chromium|webkit` 與 `viewport|full-layout|attack-preview|lesson|finished`。`viewport` 為實際 viewport 截圖，其他可含完整頁面；請勿將 full-page 的長度當作手機螢幕高度。最新截圖均在 `docs/screenshots/tactics-*.png`。

## 本機驗證結果

`npx playwright test e2e/tactics.spec.ts --repeat-each=3 --output=test-results/tactics-chrome`：`57 passed (4.6m)`，三輪皆無失敗、無 skip、無 retry。原命令使用專案共用 HTML 報告 `playwright-report/index.html`，後續既有回歸會覆蓋此路徑；本節保留該次實際輸出。

為避免兩個 runner 的 preview 生命週期相互影響，另外執行 `npm run preview -- --port 4174 --strictPort`，下列 TEST_URL 指向該相同 dist。

`$env:TEST_URL='http://127.0.0.1:4174/nitian/'; npx playwright test --config=playwright.tactics-webkit.config.ts --repeat-each=3`：`57 passed (8.1m)`，三輪無失敗、無 skip、無 retry。當次 HTML 報告已移入 `playwright-report/tactics-webkit-stability/index.html`；後續設定整理為已被 gitignore 涵蓋的 `playwright-report/tactics-webkit/index.html`，不改執行範圍或門檻。

新增獨立 manifest 與血誓／兩格轉彎疾步後，只單輪執行受影響案例：

- `$env:TEST_URL='http://127.0.0.1:4174/nitian/'; npx playwright test e2e/tactics.spec.ts --grep 'blood oath|manifest|offline' --reporter=list --output=test-results/tactics-new-cases-chrome`：`4 passed (11.8s)`。
- `$env:TEST_URL='http://127.0.0.1:4174/nitian/'; npx playwright test --config=playwright.tactics-webkit.config.ts --grep 'blood oath|manifest|offline'`：`4 passed (18.5s)`。

兩者均確認 head 指向 `tactics.webmanifest`、內容 id／start_url 為 `./?mode=tactics`，斷網重載後仍可 fetch 該 manifest、解碼兩張 atlas、實際攻擊。血誓先交還A4，預覽傷害5＝長槍2＋雷泉1＋血誓2，取消後再次確認仍造成5傷害；疾步從C3經C4到B4，沒有跨過B3雷泉。

最後再次執行 `npx vitest run src/tactics/storage.test.ts`：`Test Files 1 passed (1)`、`Tests 5 passed (5)`。儲存測試涵蓋損毀資料、設定正規化、拒讀／拒寫、未完成局不入庫、20局上限、去重、回饋保存與完整JSON匯出。

## 公開網址驗證

公開入口：`https://9gf6p4448m-del.github.io/nitian/?mode=tactics`。執行前以 `Invoke-WebRequest` 實讀 `https://9gf6p4448m-del.github.io/nitian/version.json`，HTTP Date `Fri, 23 Oct 2026 15:50:24 GMT`、Last-Modified `Fri, 23 Oct 2026 15:49:39 GMT`，內容為：

```json
{"version":"nitian-s0-43f59c23fad1","commit":"67e5d60848e88fc06d9a2075a11f9770b531c73e","builtAt":"2026-10-23T15:48:17.428Z"}
```

來源提交與要求的凍結提交相同才啟動瀏覽器。公開截圖以 `-live.png` 結尾，保留本機證據。

`$env:TEST_URL='https://9gf6p4448m-del.github.io/nitian/'; $env:PLAYWRIGHT_HTML_OUTPUT_DIR='playwright-report/tactics-chrome-live'; npx playwright test e2e/tactics.spec.ts --grep '@live' --output=test-results/tactics-chrome-live`：`22 passed (1.9m)`，單輪無 skip、無 retry。HTML 報告：`playwright-report/tactics-chrome-live/index.html`。

`$env:TEST_URL='https://9gf6p4448m-del.github.io/nitian/'; npx playwright test --config=playwright.tactics-webkit.config.ts --grep '@live' --output=test-results/tactics-webkit-live`：`22 passed (3.4m)`，單輪無 skip、無 retry。HTML 報告：`playwright-report/tactics-webkit/index.html`。

公開兩套均通過390×844 touch與1366×768、素材解碼與44px觸控目標、六卡、傷害3／血誓傷害5、取消／防雙發、同機遮牌與Tab、AI暫停／換局清舊timer、30手完整八輪／JSON／重開、儲存失效、斷網重載含兩atlas與新manifest、既有入口smoke。沒有再執行舊73案。

公開首張 Chrome 桌面預覽截圖拍到PNG解碼過程、角色只出現上方細條，保留為 `screenshots/tactics-desktop-chromium-attack-preview-live-first-capture.png`。後續素材案例以 `Image.decode()` 驗證成功，確認不是遺漏檔案。補拍以獨立 Playwright CLI（`node --input-type=module`）從公開入口重新選「攻擊」與D3，在兩張CSS背景atlas完成decode並經下一個animation frame後拍預覽，再確認攻擊、等待結算完成後拍lesson；不改凍結source或跳過案例。實際輸出四組均為 `decoded 2 atlases; damage3 preview and committed lesson screenshots saved`（chromium／webkit × phone／desktop）。已實看補拍桌面圖及公開WebKit手機首屏，素材完整、傷害來源與確認列可辨。

測試完成後於 HTTP Date `Fri, 23 Oct 2026 15:55:14 GMT` 再讀 `version.json`，仍為相同 `67e5d60848e88fc06d9a2075a11f9770b531c73e`、`nitian-s0-43f59c23fad1` 與建置時間，未混入另一部署版本。檢查本代理的4174已無listener；未操作主線4183。

公開證據共有20張主要 `*-live.png` 加1張首次捕捉圖；本機圖仍保留。既有使用者若持續看到舊版，可連網重新載入並點「有新版，立即更新」；更新會重開目前對局，介面會先確認。以上仍不等於實體iPhone或真人已確認有趣。
