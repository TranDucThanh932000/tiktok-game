# Lớp Học Đoán Từ

Game đoán từ cho TikTok LIVE màn dọc (1080×1920), giao diện lớp học chibi vẽ bằng ảnh (tường xanh bạc hà, sàn gỗ, cô giáo áo dài). Node + Express + `tiktok-live-connector`, màn hình là trang web mở bằng cửa sổ Edge `--app` để LIVE Studio/OBS bắt hình. Cổng 3015.

## Chạy

Bấm đúp `start.bat`: mở server, cửa sổ game 9:16 và bảng điều khiển.

- Đổi kênh TikTok: `tiktokUsername` trong `config.json` (đọc lúc bật server, đổi xong phải chạy lại).
- Chạy thử không kết nối TikTok: `node server.js " "`, rồi vào `http://127.0.0.1:3015/panel.html`.
- Tắt tiếng màn hình game: thêm `?mute` vào địa chỉ.
- Test: `npm test`.
- Cảnh báo TikTok qua Telegram: `.env` có `TELEGRAM_BOT_TOKEN` và `TELEGRAM_ADMIN_CHAT_ID` (đã chép từ `lop-hoc`).

**Trước mỗi buổi live** nên bấm "Xóa bảng điểm" ở bảng điều khiển. Điểm được lưu ở `data/board.json`, tắt server bật lại vẫn còn.

## Luật chơi

Không cần chat "vào lớp": ai comment cũng chơi được.

| Người xem làm gì | Chuyện gì xảy ra |
|---|---|
| Comment đúng từ đang đoán | +1 điểm. Gõ có dấu hay không dấu, viết hoa, viết liền đều được (`ca chep`, `CÁCHÉP`). Nhận cả `đáp án là ...`, `là ...`, `... nha`. Bỏ `con`, `quả`, `cái`, `cây` cũng được (`mèo` cho `con mèo`), `trái` thay `quả` cũng được |
| Comment sai | Không mất gì, đoán tiếp thoải mái |
| Follow hoặc share | 1 lượt x2: đoán đúng được +2 thay vì +1. Mỗi người tối đa 1 lần mỗi phút (`socialGapSeconds`) |
| Quà bất kỳ | **Không đụng tới điểm.** Có cảnh vui trong lớp, cô gọi tên chúc, xu góp vào quỹ lớp (xem mục Quà) |
| Tim cam (Heart Me, 1 xu) | Như quà khác, thêm: ảnh người gửi được treo lên bảng, ai gửi cuối cùng thì được treo |

- **Mỗi từ:** bảng hiện chủ đề, câu gợi ý và các ô chữ đóng. Chưa ai đoán ra thì cứ 8 giây (`hintEverySeconds`) cô mở thêm một chữ, nhiều nhất một nửa số chữ (`hints.max`). Hết 45 giây (`wordSeconds`) thì công bố đáp án.
- **Có người đoán ra:** tên hiện ⚡ ở đầu danh sách, đồng hồ rút xuống còn 10 giây (`afterFirstSeconds`) để các bạn khác kịp đoán, rồi công bố và sang từ mới sau 8 giây (`revealSeconds`).
- **Bạn nhanh nhất:** lúc công bố, bạn đoán đúng đầu tiên được hiện to giữa màn hình gần hết thời gian công bố: ảnh đại diện TikTok, vương miện, tên, số giây đoán ra và điểm vừa được; cô gọi tên bạn ấy. Không tải được ảnh (hoặc người thử ở bảng điều khiển) thì hiện mặt chibi. Ảnh chỉ giữ trong bộ nhớ, không lưu ra file.
- Mỗi người chỉ được cộng một lần mỗi từ. Hình trên điện thoại người xem trễ vài giây nên vẫn nhận đáp án thêm `graceSeconds` sau khi đồng hồ về 0.
- **Lượt x2:** chỉ có từ follow, share; chỉ mất khi đoán đúng (đoán sai không mất). Bảng điểm cũ còn lượt x2 từ quà (luật trước) thì vẫn giữ tới khi dùng hết.
- **Lớp học = bảng điểm:** 40 bạn điểm cao nhất (`seats`) ngồi trong lớp theo thứ hạng, hàng đầu sát bảng là top 8, hạng cao ngồi giữa. Top 3 có điểm phát sáng với bảng Lớp trưởng / Lớp phó. Bằng điểm thì ai đạt điểm đó trước đứng trên. Người có lượt x2 cũng được vào lớp ngay.
- Bạn đoán đúng quay mặt lại cười, giơ tay với thẻ ✓ (hoặc x2) cho tới hết từ đó.
- Bảng điểm cộng dồn cả buổi, không tự về 0.

## Quà

Quà không bao giờ cộng điểm hay cho lượt x2, để người chơi giỏi mà không gửi quà vẫn thấy công bằng. Quà mua được việc **được nhìn thấy và được gọi tên**:

- **Dải quà ngay dưới bảng** (bảng đã đẩy lên sát mép trên, bỏ thanh tên game và đồng hồ treo tường): hình Hoa hồng "Lên chào cô", Kem "Cả lớp cười", Heo may mắn "Heo chạy", Tim cam "Treo ảnh". Có quà tới thì ô của quà đó nảy lên. Chữ ngắn sửa ở `hint` trong `gifts.scenes` và `gifts.photoGift`.

- **Cảnh vui trong lớp**, chọn theo tổng xu của lần nhận (`gifts.scenes`):
  - Dưới 5 xu (`rose`): chibi của người gửi chạy từ cửa lớp lên, tên hiện trên đầu, đưa quà cho cô. Cô vỗ tay, tim bay lên.
  - 5 đến 9 xu (`kem`): như trên, thêm cả lớp quay lại cười giơ tay. Có thông báo to kèm ảnh đại diện.
  - Từ 10 xu (`pig`): hình quà chạy một vòng quanh lớp, cô giật mình rồi reo, cả lớp quay lại cười.
  - Cảnh dùng hình quà thật từ TikTok; không tải được thì dùng hình trong `public/gifts`. Xong cảnh, quà bay vào thanh quỹ lớp. Một người bấm liên tục thì gộp thành một cảnh (hiện "x5"). Đông quá thì tối đa 3 bạn chạy lên cùng lúc, cảnh chờ quá 8 thì bỏ bớt cảnh nhỏ cũ nhất.
- **Cô chúc riêng:** gọi tên rồi chúc, quà càng to lời chúc càng dài (`giftRose`, `giftKem`, `giftPig` trong `teacher.json`). Một người gửi liên tục chỉ được cảm ơn lại sau 20 giây, trừ khi quà to hơn lần trước. Lời cảm ơn được ưu tiên: không bị lời từ mới cắt ngang (từ mới đọc ngay sau), tên chưa tạo được giọng thì vẫn đọc lời chúc.
- **Ảnh treo trên bảng:** khung ảnh treo dưới mép trái bảng, ghi "Học sinh ngoan". Chỉ quà **Tim cam** (Heart Me, mã 7934) mới được treo, người gửi Tim cam cuối cùng được treo ảnh TikTok và tên. Chưa có ai thì khung hiện hình Tim cam và chữ "treo ảnh". Đổi quà ở `gifts.photoGift` (tên hoặc mã quà; mã của mọi quà nhận được có in trong cửa sổ server). Ảnh chỉ giữ trong bộ nhớ: bật lại server thì khung hiện mặt chibi kèm tên tới khi có người gửi tiếp.
- **Quỹ lớp:** mọi quà góp xu vào quỹ, thanh quỹ hiện "350/1.000 · Đủ sẽ có sự kiện". Được 90% thì thanh nhấp nháy và cô báo sắp đủ (một lần). Đủ `gifts.fundGoal` (1000 xu) thì **cô phát kẹo cả lớp**: thẻ "Cô phát kẹo cả lớp" kèm 3 người góp nhiều nhất, kẹo bay tới từng bạn, cả lớp quay lại cười. Phần dư sang quỹ mới. Quỹ được lưu cùng bảng điểm.

## Bộ từ

`words.json` có 1000 từ trong 26 chủ đề, mỗi từ kèm một câu gợi ý:

```json
{ "🐾 Con vật": [["con mèo", "Bắt chuột giỏi, thích nằm sưởi nắng"]] }
```

- Từ: chỉ chữ cái và dấu cách, 3 đến 16 chữ cái, tối đa 4 tiếng.
- Gợi ý: 8 đến 80 ký tự, **không được chứa đáp án** (so không dấu, kể cả khi bỏ `con`, `quả`...).
- Hai từ giống nhau khi bỏ dấu (như `con dê` và `con dế`) không được cùng có trong bộ, vì người xem gõ không dấu sẽ không phân biệt được.

Sửa xong khởi động lại server. File sai thì server báo rõ từ nào lỗi và không chạy. Từ được rút ngẫu nhiên, hết cả bộ mới lặp lại.

## Giọng cô giáo

Cô nói bằng Vbee (`VBEE_TOKEN`, `VBEE_APP_ID`, `VBEE_VOICE` trong `.env`, dùng chung khóa với `lop-hoc`). Phải chạy bằng `start.bat` hoặc `npm start` thì mới đọc `.env`. Thiếu khóa thì game vẫn chạy, cô chỉ hiện bong bóng chữ.

- **Từ mới:** câu mở đầu (12 kiểu) rồi đọc chủ đề và câu gợi ý (4 kiểu giới thiệu, mỗi từ cố định một kiểu).
- **Mở thêm chữ:** nhắc ngắn; chữ cuối cùng có câu riêng. Giữa từ (giây 28) mà chưa ai ra thì động viên một lần. Sắp hết giờ thì giục.
- **Đoán ra đầu tiên:** gọi tên khen; đoán ra trước khi mở chữ nào thì có lời khen "nhanh như chớp" riêng. Tên toàn ký tự đặc biệt không đọc được thì khen chung. Đủ 5, 10, 20 bạn đúng thì cô báo.
- **Công bố:** "Đáp án là ..." (4 kiểu), "Bạn nhanh nhất là ..." (4 kiểu), kèm lời theo số bạn đúng: không ai, một bạn, vài bạn, nhiều bạn.
- **Lượt x2:** follow và share có lời cảm ơn riêng.
- **Quà:** gọi tên rồi chúc (xem mục Quà). Quỹ lớp gần đủ thì báo, đủ thì báo phát kẹo.
- Cùng một loại lời, cô không nói lại đúng câu vừa nói. Tổng cộng hơn 100 câu, thêm bớt thoải mái trong `teacher.json`.
- Cô không bao giờ đọc lại nội dung comment. Lời cô hiện thêm thành bong bóng cho người xem đang tắt tiếng.

Sửa lời thoại ở `teacher.json`; thấy đọc sai từ nào thì thêm vào `fixes` (chỉ đổi cách đọc, chữ trên bảng giữ nguyên). Mỗi mẩu giọng chỉ tạo một lần rồi lưu ở `data/tts`. Giọng gợi ý và đáp án được tạo trước 3 từ, nên chỉ tốn lượt Vbee cho từ thực sự hỏi tới; tên người chơi mới mất vài giây để tạo.

Có cảnh báo từ TikTok thì tự bật **chế độ an toàn**: cô im, game vẫn chạy, chủ kênh tắt lại ở bảng điều khiển.

## Hình chibi và chuyển động

Ảnh gốc ở `art-src/`, tạo bằng ChatGPT theo `PROMPT-CHIBI.md` (3 ảnh): `hoc-sinh.png` (6 bạn × 8 dáng), `co-giao.png` (12 dáng), `lop-hoc.png` (nền lớp). Ảnh game dùng nằm ở `public/chibi/`, cắt bằng `node scripts/cat-anh-chibi.cjs` (chạy trong thư mục `doan-tu`, cần Edge). Script cũng xuất `art-src/xem-thu-*.png` để soát các khung đã cắt. Đổi ảnh khác thì chạy lại script và sửa `FW`, `FH` trong `public/js/art.js` theo số script in ra.

- **Học sinh:** bạn mới lọt vào bảng điểm bước ra từ cửa lớp bên trái, đi dọc bục giảng, xuống lối giữa rồi rẽ vào chỗ. Đổi hạng thì đi từ chỗ cũ sang chỗ mới. Đông người đổi chỗ cùng lúc thì chỉ 8 bạn đi, ưu tiên bạn mới vào, các bạn còn lại ngồi luôn. Ngồi thì quay lưng nhìn bảng; đoán đúng thì quay lại cười, giơ tay. Mỗi người chơi luôn là cùng một bạn trong 6 bạn, nửa số người được lật ngang cho lớp đỡ giống nhau. Mở lại trang thì ai cũng ngồi sẵn, không đi lại.
- **Cô giáo:** đứng góc phải bục giảng, chớp mắt, thỉnh thoảng đi dạo vài bước. Lúc nói thì đổi dáng tay. Từ mới hoặc mở thêm chữ thì đi sang trái, cầm thước chỉ lên bảng rồi về chỗ. Bạn đầu tiên đoán ra thì vỗ tay rồi giơ ngón cái. Công bố có bạn nhanh nhất thì giơ hai tay reo. Còn 5 giây mà chưa ai ra, hoặc hết giờ không ai đoán được, thì cô ôm má ngạc nhiên. Bong bóng lời cô luôn nằm bên trái cô.
- **Bảng đen** dùng khung gỗ và khay phấn cắt từ ảnh nền, kéo giãn cho vừa chữ, nằm sát mép trên màn hình.

## Bảng điều khiển

`http://127.0.0.1:3015/panel.html`: trạng thái kết nối, kim cương phiên live, giọng cô và chế độ an toàn, từ đang hỏi kèm **đáp án** (chỉ chủ kênh thấy), quỹ lớp và người đang được treo ảnh, nút thử comment đúng/sai/từng mức quà/Tim cam/follow, thử đông người, mở thêm chữ, sang bước tiếp theo, thử phát kẹo, xóa bảng điểm (xóa cả quỹ lớp và ảnh), gửi thử Telegram, và bảng xếp hạng.

## Từ ngữ trên màn hình

Màn hình và lời cô không dùng các từ như "tặng quà": chỉ có "Quỹ lớp", "Đủ sẽ có sự kiện", "treo ảnh" và lời cảm ơn, lời chúc. Nội dung comment của người xem không bao giờ hiện lên màn hình, chỉ hiện tên người đoán đúng.
