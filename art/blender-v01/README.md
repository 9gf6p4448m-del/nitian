# 阿修羅與雷晶祭壇：Blender v01 美術小樣

原創、未綁骨的程序化桌上雕塑研究。六臂紅銅主將具頭臉、冠飾、肌肉軀幹、靛藍褶裙、長槍與圓底座；祭壇具階梯、鑄銅蓮瓣、雷晶、火焰與銅環。以古印度神話雕塑輪廓啟發，不使用外部素材、假梵文或現成角色。

此資料夾獨立保存，不接入遊戲、PWA預快取或玩法。不是最終商業美術、動畫角色或手機效能驗證。

## 工具與來源

- Portable executable：`C:\Users\shung\tools\blender-4.5.10\blender-4.5.10-windows-x64\blender.exe`
- 實跑版本：Blender **4.5.10 LTS**，build `6dc0b208d1b5`，背景模式及`bpy` smoke均exit 0。
- [官方ZIP](https://download.blender.org/release/Blender4.5/blender-4.5.10-windows-x64.zip)；[官方SHA256](https://download.blender.org/release/Blender4.5/blender-4.5.10.sha256)。本機ZIP SHA256實測吻合：`EF6D846B8015F47ADE6DF3F9322CE17419080A5D922FA562B6C966064FE30DCE`。
- 沒有變更PATH、系統安裝或Unity。

## 重現

於PowerShell執行，輸出只寫回本腳本所在的`art/blender-v01`。腳本明確拋錯，搭配`--python-exit-code 1`讓錯誤傳回非零碼。

```powershell
$blender = 'C:\Users\shung\tools\blender-4.5.10\blender-4.5.10-windows-x64\blender.exe'
$script = 'C:\Users\shung\OneDrive\桌面\逆天\art\blender-v01\generate_scene.py'
$env:PYTHONUTF8 = '1'
& $blender --background --factory-startup --python-exit-code 1 --python $script -- --draft
& $blender --background --factory-startup --python-exit-code 1 --python $script
& $blender --background --factory-startup --python-exit-code 1 --python $script -- --inspect
```

`--draft`產出保留首輪的`initial-beauty.png`、`initial-game-angle.png`（1100×1000，24 samples）；預設產出最終`beauty.png`、`game-angle.png`（1600×1450，96 samples）。兩模式都會更新`.blend`與`.glb`，因此重現順序必須先draft再final，最後inspect。

## 產物與檢查

- `asura-altar.blend`：可編輯模型、曲線、程序材質、四個主題collection、兩個鏡頭與燈光。
- `asura-altar.glb`：真正3D幾何，供後續引擎試讀；沒有角色骨架或動畫。Blender程序雜訊材質不會完整移植，GLB保留基本PBR材質值。
- `beauty.png`、`game-angle.png`：Cycles實際渲染，展示／高角度兩個鏡頭。
- `initial-*.png`：首輪保留；最終縮小浮台銅線，使其落在八角地板內；調暗紅銅並提高粗糙度、加入眼瞳，降低首輪過亮與空白眼感。
- `scene-report.json`：另一個Blender背景程序重新開啟輸出的`.blend`後統計collection、物件／mesh、面數、界限、材質、GPU及鏡頭主體入框範圍；另驗GLB magic、version和檔案實長。
- `draft-render.log`、`final-render.log`、`scene-inspection.log`：執行記錄。
- `glb-reimport.log`：另開全新Blender背景程序匯入GLB，exit 0；268個mesh、98,326個三角面、所有頂點有限。這個面數為GLB匯出後的三角化結果，與`.blend`原始polygon數不同。

本次final、inspect皆exit 0；重新開啟的`.blend`共274個物件、247個原始mesh、40,362個原始polygon；包含曲線和modifier求值後49,953個polygon。兩鏡頭主體bounds皆在畫面內。GLB標頭`glTF`／version 2，宣告長度和實際長度同為2,669,680 bytes。

GPU實測偵測到RTX 4060 Laptop的OptiX裝置，使用Cycles GPU；AMD 780M所屬CPU及CUDA重複裝置未啟用。渲染耗時只代表此小樣離線渲染，不代表遊戲FPS。

## 已知限制與生成者自查

已實際開圖檢視首輪和最終的兩張視角。主體未裁切；六臂、冠與長槍可辨；高角度能讀出蓮瓣與雷晶環。角色仍有程序拼件接縫，手掌是雕塑式張掌，長槍沒有完整握柄姿態；布料沒有模擬，沒有肌肉拓樸／臉部表情系統。遠景柱是簡化的襯景，沒有雕花史學重建。

首次GLB匯出拒絕NaN，有限頂點檢查定位為蓮瓣端點完全收斂後的Solidify／Bevel；保留0.015模型單位的端點寬度後，重新生成、匯出與渲染成功。腳本保留非有限幾何檢查，避免默默輸出壞模型。

生成者的視覺檢視不等於獨立驗收；獨立review由主線另行安排。不宣稱市場偏好、最終商用品質或手機可用效能。

獨立Python審查補充：在同一個Blender程序連續生成，活用場景的物件與幾何數相同，但未使用的舊mesh／材質資料會留存。請依上述命令，每次使用新的`--factory-startup`程序重跑；本腳本不是長駐編輯器外掛。格式掃描另有39個E501長行與1個I001匯入排序警告，沒有F類錯誤；本輪記錄未整理格式。成品重新開啟與GLB匯入的獨立證據另見`REVIEW.md`。
