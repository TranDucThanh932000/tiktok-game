# Đua Top Tỉnh Thành (TikTok LIVE)

Cuộc đua xem tỉnh nào đông người nhất. Màn hình dọc 1080×1920 là bản đồ 63 tỉnh thành. Mỗi tỉnh có màu và viền màu riêng, tỉnh kề nhau không bao giờ trùng màu. Số in trên mỗi tỉnh là biển số xe của tỉnh đó: Nam Định 18, Thái Bình 17, Hà Nội 29... Bản đồ có quần đảo Hoàng Sa (Đà Nẵng) và Trường Sa (Khánh Hòa). Bên phải là bảng xếp hạng tỉnh.

Game dùng Node, Express và `tiktok-live-connector`, chạy ở cổng 3009. Cách chạy, cách kết nối TikTok, cảnh báo Telegram và giọng Vbee giống các game khác trong thư mục này.

## Chạy

Bấm đúp `start.bat`. Nó mở cửa sổ server, cửa sổ game 9:16 (thêm vào LIVE Studio/OBS bằng Window Capture) và bảng điều khiển `http://127.0.0.1:3009/panel.html`.

- Đổi kênh TikTok: sửa `tiktokUsername` trong `config.json` (đang là `thi.anh.tho732`).
- Chạy thử không kết nối TikTok: `node server.js ""`, rồi vào bảng điều khiển để giả lập comment và quà.
- Tắt tiếng màn hình game: thêm `?mute` vào địa chỉ.
- `.env` có `VBEE_TOKEN`, `VBEE_APP_ID`, `VBEE_VOICE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, chép từ game Cá chép vượt Vũ Môn (giọng nhà báo nam). Muốn giọng khác thì đổi `VBEE_VOICE`.
- Test: `npm test`.

**Trước mỗi buổi live** nên bấm **Vòng mới** ở bảng điều khiển. Người thử trên bảng điều khiển cũng được tính vào cuộc đua. Điểm và danh sách người đã điểm danh được lưu ở `data/race.json`. Lỡ tắt server giữa buổi thì bật lại vẫn còn nguyên.

## Luật chơi

| Người xem làm gì | Điểm cho tỉnh |
|---|---|
| Comment tên tỉnh, ví dụ `Nam Định` | +1. Mỗi người chỉ được tính một lần |
| Hoa hồng | +1 |
| Bắn tim | +5 |
| Heo may mắn | +10 |
| Quà khác | Theo số xu, 1 xu = 1 điểm (`pointsPerCoin`) |
| Thả tim | Không cộng điểm, chỉ có tim bay lên ở tỉnh của người đó |

- **Mỗi người thuộc một tỉnh:** comment tên tỉnh đầu tiên quyết định người đó thuộc tỉnh nào. Comment sau đó, kể cả tên tỉnh khác, không được cộng thêm và không đổi được tỉnh. Bấm **Vòng mới** thì mọi người được chọn lại.
- **Quà cộng cho tỉnh của người gửi.** Ai gửi quà khi chưa comment tên tỉnh thì điểm được giữ lại, màn hình nhắc người đó comment tên tỉnh. Comment lúc nào thì điểm được cộng lúc đó.
- **Chỉ tính tên tỉnh, không tính số.** Comment `18` hay `18 đây` không được tính.
- **Cách viết tên được chấp nhận:** có dấu hay không dấu, viết hoa, viết liền, có kèm chữ khác (`nam dinh`, `NAMDINH`, `Nam Định đây cả nhà ơi`). Nếu comment nhắc nhiều tỉnh thì tính tỉnh được nhắc đầu tiên.
- **Tên gọi khác cũng được tính:** `Sài Gòn`, `HCM`, `TPHCM`, `Huế`, `Vũng Tàu`, `Bà Rịa`, `BRVT`, `Đắc Lắc`, `Bắc Cạn`... Danh sách nằm ở `aliases` trong `src/provinces.js`. Game cố ý không nhận `HN` và `SG`, vì người xem hay viết `hn` với nghĩa "hôm nay".
- **Tên một chữ phải đúng dấu.** Viết `Huế` hoặc `hue` thì được tính; tên người như `Huệ` thì không bị nhầm thành Huế.
- **Bảng xếp hạng:** hiện 10 tỉnh (`boardSize`). Tỉnh bằng điểm thì tỉnh đạt mức điểm đó trước đứng trên. Mỗi dòng có biển số, điểm và số người (👥).
- **Trên bản đồ:** số nhỏ dưới biển số là điểm của tỉnh. Tỉnh càng nhiều điểm thì nền càng đậm. Tỉnh dẫn đầu có viền vàng và vương miện. Khi ngôi đầu đổi chủ thì hiện băng rôn.
- **Phản hồi ngay cho người xem:** tỉnh vừa được cộng sáng lên, tên người xem hiện cạnh tỉnh, có chữ +1. Quà bay từ ô "Cách chơi" tới tỉnh. Cột "vừa tiếp sức" gộp cả combo của cùng một người thành một dòng.

## Giọng MC

MC dùng Vbee. Thiếu khóa thì game vẫn chạy bình thường, chỉ không có tiếng. MC chỉ nói vào những lúc sau:

- **Khi có quà:** cảm ơn kèm tên người gửi và tên tỉnh, ví dụ "Cảm ơn Phương Thảo đã tiếp sức cho Hà Nội!". Một combo chỉ được cảm ơn một lần, sau khi combo dừng 2,5 giây (`thanksSettleMs`). Quà từ 50 điểm trở lên có câu riêng (`bigGiftPoints`). Nếu người gửi chưa chọn tỉnh, MC nhắc họ bình luận tên tỉnh.
- **Khi ngôi đầu đổi chủ.** Hai lần báo cách nhau ít nhất 20 giây (`leadGapSeconds`). Nếu trong lúc chờ ngôi đầu đổi qua lại nhiều lần, MC chỉ báo tỉnh dẫn đầu cuối cùng.
- **Thỉnh thoảng, mỗi 40 đến 75 giây** (`talkEverySeconds`), MC bình luận theo tình hình: tỉnh nào đang dẫn đầu, hai tỉnh đang sát nút, một tỉnh bỏ xa các tỉnh còn lại, một tỉnh vừa vào top 3, hoặc mời mọi người điểm danh. Ngay sau khi vừa nói, MC nghỉ một lúc chứ không nói liên tục.

MC không đọc lại nội dung comment và không xin quà; câu nói dùng từ "tiếp sức". Lời MC cũng hiện thành phụ đề cho người xem đang tắt tiếng. Có cảnh báo từ TikTok thì game tự bật **chế độ an toàn**: MC im, cuộc đua vẫn chạy, chủ kênh tắt lại ở bảng điều khiển.

Sửa lời MC trong `mc.json`. Tên 63 tỉnh và các đoạn lời được tạo một lần (116 mẩu), lưu ở `data/tts`, nên lần sau không tốn lượt Vbee. Lời mới sẽ được tự tạo khi khởi động lại server. Tên người gửi quà được tạo khi cần. Lần đầu Vbee mất khoảng 9 giây cho một tên, nên MC chờ tối đa 15 giây (`nameWaitMs`); quá thời gian đó thì MC cảm ơn mà không đọc tên.

Nút **MC bình luận ngay** trên bảng điều khiển dùng để nghe thử giọng.

## Bản đồ

- Bản đồ dùng 63 tỉnh của giai đoạn trước sáp nhập tháng 7/2025, vì người xem vẫn quen với biển số cũ. Với tỉnh có nhiều đầu biển số, bản đồ in số đầu tiên trong `plates`: Hà Nội 29, TP.HCM 51, Hải Phòng 15, Đồng Nai 60.
- Ranh giới tỉnh lấy từ [geoBoundaries VNM ADM1](https://www.geoboundaries.org) (Public Domain, dựng từ bản đồ Wikimedia Commons). Script ghim theo một commit cố định để kết quả không đổi giữa các lần dựng. Muốn dựng lại `public/map/vietnam.json`, ví dụ khi đổi khung bản đồ trong `scripts/build-map.mjs`, chạy `npm run map`. Lần đầu chạy cần mạng để tải dữ liệu.
- Hai tỉnh kề nhau luôn khít nhau. Script đơn giản hóa từng đoạn ranh giới chung đúng một lần, nên ranh giới không bị hở cũng không chồng lên nhau. Viền màu của mỗi tỉnh nằm phía trong ranh giới của chính tỉnh đó.
- Hoàng Sa được vẽ gần đúng vị trí thật. Trường Sa được thu nhỏ vào ô bên phải cho vừa màn hình dọc. Cả hai đều ghi rõ tỉnh quản lý.

## Chỉnh trong `config.json`

- `commentPoints`: điểm khi comment tên tỉnh.
- `gifts`: các quà có điểm riêng. Game nhận quà theo tên TikTok trong `names`. `points` là số điểm cộng, `icon` là hình hiện trong ô "Cách chơi". Quà không có trong danh sách thì tính theo `pointsPerCoin`.
- `boardSize`: số tỉnh trên bảng xếp hạng, từ 3 đến 12.
- `mapScores`: `false` thì ẩn điểm nhỏ dưới biển số trên bản đồ.
- `voice`: các mốc thời gian của MC đã nói ở trên. `enabled: false` thì tắt hẳn MC.

## Mã nguồn

- `src/provinces.js`: 63 tỉnh (tên, biển số, tên gọi khác) và phần nhận tên tỉnh trong comment.
- `src/race.js`: luật đua, gồm điểm danh, quà, quà giữ chờ, xếp hạng, lưu và nạp lại.
- `src/commentator.js`: MC, quyết định nói gì và nói lúc nào, ghép câu từ các mẩu giọng có sẵn.
- `src/voice.js`, `src/spoken.js`: thư viện mẩu giọng Vbee và phần đổi tên người xem thành chữ đọc được. Hai file này dùng chung với Lớp Học.
- `public/js/map.js`: vẽ bản đồ, viền màu, biển số, Hoàng Sa, Trường Sa.
- `public/js/main.js`: bảng xếp hạng, hiệu ứng, băng rôn, phụ đề MC.
- `scripts/build-map.mjs`: dựng file bản đồ.

Kiểm tra logic: `npm test`.
