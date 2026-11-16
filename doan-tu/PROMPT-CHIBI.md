# Prompt tạo ảnh chibi cho Lớp Học Đoán Từ (bản gọn: 3 ảnh)

Chỉ cần tạo **3 ảnh**. Mỗi ảnh gom nhiều nhân vật và dáng, mình sẽ tự cắt từng hình, tách nền và làm chuyển động trong game.

| Ảnh | Nội dung | Kích thước |
|---|---|---|
| `hoc-sinh.png` | 6 học sinh × 8 dáng (đi xuống, đi ngang, đi lên, ngồi quay lưng, quay lại giơ tay) | ngang 1536×1024 |
| `co-giao.png` | cô giáo 12 dáng (đi, đứng, chớp mắt, nói, chỉ bảng, vỗ tay, khen, reo, ngạc nhiên) | ngang 1536×1024 |
| `lop-hoc.png` | nền lớp học mới, có sẵn bảng đen trống, cửa lớp, bàn cô, cửa sổ | dọc 1024×1536 |

**Những thứ không cần vẽ, mình tự làm:**
- Dáng đi sang phải: mình lật ngang ảnh đi sang trái.
- Bàn ghế học sinh: mình vẽ bằng code, cùng tông màu với nền.
- Kim đồng hồ, chữ trên bảng, tên game: vẫn do game vẽ.
- Lớp 40 chỗ mà chỉ có 6 bạn: mình đổi màu nơ, tóc, da cho đỡ trùng.

**Cách làm:** chép nguyên khối prompt, dán vào công cụ tạo ảnh (ChatGPT tạo được nền trong suốt). Prompt viết bằng tiếng Anh để công cụ hiểu đúng hơn. Hình bị lệch ô một chút không sao, mình tìm từng nhân vật theo khoảng trống chứ không cắt cứng theo ô. Chỉ tạo lại khi:
- thiếu hàng hoặc thiếu cột;
- có hai nhân vật dính vào nhau;
- có chữ trong ảnh;
- dáng "đi lên" vẽ ra mặt thay vì lưng.

Lưu 3 ảnh vào `doan-tu/art-src/` rồi báo mình.

## Thứ tự tạo và ảnh cần đính kèm

Mỗi phiên có 3 lượt, vừa đủ 3 ảnh. Tạo theo đúng thứ tự dưới đây, ảnh sau đính kèm ảnh đầu tiên để cả bộ cùng một nét vẽ. Ảnh đính kèm chỉ dùng để lấy nét vẽ: prompt đã dặn công cụ không chép nhân vật trong ảnh đó.

| Lượt | Tạo ảnh | Đính kèm |
|---|---|---|
| 1 | `hoc-sinh.png` | không cần |
| 2 | `co-giao.png` | `hoc-sinh.png` |
| 3 | `lop-hoc.png` | `hoc-sinh.png` |

**Nếu có ảnh hỏng phải tạo lại ở phiên hoặc tài khoản khác:** phiên mới không còn nhớ ảnh cũ, nên bạn tải ảnh đã đạt từ phiên trước lên làm ảnh đính kèm.

| Ảnh cần tạo lại | Đính kèm ảnh nào |
|---|---|
| `hoc-sinh.png` | `co-giao.png` nếu đã có. Khi đính kèm, thay câu đầu của prompt 1 bằng câu đầu của prompt 2 (câu bắt đầu "Generate the image now. The attached image…"). Chưa có thì không đính kèm, dùng nguyên prompt 1. |
| `co-giao.png` | `hoc-sinh.png` |
| `lop-hoc.png` | `hoc-sinh.png` |

Prompt 2 và 3 bắt buộc phải có ảnh đính kèm. Nếu ChatGPT trả lời "hãy tải ảnh lên" thay vì vẽ, tức là chưa có ảnh: gửi ảnh `hoc-sinh.png` trong cùng tin nhắn với prompt.

Mỗi lần chỉ đính kèm **một** ảnh, đúng ảnh ghi trong bảng. Đính kèm nhiều ảnh dễ làm công cụ chép lẫn nhân vật.

Nếu ảnh học sinh hỏng một phần, ví dụ một hàng bị sai, mà bạn không còn lượt, cứ gửi mình xem trước. Thường mình vẫn cắt và dùng được những hàng tốt, lớp sẽ có ít kiểu bạn hơn một chút.

---

## 1. `hoc-sinh.png`: 6 học sinh (ngang, 1536×1024)

Mỗi hàng là một bạn: 3 nam, 3 nữ. Mỗi cột là một dáng: cột 1–2 đi xuống, 3–4 đi sang trái, 5–6 đi lên, 7 ngồi quay lưng nhìn bảng, 8 quay lại cười giơ tay.

```text
Generate the image now (no reference image needed). Create one sprite sheet image for a 2D classroom game, containing 6 different chibi students.
Layout: an exact grid of 8 columns x 6 rows. All cells are equal size, one figure per cell, centered, every figure drawn at the same scale, clear empty space around each figure, no figure touches another, do not draw grid lines.

Each ROW is one student, identical face, hair and outfit across the whole row:
Row 1: boy, short spiky black hair, big cheerful grin, light-tan skin.
Row 2: boy, neat side-parted black hair, round black glasses, fair skin.
Row 3: boy, fluffy wavy dark-brown hair, chubby round cheeks, warm skin.
Row 4: girl, long black high ponytail tied with a big pink ribbon, fair skin.
Row 5: girl, two black braided pigtails with yellow hair clips, light freckles, light-tan skin.
Row 6: girl, black hair in a round top bun with a mint-green scrunchie, light skin.
All students: about 8 years old, chibi proportions 2.5 heads tall (big round head, small body), Vietnamese primary school uniform: white short-sleeve collared shirt, red Young Pioneer scarf at the neck, navy blue shorts for boys, navy blue pleated skirt for girls, white socks, black shoes.

Each COLUMN is one pose, same order in every row, 3/4 top-down game view:
1 = walking toward the viewer, left foot forward;
2 = walking toward the viewer, right foot forward;
3 = walking to the left (side view facing left), left foot forward;
4 = walking to the left, right foot forward;
5 = walking away from the viewer (back view), left foot forward;
6 = walking away from the viewer (back view), right foot forward;
7 = sitting seen from behind (back of the head toward the viewer), looking ahead at a blackboard, no chair drawn;
8 = sitting, turned around to face the viewer, huge happy smile, one hand raised high, no chair drawn.

Art style: cute chibi, polished 2D mobile-game art, clean dark-brown outline of even thickness, soft cel shading, fresh pastel palette, big glossy eyes, rosy cheeks.
Transparent background (PNG with alpha); if transparency is not supported, use a flat pure green #00FF00 background. No ground shadow, no text, no letters, no numbers, no watermark.
```

---

## 2. `co-giao.png`: cô giáo 12 dáng (ngang, 1536×1024)

Hàng trên: đi sang trái (2 bước), đứng ôm sách, chớp mắt, nói (tay mở), nói (giơ ngón trỏ). Hàng dưới: cầm thước chỉ bảng, chỉ bảng và đọc, vỗ tay, giơ ngón cái, giơ hai tay reo, ôm má ngạc nhiên (sắp hết giờ).

```text
Generate the image now. The attached image is ONLY an art-style reference: match its line work, colors, shading and chibi proportions exactly, but do not copy its characters or layout.
One sprite sheet image for a 2D classroom game: the same chibi teacher in 12 poses.
Layout: an exact grid of 6 columns x 2 rows. All cells are equal size (tall cells), one full-body figure per cell, centered, feet on the same baseline, every figure drawn at the same scale, clear empty space around each figure, do not draw grid lines.

Character (identical in every cell): a young Vietnamese female teacher in her twenties, chibi proportions 3 heads tall, long straight black hair in a low half-up style with a small pink flower clip, kind warm smile, light sky-blue áo dài (traditional Vietnamese long dress) with a delicate white cherry-blossom pattern over white silk trousers, low beige heels.

Poses, numbered left to right, top row first:
1 = walking to the left (side view facing left), left foot forward;
2 = walking to the left, right foot forward;
3 = standing idle, front view, holding a red book against her chest;
4 = same as 3 with eyes closed (blink);
5 = talking, mouth open, free hand open palm toward the viewer;
6 = talking, index finger raised as if explaining;
7 = pointing to the LEFT with a long thin wooden pointer stick, body turned 3/4 to the left, smiling;
8 = same as 7 with mouth open, reading aloud;
9 = clapping happily, eyes closed smile;
10 = thumbs up with a wink;
11 = both arms raised high, cheering;
12 = surprised, both hands on her cheeks, mouth in an "O" shape.

Art style: cute chibi, polished 2D mobile-game art, clean dark-brown outline of even thickness, soft cel shading, fresh pastel palette, big glossy eyes, rosy cheeks.
Transparent background (PNG with alpha); if transparency is not supported, use a flat pure green #00FF00 background. No ground shadow, no text, no letters, no numbers, no watermark.
```

---

## 3. `lop-hoc.png`: nền lớp học mới (dọc, 1024×1536)

Tông xanh bạc hà, gỗ mật ong, nắng sớm. Bảng đen để trống vì chữ do game viết. Sàn để trống vì bàn ghế và học sinh do game đặt lên.

```text
Generate the image now. The attached image is ONLY an art-style reference: match its line work, colors, shading and chibi proportions exactly, but do not copy its characters or layout.
Background illustration for a vertical mobile game screen (portrait), the interior of a bright, cheerful Vietnamese primary school classroom, seen from the back of the room, slightly elevated, gentle perspective. Follow these proportions from top to bottom:
- top 0–3%: ceiling edge with a string of pastel triangle bunting flags;
- 3–40%: a very large EMPTY chalkboard almost the full width of the image (deep teal-green surface, thick light-wood frame with rounded corners, chalk tray at the bottom with white, yellow and pink chalk and an eraser). Nothing written on the board. A small round wall clock without hands in the top-right corner above the board;
- 40–51%: front wall painted soft mint-blue with white wainscoting; a wooden classroom door on the far left edge; a tall potted plant on the far right;
- 51–55%: a low wooden teacher platform across the full width; a small teacher's desk with books and a red apple on the platform, about one quarter from the left;
- 55–100%: honey-colored wooden plank floor receding in perspective, completely EMPTY: no desks, no chairs, no people, no objects.
Morning sunlight from the left, soft light beams, a few dust sparkles.
Art style: cute chibi 2D mobile-game art, clean outlines, soft cel shading, fresh pastel palette (mint-blue, white, honey wood, touches of peach and pink).
No characters, no people, no text, no letters, no numbers, no watermark.
```

---

## 4. `thay-giam-thi.png`: thầy giám thị 10 dáng (ngang, 1536×1024), không bắt buộc

Thêm sau, khi đã có bộ 3 ảnh trên. Chưa có ảnh này thì game vẽ tạm thầy bằng SVG. Tạo ở lượt mới, **đính kèm `hoc-sinh.png`**. Lưu vào `doan-tu/art-src/thay-giam-thi.png`, chạy lại `node scripts/cat-anh-chibi.cjs` là game tự dùng ảnh (không cần sửa code).

Thứ tự dáng (5 ô mỗi hàng): đi sang trái (2 bước), đi về phía người xem (2 bước), đi ra xa (lưng, 2 bước), chống nạnh, chỉ tay mắng, đi sang trái kéo tai (2 bước). Dáng kéo tai: tay phải duỗi ra phía sau, ngang tầm đầu một bạn nhỏ, như đang nắm tai kéo đi (không vẽ học sinh).

```text
Generate the image now. The attached image is ONLY an art-style reference: match its line work, colors, shading and chibi proportions exactly, but do not copy its characters or layout.
One sprite sheet image for a 2D classroom game: the same chibi male school supervisor in 10 poses.
Layout: an exact grid of 5 columns x 2 rows. All cells are equal size (tall cells), one full-body figure per cell, centered, feet on the same baseline, every figure drawn at the same scale, clear empty space around each figure, do not draw grid lines.

Character (identical in every cell): a strict but funny Vietnamese male school supervisor in his forties, chibi proportions 3 heads tall, short neat black hair with a side part, thick angry eyebrows, round black glasses, small black mustache, white short-sleeve collared shirt tucked in, red tie, a red armband on his left upper arm, dark navy trousers, brown belt, black shoes, a silver whistle on a red cord around his neck.

Poses, numbered left to right, top row first:
1 = walking to the left (side view facing left), left foot forward, stern face;
2 = walking to the left, right foot forward;
3 = walking toward the viewer, left foot forward;
4 = walking toward the viewer, right foot forward;
5 = walking away from the viewer (back view), left foot forward;
6 = walking away from the viewer (back view), right foot forward;
7 = standing, front view, hands on hips, frowning;
8 = scolding: body turned 3/4 to the LEFT, pointing down-left with his left index finger, mouth wide open shouting, whistle in the other hand, a small red anger mark on his forehead;
9 = walking to the left (side view facing left), left foot forward, right arm stretched BACK behind him (toward the right edge of the cell) at the height of his waist, fingers pinching as if pulling a small child's ear, annoyed face;
10 = same as 9 with the right foot forward.

Art style: cute chibi, polished 2D mobile-game art, clean dark-brown outline of even thickness, soft cel shading, fresh pastel palette, big glossy eyes, rosy cheeks.
Transparent background (PNG with alpha); if transparency is not supported, use a flat pure green #00FF00 background. No ground shadow, no text, no letters, no numbers, no watermark.
```
