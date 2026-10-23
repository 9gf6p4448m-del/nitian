# 神壇交鋒・美術來源與視覺修正

採用imagegen技能的內建image_gen工具，沒有CLI/API key路徑、沒有購買或下載外部資產。使用者提供的手機概念圖只作風格參考，未把整張圖當成可點擊介面。

## 可替換素材

- `public/art/tactics-units.png`：透明2×2圖集。左上阿修羅、右上天眾、左下紅銅壇、右下白金壇。CSS背景位置取各象限，沒有裁切修改原檔。
- `public/art/tactics-cards.png`：3×2插畫圖集。上排長槍／月刃／疾步，下排迷霧／雷泉／血誓。
- 棋盤、霧與雷泉提示、選格框、攻擊線、傷害文字、生命與行動指示皆由HTML/CSS/SVG繪製；美術不決定碰撞、方向或傷害。

## 最終生成提示

棋子圖集：

> Create a production game sprite atlas for the original Asura myth fantasy mobile strategy game NITIAN. Use the attached battle UI ONLY as a style reference, do not recreate its interface. Output ONE square 2x2 sprite atlas with genuinely transparent background. Four exactly equal quadrants, each sprite centered with at least 8% empty padding within its own quadrant, no overlap between quadrants. TOP LEFT: original crimson-skinned Asura warlord with dark indigo cloth, bronze armor, crown, multiple arm silhouettes and a long spear, standing full body on a small hexagonal dark copper base, facing slightly right. TOP RIGHT: original ivory and ancient-gold celestial warrior with elegant crescent blade, full body on hexagonal white-gold base, facing slightly left. BOTTOM LEFT: compact red-copper Asura shrine with burning crimson flame emblem, no person. BOTTOM RIGHT: ivory-gold celestial shrine with pale electric-blue crystal, no person. Consistent high-quality hand-painted 2D isometric tabletop miniatures seen from high angle; bold readable silhouettes that remain distinct at 64 pixels. Restrained detail, strong shapes, restrained golden rim highlights. No text, letters, UI, card frames, divider lines, labels, extra subjects, shadows outside the quadrants, scenery or background. Keep every full sprite inside its exact quadrant.

卡牌圖集：

> Generate ONE landscape 3 columns by 2 rows atlas of exactly SIX equally sized square card illustrations for NITIAN, an original Asura mythology tactical board game. Exact hard grid, edge-to-edge panels, no gaps, no frames, NO TEXT, NO LETTERS, no numbers, no interface. Consistent richly hand-painted dark mythic fantasy, copper and charcoal with warm gold and electric-blue accents, ancient Indian-inspired sculptural motifs, strong simple composition readable at 90px. Each item centered in its own panel and does not cross the panel boundary. TOP LEFT: long copper spear diagonally across worn dark stone with golden light along blade. TOP MIDDLE: ornate ivory-gold crescent blade with midnight blue cloth and a clean blade silhouette. TOP RIGHT: crimson Asura warrior boots dashing across stone with dynamic amber streaks, crop to feet and movement. BOTTOM LEFT: pale blue magical mist curling between ancient stone pillars and flagstones, atmospheric but clear silhouette. BOTTOM MIDDLE: luminous electric-blue thunder well in a round dark bronze basin, isolated central iconlike composition. BOTTOM RIGHT: a crimson hand offering a bright red flame over a bronze altar, sacrifice and resolve rather than gore. Use the SAME visual style and restrained value hierarchy in all six panels. Each panel visually independent. Output a complete 3x2 sheet, no outside borders.

## 本輪實際視覺閉環

1. 實際Chrome 390×844截圖：`docs/screenshots/tactics-visual-first.png`。發現手牌位於首屏下方，被固定確認列遮到，需捲動。
2. 調整高手機的棋盤最大尺寸、頂列與卡牌高度；加入獨立卡面插畫，保留棋格至少44px。
3. 同尺寸重拍：`docs/screenshots/tactics-visual-refined.png`。DOM量測：棋盤244px；手牌y629、底759.5；固定列由y762開始，首屏可看到手牌。較矮視窗仍允許垂直捲動；不是所有螢幕都硬塞在一屏。
4. 後續Chrome／WebKit實際操作、攻擊預覽、終局、離線截圖與結果見QA。不以概念圖或本機截圖冒充公開版本已送達。

## 限制

棋子是固定插畫，換武器主要由文字與方向規則表示，沒有每種武器的獨立角色動畫；初版中立壇為程式符號。這些是後續美術替換入口，不宣稱已達最終商業品質或已驗證市場偏好。
