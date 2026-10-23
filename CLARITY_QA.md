# 結算理解改版實跑（2026-10-23）

基準41b7558。使用者試玩SUMERU敵先手後表示看不懂倒刺與結算，並要求繼續。此輪改教學、播放與說明，不改核心規則、卡牌、AI、牌組或既有門檻。

## 真實紀錄核對

匯出4回合在記憶體轉譯現有引擎重播，每回合timeline、全部events與after資源均assert.deepEqual：R1 9 events、R2 7、R3 7、R4 7，FINAL lost HP0/33。沒有修改使用者紀錄或把其識別碼加入repo。

- R1倒刺在敵奉還之後才執行，因此先掉4血，之後敵破勢掉6血才立即反傷6。
- R2敵破勢先扣6血，兩張護身才取得12盾；盾在R3開始清除。
- R4敵奉還19讓玩家23→4；玩家破勢讓敵39→33，立刻觸發敵倒刺6（實傷4）致死。玩家最後兩張牌未執行。

## 本機驗證

- `npm.cmd run test:coverage` → **5 files、82 tests passed**，Statements97.64%、Branches92.51%、Functions100%、Lines99.75%。原63案例與四80%門檻保留，新增19語意測試。
- `npm.cmd run build` → TypeScript及Vite通過。
- `npm.cmd run test:e2e` → **37 passed (2.4m)**，原26＋新增11。涵蓋四種教學逐事件、教學與正式交手隔離、1300ms暫停、逐步／略過一致、減少動態不覆蓋手動暫停、兩次重看不重存、390鍵盤／焦點與無溢出、真實SUMERU四回合反傷致死及未執行牌。
- 最後顯示微調後 `npx playwright test e2e/clarity.spec.ts --reporter=list` → **11 passed (43.1s)**，加強驗證敗北畫面直接顯示倒刺反傷6／實傷4及後招停止、手機長按鈕完整不裁切；原26未改，正式站再整套驗證。
- 教學缺功能RED：舊dist找不到「教學」按鈕，1 failed；新dist教學各案GREEN。
- 暫停優先序RED：手動暫停→設定勾減少動態，舊實作直接finish令事件面板消失，1 failed；guard優先後GREEN。
- 零效果原因RED：無雷引雷／無盾借甲／滿雷汲能原只顯示「資源沒有變化」，3 failed /16 passed；改以before快照說原因後19 passed。
- 新E2E有一處機械修正：原用innerText取快照，卻用toHaveText的textContent比對，block換行語意不同。改成poll同一innerText完全相等，保留1300ms等待、同一事件不變與下一步必變斷言，未放寬需求。
- 首輪手機首頁舞台因負margin16搭padding12造成document寬394，修為負margin12後document寬390；教學長退出鈕另改二欄，以實際截圖核對。
- React／TypeScript／最終code review沒有未解CRITICAL/HIGH；兩項MEDIUM（暫停優先序、零效原因）皆修並回歸。
- 實際手機畫面：[互動教學](docs/screenshots/clarity-lesson-mobile.png)／[暫停逐事件](docs/screenshots/clarity-paused-mobile.png)／[反傷致死總結](docs/screenshots/clarity-defeat-mobile.png)。

## 範圍

`git diff --exit-code 41b7558 -- src/game/duel.ts src/game/data.ts src/game/rng.ts src/game/duel.test.ts src/game/engine.ts src/game/engine.test.ts src/storage.test.ts src/duel-storage.test.ts e2e/duel.spec.ts e2e/game.spec.ts package.json vite.config.ts playwright.config.ts` → 空白、exit0。卡數值、隨機牌序、AI及原驗收未改。

新增判準為CLARITY_ACCEPTANCE.md、src/game/explanations.test.ts與e2e/clarity.spec.ts。新增展示模組explanations.ts、教學／重看ResolutionHelp.tsx，修改DuelApp.tsx與duel.css；README／DUEL_SPEC補操作與時效。

## 送達

- 程式來源：`f92fcfa78cfc2f49104793c805b8d246078bc428`（2026-10-23 15:22:28 +08:00）。後續提交只補QA送達證據與畫面，不改程式，因此main可比version.json多一筆文件提交。
- `npm.cmd run deploy:pages` → `Published`、exit0。
- `git log origin/gh-pages -1 --format='%H %cI %s'` → `d6107cc49a210801122acefe49c254ff19950677 2026-10-23T15:22:59+08:00 Updates`。
- 本機dist與線上version.json一致：`nitian-s0-928758b262f0`、source `f92fcfa78cfc2f49104793c805b8d246078bc428`、builtAt `2026-10-23T07:22:43.846Z`。
- `gh api repos/9gf6p4448m-del/nitian/pages/builds/latest` → `status: built`、commit `d6107cc49a210801122acefe49c254ff19950677`、updated_at `2026-10-23T07:27:00Z`（台灣15:27）、error null。GitHub Actions曾排隊，已等正式站source對齊後才跑線上測試。
- 正式站命令：`$env:TEST_URL='https://9gf6p4448m-del.github.io/nitian/'; npm.cmd run test:e2e` → **37 passed (2.6m)**、exit0。含新教學、暫停／逐步、實際SUMERU反殺與重看、新舊對戰完整勝敗、手機與離線。
- 教學圖已由正式站390×844測試重拍（頁尾07:22 UTC）；暫停與敗北圖為同程式碼production preview實拍（07:18 UTC）。不是實體手機安裝截圖。
- PWA更新：連線開啟原網址，看到「新版本已備妥」按「更新並重開」。首頁應有「先學倒刺與順序」，上方有「教學」；頁尾2026-10-23 07:22 UTC（台灣15:22）。優先使用頁內更新，清網站資料會刪除本機紀錄。

變更檔案與行號：`src/DuelApp.tsx:49`接播放與教學、`:185`起暫停timer；`src/ResolutionHelp.tsx:10`事件面板、`:27`教學、`:54`獨立重看、`:67`回合總結；`src/game/explanations.ts:46`解釋快照、`:68`逐牌因果、`:146`真引擎示範。`src/duel.css`修手機布局，README／DUEL_SPEC補操作。`git show --stat f92fcfa`：13 files changed、884 insertions、15 deletions。後續QA／一張正式站截圖更新不改程式。

## 仍未驗證

沒有真人重新試玩此教學，尚不能宣稱已看懂或好玩。手機尺寸／觸控模擬不等於實機PWA安裝。最後一手優勢、單局平衡與每回合操作時間仍待觀察；本輪沒有改這些規則。
