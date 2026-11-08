# Lớp Học Đoán Từ

Game đoán từ cho TikTok LIVE màn dọc (1080×1920), giao diện lớp học chibi giống `lop-hoc`. Node + Express + `tiktok-live-connector`, màn hình là trang web mở bằng cửa sổ Edge `--app` để LIVE Studio/OBS bắt hình. Cổng 3015.

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
| Hoa hồng 1 xu / kem 5 xu / heo may mắn 10 xu | 1 / 6 / 13 lượt x2: đoán đúng được +2 thay vì +1 |
| Follow hoặc share | 1 lượt x2. Mỗi người tối đa 1 lần mỗi phút (`socialGapSeconds`) |

- **Mỗi từ:** bảng hiện chủ đề, câu gợi ý và các ô chữ đóng. Chưa ai đoán ra thì cứ 8 giây (`hintEverySeconds`) cô mở thêm một chữ, nhiều nhất một nửa số chữ (`hints.max`). Hết 45 giây (`wordSeconds`) thì công bố đáp án.
- **Có người đoán ra:** tên hiện ⚡ ở đầu danh sách, đồng hồ rút xuống còn 10 giây (`afterFirstSeconds`) để các bạn khác kịp đoán, rồi công bố và sang từ mới sau 8 giây (`revealSeconds`).
- **Bạn nhanh nhất:** lúc công bố, bạn đoán đúng đầu tiên được hiện to giữa màn hình gần hết thời gian công bố: ảnh đại diện TikTok, vương miện, tên, số giây đoán ra và điểm vừa được; cô gọi tên bạn ấy. Không tải được ảnh (hoặc người thử ở bảng điều khiển) thì hiện mặt chibi. Ảnh chỉ giữ trong bộ nhớ, không lưu ra file.
- Mỗi người chỉ được cộng một lần mỗi từ. Hình trên điện thoại người xem trễ vài giây nên vẫn nhận đáp án thêm `graceSeconds` sau khi đồng hồ về 0.
- **Lượt x2:** chỉ mất khi đoán đúng (đoán sai không mất). Tính theo số xu của quà, quà to tính theo mức gần nhất nhân lên, ví dụ 99 xu = 9 lần mức 10 xu = 117 lượt. Sửa ở `boost.tiers`.
- **Lớp học = bảng điểm:** 40 bạn điểm cao nhất (`seats`) ngồi trong lớp theo thứ hạng, hàng đầu sát bảng là top 8, hạng cao ngồi giữa. Top 3 có điểm phát sáng với bảng Lớp trưởng / Lớp phó. Bằng điểm thì ai đạt điểm đó trước đứng trên. Người có lượt x2 từ quà cũng được vào lớp ngay, có viền hồng và hình quà.
- Bạn đoán đúng quay mặt lại cười, giơ tay với thẻ ✓ (hoặc x2) cho tới hết từ đó.
- Bảng điểm cộng dồn cả buổi, không tự về 0.

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
- **Lượt x2:** gọi tên; follow và share có lời cảm ơn riêng.
- Cùng một loại lời, cô không nói lại đúng câu vừa nói. Tổng cộng hơn 100 câu, thêm bớt thoải mái trong `teacher.json`.
- Cô không bao giờ đọc lại nội dung comment. Lời cô hiện thêm thành bong bóng cho người xem đang tắt tiếng.

Sửa lời thoại ở `teacher.json`; thấy đọc sai từ nào thì thêm vào `fixes` (chỉ đổi cách đọc, chữ trên bảng giữ nguyên). Mỗi mẩu giọng chỉ tạo một lần rồi lưu ở `data/tts`. Giọng gợi ý và đáp án được tạo trước 3 từ, nên chỉ tốn lượt Vbee cho từ thực sự hỏi tới; tên người chơi mới mất vài giây để tạo.

Có cảnh báo từ TikTok thì tự bật **chế độ an toàn**: cô im, game vẫn chạy, chủ kênh tắt lại ở bảng điều khiển.

## Bảng điều khiển

`http://127.0.0.1:3015/panel.html`: trạng thái kết nối, kim cương phiên live, giọng cô và chế độ an toàn, từ đang hỏi kèm **đáp án** (chỉ chủ kênh thấy), nút thử comment đúng/sai/quà/follow, thử đông người, mở thêm chữ, sang bước tiếp theo, xóa bảng điểm, gửi thử Telegram, và bảng xếp hạng.

## Từ ngữ trên màn hình

Bảng x2 chỉ hiện biểu tượng quà và số lượt, không dùng các từ như "tặng quà". Nội dung comment của người xem không bao giờ hiện lên màn hình, chỉ hiện tên người đoán đúng.
