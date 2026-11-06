# Lớp Học · Ai Thông Minh Hơn

Game lớp học cho TikTok LIVE màn dọc (1080×1920). Node + Express + `tiktok-live-connector`, màn hình là trang web mở bằng cửa sổ Edge `--app` để LIVE Studio/OBS bắt hình. Cổng 3008.

## Chạy

Bấm đúp `start.bat`: mở server, cửa sổ game 9:16 và bảng điều khiển.

- Đổi kênh TikTok: `tiktokUsername` trong `config.json`.
- Chạy thử không kết nối TikTok: `node server.js ""`, rồi vào `http://127.0.0.1:3008/panel.html`.
- Tắt tiếng màn hình game: thêm `?mute` vào địa chỉ.
- Test: `npm test`.
- Muốn nhận cảnh báo TikTok qua Telegram: tạo `.env` có `TELEGRAM_BOT_TOKEN` và `TELEGRAM_ADMIN_CHAT_ID`.

**Trước mỗi buổi live** nên bấm "Mở lớp mới" ở bảng điều khiển. Lớp và điểm được lưu lại khi tắt server (`data/class.json`), để lỡ mất điện giữa buổi thì không mất điểm.

## Luật chơi

| Người xem làm gì | Chuyện gì xảy ra |
|---|---|
| Chat `vào` (cả `vao`, `vô`, `vào lớp`, `cho em vào`...) | Có chỗ ngồi, tên hiện dưới bàn |
| Comment `A` `B` `C` `D` (cả `aaa`, `đáp án b`, `chọn c`...) | Giơ tay với thẻ đáp án. Chỉ tính đáp án đầu tiên của mỗi câu. `à`, `á`, `ạ` không tính là đáp án |
| Đúng / sai | Đúng +1 điểm, sai hoặc không trả lời giữ nguyên. Bạn đúng đầu tiên của mỗi câu được x2 điểm câu đó (`firstRightMultiplier`) |
| Hoa hồng 1 xu / kem 5 xu / heo may mắn 10 xu | 1 / 6 / 13 lượt x2 |
| Follow hoặc share | 1 lượt x2 cho câu tiếp theo. Mỗi người tối đa 1 lần mỗi phút (`socialGapSeconds`, dùng chung cho cả follow và share), quá thì bỏ qua, không báo gì trên màn hình |

- **Ban cán sự:** ba bạn cao điểm nhất (có ít nhất 1 điểm) làm Lớp trưởng và 2 Lớp phó học tập, tên phát sáng. Bằng điểm thì ai đạt điểm đó trước đứng trên.
- **Đúng đầu tiên:** tính theo thứ tự comment tới, bạn trả lời sai trước đó không ảnh hưởng. Cộng dồn với lượt x2 nên bạn đúng đầu tiên mà đang có lượt x2 được +4.
- **Lớp đầy (50 chỗ):** người vào sau thay người thấp điểm nhất, bằng điểm thì thay người im lâu nhất. Vào lại thì điểm tính lại từ 0.
- **Không bị thay:** ban cán sự, người còn lượt x2, người vừa vào dưới 25 giây (`newcomerGraceSeconds`), người đang chờ kết quả câu vừa trả lời. Nếu chưa thay được ai thì người mới chờ ngoài cửa và tự vào khi tới lượt, không cần chat lại. Hai lần thay cách nhau ít nhất 4 giây (`kickGapSeconds`).
- **Lượt x2:** mất một lượt mỗi khi trả lời, đúng hay sai đều mất; không trả lời thì không mất. Lượt được giữ cả khi ra khỏi lớp. Người chưa vào lớp mà có quà thì được vào luôn.
- **Tính theo số xu của quà**, không theo tên quà, nên quà khác cùng giá cũng được. Quà to hơn tính theo mức gần nhất nhân lên, ví dụ 99 xu = 9 lần mức 10 xu = 117 lượt. Sửa ở `boost.tiers` trong `config.json`.

Cứ 6 câu (`setSize`) bảng hiện Ban cán sự một lần, điểm không bị xóa.

## Giọng cô giáo

Cô nói bằng Vbee (`VBEE_TOKEN`, `VBEE_APP_ID`, `VBEE_VOICE` trong `.env`). Thiếu khóa thì game vẫn chạy, chỉ không có tiếng.

- **Đọc bài:** đọc câu hỏi rồi từng đáp án, đáp án đang đọc sáng lên trên bảng. Học sinh trả lời được ngay từ lúc câu hỏi hiện, nhưng **đồng hồ chỉ chạy sau khi cô đọc xong**.
- **Công bố:** nói đáp án, lời giải, rồi gọi tên khen tối đa 3 bạn đúng. Cả lớp đúng, ít bạn đúng, không ai đúng, không ai trả lời đều có lời riêng.
- **Khen thêm:** đúng đầu tiên, đúng từ 3 câu liên tiếp, được nhân đôi điểm. Lên lớp trưởng thì chúc mừng kèm tiếng vỗ tay.
- **Trong lúc chờ:** chào bạn mới vào, cảm ơn khi có lượt x2, nhắc bạn nhường chỗ, khen bạn trả lời đầu tiên, giục khi sắp hết giờ, gọi tên bạn im lặng lâu, mời chat "vào" khi lớp còn vắng.
- **Đáp lại comment** theo từ khóa: "chào cô", "cô ơi", "khó quá", "đáp án là gì"... Mỗi người một phút một lần. Cô chỉ đọc tên, **không bao giờ đọc lại nội dung comment**.
- Lời cô hiện thêm thành bong bóng, cho người xem đang tắt tiếng.

Sửa lời thoại ở `teacher.json`, khởi động lại server là mẩu mới tự được tạo. `{name}` là tên học sinh; tên toàn ký tự đặc biệt không đọc được thì cô bỏ qua câu đó. Thấy đọc sai từ nào thì thêm vào mục `fixes`, ví dụ `"Teacher": "ti chờ"` (chỉ đổi cách đọc, chữ trên bảng giữ nguyên).

Mỗi mẩu giọng chỉ tạo một lần rồi lưu ở `data/tts`, lần sau không tốn lượt Vbee. Giọng câu hỏi được tạo trước 2 câu, nên chỉ tốn cho câu thực sự hỏi tới. Nếu giọng câu sắp hỏi chưa có, game chờ tối đa 12 giây rồi vẫn hỏi, chỉ không đọc.

Có cảnh báo từ TikTok thì tự bật **chế độ an toàn**: cô im, lớp vẫn chạy, chủ kênh tắt lại ở bảng điều khiển.

Ghế chưa có người là hình mờ, không tên và không tự trả lời, để không ai tưởng đó là người thật.

## Bộ câu hỏi

Câu hỏi nằm trong `questions.json`. Mỗi câu có dạng:

```json
{ "s": "Toán", "q": "12 × 8 bằng bao nhiêu?", "o": ["96", "86", "106", "92"], "e": "12 × 8 = 96" }
```

- `s`: môn, `q`: câu hỏi, `e`: lời giải hiện dưới "Đáp án đúng" và cô đọc lên (không bắt buộc).
- `o`: 4 đáp án, **đáp án đúng luôn viết đầu tiên**; lúc hỏi game tự xáo A B C D.

Sửa xong khởi động lại server. File sai định dạng thì server báo rõ câu nào lỗi và không chạy.

Thời gian nằm trong `timing` của `config.json`. `askSeconds` là số giây đếm ngược sau khi cô đọc xong. Hình trên điện thoại người xem trễ vài giây so với máy, nên còn có `graceSeconds` nhận đáp án sau khi đồng hồ về 0.

## Từ ngữ trên màn hình

Tránh các từ như "tặng quà", "đánh", "máu". Bảng x2 chỉ hiện biểu tượng và số lượt, người bị thay được ghi là "A vào thay B".
