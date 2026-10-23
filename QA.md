# S0 驗證與送達紀錄 · 2026-10-23

## 交付版本

- 原始碼：https://github.com/9gf6p4448m-del/nitian
- 正式試玩：https://9gf6p4448m-del.github.io/nitian/
- 遊戲程式來源提交：`cea2f606023636ada05db729d07e428ef819c2c0`。
- Pages提交：`a029d312d964ec72b853da7c69f0eaba7a883191`。
- Pages提交時間：`2026-10-23T11:52:38+08:00`。
- Pages建置完成：`2026-10-23T03:53:21Z`，台北11:53:21，status=`built`，error.message=`null`。
- 線上 `version.json`：`nitian-s0-8c4034928409`，builtAt=`2026-10-23T03:51:04.683Z`。
- 線上版本及來源提交與實測dist比對：`Matches: true`。
- 本紀錄與截圖為發版後的文件提交；未改動上述已部署的遊戲程式或資產。

## 實跑證據

同一程式提交在 `C:\Users\shung\work\nitian-verify` 驗證，未改案例／種子／門檻。
Chrome版本155；Node24.16；固定單worker、零重試；沒有skip或quarantine。

|指令原文|實際輸出|
|---|---|
|`npm.cmd run test:coverage`|`Test Files 2 passed (2)`；`Tests 31 passed (31)`|
|同上，規則／儲存核心coverage|Statements99.51%；Branches95.45%；Functions100%；Lines100%|
|`npm.cmd run build`|`tsc -b && vite build && node scripts/build-pwa.mjs` exit0；22 modules；PWA預快取10 URLs|
|`npm.cmd run test:e2e`，本機production|`11 passed (23.5s)`|
|`$env:TEST_URL='https://9gf6p4448m-del.github.io/nitian/'; npm.cmd run test:e2e`|正式網址`11 passed (34.2s)`|
|`npm.cmd audit`|`found 0 vulnerabilities`|
|`npm.cmd run deploy:pages`|`Published`|
|`gh api repos/9gf6p4448m-del/nitian/pages/builds/latest`|`built`；commit與Pages提交一致；無error|
|`git diff --exit-code 1511a19 -- ACCEPTANCE.md`|exit0，凍結範圍未變|
|`git diff --check`|exit0|

以上coverage僅針對規則／儲存核心，不宣稱整個React介面100%覆蓋。

## 瀏覽器11項

1. 紙上試煉四回合43HP勝利；每回合預覽與結果相符；回饋、JSON匯出、同種子重開。
2. 移動、撤回、同區調序、三張上限與清空。
3. 零張出手直到死亡；新種子與完成紀錄。
4. 正常動畫與略過結果一致；演出時操作鎖定。
5. 390×844及1366×768無橫向溢出，主要觸控目標≥44px；減少動態直接結算。
6. localStorage拒絕存取時可遊玩且明確提示。
7. manifest可用；首次在線快取後，真正切離線重新載入並開局。
8. 演出期間品牌入口不能繞過鎖定。
9. 教學最後演出等待期間修改音效，結算不覆寫新設定。
10. `isMobile:true, hasTouch:true`之390×844觸控情境，實際tap手牌／插槽／撤回；出手列在視窗內。
11. 鍵盤Enter選牌插槽、撤回；Escape關視窗並還原開啟者焦點。

截圖皆來自正式網址瀏覽器實測：

- [手機全頁畫面](docs/screenshots/battle-mobile.png)
- [桌面全頁畫面](docs/screenshots/battle-desktop.png)

## 回歸鑑別與審查

- 引擎先有缺實作RED，再有26項GREEN；補儲存與事件一致性後共31項。
- 倒刺事件快照原本在event外消耗，連續性斷言RED：true／false不符；移至反傷event內後GREEN。
- 離線RED的真實SW診斷：模組／CSS請求`cache.match(req)=false`，canonical URL為true。
  僅對同源預快取白名單採canonical key後，離線重載GREEN。暫時診斷已移除。
- 品牌入口原本演出時開dialog，RED為count1／預期0；handler加入playing guard後GREEN。
  回歸用force點擊，避免測試等待aria-disabled消失才行使入口；不是略過斷言。
- 音效設定回歸以假時計推至最後「回合結束」畫面後改設定；舊碼unchecked RED，最新ref合併patch後GREEN。
- 關dialog焦點回歸在`6b97bd8`為inactive RED；`cea2f60` cleanup還原開啟者後GREEN。
- 規則／TypeScript、React及最終程式覆審獨立進行；三項核心修補與最後焦點修補均裁定真的修好。
- 最終無未解CRITICAL／HIGH程式finding。未配置ESLint，沒有聲稱執行過Hooks lint；
  實際閉包缺陷有瀏覽器回歸，缺工具本身未冒稱為執行期重大缺陷。

## 範圍檢查

新專案基準`1511a19`，規則GREEN檢查點`94056ad`，最終程式`cea2f60`。
基準至交付的檔案群均對應需求：

- `src/game/*`：八種牌、決定論抽洗牌、純結算、事件、原版及48HP驗算。
- `src/App.tsx`、`Art.tsx`、`style.css`：點選軌道、預覽、原創SVG、回饋、響應式與演出。
- `src/storage*`：設定、最近20局、故障降級及JSON輸出。
- `src/pwa.ts`、`public/*`、`scripts/build-pwa.mjs`：安裝資源、離線、更新與版本識別。
- `e2e/*`、測試／建置設定、package及lock：原定驗算、瀏覽器流程與可重現建置。
- `README.md`、`S0_SPEC.md`、本紀錄與截圖：操作、規格、已知限制、送達證據。

另依既有維護規範，在家目錄的`docs/harness/lessons.md`追加此次OneDrive事件、
`docs/harness/05-maintenance.md`僅追加沿革；經獨立文件read-back，未改制度判準，
也未提交或還原兩檔原有的他人變更。此二檔不屬遊戲repository。

## 限制與下一步

沒有真人趣味／平衡驗證、實體iPhone／Android安裝驗證，也未聲稱跨版本實機更新已測。
手機頁面與軌道需捲動；是否繁瑣是本次試玩的重要問題。沒有中途存檔、三場流程、
獎勵或遺物。接下來等製作人試玩，再決定是否改核心或進入S1。
