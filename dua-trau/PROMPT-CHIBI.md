# Prompt tạo ảnh chibi cho Đua Trâu (3 ảnh)

Chỉ cần tạo **3 ảnh**. Hai ảnh trâu gom cả 5 con và nhiều dáng; mình tự cắt từng hình và tách nền bằng `npm run cat-anh`.

| Ảnh | Nội dung | Kích thước |
|---|---|---|
| `trau-chay.png` | 5 con trâu × 4 khung phi nước đại (hàng = nước, cột = khung) | ngang 1536×1024 |
| `trau-dang.png` | đúng 5 con trâu đó × 3 dáng: đứng, nhảy mừng thắng, nằm buồn thua | dọc 1024×1536 |
| `nen.png` | nền đồng quê: trời, đồi, hàng rào, đường đua đất trống, bãi cỏ | dọc 1024×1536 |

Thứ tự hàng trong cả hai ảnh trâu, từ trên xuống: **Thái Lan, Việt Nam, Trung Quốc, Campuchia, Philippines**.

| Nước | Áo yên | Phụ kiện |
|---|---|---|
| Thái Lan | xanh dương, viền vàng | vòng hoa cúc vạn thọ cam |
| Việt Nam | vàng, viền đỏ | nón lá, khăn đỏ |
| Trung Quốc | đỏ, viền vàng | hoa lụa đỏ trên trán, chuông vàng |
| Campuchia | xanh ngọc, viền trắng | khăn krama ca rô đỏ trắng |
| Philippines | cam, viền nâu | nón salakot đan, khăn xanh |

**Những thứ không cần vẽ, game tự làm:**
- Cờ 5 nước: game vẽ đúng màu và cắm lên lưng trâu. Ảnh AI hay vẽ sai cờ nên prompt dặn không vẽ cờ.
- Làn đua, vạch xuất phát, bụi, vương miện, chữ, số mét, đồng hồ: game vẽ.
- Dáng chạy sang trái: không cần, trâu chỉ chạy sang phải.

**Cách làm:** chép nguyên khối prompt, dán vào ChatGPT (ChatGPT tạo được nền trong suốt). Prompt viết bằng tiếng Anh để công cụ hiểu đúng hơn. Hình lệch ô một chút không sao: mình tìm từng con trâu theo khoảng trống chứ không cắt cứng theo ô. Chỉ tạo lại khi:
- thiếu hàng hoặc thiếu cột;
- có hai con trâu dính vào nhau;
- có chữ hoặc cờ trong ảnh;
- trâu quay mặt sang trái;
- nền là ô caro xám trắng vẽ giả (không phải trong suốt thật). Gặp trường hợp này thì nhắn thêm cho ChatGPT: "use a flat pure green #00FF00 background instead".

Lưu 3 ảnh vào `dua-trau/art-src/` đúng tên ở trên rồi báo mình, hoặc tự chạy `npm run cat-anh` trong thư mục `dua-trau` rồi bấm F5 ở cửa sổ game. Thiếu ảnh nào thì game vẫn chạy, phần đó được vẽ bằng hình khối như hiện tại.

## Thứ tự tạo và ảnh cần đính kèm

Mỗi phiên có 3 lượt, vừa đủ 3 ảnh. Tạo theo đúng thứ tự dưới đây.

| Lượt | Tạo ảnh | Đính kèm |
|---|---|---|
| 1 | `trau-chay.png` | không cần |
| 2 | `trau-dang.png` | `trau-chay.png` (để vẽ lại **đúng** 5 con trâu đó) |
| 3 | `nen.png` | `trau-chay.png` (chỉ để lấy nét vẽ) |

Prompt 2 và 3 bắt buộc phải có ảnh đính kèm. Nếu ChatGPT trả lời "hãy tải ảnh lên" thay vì vẽ, tức là chưa có ảnh: gửi ảnh `trau-chay.png` trong cùng tin nhắn với prompt. Mỗi lần chỉ đính kèm **một** ảnh.

**Nếu có ảnh hỏng phải tạo lại ở phiên hoặc tài khoản khác:** phiên mới không còn nhớ ảnh cũ, nên bạn tải ảnh đã đạt từ phiên trước lên làm ảnh đính kèm.

| Ảnh cần tạo lại | Đính kèm ảnh nào |
|---|---|
| `trau-chay.png` | `trau-dang.png` nếu đã có, và thay câu đầu của prompt 1 bằng câu đầu của prompt 2 (câu bắt đầu "Generate the image now. The attached image shows…"). Chưa có thì không đính kèm, dùng nguyên prompt 1. |
| `trau-dang.png` | `trau-chay.png` |
| `nen.png` | `trau-chay.png` |

Nếu một hàng trâu bị sai mà bạn không còn lượt, cứ gửi mình xem trước. Thường mình vẫn cắt và dùng được các hàng tốt; con nào thiếu thì game vẽ con đó bằng hình khối.

---

## 1. `trau-chay.png`: 5 con trâu × 4 khung chạy (ngang, 1536×1024)

Mỗi hàng là một nước. Mỗi cột là một khung phi nước đại; game chiếu 4 khung liên tục để trâu chạy mượt.

**Bản ngắn (dùng bản này trước).** Bản đầy đủ phía dưới có lần làm ChatGPT báo "the image-generation request encountered an issue". Nếu ChatGPT báo lỗi đó, gõ `try again` trước, vì lỗi này thường chỉ tạm thời. Bị lại thì mở cuộc chat mới và dán bản ngắn.

```text
Generate the image now. Draw a sprite sheet for a 2D racing game: 5 cute chibi water buffaloes, each shown in 4 running poses, arranged in a grid of 4 columns and 5 rows (20 buffaloes in total). Every buffalo is the same size, seen from the side, facing right, with empty space around it. No grid lines.

Shared look: chubby slate-gray water buffalo, short legs, big round head, large curved cream horns, pink muzzle, big shiny eyes, happy smile, thin tail.

One row per buffalo (same outfit in all 4 poses of the row):
Row 1: blue saddle blanket with gold trim, orange flower garland on the neck.
Row 2: yellow saddle blanket with red trim, Vietnamese conical straw hat, red scarf.
Row 3: red saddle blanket with gold trim, red flower on the forehead, small gold bell.
Row 4: turquoise saddle blanket with white trim, red-and-white checkered scarf.
Row 5: orange saddle blanket with brown trim, woven brown straw hat, blue scarf.

Columns are 4 frames of a gallop, left to right: legs fully stretched; front hooves landing; all legs tucked under the belly in the air; back hooves landing.

Style: polished cute 2D mobile game art, clean dark outline, soft cel shading, bright colors. Transparent background. No ground, no shadows, no text, no flags.
```

Bản đầy đủ:

```text
Generate the image now (no reference image needed). Create one sprite sheet image for a 2D racing game, containing 5 different cute chibi water buffaloes.
Layout: an exact grid of 4 columns x 5 rows. All cells are equal size, one buffalo per cell, centered, every buffalo drawn at the same scale and filling most of its cell, clear empty space around each buffalo, no buffalo touches another, do not draw grid lines.

All buffaloes share the same base design: a cute chibi Asian water buffalo with a chubby round body, short stubby legs, a big round head, slate-gray skin, large curved cream-white horns sweeping backward, small round ears, a pink muzzle with two nostrils, big glossy black eyes with white highlights, rosy cheeks, a thin tail with a dark tuft, dark gray hooves. Every buffalo is seen exactly from the SIDE, facing RIGHT, running at full speed with a big happy determined smile.

Each ROW is one buffalo, with an identical outfit across the whole row (plain fabric: no flags, no letters, no symbols on the outfit):
Row 1: royal blue saddle cloth with a gold fringe trim on its back, a garland of orange and yellow marigold flowers around the neck.
Row 2: golden-yellow saddle cloth with a red trim, a Vietnamese conical straw hat (non la) tied on the head between the horns, a small red neck scarf.
Row 3: bright red saddle cloth with a gold trim, a red silk flower on the forehead, a small round gold bell on a red collar.
Row 4: turquoise saddle cloth with a white trim, a red-and-white checkered krama scarf tied around the neck.
Row 5: orange saddle cloth with a brown trim, a wide woven brown straw salakot hat with a pointed top, a blue neck scarf.

Each COLUMN is one frame of the same gallop cycle, same order in every row:
1 = front legs stretched far forward and back legs stretched far back (body fully extended);
2 = front hooves touching the ground, back legs swinging forward under the belly;
3 = all four legs gathered under the belly, all hooves off the ground (body bunched up);
4 = back hooves touching the ground, front legs lifting and reaching forward.
The tail streams out behind in every frame. Keep the body, head and outfit exactly the same size and shape in all 4 frames; only the legs, the tail and a slight head bob change.

Art style: cute chibi, polished 2D mobile-game art, clean dark-brown outline of even thickness, soft cel shading, bright cheerful palette, big glossy eyes.
Transparent background (PNG with alpha); if transparency is not supported, use a flat pure green #00FF00 background and do not use green anywhere on the buffaloes. No ground, no shadow, no dust, no speed lines, no text, no letters, no numbers, no flags, no watermark.
```

---

## 2. `trau-dang.png`: 5 con trâu × 3 dáng (dọc, 1024×1536)

Đính kèm `trau-chay.png`. Cột 1 đứng yên (lúc tạm dừng), cột 2 nhảy mừng (nước thắng vòng), cột 3 nằm buồn (các nước thua).

```text
Generate the image now. The attached image shows the 5 buffalo characters: redraw exactly these same 5 buffaloes (same body, horns, skin color, saddle cloths, hats, scarves and flowers, same row order, same art style), only in new poses. Do not add or change any accessory.
One sprite sheet image for a 2D racing game.
Layout: an exact grid of 3 columns x 5 rows. All cells are equal size, one buffalo per cell, centered, every buffalo drawn at the same scale as in the attached image, clear empty space around each buffalo, no buffalo touches another, do not draw grid lines.

Each ROW is one buffalo, in the same order as the attached image:
Row 1: royal blue saddle cloth, orange marigold garland.
Row 2: golden-yellow saddle cloth, Vietnamese conical straw hat, red neck scarf.
Row 3: red saddle cloth, red silk flower on the forehead, gold bell.
Row 4: turquoise saddle cloth, red-and-white checkered krama scarf.
Row 5: orange saddle cloth, brown woven salakot hat, blue neck scarf.

Each COLUMN is one pose, same order in every row, every buffalo seen exactly from the SIDE and facing RIGHT:
1 = standing still, all four hooves on the ground, calm happy smile;
2 = celebrating a win: jumping high in the air with all four legs tucked under the body, eyes closed, huge joyful open-mouth smile;
3 = tired after losing: lying down on its belly with the legs folded under the body, head drooping low, eyes closed, sad little frown.

Art style: cute chibi, polished 2D mobile-game art, clean dark-brown outline of even thickness, soft cel shading, bright cheerful palette, big glossy eyes.
Transparent background (PNG with alpha); if transparency is not supported, use a flat pure green #00FF00 background and do not use green anywhere on the buffaloes. No ground, no shadow, no dust, no sweat drops, no stars, no text, no letters, no numbers, no flags, no watermark.
```

---

## 3. `nen.png`: nền đường đua đồng quê (dọc, 1024×1536)

Đính kèm `trau-chay.png` (chỉ lấy nét vẽ). Tỉ lệ các dải khớp với màn hình game: phần trời bị bảng tiêu đề và đồng hồ che gần hết, dải đất là 5 làn đua, bãi cỏ dưới cùng nằm sau bảng quà.

```text
Generate the image now. The attached image is ONLY an art-style reference: match its line work, colors and shading, but do not draw any buffalo, animal or character.
Background illustration for a vertical mobile racing game screen (portrait): a sunny Southeast Asian countryside racecourse seen exactly from the side (flat 2D side view, no perspective, the ground is perfectly horizontal). Follow these proportions from top to bottom:
- 0–20%: bright blue sky with a few soft white clouds; distant rolling green hills with a few coconut palm trees, bamboo clumps and tiny rice terraces. Keep this area calm and simple;
- 20–25%: a white wooden ranch fence running across the full width, green grass behind it;
- 25–76%: a very wide flat racetrack of light-brown sandy dirt, completely EMPTY and evenly colored, only a few tiny pebbles scattered; no lane lines, no markings, no hoof prints, no objects;
- 76–100%: a lush green grass meadow with small yellow and white wildflowers, a few round bushes at the far left and far right edges.
Keep important details away from the left and right 10% of the image, the sides may be cropped.
Art style: cute chibi 2D mobile-game art, clean outlines, soft cel shading, bright cheerful palette.
No characters, no animals, no people, no text, no letters, no numbers, no flags, no watermark.
```
