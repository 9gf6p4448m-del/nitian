# 獨立唯讀驗收（2026-10-24）

範圍：`art/blender-v01/`、`ART_STUDY_ACCEPTANCE.md`、`docs/tactics-feedback-2026-10-24.md`、`docs/blender-unity-evaluation-2026-10-24.md`。本 reviewer 未參與模型生成，未修改腳本、場景、圖片或既有遊戲；僅新增本紀錄。Python 專門審查與生成重跑由另一位 reviewer 負責，本紀錄不冒認其驗證。

結論：本次範圍沒有發現可重現的缺陷或誇大交付；重開場景、GLB 結構與重新匯入、兩張最終渲染及文件語義均通過。這不代表最終商業美術、手機效能或真人喜好通過。

## 1. 腳本安全與輸出範圍

已完整讀取 `generate_scene.py`。`ROOT` 綁定腳本所在的 `art/blender-v01`，`output()` 以 resolve 後的 parent 驗證輸出不逸出（14–23 行）；沒有網路呼叫、執行外部命令或讀取憑證。場景清除作用於 Blender 記憶體，不是刪除磁碟檔案（90–94 行）。實際磁碟寫入為固定名稱的 GLB、blend、PNG，以及 inspect 的 JSON（82、466–475 行）。

重跑方式是 README 18–27 行的全新 `--background --factory-startup` 程序；draft 與 final 都會覆寫同名 blend／GLB，README 已明說必須先 draft、再 final、最後 inspect。本 reviewer 未重新執行生成器，避免覆寫交付物；下面的獨立檢查均不呼叫生成器，也不寫回模型。

## 2. 獨立重開 blend

實際指令（PowerShell；`--disable-autoexec` 防止場景內自動腳本執行）：

```powershell
& 'C:\Users\shung\tools\blender-4.5.10\blender-4.5.10-windows-x64\blender.exe' --background --disable-autoexec 'C:\Users\shung\OneDrive\桌面\逆天\art\blender-v01\asura-altar.blend' --python-exit-code 1 --python-expr "import bpy,json,math; from mathutils import Vector; s=bpy.context.scene; meshes=[o for o in s.objects if o.type=='MESH']; report={'filepath':bpy.data.filepath,'blender':bpy.app.version_string,'objects':len(s.objects),'mesh_objects':len(meshes),'polygons':sum(len(o.data.polygons) for o in meshes),'curves':sum(o.type=='CURVE' for o in s.objects),'materials':len(bpy.data.materials),'nonplanar_meshes':sum(all(max(v.co[i] for v in o.data.vertices)-min(v.co[i] for v in o.data.vertices)>0.001 for i in range(3)) for o in meshes if len(o.data.vertices)),'collection_objects':{c.name:len(c.objects) for c in bpy.data.collections},'cameras':[o.name for o in s.objects if o.type=='CAMERA'],'engine':s.render.engine,'samples':s.cycles.samples,'resolution':[s.render.resolution_x,s.render.resolution_y]}; print('INDEPENDENT_SCENE_READBACK',json.dumps(report)); assert report['objects']==274 and report['mesh_objects']==247 and report['polygons']==40362 and report['nonplanar_meshes']>200"
```

實際輸出重點，exit code **0**：

```text
blender: 4.5.10 LTS
objects: 274
mesh_objects: 247
polygons: 40362
curves: 21
materials: 11
nonplanar_meshes: 247
collection_objects: 01_ASURA_six_armed_original_sculpture=184, 02_LOTUS_lightning_altar=57, 03_STONE_floating_dais=27, 04_CAMERAS_and_lighting=6, Collection=0
cameras: beauty_camera, game_angle_camera
engine: CYCLES
samples: 96
resolution: [1600, 1450]
Blender quit
```

247 個網格各自在本地 X／Y／Z 都有大於 0.001 的厚度；場景確有立體模型、程序材質、曲線與兩個鏡頭。物件／網格／原始面數和 `scene-report.json:10–15`、`README.md:39` 一致。

## 3. 獨立讀取 GLB 並重新匯入

實際指令（新 Blender 程序，不使用生成者的 inspect）：

```powershell
& 'C:\Users\shung\tools\blender-4.5.10\blender-4.5.10-windows-x64\blender.exe' --background --factory-startup --disable-autoexec --python-exit-code 1 --python-expr "import bpy,json,struct,pathlib,math; p=pathlib.Path('C:/Users/shung/OneDrive/桌面/逆天/art/blender-v01/asura-altar.glb'); raw=p.read_bytes(); magic,ver,total=struct.unpack('<4sII',raw[:12]); size,kind=struct.unpack('<II',raw[12:20]); doc=json.loads(raw[20:20+size]); print('INDEPENDENT_GLB_HEADER',json.dumps({'magic':magic.decode(),'version':ver,'declared_bytes':total,'actual_bytes':len(raw),'json_chunk_type':kind,'nodes':len(doc.get('nodes',[])),'meshes':len(doc.get('meshes',[])),'materials':len(doc.get('materials',[])),'animations':len(doc.get('animations',[])),'skins':len(doc.get('skins',[]))})); assert magic==b'glTF' and ver==2 and total==len(raw) and len(doc.get('meshes',[]))>200; bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False); bpy.ops.import_scene.gltf(filepath=str(p)); meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']; finite=all(math.isfinite(x) for o in meshes for v in o.data.vertices for x in v.co); triangles=sum(len(o.data.polygons) for o in meshes); print('INDEPENDENT_GLB_IMPORT',json.dumps({'mesh_objects':len(meshes),'polygons':triangles,'finite_vertices':finite,'types':list(set(o.type for o in bpy.context.scene.objects))})); assert len(meshes)==268 and triangles==98326 and finite"
```

實際輸出，exit code **0**（略過逐物件的 INFO）：

```text
INDEPENDENT_GLB_HEADER {"magic": "glTF", "version": 2, "declared_bytes": 2669680, "actual_bytes": 2669680, "json_chunk_type": 1313821514, "nodes": 268, "meshes": 268, "materials": 10, "animations": 0, "skins": 0}
glTF import finished in 0.40s
INDEPENDENT_GLB_IMPORT {"mesh_objects": 268, "polygons": 98326, "finite_vertices": true, "types": ["MESH"]}
Blender quit
```

標頭、檔長、節點與網格實際存在；重新匯入的全部頂點有限，三角面數與 `README.md:37` 一致。沒有動畫或骨架，與 `README.md:32` 所述限制一致。

## 4. 實際開圖

透過 `view_image` 分別開啟以下最終圖片，沒有只以檔名存在判定：

- `C:\Users\shung\OneDrive\桌面\逆天\art\blender-v01\beauty.png`
- `C:\Users\shung\OneDrive\桌面\逆天\art\blender-v01\game-angle.png`

兩張均可辨冠飾、六臂、軀幹與腿、長槍、階梯祭壇、蓮瓣及雷晶銅環；主將、武器、祭壇和浮台未被圖片邊界裁切。高角度保留人物與祭壇間的空間關係。接縫與未完整握槍姿態可見，已在 `README.md:45` 明說，不構成未揭露問題。

另以 `Select-String -Path art\blender-v01\final-render.log -Pattern 'STUDY_RENDER_FINISHED|Blender quit|Saved:|RENDER_DEVICE' | Select-Object -Last 8` 讀取生成紀錄，實際包含 `RENDER_DEVICE GPU`、兩個 PNG 的 `Saved:`、`STUDY_RENDER_FINISHED final` 與 `Blender quit`。這是紀錄核對，不冒認 reviewer 重新渲染。

## 5. 文件 fresh read-back

- `ART_STUDY_ACCEPTANCE.md:8–12` 要求的是可重開的立體場景、可匯入 GLB、至少兩個實際視角、保留首輪及獨立驗證；沒有把手機遊戲移植或最終商業美術納入本輪。
- `docs/tactics-feedback-2026-10-24.md:3–9` 明確記錄使用者對 0.5 的負面回饋，區分程式驗證與人類趣味，未把美術不足當成唯一根因。
- 同文件 `:25` 將開局標為可行自然例子，明說不是最優性證明，也承認天方後續已有合法攻擊；未把合法路線推論成所有開局都只能走路。
- 同文件 `:33–38` 要下一輪比較操作／理解負擔與核心決策本身；A、B 均標為未實作、未定案，沒有把規則變更當成既有授權，也沒有宣稱已解決耐玩問題。
- `docs/blender-unity-evaluation-2026-10-24.md:3、9、11、23–25` 清楚區分本機安裝、未知歷史原因、背景 CLI 操作、Unity 評估、Blender 實際交付與尚未驗證項目，沒有假稱 MCP 已接通、已遷移或已發布手機新版。Unity 官方來源事實由主線另行核對，本 reviewer 未重新作外部授權研究。

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | pass |
| HIGH | 0 | pass |
| MEDIUM | 0 | pass |
| LOW | 0 | pass |

Verdict: APPROVE — 僅限上述獨立驗收範圍；無阻擋問題。
