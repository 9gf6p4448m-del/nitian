# 奪勢 0.6：獨立文件讀回

日期：2026-10-24，Asia/Taipei。唯讀覆核範圍為 CLASH_SPEC／ACCEPTANCE／PAPER／QA、README 的 0.6 入口、新紙上驗算 script、新 E2E 與 WebKit 設定；另外只核對 App 的匯出視角與 seed 正規化。未重做主線已完成的核心 TS／React 覆審，未操作瀏覽器，未改規則、驗收、舊測試或部署。此檔是本角色唯一寫入的檔案。

## 玩家如何遊玩

4×4 棋盤以 A2、D3 兩座不可占格祭壇為目標。每手消耗一張牌：槍將／刃將部署並攻擊，雷泉放在空格後啟動相鄰友軍，變陣則讓友軍原地、移一格或換位後攻擊。雷泉雙方共享，相鄰攻擊最多加 1；只有指定啟動的棋子攻擊，沒有自動反擊。操作是點牌、亮格、方向、預覽、確認，泉／變陣依提示選棋子；取消不消耗，棄牌整備消耗一手。雙方每輪各一手後，依祭壇正交鄰兵多寡加分，平兵中立；累計分決勝。每輪先手交換，因此有輪末／次輪連動出手。依據：CLASH_SPEC.md:7、13、18、22；README.md:5。

兩輪試局是固定多兵盤、固定四類起手、修先的教學與分支對照；六輪正常局由對稱雙槍盤及 seed 洗牌起手開始，用於後續評估局勢與重玩意願。兩輪的同勝／剩兵差異不能證明六輪有有效長期取捨；不同對手回應的示例不能直接排名首手。沒有最優、平衡、耐玩或真人已喜歡的證據。依據：CLASH_SPEC.md:24、26；CLASH_PAPER.md:36、47、55；CLASH_QA.md:27。

## 五條實際引擎路線

執行 `node scripts/check-clash-paper.mjs`，exit 0，實際輸出：

```text
I: 2:0; winner=xiu; hand/deck/discard=3/7/2 each
II: 2:0; winner=xiu; hand/deck/discard=3/7/2 each
III: 1:1; winner=draw; hand/deck/discard=3/7/2 each
III_worse: 1:2; winner=tian; hand/deck/discard=3/7/2 each
I_reply: 1:1; winner=draw; hand/deck/discard=3/7/2 each
PAPER_ENGINE_CHECK: 5 routes passed; preview unchanged and equal; cards 3/7/2 each
```

I／II 為條件勝例；III 是移位讓出第二格射線後守成和局，III_worse 固定前三手而改最後落點，證明兩輪終局下 C1 比 D2 差；I_reply 證明 I 不能由單一路線宣稱必勝。script 的自動斷言涵蓋終分、終局、牌數、預覽不污染及與正式解析相等，沒有逐項自動比對紙上所列每個 HP／位置，不把五條示例當窮舉或最優性證明。

scripts/check-clash-paper.mjs:9–15 從白名單的正式 rng／cards／engine TypeScript 讀入，僅改 import 路徑並以既有 TypeScript 轉譯到系統暫存目錄，再載入正式引擎；不是重寫一套驗算模型。固定路線由同一 createGame／previewAction／applyAction 執行（:25、30、32）。沒有外部輸入、網路、shell 執行或正式資料寫入路徑。此範圍未見 CRITICAL／HIGH 安全問題；暫存 JS 會留在系統暫存目錄。

## 設定、匯出與測試範圍

- src/ClashApp.tsx:102–106 對 seed trim／空值 fallback 後，建立、保存與顯示都使用 normalized；重載入口 :16 採相同規則。與 QA 的修正敘述相符。
- src/ClashApp.tsx:136 未終局的人機匯出固定修方視角，同機採當前方；src/clash/engine.ts:95–98 的 view 只有本方 hand 與公開 snapshot／棄牌，不含 state.hands／decks／seed。外層 JSON 仍有 options.seed（App :137），所以 QA :18「沒有 hands/decks/seed」應明確限定為 state，不能理解成整份 JSON 沒有 seed；已回報主線。README :12 與 QA :29 已揭露單機診斷資料可見，不宣稱防作弊伺服器。
- e2e/clash.spec.ts 使用 UI 操作，data-state 僅讀出及以正式引擎比對；兩個 manifest 比對的 execFileSync 使用固定 git 與固定檔案白名單（:316–320），沒有不可信 shell 字串。WebKit 設定零重試、單 worker；390 棋盤 >=340 新斷言（E2E :95）有先前故障紅的紀錄，讀回時尚待最終公開版本綠。
- `git diff --name-status b01bcb2 -- '*.test.ts' 'e2e/*' 'public/manifest.webmanifest' 'public/tactics.webmanifest'` 實際只列新增 clash E2E、engine.test.ts、storage.test.ts；沒有修改既有測試與舊 manifest。vite.config.ts:13 四項 80% 原閾值保留，差異只有把新 clash 引擎納入 coverage。

## 本角色執行的其他檢查

- `npx tsc --noEmit -p tsconfig.json`：exit 0，無輸出。
- `npx eslint . --ext .ts,.tsx,.js,.jsx`：exit 0，實際為 `0 errors, 3 warnings`，三者皆為 coverage/block-navigation.js、prettify.js、sorter.js 生成產物的 unused eslint-disable；沒有修動產物。
- PowerShell UTF-8 讀取範圍文件並擷取 Markdown 的本地相對連結，以 `Test-Path -LiteralPath` 檢查：`LOCAL_LINKS_CHECKED=6 MISSING=0`。
- `git diff --check`：exit 0，無輸出。

本角色沒有重新執行 coverage／E2E；QA 與 browser report 的既有測試結果是引用主線紀錄，不能當作本角色獨立重跑。當下 source HEAD 為 b01bcb2，origin/gh-pages 最近紀錄為 627709d、2026-10-23T23:48:58+08:00，均不能證明 0.6 已公開送達。CLASH_QA.md:3、10–11、21 與 docs/clash-browser-report.md:90、94 明確保留最終建置、手機加嚴斷言及公開 Pages 核對；這些環節仍未驗證，未將未來公開測試寫成已通過。後續送達由主線補上 source SHA、Pages 時間戳、公開 build 指紋及相應實測結果。
