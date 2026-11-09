# Tiệm Net Cô Tám

Game quán net cho TikTok LIVE màn dọc (1080×1920). Người xem comment để vào máy, ngồi là cày giờ, hết giờ thì nhường máy cho người chờ. Node + Express + `tiktok-live-connector`, màn hình là trang web mở bằng cửa sổ Edge `--app` để LIVE Studio/OBS bắt hình. Cổng 3016.

## Chạy

Bấm đúp `start.bat`: mở server, cửa sổ game 9:16 và bảng điều khiển.

- Đổi kênh TikTok: `tiktokUsername` trong `config.json` (đọc lúc bật server, đổi xong phải chạy lại).
- Chạy thử không kết nối TikTok: `node server.js " "`, rồi vào `http://127.0.0.1:3016/panel.html`.
- Tắt tiếng màn hình game: thêm `?mute` vào địa chỉ.
- Test: `npm test`.
- Cảnh báo TikTok qua Telegram: `.env` có `TELEGRAM_BOT_TOKEN` và `TELEGRAM_ADMIN_CHAT_ID` (đã chép từ `doan-tu`).
- Giọng cô Tám cần `VBEE_TOKEN`, `VBEE_APP_ID` trong `.env` (đã chép từ `doan-tu`) và phải chạy bằng `start.bat` hoặc `npm start` thì mới đọc `.env`.

**Trước mỗi buổi live** nên bấm "Bắt đầu buổi mới" ở bảng điều khiển. Sổ tiệm (điểm cày, giờ còn lại) lưu ở `data/board.json`, tắt server bật lại vẫn còn, nhưng tiệm trống: ai muốn chơi tiếp thì gõ `ngoi` lại.

## Luật chơi

Thời gian trong game tính bằng **phút net**: 1 phút net = 3 giây thật (`clock.secondsPerMinute`). Đồng hồ "GIỜ TIỆM" chạy theo phút net, bắt đầu từ 19:00, trời ngoài cửa sổ đổi theo giờ.

| Người xem làm gì | Chuyện gì xảy ra |
|---|---|
| Comment `ngoi` (`ngồi`, `vào`, `vô`, `vào máy`, `chơi`...) | Đi từ cửa vào một máy trống, có sẵn 20 phút (`freeMinutes`). Hết máy thì đứng hàng chờ phía dưới. `ngoi 7` là xin máy số 7 |
| Comment tên game: `volam` (`vl`), `au`, `cs`, `aoe`, `fifa`, `chat` | Đổi game trên màn hình máy mình. Chưa ngồi thì vào máy chơi game đó luôn |
| Comment `gio` | Hiện còn bao nhiêu phút (hoặc đang chờ thứ mấy) |
| Comment `ve` (`về`, `về nhà`, `nghỉ`) | Tắt máy ra về, nhường máy cho người chờ. Giờ đã nạp còn dư được giữ cho lần sau |
| Comment `buzz` | Rung máy một bạn khác trong tiệm (mỗi người 20 giây một lần) |
| Comment `gg` (`đập phím`, `cay`) | Đập phím, phím bay tung tóe (15 giây một lần) |
| Comment bất kỳ khi đang chơi | +1 phút, mỗi người tối đa một lần mỗi 10 giây |
| Thả tim (đang ngồi hoặc đang chờ) | 15 tim = +1 phút (`likesPerMinute`) |
| Follow | +30 phút (mỗi người một lần) |
| Share | +15 phút (mỗi người 60 giây một lần) |

Lệnh phải là cả comment (gõ `ngoi nha`, `cho em ngồi với`, `NGỒI!!` đều được), chữ lẫn trong câu dài không tính. Gõ có dấu hay không dấu đều được.

- **Hết giờ:** màn hình đỏ "HẾT GIỜ", vẫn ngồi đó nếu không ai chờ. Có người chờ thì sau 10 giây (`kickSeconds`) bị mời ra, người hết giờ lâu nhất đi trước. Thả tim, follow, share hay tặng quà là chơi tiếp ngay. Hết giờ mà im lặng 5 phút (`idleKickMinutes`) thì cô Tám tắt máy.
- **Bảng cày net:** số phút đã chơi (không tính lúc hết giờ hay cúp điện), nhân hệ số lên đồ / VIP / giờ vàng. Top 10, hai trang tự đổi.

### Quà

Mỗi xu = 30 phút (`minutesPerCoin`), cộng thêm món theo mức quà. Quà to tính theo mức gần nhất nhân lên (99 xu = 3 lần mức 30 xu). Tặng quà là vào tiệm luôn, khỏi gõ `ngoi`; tiệm đầy thì đứng đầu hàng chờ (trước những bạn chưa tặng).

| Quà (hoặc quà khác cùng giá) | Món |
|---|---|
| Hoa hồng 1 xu | Nạp giờ |
| Tim tay 5 xu | Tô mì trứng + chai nước tăng lực đặt cạnh máy |
| Heo may mắn 10 xu | Lên đồ: cày x2 trong 120 phút |
| Donut 30 xu | Máy khủng: màn hình viền đèn RGB, cày x2 trong 240 phút |
| Hộp quà 100 xu | Phòng VIP: chuyển lên 4 máy VIP sát quầy, cày x3 trong 300 phút. VIP kín thì chờ ở máy cũ, có chỗ là lên |
| Corgi 299 xu | Bao net: mọi người đang ngồi và đang chờ +60 phút |
| Galaxy 1000 xu | Mua lại tiệm: bảng hiệu đổi thành "NET <tên>" 10 phút, cả tiệm +120 phút |

Hệ số cộng dồn kiểu cộng: lên đồ +1, VIP +2, giờ vàng +1 (lên đồ trong VIP lúc giờ vàng = x5). Sửa trong `gifts`, `rates`.

### Chuyện trong tiệm (tự xảy ra, chế độ an toàn thì tắt)

- **Giờ vàng** (khoảng mỗi 4 phút, dài 60 giây): một game được x2, bảng vàng hiện tên game và lệnh để đổi.
- **Cúp điện** (khoảng mỗi 10 phút, 7 giây): tối thui, đèn pin quét qua, không trừ giờ cũng không cày.
- **Mẹ tới kiếm** (khoảng mỗi 5 phút, khi có từ 5 người chơi): mẹ cầm chổi lông gà vào gọi tên một bạn **chưa tặng quà**. Bạn đó gõ `tron` trong 12 giây thì núp dưới gầm bàn, mẹ bỏ đi, được +10 phút; không thì bị xách về (giờ còn dư vẫn giữ).

## Giọng cô Tám

Cô Tám nói bằng Vbee, giọng nữ miền Nam `sg_female_thaotrinh_full_48k-fhg`, tốc độ 1.1 (`voice` trong `config.json`). Gói Vbee hiện tại cũng tạo được `sg_female_lantrinh_vdts_48k-fhg` và `sg_female_tuongvy_call_44k-fhg`. Đổi giọng hoặc tốc độ thì chạy lại server; lần đầu với giọng mới sẽ tạo lại toàn bộ lời (khoảng 120 mẩu ngắn).

- Chữ cô nói hiện thành bong bóng cạnh quầy, đúng lúc cô bắt đầu nói, cho người xem đang tắt tiếng.
- Mỗi câu ghép từ các mẩu giọng lưu ở `data/tts`: lời cố định tạo sẵn lúc bật server (chỉ lần đầu), tên người chơi và câu có số phút lạ tạo khi cần rồi để dành. Mẩu chưa kịp tạo (khoảng 3 giây) thì câu đó chỉ hiện chữ, lần sau mới có tiếng.
- Đang nói mà có câu mới ngang hàng thì câu mới chờ (chỉ giữ câu mới nhất); câu quan trọng hơn (quà to, chuyện trong tiệm) cắt ngang. Tên toàn ký tự đặc biệt không đọc được thì cô gọi "bạn".
- Lời thoại sửa ở `lines.json`, `{name}` là tên người chơi. Đọc sai chữ nào thì thêm vào `fixes` (ví dụ `"Sting": "Xì tinh"`); tên game và lệnh đọc theo `speak`. Chữ trên màn hình giữ nguyên.
- Lời của mẹ (`mom`, `momLost`) chỉ hiện trong bong bóng của mẹ, chưa có giọng.
- Chế độ an toàn thì cô im, chỉ hiện chữ. Bảng điều khiển có nút "Cô Tám nói thử".

## Nhân vật riêng (ảnh AI)

Chưa có ảnh thì game dùng hình vẽ sẵn. Để tốn ít lượt tạo ảnh nhất, cho AI vẽ **bảng nhân vật** rồi để script cắt ra:

1. Dán prompt trong [prompt-nhan-vat.txt](prompt-nhan-vat.txt) vào ChatGPT/Gemini. Lưu ảnh thành `anh-goc/bo-1.png` (4 khách, cô Tám, mẹ). Muốn thêm 4 khách thì làm thêm `anh-goc/bo-2.png`.
2. Trong thư mục `quan-net`, chạy `node scripts/cat-anh.mjs`. Script xóa nền xanh, tách từng hình theo lưới, kê các tư thế đứng/đi của cùng một người cho cùng chiều cao, rồi ghi PNG nền trong suốt vào `public/nhan-vat/` (ghi đè ảnh cũ cùng tên). Nếu đếm sai số hình (AI vẽ dính nhau, thiếu ô, vẽ thêm đồ vật), script báo ô bị lỗi và không ghi file nào. Khi đó hãy tạo lại bảng ấy.
3. Bấm F5 ở cửa sổ game, không cần tắt server. Mục "Nhân vật riêng" trên bảng điều khiển cho biết game đã nhận những tư thế nào.

| Tên file | Dùng cho |
|---|---|
| `khach-N-dung.png` | Đứng xếp hàng chờ máy, đi xuống cửa khi về (nhìn trước) |
| `khach-N-sau.png` | Đi lên phía máy (sau lưng) |
| `khach-N-ngang.png` | Đi sang phải; khi đi sang trái game tự lật ảnh |
| `khach-N-ngoi.png` | Ngồi gõ phím (sau lưng); hết giờ thì gục xuống ngủ "z Z" |
| `chu-tiem.png` | Cô Tám bình thường |
| `chu-tiem-la.png` | Cô Tám la (hết giờ, đuổi, cúp điện, mẹ tới...) |
| `chu-tiem-vui.png` | Cô Tám vui (không bắt buộc; thiếu thì dùng ảnh thường) |
| `me-sau.png` | Mẹ đi vào tìm con (sau lưng) |
| `me.png` | Mẹ đứng ở máy của con, rồi đi về |

- N chạy từ 1 đến 99. Mỗi tài khoản TikTok được gán cố định một khách. Khi đã có ảnh khách, cả tiệm chỉ dùng ảnh, xoay vòng giữa các khách.
- Thiếu ảnh `sau` hoặc `ngang` thì game dùng ảnh `dung`; thiếu hẳn thì dùng hình vẽ sẵn.
- Cũng có thể bỏ từng ảnh lẻ vào `public/nhan-vat/` (`.png`, `.webp`, `.jpg`). Ảnh nền trong suốt được giữ nguyên. Ảnh nền một màu (tốt nhất là xanh lá #00FF00) thì game tự xóa nền và cắt sát nhân vật.

## Bảng điều khiển

`http://127.0.0.1:3016/panel.html`: trạng thái kết nối, kim cương phiên live, chế độ an toàn, nút thử lệnh / game / quà / tim / follow / share / vào phòng, thử đông người (34 bạn là đầy tiệm và có hàng chờ), bật ngay giờ vàng, cúp điện, mẹ tới kiếm, bắt đầu buổi mới, gửi thử Telegram, kiểm tra ảnh nhân vật, bảng cày net.

## Màn hình

- Trên cùng: bảng hiệu neon, bốn ô GIỜ TIỆM, MÁY TRỐNG, ĐANG CHỜ, ĐANG XEM (số người xem live). Có quà to thì dải thông báo phủ tạm lên đây; giờ vàng thay chỗ bốn ô này.
- Tường: cửa sổ (ai vào phòng live thì hiện "đang ngó vào"), bảng DỊCH VỤ (hình quà và tên món, không ghi giá), quầy thu ngân có cô Tám và bong bóng lời nói.
- 4 máy VIP sát quầy, 24 máy thường 4 dãy (`room`), mỗi máy có tên, giờ còn lại, màn hình game đang chơi. Hàng chờ đứng dưới cùng.
- Dưới cùng: bảng cày net và bảng cú pháp comment.

Nội dung comment của người xem không bao giờ hiện lên màn hình, chỉ hiện tên.
