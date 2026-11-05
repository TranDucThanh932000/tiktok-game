# Hồ Câu Cá 3D (TikTok LIVE)

Game câu cá 3D bằng Three.js cho TikTok LIVE, màn hình dọc 1080×1920.

## Chạy

Bấm đúp `start.bat`. Nó mở 3 thứ: cửa sổ server, cửa sổ game (thêm vào LIVE Studio/OBS dưới dạng Window Capture) và bảng điều khiển `http://127.0.0.1:3006/panel.html`.

Kênh TikTok đặt ở `tiktokUsername` trong `config.json`.

## Luật chơi

| Người xem làm gì | Kết quả |
|---|---|
| Comment **câu** | Rơi từ trên trời xuống, ngồi vào một chỗ trống quanh hồ và thả câu |
| **Câu free**: thả **100 tim**, **follow** hoặc **share** | Giật cá 1 lần (cá tạp 0,3–3 kg). Người chưa ngồi thì tự xuống hồ |
| 1 **Hoa hồng** | Giật luôn, cá nhỏ 1–2 kg |
| 1 **Bắn tim** (5 xu) | Giật luôn, cá vừa 2–5 kg |
| 1 **Heo may mắn** (10 xu) | Giật luôn, cá to 5–10 kg |
| 1 **Hộp quà** | Giật cá mập 100–200 kg |
| 1 **Cỏ ba lá** | Không giật cá. Tăng tỉ lệ câu thành công của người đó lên **80%** trong **3 phút** (`luck`). Người xem chỉ thấy dòng "Tăng tỉ lệ câu thành công", thẻ tên có 🍀 và vòng đỏ quanh cả khung tên ngắn dần theo thời gian còn lại, 20 giây cuối thì nhấp nháy |

- Bảng hướng dẫn hiện ảnh quà và mức cá tương ứng; đặt `display.giftGuide: false` để chỉ giới thiệu các loại cá, không có ảnh quà. Về follow/share, màn hình chỉ có dòng nhỏ "Follow/Share: 1 lần mỗi phút" và lời cảm ơn khi có người follow/share; mỗi lần vẫn được giật 1 lần như cũ. Khi viết thêm chữ lên màn hình hay giọng đọc, tránh các từ như "tặng quà", "đánh", "máu".
- Follow và share tính chung: mỗi người tối đa **1 lần câu free mỗi phút** bằng một trong hai cách (`freePullCooldownSeconds`), để không ai spam follow/unfollow hay share liên tục. Thả tim không bị giới hạn này (đã có `maxLikePullsQueued`).
- Mọi lần giật đều chỉ thành công **60%** (`successRate`), trừ người đang có cỏ ba lá: **80%** (`luck.successRate`). Mỗi cỏ ba lá cộng thêm `luck.seconds` giây (combo 3 cỏ là 9 phút). Lượt giật đã xếp hàng mà chưa tới lượt cũng được tính lại theo tỉ lệ mới. Con số 80% không bao giờ gửi xuống màn hình game, chỉ ghi trong cửa sổ server.
- Mỗi lần giật, camera quay cận người đó đang vật lộn với cá khoảng 2,4 giây (`focusMs`). Khi có nhiều lượt chờ, mỗi lượt rút xuống 1,7 giây (`rushFocusMs`).
- Tặng combo (ví dụ 10 hoa hồng) được gộp thành một lần quay cận và giật 10 con một lúc.
- Bảng xếp hạng tính theo tổng số kg cá câu được; bên cạnh là số lần giật thành công. Màn hình chỉ hiện **5 người** cao điểm nhất (`boardSize`), mỗi lần một người với avatar to, cứ 3 giây trượt từ trái sang phải sang người tiếp theo. Bảng được lưu ở `data/board.json`, bật lại server vẫn còn. Muốn xóa thì bấm **Xóa bảng xếp hạng** trên bảng điều khiển.
- Mỗi lần giật thành công có giọng Vbee chúc mừng, ví dụ "Chúc mừng Lan Anh câu được cá chép nặng 4 ký". Câu được ghép từ các mẩu có sẵn ("Chúc mừng", tên người chơi, "câu được cá chép", "nặng 4 ký") nên đọc ngay lúc cá lên, không phải chờ Vbee. Các mẩu dùng chung được tạo một lần lúc bật server lần đầu (khoảng 1–2 phút) và lưu ở `data/tts`; tên người chơi được tạo lúc họ comment "câu". Chỉnh câu chữ trong mục `voice.text` của `config.json`.
- Hồ có 50 chỗ ngồi (`seats`). Khi hồ kín, người lâu nhất chưa giật cá sẽ nhường chỗ. Ai ngồi **1 phút không giật cá** lần nào (`idleLeaveSeconds`) thì tự ra về; comment hay tim chưa đủ 100 không giữ được chỗ, nhưng tim thả dở vẫn được để dành, thả tiếp đủ 100 là tự xuống hồ lại.

## Cá hiếm

- Cứ mỗi **100 con cá** được giật (tính cả con xổng, mọi loại quà/tim/follow/share), **con thứ 100 là cá hiếm** (cá tầm, cá sủ vàng, cá tra dầu) nặng **50–100 kg**, chỉ dính **30%** (cỏ ba lá không tăng tỉ lệ này). Chỉnh ở mục `rare` (`every`, `successRate`, `focusMs`) và loài cá ở `tiers.rare` trong `config.json`.
- Góc trái phía trên có thanh nhỏ "🌟 Cá hiếm 37/100"; còn 1 con thì đổi thành "Con tiếp theo là CÁ HIẾM!" và nhấp nháy.
- Lượt giật trúng con thứ 100 được quay cận riêng, lâu hơn (5 giây), máy lùi xa như cá mập. Combo quà vượt mốc bị tách: phần trước giật trước, con cá hiếm riêng, phần còn lại giật tiếp ngay sau.
- **Hiệu ứng riêng cho cá hiếm và cá mập** (cá mập quay cận 5 giây, `sharkFocusMs`, kể cả lúc đông lượt chờ): lúc giằng co có viền màn hình đỏ hoặc vàng đập theo nhịp, hai dải đen, chữ lớn "CẮN CÂU!", tiếng tim đập nhanh dần, xoáy nước dưới cá, camera áp sát và rung dần; phần này giống nhau dù cá có dính hay không nên không lộ kết quả. Cá hiếm dính: cột sáng vàng, tia sáng xoay quanh cá, vàng bắn tung, 4 đợt pháo hoa. Cá mập dính: chớp sáng, rung mạnh, 2 đợt cột nước, sóng xung kích. Xổng: màn hình xám lại, chữ "VUỘT MẤT RỒI!". Code ở `public/js/epic.js`.
- Bộ đếm lưu ở `data/rare.json`, bật lại server vẫn đếm tiếp; **Xóa bảng xếp hạng** không xóa bộ đếm. Trên bảng điều khiển, mục **Cá hiếm** có nút cho lượt giật tới ra cá hiếm (để thử) và nút đếm lại từ 0.

## Vòng quay sự kiện

Cứ **2 phút** (`wheel.everySeconds`) vòng quay tự chạy một lần, ô trúng đổi luật cả hồ trong **45 giây** (`eventSeconds`). Báo trước 15 giây (`warnSeconds`), quay 6 giây (`spinSeconds`). Hồ không có ai (`minPlayers`) thì chưa quay. Vòng quay luôn miễn phí, quà và tim không mua được lượt quay.

| Ô | Hiệu ứng | Trọng số |
|---|---|---|
| 🎣 Cá cắn câu | Tỉ lệ dính 75% (`rate`) | 22 |
| ❤️ Mưa tim | 50 tim là giật 1 lần (`likesPerPull`) | 20 |
| ⚖️ Cá béo | Cá nặng gấp đôi (`kgMul`) | 18 |
| ⏱️ Thi câu nhanh | Ai câu nhiều kg nhất trong giờ thi được cộng 50 kg (`sprint.bonusKg`) | 15 |
| ⛈️ Giông bão | Trời chuyển bão (`weather`), tỉ lệ dính 40%, cá nặng gấp 3 | 12 |
| 🌟 Tìm cá hiếm | Mỗi lần giật tính 3 lần vào bộ đếm cá hiếm (`rareStep`) | 8 |
| 🦈 Cá mập vào hồ | Cả hồ cùng kéo, xem bên dưới | 5 |

- Ô càng rộng trên vòng quay thì càng dễ trúng, đúng theo trọng số. Không ô nào ra hai lần liền. Đổi trọng số, câu chữ, thời lượng trong mục `wheel` của `config.json`; đặt `weight` bằng 0 để bỏ một ô.
- **Hiệu ứng tính theo lúc nhận quà/tim**, không phải lúc camera quay tới: quà tặng ở giây cuối đang xếp hàng vẫn được hưởng. Cỏ ba lá vẫn giữ 80% trong mọi sự kiện, nên đáng giá nhất lúc Giông bão. Cá hiếm giữ nguyên 50–100 kg và 30%, không nhân cân nặng.
- Màn hình chỉ hiện câu mô tả, không hiện tỉ lệ thành công.
- **Người quay**: ai tặng nhiều xu nhất kể từ lần quay trước được ghi tên "đang quay". Chỉ để vinh danh, không ảnh hưởng kết quả.
- **Vòng vàng**: cả live thả đủ **3.000 tim** (`goldenLikes`, đặt 0 để tắt) thì lần quay tới là vòng vàng, chỉ gồm các ô có `goldWeight`: Cá béo, Tìm cá hiếm, Cá mập vào hồ. Tim được giữ qua các lần quay thường, quay vòng vàng xong mới đếm lại. Thanh ở giữa phía trên màn hình hiện đếm ngược và số tim.
- **Thi câu nhanh**: chỉ tính các lượt nhận trong giờ thi. Hết giờ thì chờ các lượt đó lộ kết quả (tối đa `closeSeconds` giây) rồi mới trao thưởng.
- **Cá mập vào hồ**: sức cá mập = `hpBase` + `hpPerPlayer` × số người đang ngồi, tối đa `hpMax`. Mỗi lần giật là một nhịp kéo dù cá có dính hay không, trừ sức theo `damage` (tim/follow/share 1, hoa hồng 2, bắn tim 5, heo 10, hộp quà 40). Hết sức thì người góp nhiều điểm nhất được kéo một con cá mập con 50–100 kg (`tiers.boss`), chắc chắn dính, thấp hơn Hộp quà để quà đó không mất giá. Hết giờ chưa kéo được thì cá mập bơi đi mất, không ai được thưởng.
- Trên bảng điều khiển, mục **Vòng quay** có nút quay ngay, quay vòng vàng, thử từng ô và bật/tắt tự quay. Lúc có sự kiện, chọn thời tiết trên bảng điều khiển sẽ thắng thời tiết của sự kiện (tỉ lệ và cân nặng của sự kiện vẫn giữ).
- Giọng đọc của vòng quay nằm ở `voice.wheel` (bật/tắt), `voice.text` và `voice` của từng ô. Lần bật server đầu tiên sau khi có vòng quay sẽ tạo thêm khoảng 70 mẩu giọng Vbee (số ký lớn hơn và các câu mới), mất khoảng 2 phút và chỉ tạo một lần.

## Thời tiết, ngày và đêm

- Hồ có ngày và đêm: mặt trời mọc sau dãy núi bên trái, đi qua dải trời phía trên rồi lặn bên phải; ban đêm có mặt trăng, sao, đèn lồng sáng rực và mặt hồ phát sáng xanh. Mặc định **1 ngày đêm = 24 phút** (`sky.cycleMinutes`, mỗi phút là một giờ trong game). Đặt `sky.realClock: true` để chạy theo giờ thật của máy.
- Thời tiết tự đổi ngẫu nhiên sau mỗi 40–150 giây (`sky.weatherSeconds`): ☀️ nắng, ⛅ nhiều mây, 🌬️ gió lớn, 🌧️ mưa, ⛈️ giông bão (mưa to, sấm chớp). Kiểu nào hay ra hơn thì tăng trọng số trong `sky.weather`; đặt 0 để tắt hẳn kiểu đó.
- Gió giật thất thường, có lúc đổi chiều: cây dừa, cờ dây, lá súng, mây và hạt mưa nghiêng theo gió; gió to thì lá bay ngang qua hồ. Mưa làm mặt hồ nổi gợn tròn và sàn gỗ ướt sẫm màu.
- Có tiếng mưa, gió, sấm; ban ngày chim hót, ban đêm dế kêu. Góc phải phía trên hiện giờ trong game và thời tiết; mỗi lần đổi trời có thông báo nhỏ.
- Trên bảng điều khiển, mục **Thời tiết & giờ** cho chọn thời tiết (bấm 🎲 để quay về tự đổi), nhảy tới bình minh, trưa, hoàng hôn, đêm, hoặc dừng giờ.

## Quà

Quà được nhận ra theo tên trong `gifts[].names` (Rose, Finger Heart, Lucky Pig, Gift Box). Icon các quà là ảnh gốc của TikTok trong `public/gifts`. Cỏ ba lá nhận ra theo `luck.names` (tên TikTok là Treasure Clover); nếu quà cỏ ba lá trên TikTok có tên khác thì phải thêm tên đó vào, không thì nó bị tính như quà lạ theo số xu (thành câu cá nhỏ). Quà khác tên thì tính theo số xu trong `otherGiftsByCoins`. Nếu TikTok đặt tên quà bắn tim hay heo may mắn khác, chỉ cần thêm tên đó vào `names`.

## Khác

- `.env` dùng chung khóa với các game khác: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` (báo cảnh báo TikTok), `VBEE_TOKEN`, `VBEE_APP_ID` (giọng đọc).
- `?mute` sau đường dẫn game để tắt tiếng; `?cam=x,y,z,lookX,lookY,lookZ,fov` để chỉnh góc máy toàn cảnh.
- Kiểm thử logic: `npm test`.
