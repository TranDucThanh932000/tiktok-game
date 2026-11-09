# Đua Top Tỉnh Thành (TikTok LIVE)

Cuộc đua xem tỉnh nào đông người nhất. Màn hình dọc 1080×1920 là bản đồ 3D 63 tỉnh thành, camera nhìn chéo từ phía Nam. Mọi tỉnh cùng một màu đất. Tỉnh càng nhiều điểm thì khối đất của tỉnh càng nhô cao. Trên bản đồ không ghi số cho đỡ rối. Bản đồ có quần đảo Hoàng Sa (Đà Nẵng) và Trường Sa (Khánh Hòa). Bên phải là bảng xếp hạng tỉnh.

Game dùng Node, Express, `tiktok-live-connector` và three.js (vẽ bản đồ 3D), chạy ở cổng 3009. Cách chạy, cách kết nối TikTok, cảnh báo Telegram và giọng Vbee giống các game khác trong thư mục này.

## Chạy

Bấm đúp `start.bat`. Nó mở cửa sổ server, cửa sổ game 9:16 (thêm vào LIVE Studio/OBS bằng Window Capture) và bảng điều khiển `http://127.0.0.1:3009/panel.html`. Lần đầu, hoặc khi máy chưa có thư viện three.js, `start.bat` tự chạy `npm install`.

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
| Hoa hồng, Tim cam (Heart Me) | +1 |
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
- **Trên bản đồ:** tỉnh càng nhiều điểm so với tỉnh dẫn đầu thì khối đất càng cao. Tỉnh dẫn đầu cao nhất, có viền vàng và vương miện. Khi ngôi đầu đổi chủ thì hiện băng rôn.
- **Phản hồi ngay cho người xem:** tỉnh vừa được cộng sáng lên, tên người xem hiện cạnh tỉnh, có chữ +1. Quà bay từ ô "Cách chơi" tới tỉnh. Cột "vừa tiếp sức" gộp cả combo của cùng một người thành một dòng.
- **Camera focus khi có quà:** ai tặng quà thì camera bay tới tỉnh của người đó và nghiêng sâu hơn. Tỉnh đó sáng lên và nhô cao thêm, các tỉnh khác tối đi và tạm hạ thấp để không che. Combo quà làm camera ở lại lâu hơn. Khi MC đọc câu báo tiếp sức, camera quay lại tỉnh đó và giữ ở đó tới khi MC nói xong. Không có quà mới trong 6 giây (`holdSeconds`) thì camera lùi về toàn cảnh, các tỉnh trở lại độ cao theo điểm. Nhiều tỉnh cùng tặng thì mỗi tỉnh được xem ít nhất 2,5 giây (`minDwellSeconds`) rồi mới chuyển sang tỉnh tặng gần nhất.
- **Thẻ người tặng:** trong lúc camera focus, cạnh tỉnh hiện thẻ to gồm ảnh đại diện, tên người tặng, tỉnh được tiếp sức, quà và số điểm. Cùng một người tặng liên tiếp thì điểm trên thẻ cộng dồn. Lúc MC đọc tên ai thì thẻ hiện đúng người đó. Camera lùi về toàn cảnh thì thẻ ẩn. Tắt camera (`camera.enabled: false`) thì không có thẻ, tên người tặng hiện nhỏ trên tỉnh như trước.

## Giọng MC

MC dùng Vbee. Thiếu khóa thì game vẫn chạy bình thường, chỉ không có tiếng. MC chỉ nói vào những lúc sau:

- **Khi có quà:** MC chỉ báo ai vừa tiếp sức cho tỉnh nào, không nói "cảm ơn", ví dụ "Phương Thảo vừa tiếp sức cho Hà Nội!". Một combo chỉ được báo một lần, sau khi combo dừng 2,5 giây (`thanksSettleMs`). Quà từ 50 điểm trở lên có câu riêng (`bigGiftPoints`). Nếu người gửi chưa chọn tỉnh, MC nhắc họ bình luận tên tỉnh.
- **Khi ngôi đầu đổi chủ.** Hai lần báo cách nhau ít nhất 20 giây (`leadGapSeconds`). Nếu trong lúc chờ ngôi đầu đổi qua lại nhiều lần, MC chỉ báo tỉnh dẫn đầu cuối cùng.
- **Thỉnh thoảng, mỗi 40 đến 75 giây** (`talkEverySeconds`), MC bình luận theo tình hình: tỉnh nào đang dẫn đầu, hai tỉnh đang sát nút, một tỉnh bỏ xa các tỉnh còn lại, một tỉnh vừa vào top 3, hoặc mời mọi người điểm danh. Ngay sau khi vừa nói, MC nghỉ một lúc chứ không nói liên tục.

MC không đọc lại nội dung comment và không xin quà; câu nói dùng từ "tiếp sức". Lời MC cũng hiện thành phụ đề cho người xem đang tắt tiếng. Có cảnh báo từ TikTok thì game tự bật **chế độ an toàn**: MC im, cuộc đua vẫn chạy, chủ kênh tắt lại ở bảng điều khiển.

Sửa lời MC trong `mc.json`. Để giọng đọc trôi chảy, mỗi câu được Vbee đọc liền cả câu, kể cả tên tỉnh: câu có `{province}` được tạo sẵn đủ 63 bản, ví dụ "Bạn vừa tiếp sức cho Hà Nội!", "Bạn vừa tiếp sức cho Nam Định!"... Chỉ tên người gửi quà là mẩu riêng, tạo khi cần. Vì vậy khi viết lời mới:

- Đặt `{name}` ở đầu câu hoặc ngay sau dấu câu, ví dụ `{name} vừa tiếp sức cho {province}!` hoặc `Quá đỉnh! {name} ...`. Đừng để tên nằm giữa hai cụm từ, vì chỗ nối sẽ nghe không liền.
- Câu có hai tỉnh thì đặt mỗi tỉnh trong một vế riêng, có dấu câu ngăn cách, ví dụ `{province} vươn lên dẫn đầu! {province2} bị vượt mặt rồi!`. Mỗi vế chỉ cần 63 bản, thay vì 63 × 62 bản.

Toàn bộ khoảng 2.000 mẩu được tạo một lần, lưu ở `data/tts`, nên lần sau không tốn lượt Vbee. Lần đầu mất khoảng một giờ. Câu báo tiếp sức được tạo trước. Trong lúc chờ, MC tạm ghép câu từ mẩu nhỏ (cụm lời + tên tỉnh), nên vẫn nói được, chỉ kém liền mạch hơn. Sau mỗi 100 mẩu, cửa sổ server báo tiến độ. Lời mới sẽ được tự tạo khi khởi động lại server. Lần đầu Vbee mất khoảng 9 giây cho một tên người, nên MC chờ tối đa 15 giây (`nameWaitMs`); quá thời gian đó thì MC đọc câu không có tên, ví dụ "Hà Nội vừa được tiếp sức!".

Nút **MC bình luận ngay** trên bảng điều khiển dùng để nghe thử giọng.

## Bản đồ

- Bản đồ dùng 63 tỉnh của giai đoạn trước sáp nhập tháng 7/2025, vì người xem vẫn quen với tên và biển số cũ. Biển số chỉ còn hiện ở bảng xếp hạng. Với tỉnh có nhiều đầu biển số, bảng in số đầu tiên trong `plates`: Hà Nội 29, TP.HCM 51, Hải Phòng 15, Đồng Nai 60.
- Ranh giới tỉnh lấy từ [geoBoundaries VNM ADM1](https://www.geoboundaries.org) (Public Domain, dựng từ bản đồ Wikimedia Commons). Script ghim theo một commit cố định để kết quả không đổi giữa các lần dựng. Muốn dựng lại `public/map/vietnam.json`, ví dụ khi đổi khung bản đồ trong `scripts/build-map.mjs`, chạy `npm run map`. Lần đầu chạy cần mạng để tải dữ liệu.
- Hai tỉnh kề nhau luôn khít nhau. Script đơn giản hóa từng đoạn ranh giới chung đúng một lần, nên ranh giới không bị hở cũng không chồng lên nhau. Mỗi tỉnh là một khối đất dựng từ ranh giới đó, có đường trắng chạy quanh mặt trên.
- Góc nhìn toàn cảnh được tính để mép Bắc, mép Nam đất liền nằm đúng chỗ như bản đồ phẳng trước đây, nên bản đồ không đè lên bảng xếp hạng. Độ nghiêng, độ cao tối đa, màu đất chỉnh ở đầu file `public/js/map.js` (`TILT`, `MAX_H`, `LAND`...).
- Hoàng Sa được vẽ gần đúng vị trí thật. Trường Sa được thu nhỏ vào ô bên phải cho vừa màn hình dọc. Cả hai đều ghi rõ tỉnh quản lý.
- Bản đồ chỉ vẽ lại khi có thay đổi (điểm, camera bay, hiệu ứng), lúc đứng yên không tốn card đồ họa.

## Chỉnh trong `config.json`

- `commentPoints`: điểm khi comment tên tỉnh.
- `gifts`: các quà có điểm riêng. Game nhận quà theo tên TikTok trong `names`. `points` là số điểm cộng, `icon` là hình hiện trong ô "Cách chơi". Quà không có trong danh sách thì tính theo `pointsPerCoin`.
- `boardSize`: số tỉnh trên bảng xếp hạng, từ 3 đến 12.
- `camera`: `enabled: false` thì tắt camera focus. `onComment: true` thì camera cũng tới tỉnh của người vừa comment, nhưng chỉ khi đang không focus tỉnh nào. `holdSeconds` và `minDwellSeconds` là các mốc thời gian đã nói ở trên. `maxZoom` là mức zoom tối đa cho tỉnh nhỏ.
- `voice`: các mốc thời gian của MC đã nói ở trên. `enabled: false` thì tắt hẳn MC.

## Mã nguồn

- `src/provinces.js`: 63 tỉnh (tên, biển số, tên gọi khác) và phần nhận tên tỉnh trong comment.
- `src/race.js`: luật đua, gồm điểm danh, quà, quà giữ chờ, xếp hạng, lưu và nạp lại.
- `src/commentator.js`: MC, quyết định nói gì và nói lúc nào, ghép câu từ các mẩu giọng có sẵn.
- `src/voice.js`, `src/spoken.js`: thư viện mẩu giọng Vbee và phần đổi tên người xem thành chữ đọc được. Hai file này dùng chung với Lớp Học.
- `public/js/map.js`: bản đồ 3D bằng three.js: khối đất từng tỉnh, độ cao theo điểm, ánh sáng, bóng đổ, Hoàng Sa, Trường Sa, vương miện tỉnh dẫn đầu, camera bay tới tỉnh và làm sáng tỉnh khi focus.
- `public/js/camera.js`: quyết định khi nào focus tỉnh nào: bay tới tỉnh có quà, giữ khi có combo và khi MC đọc câu báo tiếp sức, rồi lùi về toàn cảnh.
- `public/js/main.js`: bảng xếp hạng, hiệu ứng, thẻ người tặng, băng rôn, phụ đề MC.
- `scripts/build-map.mjs`: dựng file bản đồ.

Kiểm tra logic: `npm test`.
