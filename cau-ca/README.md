# Hồ Câu Cá 3D (TikTok LIVE)

Game câu cá 3D bằng Three.js cho TikTok LIVE, màn hình dọc 1080×1920. Khung cảnh là hồ câu dịch vụ kiểu Việt, dựng theo bản vẽ `vietnam_service_fishing_pond_layout.png`.

## Khung cảnh

- **Ao chữ nhật** bờ xi măng, nước xanh rêu, ánh theo màu trời. Bên phải có đường bê tông chạy từ cổng vào lên hết khu hồ.
- **20 chòi đánh số**: 1–8 bờ trên, 9–16 bờ dưới, 17–20 bờ trái, đúng thứ tự trên bản vẽ. Mái lá dừa, cứ 3 chòi có một mái tôn, cột tre, sàn gỗ chìa ra mép nước. Mỗi chòi có ghế nhựa hoặc ghế xếp, thùng đá, xô, vợt và gói cám. Số chòi sơn to trên biển gỗ, **chòi 8 và 9 là số đẹp** nên sơn đỏ chữ vàng. Người chơi nào cũng có số chòi ở đầu thẻ tên.
- **2 quạt nước** chạy liên tục, bánh guồng quay, bọt trắng và sóng tròn loang về phía nam. Cá hay tụ quanh quạt.
- **Quán võng**: 3 võng đong đưa (2 võng có người nằm), quầy cà phê đá, trà đá, mì gói, dây bóng vàng buổi tối.
- **Bàn cân và loa**: mỗi lần lên cá, màn số trên cân hiện số ký, bảng trắng ghi 4 chòi nhiều ký nhất, loa toả sóng, dòng thông báo ghi kiểu "📢 Chòi số 7 lên cá 3 ký 2". Bảng trắng chỉ tính từ lúc mở trang và xoá dòng khi người đó rời chòi (bảng xếp hạng chính vẫn lưu ở server).
- **Bãi xe máy**, hàng dừa, hàng rào, ruộng lúa, xóm nhà, rặng cây và núi thấp phía xa, 3 con chó nằm dưới gốc dừa.
- **Không khí**: từ 15 giờ trời đã ngả vàng cho chiều tà ở lâu trên màn hình. Tối bật đèn tuýp dọc bờ, vệt đèn hắt xuống nước, đầu phao đài phát sáng.
- **Nhạc bolero** phát qua loa: bài do code tự chơi, giai điệu viết riêng cho game, không lấy từ bài hát nào. Chỉnh ở `display.music` trong `config.json`: `on` bật/tắt, `volume` từ 0 đến 2.
- Vị trí mọi thứ khai báo ở đầu `public/js/world.js` bằng toạ độ pixel của bản vẽ (`P(px, py)`) và bảng `HUTS` (các chòi), đổi layout thì sửa ở đó. Muốn xem lại hồ trong hang đá trước đây thì lấy từ git, commit `1131e18`.

## Chạy

Bấm đúp `start.bat`. Nó mở 3 thứ: cửa sổ server, cửa sổ game (thêm vào LIVE Studio/OBS dưới dạng Window Capture) và bảng điều khiển `http://127.0.0.1:3006/panel.html`.

Kênh TikTok đặt ở `tiktokUsername` trong `config.json`.

## Luật chơi

| Người xem làm gì | Kết quả |
|---|---|
| Comment **câu** | Rơi từ trên trời xuống, vào một chòi trống và thả câu |
| **Câu free**: thả **50 tim**, **follow** hoặc **share** | Giật cá 1 lần (cá tạp 0,3–3 kg). Người chưa ngồi thì tự xuống hồ |
| 1 **Hoa hồng** | Giật luôn, cá nhỏ 1–2 kg |
| 1 **Bắn tim** (5 xu) | Giật luôn, cá vừa 2–5 kg |
| 1 **Heo may mắn** (10 xu) | Giật luôn, cá to 5–10 kg |
| 1 **Hộp quà** | Giật cá mập 100–200 kg |
| 1 **Cỏ ba lá** | Không giật cá. **Đổi cần câu** sang một loại ngẫu nhiên (xem mục Trang bị Cần Thủ) |
| 1 **Bánh vòng** (30 xu) | Không giật cá. **Đổi móc câu** sang một loại ngẫu nhiên (xem mục Trang bị Cần Thủ) |
| Friendship Necklace, Perfume, Little Crown, Paper Crane, Corgi | Không giật cá. Nhận đạo cụ (xem mục Trang bị Cần Thủ) |

- Bảng hướng dẫn hiện ảnh quà và mức cá tương ứng; đặt `display.giftGuide: false` để chỉ giới thiệu các loại cá, không có ảnh quà. Về follow/share, màn hình chỉ có dòng nhỏ "Follow/Share: 1 lần mỗi phút" và lời cảm ơn khi có người follow/share; mỗi lần vẫn được giật 1 lần như cũ. Khi viết thêm chữ lên màn hình hay giọng đọc, tránh các từ như "tặng quà", "đánh", "máu".
- Follow và share tính chung: mỗi người tối đa **1 lần câu free mỗi phút** bằng một trong hai cách (`freePullCooldownSeconds`), để không ai spam follow/unfollow hay share liên tục. Thả tim không bị giới hạn này (đã có `maxLikePullsQueued`).
- Mọi lần giật đều thành công **60%** (`successRate`), cộng thêm phần trang bị đang có (xem mục Trang bị Cần Thủ).
- Mỗi lần giật, camera quay cận người đó đang vật lộn với cá khoảng 2,4 giây (`focusMs`). Khi có nhiều lượt chờ, mỗi lượt rút xuống 1,7 giây (`rushFocusMs`).
- Tặng combo (ví dụ 10 hoa hồng) được gộp thành một lần quay cận và giật 10 con một lúc.
- Bảng xếp hạng tính theo tổng số kg cá câu được; bên cạnh là số lần giật thành công. Màn hình chỉ hiện **5 người** cao điểm nhất (`boardSize`), mỗi lần một người với avatar to, cứ 3 giây trượt từ trái sang phải sang người tiếp theo. Bảng được lưu ở `data/board.json`, bật lại server vẫn còn. Muốn xóa thì bấm **Xóa bảng xếp hạng** trên bảng điều khiển.
- Mỗi lần giật thành công có giọng Vbee chúc mừng, ví dụ "Chúc mừng Lan Anh câu được cá chép nặng 4 ký". Khoảng 40% số lần (`voice.hutChance`, đặt 0 để tắt) loa đọc thêm số chòi ở đầu câu, ví dụ "Chòi số 7". Lần bật server đầu tiên sau khi có tính năng này sẽ tạo thêm 20 mẩu giọng Vbee. Câu được ghép từ các mẩu có sẵn ("Chúc mừng", tên người chơi, "câu được cá chép", "nặng 4 ký") nên đọc ngay lúc cá lên, không phải chờ Vbee. Các mẩu dùng chung được tạo một lần lúc bật server lần đầu (khoảng 1–2 phút) và lưu ở `data/tts`; tên người chơi được tạo lúc họ comment "câu". Chỉnh câu chữ trong mục `voice.text` của `config.json`.
- Hồ có 20 chòi (`seats`, tối đa 20 vì khu hồ chỉ dựng từng ấy chòi). Hết chòi thì người lâu nhất chưa giật cá sẽ nhường chỗ. Ai ngồi **1 phút không giật cá** lần nào (`idleLeaveSeconds`) thì tự ra về; comment hay tim chưa đủ 50 không giữ được chỗ, nhưng tim thả dở vẫn được để dành, thả tiếp đủ 50 là tự xuống hồ lại.

## Trang bị Cần Thủ

Bảng nằm dưới bảng xếp hạng, danh sách tự cuộn lặp liên tục, xếp theo giá quà từ thấp đến cao (thứ tự tự tính theo `coins` trong `config.json`). Mỗi dòng dừng trong tầm mắt khoảng 3 giây.

### Đạo cụ (`props`)

| Quà | Giá | Đạo cụ | Tác dụng |
|---|---|---|---|
| Friendship Necklace | 10 xu | Lưới cá | Lần giật tới kèm thêm 1 con cá vừa, chắc chắn dính (`net.tier`). Combo cộng số lần dùng |
| Perfume | 20 xu | Mồi câu | 5 con cá tiếp theo nặng gấp 1,5 (`bait.pulls`, `bait.kgMul`). Không áp dụng cho cá mập, cá hiếm. Combo cộng lượt |
| Little Crown | 99 xu | Ghế VIP | 10 phút không bị mời về vì ngồi im, không bị người mới đẩy ra (`vip.seconds`). Có viền vàng quanh bệ |
| Paper Crane | 99 xu | Bùa cá hiếm | Mỗi lần giật tính 2 lần vào bộ đếm cá hiếm (`charm.rareStep`). Tới đúng con cá hiếm thì tỉ lệ dính +30% rồi hết bùa (`charm.bonus`) |
| Corgi | 299 xu | Rái cá | Rái cá ngồi cạnh 10 phút, cứ 20 giây tha về 1 con cá vừa, cộng thẳng vào bảng (`otter`). Cũng giữ chỗ như Ghế VIP, không tính vào bộ đếm cá hiếm |
| (top 1 tự có) | | Hào quang Vua Câu | Vương miện, hào quang và viền tên vàng cho người đứng đầu bảng xếp hạng. Chỉ để vinh danh |

- Thẻ tên có biểu tượng đạo cụ đang có. Hệ số và tỉ lệ không gửi xuống màn hình game.
- Đạo cụ theo lượt giữ tới khi dùng hết hoặc tắt server. Đạo cụ theo giờ vẫn đếm giờ cả khi người đó không ngồi hồ, rái cá chỉ tha cá lúc chủ đang ngồi. Bấm dọn hồ trên bảng điều khiển sẽ xoá hết.
- Đổi quà hay giá thì sửa `names`, `icon`, `coins` trong `config.json`. Quà trong `props` không còn tính theo số xu như quà lạ nữa.

### Cần câu và móc câu (`gear`)

Tặng quà để đổi trang bị, mỗi lần ra ngẫu nhiên một món, luôn khác món đang dùng.

| Quà | Đổi gì | Các loại (`gear.rod.items`, `gear.hook.items`) |
|---|---|---|
| Cỏ ba lá | Cần câu | Tre Già, Trúc Xanh, Than Đen, Bạc, Vàng, Hồng Ngọc, Pha Lê, Long Vương |
| Bánh vòng | Móc câu | Sắt, Đồng, Bạc, Vàng, Ngọc Bích, Băng, Thạch Anh, Lửa |

- **Tăng tỉ lệ:** có cần câu thì cộng **5%**, có móc câu cộng thêm **5%** (`gear.bonus`), đủ cả hai là 60% + 10% = **70%**. Đổi tiếp chỉ đổi kiểu dáng, không cộng dồn. Mọi loại cộng như nhau. Trang bị cộng vào cả tỉ lệ của sự kiện (Giông bão 40% thành 50%), không áp dụng cho cá hiếm.
- **Không lộ con số:** `gear.bonus` không gửi xuống màn hình game, người xem chỉ thấy dòng "Tăng tỉ lệ câu thành công". Cửa sổ server mới ghi con số.
- **Nhìn thấy trên màn hình:** cần câu đổi màu (loại xịn có đầu cần phát sáng), phao mang màu của móc, móc hiện ở miệng cá lúc giật lên. Thẻ tên có dấu 🎣; lúc quay cận thì hiện tên món đang dùng.
- Combo chỉ đổi một lần. Lượt giật đã xếp hàng được tính lại khi có thêm món mới.
- Trang bị giữ tới khi tắt server, kể cả khi người đó rời hồ rồi quay lại. Bấm dọn hồ trên bảng điều khiển cũng xoá trang bị.
- Bảng này đi cùng `display.giftGuide` vì có ảnh quà; đặt `false` thì bảng ẩn đi, quà và đạo cụ vẫn hoạt động.

## Cá hiếm

- Cứ mỗi **100 con cá** được giật (tính cả con xổng, mọi loại quà/tim/follow/share), **con thứ 100 là cá hiếm** (cá tầm, cá sủ vàng, cá tra dầu) nặng **50–100 kg**, chỉ dính **30%** (trang bị không tăng tỉ lệ này). Chỉnh ở mục `rare` (`every`, `successRate`, `focusMs`) và loài cá ở `tiers.rare` trong `config.json`.
- Góc trái phía trên có thanh nhỏ "🌟 Cá hiếm 37/100"; còn 1 con thì đổi thành "Con tiếp theo là CÁ HIẾM!" và nhấp nháy.
- Lượt giật trúng con thứ 100 được quay cận riêng, lâu hơn (5 giây), máy lùi xa như cá mập. Combo quà vượt mốc bị tách: phần trước giật trước, con cá hiếm riêng, phần còn lại giật tiếp ngay sau.
- **Hiệu ứng riêng cho cá hiếm và cá mập** (cá mập quay cận 5 giây, `sharkFocusMs`, kể cả lúc đông lượt chờ): lúc giằng co có viền màn hình đỏ hoặc vàng đập theo nhịp, hai dải đen, chữ lớn "CẮN CÂU!", tiếng tim đập nhanh dần, xoáy nước dưới cá, camera áp sát và rung dần; phần này giống nhau dù cá có dính hay không nên không lộ kết quả. Cá hiếm dính: cột sáng vàng, tia sáng xoay quanh cá, vàng bắn tung, 4 đợt pháo hoa. Cá mập dính: chớp sáng, rung mạnh, 2 đợt cột nước, sóng xung kích. Xổng: màn hình xám lại, chữ "VUỘT MẤT RỒI!". Code ở `public/js/epic.js`.
- Bộ đếm lưu ở `data/rare.json`, bật lại server vẫn đếm tiếp; **Xóa bảng xếp hạng** không xóa bộ đếm. Trên bảng điều khiển, mục **Cá hiếm** có nút cho lượt giật tới ra cá hiếm (để thử) và nút đếm lại từ 0.

## Vòng quay sự kiện

Cứ **2 phút** (`wheel.everySeconds`) vòng quay tự chạy một lần, ô trúng đổi luật cả hồ trong **45 giây** (`eventSeconds`). Báo trước 15 giây (`warnSeconds`), quay 6 giây (`spinSeconds`). Hồ không có ai (`minPlayers`) thì chưa quay. Vòng quay luôn miễn phí, quà và tim không mua được lượt quay.

| Ô | Hiệu ứng | Trọng số |
|---|---|---|
| 🎣 Cá cắn câu | Tỉ lệ dính 75% (`rate`) | 22 |
| ❤️ Mưa tim | 30 tim là giật 1 lần (`likesPerPull`) | 20 |
| ⚖️ Cá béo | Cá nặng gấp đôi (`kgMul`) | 18 |
| ⏱️ Thi câu nhanh | Ai câu nhiều kg nhất trong giờ thi được cộng 50 kg (`sprint.bonusKg`) | 15 |
| ⛈️ Giông bão | Trời chuyển bão (`weather`), tỉ lệ dính 40%, cá nặng gấp 3 | 12 |
| 🌟 Tìm cá hiếm | Mỗi lần giật tính 3 lần vào bộ đếm cá hiếm (`rareStep`) | 8 |
| 🦈 Cá mập vào hồ | Cả hồ cùng kéo, xem bên dưới | 5 |

- Ô càng rộng trên vòng quay thì càng dễ trúng, đúng theo trọng số. Không ô nào ra hai lần liền. Đổi trọng số, câu chữ, thời lượng trong mục `wheel` của `config.json`; đặt `weight` bằng 0 để bỏ một ô.
- **Hiệu ứng tính theo lúc nhận quà/tim**, không phải lúc camera quay tới: quà tặng ở giây cuối đang xếp hàng vẫn được hưởng. Cá hiếm giữ nguyên 50–100 kg và 30%, không nhân cân nặng.
- Màn hình chỉ hiện câu mô tả, không hiện tỉ lệ thành công.
- **Người quay**: ai tặng nhiều xu nhất kể từ lần quay trước được ghi tên "đang quay". Chỉ để vinh danh, không ảnh hưởng kết quả.
- **Vòng vàng**: cả live thả đủ **3.000 tim** (`goldenLikes`, đặt 0 để tắt) thì lần quay tới là vòng vàng, chỉ gồm các ô có `goldWeight`: Cá béo, Tìm cá hiếm, Cá mập vào hồ. Tim được giữ qua các lần quay thường, quay vòng vàng xong mới đếm lại. Thanh ở giữa phía trên màn hình hiện đếm ngược và số tim.
- **Thi câu nhanh**: chỉ tính các lượt nhận trong giờ thi. Hết giờ thì chờ các lượt đó lộ kết quả (tối đa `closeSeconds` giây) rồi mới trao thưởng.
- **Cá mập vào hồ**: sức cá mập = `hpBase` + `hpPerPlayer` × số người đang ngồi, tối đa `hpMax`. Mỗi lần giật là một nhịp kéo dù cá có dính hay không, trừ sức theo `damage` (tim/follow/share 1, hoa hồng 2, bắn tim 5, heo 10, hộp quà 40). Hết sức thì người góp nhiều điểm nhất được kéo một con cá mập con 50–100 kg (`tiers.boss`), chắc chắn dính, thấp hơn Hộp quà để quà đó không mất giá. Hết giờ chưa kéo được thì cá mập bơi đi mất, không ai được thưởng.
- Trên bảng điều khiển, mục **Vòng quay** có nút quay ngay, quay vòng vàng, thử từng ô và bật/tắt tự quay. Lúc có sự kiện, chọn thời tiết trên bảng điều khiển sẽ thắng thời tiết của sự kiện (tỉ lệ và cân nặng của sự kiện vẫn giữ).
- Giọng đọc của vòng quay nằm ở `voice.wheel` (bật/tắt), `voice.text` và `voice` của từng ô. Lần bật server đầu tiên sau khi có vòng quay sẽ tạo thêm khoảng 70 mẩu giọng Vbee (số ký lớn hơn và các câu mới), mất khoảng 2 phút và chỉ tạo một lần.

## Thời tiết, ngày và đêm

- **Ngày** trời xanh, nắng trắng. **Chiều tà** (từ 15 giờ) nắng vàng, mặt trời lặn phía bên phải màn hình. **Đêm** có trăng sao, đèn tuýp dọc bờ tự bật, đầu phao sáng. Mặc định **1 ngày đêm = 24 phút** (`sky.cycleMinutes`, mỗi phút là một giờ trong game). Đặt `sky.realClock: true` để chạy theo giờ thật của máy.
- Thời tiết tự đổi ngẫu nhiên sau mỗi 40–150 giây (`sky.weatherSeconds`): ☀️ nắng đẹp (`clear`), ⛅ nhiều mây (`cloudy`), 🌬️ gió to (`windy`), 🌧️ mưa (`rain`), ⛈️ giông bão (`storm`, trời tối sầm nên đèn cũng bật, chớp và sấm). Kiểu nào hay ra hơn thì tăng trọng số trong `sky.weather`; đặt 0 để tắt hẳn kiểu đó.
- Gió giật thất thường, có lúc đổi chiều: tàu dừa, võng, mây, mưa và lá bay theo gió. Mưa làm mặt ao nổi gợn tròn.
- Có tiếng máy quạt nước, dế kêu ban đêm, mưa, gió, sấm. Góc phải phía trên hiện giờ trong game và thời tiết; mỗi lần đổi có thông báo nhỏ.
- Trên bảng điều khiển, mục **Thời tiết & giờ** cho chọn thời tiết (bấm 🎲 để quay về tự đổi), nhảy tới bình minh, trưa, hoàng hôn, đêm, hoặc dừng giờ.

## Quà

Quà được nhận ra theo tên trong `gifts[].names` (Rose, Finger Heart, Lucky Pig, Gift Box). Icon các quà là ảnh gốc của TikTok trong `public/gifts`. Cỏ ba lá nhận ra theo `gear.rod.names` (tên TikTok là Treasure Clover), bánh vòng theo `gear.hook.names` (tên TikTok là Doughnut); nếu quà trên TikTok có tên khác thì phải thêm tên đó vào, không thì nó bị tính như quà lạ theo số xu (thành câu cá nhỏ). Quà khác tên thì tính theo số xu trong `otherGiftsByCoins`. Nếu TikTok đặt tên quà bắn tim hay heo may mắn khác, chỉ cần thêm tên đó vào `names`.

## Khác

- `.env` dùng chung khóa với các game khác: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` (báo cảnh báo TikTok), `VBEE_TOKEN`, `VBEE_APP_ID` (giọng đọc).
- `?mute` sau đường dẫn game để tắt tiếng; `?cam=x,y,z,lookX,lookY,lookZ,fov` để chỉnh góc máy toàn cảnh.
- Kiểm thử logic: `npm test`.
