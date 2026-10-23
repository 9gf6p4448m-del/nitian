# 奪火手機原型 實跑紀錄

2026-10-23。基準 `0c6046e`，工作分支 `codex/capture-fire-mobile`。本紀錄區分程式測試與真人趣味驗證；沒有把瀏覽器自動操作當作真人A/B試玩。

## 變更範圍

- `src/fire/engine.ts`：純規則、合法行動、即時事件、A/B與終局；`ai.ts`：同規則有限兩層搜尋。
- `src/FireApp.tsx`、`src/fire/FirePawn.tsx`、`src/fire.css`：點棋/選動作/預覽/確認、神火與角色SVG、固定手機確認列、紀錄與結果。
- `src/fire/storage.ts`：獨立設定、20局完成紀錄、回饋與儲存故障處理。
- `src/main.tsx`：`?mode=fire` 新模式；根入口仍輪流插牌，`?legacy=1`仍原版。`DuelApp.tsx`僅新增奪火連結。
- manifest：保持既有id，PWA啟動改為奪火；沒有建立新服務或帳號。
- 三個新單元測試檔、`e2e/fire.spec.ts`、`e2e/fire-touch.spec.ts`、WebKit設定、奪火Hooks lint、規格/驗收/README。

## 本機環境與指令

Windows，Node `v24.16.0`、npm `11.13.0`；既有React/Vite架構。所有瀏覽器測試都讀 production build，經實際角色、格子、行動與確認按鈕操作，沒有注入遊戲狀態後門。

```sh
npm test
npm run test:coverage
npm run lint:fire
npm run build
npm run test:e2e
npx playwright test e2e/fire-touch.spec.ts --reporter=list --output=test-results/fire-touch
npx playwright test e2e/fire.spec.ts e2e/fire-touch.spec.ts --reporter=list --output=test-results/fire-latest
npx playwright test --config=playwright.fire-webkit.config.ts --output=test-results/fire-webkit
```

實際結果：

- 單元測試：`8 files / 116 tests passed`，包含舊版與新增34項奪火測試。
- 全核心覆蓋率：statements `97.94%`、branches `93.18%`、functions `99.43%`、lines `99.50%`；原四項80%門檻不變，新奪火核心與儲存已納入。
- `lint:fire`：exit 0、無警告；涵蓋FireApp、FirePawn及共用PWA hook的rules-of-hooks/exhaustive-deps，未聲稱全面lint舊版。
- `npm run build`：TypeScript及Vite/PWA產物成功，34 modules。
- 完整Chrome回歸首次列舉53項，`53 passed (3.3m)`；另新增觸控案 `1 passed`，共54項不同案例。舊37項未刪改或縮減。
- Safari相容修補後另跑全部17項奪火Chrome案例，`17 passed (1.1m)`。
- iPhone 13裝置參數的WebKit：`5 passed (19.0s)`，含真實tap、390/桌面控制、對話框回焦及離線重開。這是瀏覽器模擬，非實體iPhone或實際安裝測試。

## 實際覆蓋

390×844、320×667及1366×768：選擇、取消、預覽不改真state、雙擊只走一次、AI回應與後手、同機雙人、推退切換、A/B奉獻、殲滅勝敗、三次重複和、單人強制略過、角色退場、新局/重開、完成/未完局匯出、回饋、本機儲存故障、減少動態、PWA離線重新開啟。

預覽/實際動作逐步比對；匯出JSON檢查status、variant、opponent、回饋、完成時間、手數與最後state。用待機讓AI自行決策到實際玩家敗北，再確認可重開。奉獻/殲滅的手寫合法路線只是測試UI終局，不宣稱那些對手回應是好策略。

本輪實際修正：

1. 死亡角色仍存在引擎陣列，UI已以HP>0篩選，避免幽靈占格/名冊。
2. 匯出檔名統一 `nitian-fire-*.json`；完成局補上完成時間，未完局時間/結果為null。
3. 勝敗文字明寫雙方，不在玩家敗北時籠統說「對方退場」。
4. 手機確認列固定底部，320窄螢幕也完整可見，沒有只靠自動捲動讓測試變綠。
5. 關閉對話框恢復開啟按鈕焦點；針對WebKit pointer不自動聚焦button，於click capture先聚焦，再保存opener。
6. 投火軌跡、受傷與到位回饋不攔截點擊；系統減少動態會關閉動畫。

## 獨立覆核

引擎TypeScript、整合code review、React及修補覆核均有fresh context；未留新HIGH/CRITICAL。原缺Hooks檢查已補上新模式檢查，沒有引入無關舊模式重構。

獨立引擎探針：另寫BFS比對移動集合，500局隨機對局121,376步，位置/血量/唯一火/存活持有者/勝者/輸入不變性皆通過；抽查886個AI局面合法且不改輸入，桌機最大2.26ms。隨機對局20局在500步截停，不能推論任意雙方都能快速終局。

AI測試的8局自走218步全部終局，6殲滅/2奉獻；這可能反映暫定AI偏好，不能拿來判定真人打法或平衡。桌機量測不能當作使用者手機CPU保證。

最後窄覆核實跑WebKit pointer與Chrome Enter/Escape回焦、移動；320×667確認列y=614、高44，全顯示。投火/受傷覆核另有合法九手到投火，軌跡不攔點擊；prefers-reduced-motion的動畫為none。

## 畫面

- [Chrome手機](docs/screenshots/fire-mobile.png)、[Chrome桌面](docs/screenshots/fire-desktop.png)
- [WebKit手機](docs/screenshots/fire-mobile-webkit.png)、[WebKit桌面](docs/screenshots/fire-desktop-webkit.png)

## 發布與真人試玩

既有位置：https://9gf6p4448m-del.github.io/nitian/?mode=fire 。發布後核對 `version.json` 的來源commit/建置UTC、`origin/gh-pages`的commit/時間與Pages build狀態，再對線上網址做同一組smoke測試。送達實測於本輪發布後補記。

尚未用使用者的實體手機安裝，也沒有獨立真人反覆A/B對局。首次需連線載完快取；若頁內提示新版本，確認更新後重開。更新會捨棄未完局，保存的完成紀錄保留。

製作人優先試三件事：先B版人機熟悉投火與接應，再A版比較祭壇差別，最後交換先後手或同機雙人。請記下哪一手改變原計畫、是否只是清人後運火；尚未證實好玩或耐玩。
