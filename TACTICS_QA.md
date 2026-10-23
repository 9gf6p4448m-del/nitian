# 神壇交鋒0.5・驗證與送達

基準 `c6b6ca155057b84d85f55f8895899804b4071db0`，可退回分支 `checkpoint/realm-0.4-c6b6ca1`。舊模式與驗收保留。此紀錄目前持續補入實測輸出；公開版本未完成核對前不宣稱已送達。

## 規則、建置與獨立審查

`npm run test:coverage`：15個檔案、205個測試全過。Statements 98.63%、Branches 95.11%、Functions 99.62%、Lines 99.68%。原161個測試保留，新增44個；coverage擴充到新`tactics`資料夾，原四項80%門檻未降低。

`npm run lint:fire`、`npm run lint:realm`、`npx eslint src/TacticsApp.tsx src/tactics --max-warnings 0`、`npx tsc --noEmit -p tsconfig.json`均exit0。`npx eslint . --ext .ts,.tsx,.js,.jsx`為0 errors、3個coverage生成JS的unused-disable warnings；不修改無關產物消警告。ESLint新增全TS parser，既有React hooks檢查範圍未縮小。

`npm run build`：TypeScript與Vite成功，45 modules transformed；新增獨立manifest與兩張atlas後Service Worker precache 13 URLs。最後來源提交、時間與公開metadata於送達階段記入下方。

獨立TypeScript審查另跑300局隨機合法完整局、9152次行動、80次隱藏資訊替換比較，violations=0。另驗證出生格被占且普通空格被雷泉填滿時仍可在可站祭壇重生，HP6、下回合AP1、不會卡死。不是AI最佳性或真人平衡證明。

## 首輪失敗與修正證據

- 首次build唯一TS6133：UI未使用變數`other`；最小移除後build exit0，沒有改規則或刪測試。
- React獨立審查實測：同機交棒時Tab可繞到背景教學，露出4張手牌。修成獨立handoff狀態、換回合同步遮牌、背景inert、焦點限制／還原；覆測同一路徑、換局取消與MutationObserver，cards=0且沒有瞬間插入新手牌。
- 終局後到規則勾選減少動態，曾被終局effect重新開啟結果。以finished game identity只處理一次；同16回合重現覆測保持規則頁、checkbox=true、history=1。
- 主manifest若改成tactics，原fire/realm兩個PWA案例會失敗（Expected realm, Received tactics）。還原原manifest，另新增tactics專用manifest與獨立ID。相同原命令覆測2 passed；新模式線上／離線manifest正確，兩張美術離線解碼成功，四條舊入口仍使用原manifest。沒有更改原測試消紅。
- 新瀏覽器案例首輪有下拉label定位及舊duel需先開始的測試腳本問題；修正依據、原輸出及最終計數另見`docs/tactics-browser-report.md`。產品規則與案例目標不變。

## 畫面與流程

既有七個瀏覽器測試檔全部保留，共73 passed：`npx playwright test e2e/battle.spec.ts e2e/duel.spec.ts e2e/clarity.spec.ts e2e/fire.spec.ts e2e/realm.spec.ts e2e/domains.spec.ts --reporter=list --output=test-results/tactics-legacy-regression`實際匹配61案、61 passed (4.3m)；其餘以`$env:TEST_URL='http://127.0.0.1:4183/nitian/'; npx playwright test e2e/game.spec.ts e2e/fire-touch.spec.ts --reporter=list --output=test-results/tactics-legacy-additional`跑12案、12 passed (22.7s)。前一命令中的battle.spec.ts不存在，因此以第二命令補齊真正的game/fire-touch檔，不把61誤報成全套。

視覺閉環：`docs/screenshots/tactics-visual-first.png` → `tactics-visual-refined.png`。第一張發現手牌位於首屏下方；第二張390×844量測手牌底759.5px、確認列頂762px，保留44px以上棋格與主要按鈕。桌面／WebKit與後續公開截圖由瀏覽器驗證另存，不把概念圖當實際畫面。

新模式本機Chrome首輪完整19 passed，涵蓋手機touch／桌面、參考盤傷害3、取消與雙擊鎖、換武器斜角、疾步／迷霧／雷泉／血誓／占壇、八輪終局與JSON、同種子重開、換手隱私、AI暫停／換局、儲存拒絕與離線。Chrome與WebKit各三輪為57 passed (4.6m)／57 passed (8.1m)。新增專用manifest與血誓傷害5／轉彎疾步後，只跑受影響案例，各4 passed (11.8s／18.5s)，包含離線重測。最終測試檔為22個不同案例，沒有跳過或retry；詳細命令及首輪失敗見`docs/tactics-browser-report.md`。

新增／擴充的驗收與檢查檔案：`TACTICS_ACCEPTANCE.md`、`src/tactics/engine.test.ts`、`src/tactics/ai.test.ts`、`src/tactics/storage.test.ts`、`e2e/tactics.spec.ts`、`playwright.tactics-webkit.config.ts`、`vite.config.ts`、`eslint.config.js`。只新增新玩法案例／coverage範圍／TS解析，既有測試及80%門檻未降低；原主manifest完全還原。

## 送達狀態

待部署完成後記錄來源commit、gh-pages commit、version.json、GitHub Pages建置時間及公開網址Chrome／WebKit輸出。尚未由本段證明送達。

## 限制與真人試玩

未做實體iPhone／Android安裝驗證；瀏覽器手機尺寸與WebKit模擬不等於實機。AI是同規則有限搜尋，不保證最佳策略。先後手、最後一手、牌庫比例、擊倒懲罰與血誓是否值得仍待真人試玩。棋子尚無換武器的獨立動作素材，角色／壇／UI已分離可替換。未完成局不保存，無網路多人、商業化或付費服務。
