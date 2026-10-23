# 奪勢0.6：驗證與送達

日期：2026-10-24。基準`b01bcb2`；新增獨立`mode=clash`。本文件區分原始碼實跑、瀏覽器模擬、公開送達與真人評價。來源提交`71c485444d615262fe3cd501c9db081039e17dc6`已發布，公開瀏覽器最終結果補於下方送達紀錄。

## 指令與實際結果

- `npm run test:coverage`：17 files、246 tests passed，exit0。全域statement97.79%、branch93.69%、function99.20%、line99.67%；新clash為95.04%／90.17%／98.18%／99.63%。原四項80%門檻不變。
- `node scripts/check-clash-paper.mjs`：五條實際解析器路線通過；I 2:0、II 2:0、III 1:1、III_worse 1:2、I_reply 1:1；預覽不改原狀態且與正式結果相同，雙方終局手/庫/棄=3/7/2。對應紙上驗算見[分支紀錄](CLASH_PAPER.md)。
- `npm run lint:fire`、`npm run lint:realm`、`npx eslint src/ClashApp.tsx src/clash --max-warnings 0`：exit0；`git diff --check`無輸出。新增App納入原React hooks規則。
- `npm run build`：51 modules，exit0。正式source為`71c48544`，JS431.27kB/gzip136.70、CSS95.08kB/gzip21.06，precache14 URLs；未將大型Blender原始檔放入public或PWA。
- Chrome/WebKit詳細指令與每輪測試結果見[瀏覽器紀錄](docs/clash-browser-report.md)。本機首輪Chrome11/14過：desktop遮住棋盤為產品缺陷；另兩例為測試locator/交接步驟/換行正規化修正，未改驗收。desktop與JSON/dialog等受影響5例修後全過。WebKit本機完整14過，視覺檢視另發現手機棋盤縮小；後續修正、公開重驗與等待條件修正結果均列在下方，不以本機14綠代替最終證據。

## 審查找出的問題

- 本機紀錄schema只驗外層而接受null棋子/事件：先故障測試紅，補深層驗證後storage17例綠。新validator曾有unknown型別縮窄編譯失敗；只捕捉局部maxRounds/springs後，同`npx tsc --noEmit -p tsconfig.json`從exit1變exit0，runtime判準不變。
- 局型設定重載被full覆蓋：改明確query才覆蓋，fresh測得absent→study/2、explicit full→full/6、invalid→study/2。
- 長玩法dialog初次聚焦尾端，標題在畫面外：聚焦可程式focus的h2並回scrollTop0。fresh390×500為focusH2、scrollTop0、標題可見，Escape回開啟按鈕。
- 中途JSON漏敵手牌：先改公開視圖，又由fresh review抓到AI回合使用AI視角仍會漏；現固定人機為xiu視角，同機為當前揭牌方。RED exportsAIHand=true；GREEN exportPlayer=xiu、exportsHumanHand=true、export.state沒有hands/decks/seed；外層options.seed仍保留，供重現。
- 空白種子開始用trim、設定卻存原值，重載牌序改變：統一normalized Options建立/保存/顯示，fresh RED handsSame=false/decksSame=false，GREEN seed都review-seed且兩項都true。
- 桌面棋盤底部超過fixed footer：限制desktop arena依視窗高度縮放。修後desktop5受影響例全過。
- WebKit手機因desktop外justify-self:center縮為218.19px，雖44px點擊測試過但可讀性不足：將該屬性限制desktop media。加嚴390棋盤至少340px的案例在問題版紅，公開修正版綠，實測350px；最終圖已實際開啟檢視。

TS、React與跨模組code review均有獨立角色。React實測另確認預覽前後state字串相同、同一DOM同步點20次只出一手、modal暫停AI、新局不收舊timer、交接Esc不可關且手牌DOM0張。code reviewer的兩項finding皆有修前紅/修後綠；不把靜態閱讀冒認完整E2E。

舊模式回歸指令：`npx playwright test e2e/game.spec.ts e2e/duel.spec.ts e2e/clarity.spec.ts e2e/fire.spec.ts e2e/fire-touch.spec.ts e2e/realm.spec.ts e2e/domains.spec.ts e2e/tactics.spec.ts --reporter=list --output=test-results/clash-legacy-regression`，實際`95 passed (6.6m)`、exit0。測試產生的32張既有截圖已復原基準，沒有改舊程式/測試/圖檔；新增clash截圖分開保存。

## 公開送達紀錄

`git push origin main`推送source `71c4854`；`npm run build` exit0後，`npm run deploy:pages`實際輸出`Published`、exit0。`git fetch origin gh-pages`與`git log origin/gh-pages -1 --format='%H %cI %s'`實讀Pages提交`1bacf30e24689f8f6130ffa2ce389b9c34b70af9`，時間`2026-10-24T02:11:55+08:00`。

`gh api repos/9gf6p4448m-del/nitian/pages/builds/latest`讀得`status=built`、同一Pages提交，`updated_at=2026-10-23T18:12:34Z`（台灣10/24 02:12:34）。公開`version.json` HTTP200，回應Date為`Fri, 23 Oct 2026 18:12:54 GMT`，內容如下；既有`nitian-s0`為共用快取命名，不表示遊戲仍是舊版。

```json
{"version":"nitian-s0-6b82fddf0a6a","commit":"71c485444d615262fe3cd501c9db081039e17dc6","builtAt":"2026-10-23T18:11:11.417Z"}
```

公開實測：Chrome單輪`14 passed (48.3s)`；WebKit最後完整輪`13 passed (1.4m)`，離線生命週期等待修正後單例`1 passed (6.2s)`。WebKit是14項分次通過，沒有單輪14綠的宣稱。遠端圖集等待補拍Chrome5例`5 passed (16.6s)`，不增加獨立案例總數。兩個瀏覽器都實際斷網重載並出牌，不是只檢查manifest存在。完整指令與失敗軌跡見瀏覽器報告。

WebKit兩次離線驗證程式修正：首次5秒poll早於5.6MB預快取完成；改ready事件後，立即讀active.state仍可能是activating，因ready與activated並非同一時點。最終等statechange達activated才斷網；若redundant明確失敗，整體原90秒上限未變，沒有sleep或略過離線操作。交接reveal也改為先等可操作手牌或open交接dialog，避免React effect尚未掛上就讀count。截圖等待兩張CSS圖集實際load，保留最初未載圖的`-loading-live`畫面，不把網路下載中圖冒認最終畫面。

後續只補驗證文件、實際截圖與測試等待條件，不改runtime，main可能比runtime source新；不混淆來源與Pages提交。玩家必須使用`?mode=clash`新入口，0.4/0.5舊PWA捷徑保留原模式。新版提示按「更新並重開」更新SW，會重開當局；直接用新連結可核對本頁0.6。首次連網完成快取後才能離線。

## 已知限制

本版是候選玩法，尚未由使用者試玩0.6；沒有證實好玩、平衡、重玩意願或市場接受度。兩輪同勝剩軍力不同不能當成策略取捨證明。AI為公開盤面的啟發式，不宣稱最優。

瀏覽器手機尺寸與WebKit模擬不等於實體iPhone安裝/效能驗證。未完成局不恢復。單機客戶端內部`data-state`仍含完整診斷資料，正常介面遮蔽與匯出不漏牌，但不是有保密伺服器的防作弊多人環境。沒有帳號、網路多人、遺物/新角色、Unity遷移或美術市場測試。

## 製作人最值得試的三個情境

1. 兩輪試局用泉B2啟動B3槍，觀察敵人是否反用泉；能否不用規則長文解釋傷害3的原因？AI回應不限紙上路線。
2. 同機按紙上III走，最後比較槍D2與C1：同樣擊殺，為何一個和、一個輸？預覽是否真的幫助理解祭壇，而非只追最大傷害？
3. 六輪局用同seed重開，改一次早期部署/雷泉時機：是否產生想繼續處理的局勢？若只是更容易按，仍應記為「可讀性改善，趣味未解」。
