# 製作工具決策與範圍（2026-10-24）

本輪先保留 React 手機版，完成獨立 Blender 主將與祭壇小樣。Unity 僅評估授權與版本，不安裝、不啟用授權、不遷移遊戲。使用者目前回饋為「操作重複、局勢難讀」，美術研究不能視為已解決玩法問題；見 [回饋紀錄](tactics-feedback-2026-10-24.md)。

## 已核對的環境

- 《逆天》目前是 TypeScript／React／Vite 瀏覽器遊戲，沒有使用 Unity 2022。
- 本機已有 `C:\Program Files\Unity\Hub\Editor\2022.3.62f1\Editor\Unity.exe`；實測 ProductVersion 為 `2022.3.62f1_4af31df58517`。未發現該版本的 AndroidPlayer／WebGLSupport／iOSSupport 目錄，不能因此承諾能立即打包。
- 沒有證據能說明當初安裝 2022 的原因；不可補寫成「因為免費才選 2022」。
- 本輪新增獨立 portable Blender 4.5.10 LTS，沒有改 PATH 或替換 Unity。來源、雜湊、實跑指令、模型與兩張實際渲染見 [小樣 README](../art/blender-v01/README.md)。
- 本輪控制 Blender 的方式是背景 CLI＋`bpy` 腳本；不是已接通 Unity／Blender 原生 MCP 或桌面 GUI。

## Unity 6 是否要付費

Unity 6 可以使用免費的 Personal 方案，並非升到 6 就必須付費。資格依最近連續 12 個月的 Total Finances 計算，Personal 門檻為不超過 US$200,000。個人自用、公司自用、替客戶提供服務的計算基礎不同；沒有使用者的財務及使用身分資料，不能替使用者確認資格。[官方方案](https://unity.com/products)、[資格說明](https://unity.com/pages/license-compliance)

Runtime Fee 已取消，不以安裝次數收取該項費用。[官方費率更新](https://unity.com/products/pricing-updates)

2022 與 6 是引擎版本，不是免費與付費版本之分。若日後決定遷移，應重新核對當時的穩定版本、套件與手機瀏覽器支援；本輪查到官方列 Unity 6.3 LTS 支援至 2027 年 12 月。[官方支援頁](https://unity.com/releases/unity-6/support)

## 本輪交付界線

小樣為原創、未綁骨的雕塑式研究，提供 `.blend`、`.glb`、腳本與渲染圖。尚未驗證手機遊戲效能、動畫品質或玩家美術偏好。遊戲程式及 PWA 資產不變，不發布新的手機遊戲版本。

建議先處理可讀性與回合決策，再決定是否值得投資完整角色與 Unity 遷移。引擎或工具更新不能取代真人試玩。
