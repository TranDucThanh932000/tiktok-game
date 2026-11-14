# Đua Trâu 5 nước (Buffalo Race)

Game đua trâu cho TikTok LIVE màn dọc (1080×1920). Năm con trâu chibi của Thái Lan, Việt Nam, Trung Quốc, Campuchia và Philippines chạy trên 5 làn. Chữ trên màn hình bằng tiếng Anh và để ít nhất có thể. Game dùng Node, Express và `tiktok-live-connector`, chạy ở cổng 3019. Màn hình game là trang web mở trong cửa sổ Edge `--app`, để LIVE Studio hoặc OBS bắt hình.

## Chạy

Bấm đúp `start.bat`. Nó mở cửa sổ server, cửa sổ game 9:16 (thêm vào LIVE Studio/OBS bằng Window Capture) và bảng điều khiển `http://127.0.0.1:3019/panel.html`.

- Đổi kênh TikTok: sửa `tiktokUsername` trong `config.json`, rồi chạy lại server.
- Chạy thử không kết nối TikTok: `node server.js ""`, rồi giả lập comment và quà ở bảng điều khiển.
- Tắt tiếng màn hình game: thêm `?mute` vào địa chỉ.
- Test: `npm test`.

**Trước mỗi buổi live** nên bấm **Xóa số vòng thắng** ở bảng điều khiển. Vòng đang chạy, số vòng thắng và nước người xem đã chọn được lưu ở `data/state.json`. Lỡ tắt server thì bật lại, vòng đua chạy tiếp từ số giây còn lại.

## Luật chơi

| Người xem làm gì | Trâu được cộng |
|---|---|
| Comment tên nước, ví dụ `Vietnam`, `viet nam`, `Thái Lan`, `ไทย`, `Campuchia`, `Pinoy` | +0,1 m cho nước đó, mỗi comment một lần |
| Quà TikTok (1 xu) | +1 m cho **Thái Lan** |
| Hoa hồng / Rose (1 xu) | +1 m cho **Việt Nam** |
| GG (1 xu) | +1 m cho **Trung Quốc** |
| Kem ốc quế / Ice Cream Cone (1 xu) | +1 m cho **Campuchia** |
| Tim cam / Heart Me (1 xu) | +1 m cho **Philippines** |
| Quà khác | +1 m mỗi quà cho nước người đó comment gần nhất. Chưa comment nước nào thì không tính |

Quà combo được tính theo số lượng, ví dụ 10 bông hồng thì +10 m cho Việt Nam.

- **Mỗi vòng 60 giây** (`roundSeconds`). Hết giờ, nước đi xa nhất thắng vòng và được cộng 1 vào bảng 🏆 góc trái. Hai nước bằng mét thì nước đạt mức đó trước thắng. Cả vòng không ai chạy thì không có nước thắng.
- **Công bố 8 giây** (`resultSeconds`): bảng giữa màn hình hiện con trâu thắng nhảy mừng, tên nước, số mét và người tiếp sức nhiều mét nhất cho nước đó. Các trâu thua nằm buồn. Sau đó mọi trâu về vạch xuất phát và vòng mới bắt đầu (hiện chữ GO!).
- **Quà gửi trong lúc công bố hoặc lúc tạm dừng không bị mất.** Số mét được để dành và cộng vào lúc vòng mới bắt đầu (hoặc lúc chạy tiếp).
- **Comment nhắc nhiều nước** thì tính nước được nhắc trước, ví dụ `thailand > vietnam` tính cho Thái Lan. Tên tiếng Anh viết liền phải đứng thành từ riêng: `vn` được tính, `vnd` thì không.
- **Tên được chấp nhận** nằm ở `aliases` của từng nước trong `config.json`, gồm tiếng Anh, tiếng Việt có dấu hoặc không dấu, chữ Thái, chữ Hoa và chữ Khmer. Game cố ý không nhận `viet` (dễ nhầm với "viết") và `phi` (dễ nhầm với "phi" trong tiếng Việt).

## Màn hình

Từ trên xuống: tên game, bảng số vòng thắng (cờ + số) và đồng hồ đếm ngược kèm số vòng. 10 giây cuối đồng hồ chuyển đỏ, đập nhịp và kêu tích tắc. Dải tối bên dưới hiện người vừa tiếp sức: ảnh đại diện, tên, cờ nước, quà và số mét.

5 làn đua có thẻ cờ, tên nước, hạng (#1–#5) bên trái và số mét bên phải. Trâu của nước dẫn đầu có vương miện. Vị trí trâu tính theo tỉ lệ so với nước dẫn đầu, nên nước dẫn đầu luôn ở gần đích, các nước khác đuổi theo. Mặt đường trôi về sau cho cảm giác đang chạy.

- Mỗi comment: trâu tăng tốc một nhịp, hiện `+0.1` trên đầu (tối đa 4 lần mỗi giây mỗi làn để khỏi rối), có tiếng vó.
- Mỗi quà: ô quà dưới cùng nảy lên, hình quà bay lên con trâu, hiện `+1m` to, tên và ảnh người gửi, trâu chạy nhanh tung bụi, có tiếng chuông.
- Bảng dưới cùng: dòng `💬 VIETNAM +0.1m` đổi lần lượt tên các nước để người xem biết gõ gì; 5 ô quà, mỗi ô có cờ, tên nước, hình quà và `+1m`. Màn hình không có chữ xin quà.

## Giọng đọc tên nước

Khi có quà, MC đọc tên nước bằng tiếng Anh: "Thailand!", "Vietnam!", "China!", "Cambodia!", "Philippines!". Giọng là `en-US-AndrewNeural` của Vbee (giọng nam Mỹ), đặt ở `voice.code` trong `config.json`. Tài khoản Vbee hiện dùng được các giọng nam tiếng Anh `en-US-AndrewNeural`, `en-US-BrianNeural`, `en-US-ChristopherNeural`, `en-US-DavisNeural`, `en-US-EricNeural`. Các giọng `en-US-GuyNeural`, `en-US-JennyNeural`, `en-US-AriaNeural`, `en-GB-RyanNeural` thì Vbee báo chưa kích hoạt. Xóa `voice.code` thì game dùng `VBEE_VOICE` trong `.env`.

Khóa Vbee nằm trong `.env` (`VBEE_TOKEN`, `VBEE_APP_ID`, chép từ `dua-tinh`). Phải chạy bằng `start.bat` hoặc `npm start` thì mới đọc `.env`. Thiếu khóa thì game vẫn chạy, chỉ không có giọng. Vbee để hơn 1 giây lặng sau mỗi câu; trang game tự cắt khoảng lặng để đọc các nước nối nhau nhanh.

- 5 câu được tạo một lần lúc bật server, lưu ở `data/tts/`. Lần sau dùng lại ngay, không tốn lượt Vbee.
- Sửa câu đọc ở `say` của từng nước trong `config.json`. Đổi câu hay đổi giọng thì server tự tạo lại câu đó.
- Combo quà không làm giọng dồn: cùng một nước không đọc lại trong 2,5 giây (`voice.repeatGapSeconds`). Nhiều nước có quà cùng lúc thì xếp hàng, tối đa 3 nước (`voice.maxQueue`); hàng đầy thì bỏ nước cũ nhất.
- Quà gửi lúc đang công bố kết quả hay lúc tạm dừng vẫn được đọc tên.
- Tắt giọng: `"voice": { "enabled": false, ... }`. Tắt toàn bộ âm thanh màn hình game: thêm `?mute` vào địa chỉ.
- Chạy thử song song với game đang live: `PORT=3098 DATA_DIR=<thư mục khác> npm start`, để vòng đua thử không ghi đè `data/state.json`.

## Ảnh chibi

3 ảnh gốc tạo theo [PROMPT-CHIBI.md](PROMPT-CHIBI.md) nằm trong `art-src/`. Thay ảnh nào thì chạy lại `npm run cat-anh` rồi bấm F5 ở cửa sổ game. Script làm những việc sau:

- Cắt từng con trâu (35 hình), tách nền. Nền trong suốt hoặc nền xanh #00FF00 đều được.
- Xóa quầng sáng màu mờ ChatGPT hay vẽ quanh hình.
- Ghi các hình vào `public/chibi/`.
- Đo dải đất trong `nen.png` và ghi vào `nen.json`. Game dựa vào đó phóng và dời ảnh nền cho dải đất khớp đúng 5 làn đua, nên ảnh nền mới không cần đúng tỉ lệ trong prompt.

Script báo lỗi bố cục (thiếu hình, hai hình dính nhau) thì chưa ghi file nào. Xóa hết ảnh trong `public/chibi/` thì game quay về vẽ trâu và nền bằng hình khối.

Cờ 5 nước do game vẽ bằng SVG (`public/js/flags.js`), vì Windows không hiện emoji cờ và ảnh AI hay vẽ sai cờ.

## Đổi quà, đổi số mét

Trong `config.json`:

- `commentMeters` (0.1), `giftMeters` (1), `otherGiftMeters` (1): số mét cho mỗi comment, mỗi quà của nước, mỗi quà khác. Đặt `otherGiftMeters` là 0 thì quà khác không được tính. Số mét lẻ tối đa 1 chữ số.
- `nations[].gift`: quà của từng nước. `names` là tên quà TikTok gửi về (tiếng Anh, có thể thêm tên tiếng Việt), `ids` là mã quà nếu muốn chắc chắn hơn, `icon` là hình trong `public/gifts/`. Khi có quà chưa được tính, cửa sổ server in dòng `[Quà chưa tính] ... TênQuà #mã` để bạn chép tên hoặc mã vào đây.
- `roundSeconds`, `resultSeconds`: số giây mỗi vòng và số giây công bố.

Sửa xong thì khởi động lại server.
