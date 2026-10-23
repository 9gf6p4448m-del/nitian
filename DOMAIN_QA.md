# 爭域制驗證紀錄

凍結依據：`DOMAIN_ACCEPTANCE.md`，基準 `d049f34`。未執行或缺送達證據的範圍均為未驗證，不以測試發現或型別檢查替代瀏覽器實跑。

## 覆蓋設計

| 範圍 | 固定驗收 |
| --- | --- |
| 初始與觸控 | 完整局總神力2：2、區數1：1及四區數值；390 touch預覽／取消、雙擊僅一步、44px、無溢出 |
| 跨區供應 | 試局5：6、區數2：1；C2大壇接B2橫3及C3縱2，總分15：6、東北10：6、區數3：0；取消不污染 |
| 同腳本對照 | B4橫3、B3橫3、C2普通壇、D4普通壇；終局13：12而區數1：2，爭域天勝／總分修勝；檢查結果原因、JSON及紀錄 |
| 切換重開 | 保留mode／opponent／humanSide／first，只換勝利規則，重設棋盤與步驟 |
| AI | 兩制完整局、玩家後手；確認前MutationObserver記錄真實人類中間態，之後最多一次合法AI回應 |
| 平手 | 完整12手固定對稱腳本，總分12：12、區數2：2及平手原因；四區10：0／0：2／2：0／0：10 |
| 暫停與舊AI | 新局選規則視窗暫停AI；改規則換局後等待超過AI延遲，不得收舊回應 |
| 相容性 | 舊本機紀錄缺勝利規則仍可讀，標示總分制 |
| 版面 | 320×700與1366×768無橫溢；主操作至少44px；確認／取消完整在viewport |
| PWA | Service Worker接管後離線reload，離線重開兩制及下棋 |

新增 `e2e/domains.spec.ts` 共9項，其中5項標記 `@live`。iPhone WebKit設定只執行這5項核心旅程。Chrome完整回歸包含新9項及舊64項。

## 實際結果

| 指令／環境 | 實際輸出 | 狀態 |
| --- | --- | --- |
| `npx playwright test e2e/domains.spec.ts --list` | `Total: 9 tests in 1 file`，exit0 | 測試發現通過，尚非瀏覽器實跑 |
| `npx playwright test --config playwright.domains-webkit.config.ts --list` | `Total: 5 tests in 1 file`，exit0 | 核心篩選通過，尚非瀏覽器實跑 |
| `npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types node e2e/domains.spec.ts playwright.domains-webkit.config.ts` | 無錯誤輸出，exit0 | 測試與設定型別檢查通過 |
| `npx playwright test e2e/domains.spec.ts --reporter=list --output=test-results/domains-chrome`（首輪） | `4 failed, 5 passed (1.3m)`，exit1 | 未驗證：A1測試期望誤寫；確認列缺總分前後箭頭；總分制缺控制區計數（影響2項），待補正重跑 |
| `npx playwright test --reporter=list --output=test-results/domains-full-regression`（修正後） | `73 passed (4.7m)`，exit0 | 本機Chrome新9項與舊64項完整回歸通過；無跳過 |
| `npx playwright test --config playwright.domains-webkit.config.ts --reporter=list --output=test-results/domains-webkit` | `5 passed (1.1m)`，exit0 | 本機iPhone WebKit核心通過；含touch及離線兩制 |
| `$env:TEST_URL='https://9gf6p4448m-del.github.io/nitian/'; npx playwright test e2e/domains.spec.ts --grep '@live' --reporter=list --output=test-results/domains-public-chrome` | `5 passed (36.3s)`，exit0 | 公開Chrome通過 |
| `$env:TEST_URL='https://9gf6p4448m-del.github.io/nitian/'; npx playwright test --config playwright.domains-webkit.config.ts --reporter=list --output=test-results/domains-public-webkit` | `5 passed (1.1m)`，exit0 | 公開iPhone WebKit通過 |
| `npm run test:coverage` | 12 files、161 tests passed；statements98.31%、branches94.59%、functions99.52%、lines99.59% | 通過；原四項80%門檻不變 |
| `npm run lint:fire`、`npm run lint:realm` | exit0、無警告 | 通過 |
| `npm run build` | TypeScript/Vite成功、39modules；發布JS366.32kB/gzip115.86kB | 通過；無新依賴 |
| fresh React／TypeScript／規則審查 | APPROVE，無HIGH/CRITICAL；兩項MEDIUM已修並實測GREEN-RED-GREEN | 通過，見下 |

## 驗算修正與獨立核對

首輪保留所有案例：完整局A1普通壇會接到C1橫向神力2，新增西北控制，所以預覽應為修1→2區、落子後總神力4：2與區數2：1，原測試誤寫1→1已更正。確認列保留較強的5→15／6→6前後斷言，由介面補上；總分制也保留區數與四區對照斷言。未改凍結驗收或跳過測試。

Fresh審查以記憶體載入本版與基準d049f34的真實引擎，獨立核對128個合法reachable states，四域oracle/原動作庫存步數相容/總分贏家相容均PASS；12個局面用無剪枝minimax核對AI選擇，PASS。不是另抄引擎後以同一程式自證。

兩項MEDIUM為爭域新局仍誤教總分勝法、四域預覽僅aria標示；已按規則改notice並加入可見「目前四域／四域預覽·尚未落子」。獨立Vite4181+Chrome320實跑19項全true；僅記憶體還原故障文案/標題後domainsNotice/domainsPreviewHeading/powerPreviewHeading變false；恢復後19項全true、noPageErrors=true。輸出GREEN-RED-GREEN，4181已關閉，未改dist。

`e2e/realm.spec.ts`只新增原總分制URL參數與新局明選power，原案例/數值斷言保留。新增domain.test.ts11個測試及storage相容案例，原149測試未刪。coverage-final.json中realm engine/AI四項均100%（總體如上），不是僅擴充測試數。

範圍檢查：engine/AI為新增判勝及評估，storage/測試為規則欄位與舊紀錄相容，RealmApp/realm.css為四域及對照操作，package/lock僅版本0.4，e2e/config為兩制流程，README/REALM_SPEC/DOMAIN文件及新截圖為交付。`git diff --check` exit0；合法動作、庫存、步數無變，未改其他遊戲引擎。

## 送達證據

- 爭域網址：https://9gf6p4448m-del.github.io/nitian/?mode=realm&victory=domains
- 總分網址：https://9gf6p4448m-del.github.io/nitian/?mode=realm&victory=power
- 功能提交61935b2d42d9f1257b90be380103759d1d77eb05；發布來源3ee60a8138426d445e5dd4c299f4243ef435e12b（2026-10-23 22:13:17+08:00，僅補文件EOF格式，runtime同61935b2）。`git push origin HEAD:main`：d049f34..3ee60a8。
- `npm run deploy:pages`實際輸出`Published`。`git log origin/gh-pages -1`為271b52f50c1053cb1bfe7185a36bd13497ae167e，時間2026-10-23 22:13:43+08:00。
- `gh api repos/9gf6p4448m-del/nitian/pages/builds/latest`：status=built、commit=271b52f...、updated_at=2026-10-23T14:14:35Z（台灣22:14:35）。
- 公開version.json實讀：version=nitian-s0-08a0f46b0fb4、commit=3ee60a8138426d445e5dd4c299f4243ef435e12b、builtAt=2026-10-23T14:13:22.860Z，與dist相符。cache前綴沿用既有產生器，遊戲版本0.4。
- 公開Chrome/WebKit各5項通過，含真touch/預覽取消/雙擊、跨區多源、同腳本兩制贏家相反/JSON/切換、兩制AI及後手、離線reload與兩制下棋。另兩瀏覽器直接開victory=power網址，教學=總分制、state.victory=power、ply=0，exit0；不是只檢查HTTP首頁。
- 來源提交後僅補本QA、docs/domain-delivery.json與22張公開截圖，無runtime變更；文件提交不需要重部署，也不冒稱為線上來源SHA。
- 若既有PWA仍是0.3，直接開上述新連結，或按「有新版，立即更新」（會重開本局）。新安裝可Safari分享→加入主畫面，未在實體手機安裝驗證。
- 機器可讀證據：[domain-delivery.json](docs/domain-delivery.json)。

## 截圖

本機Chrome已保留16張 `docs/screenshots/domain-mobile*`、`domain-cross-preview*`、`domain-cross-supply*`、`domain-contrast-domains*`、`domain-contrast-power*`、`domain-draw-result*`、`domain-narrow-preview*`、`domain-desktop-preview*`。每個旅程都有fullPage與viewport；WebKit核心另存10張 `-webkit` 圖，公開網址將加 `-live`，避免覆蓋本機證據。

已實際檢視Chrome跨區預覽viewport、總分制對照完整頁、320窄手機viewport及12手平手完整頁；WebKit另檢視跨區預覽viewport。四區卡依西北／東北／西南／東南排列，中線清楚且供應光流跨區不中斷。C2大壇顯示10，來源列為6+4；固定確認列顯示控制區修2→3／天1→0與神力修5→15／天6→6，確認與取消完整可見。總分制頁明示區數僅供對照、總神力決勝，13：12與區數1：2可同時核對。WebKit圖檔使用裝置像素比例3，像素寬度高於CSS390px。

全Chrome回歸重拍的既有realm／fire／battle／duel／clarity截圖已由整合端還原，以保留既有交付證據；新功能證據只保留domain前綴。

公開另有22張live圖（核心20張＋直接總分URL2張），總domain圖48張。已檢視公開爭域結果、WebKit跨區預覽，頁腳0.4／22:13:22，總分13:12但控制1:2而天眾獲勝；跨區光流及固定預覽前後數字清楚。WebKit正常出現更新提示，後續AI及離線仍通過。

## 限制

未驗證真人趣味、策略平衡、長期耐玩性或實體手機安裝；自動測試不代稱上述結果。
