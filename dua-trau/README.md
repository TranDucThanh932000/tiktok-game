# Đua Trâu 5 số báo danh

Game đua trâu cho TikTok LIVE màn dọc (1080×1920). Năm con trâu chibi mang số báo danh 1 đến 5 chạy trên 5 làn. Người xem comment số để chọn trâu của mình, rồi thả tim và tặng quà cho trâu chạy. Chữ trên màn hình bằng tiếng Việt và để ít nhất có thể. Game dùng Node, Express và `tiktok-live-connector`, chạy ở cổng 3019. Màn hình game là trang web mở trong cửa sổ Edge `--app`, để LIVE Studio hoặc OBS bắt hình.

## Chạy

Bấm đúp `start.bat`. Nó mở cửa sổ server, cửa sổ game 9:16 (thêm vào LIVE Studio/OBS bằng Window Capture) và bảng điều khiển `http://127.0.0.1:3019/panel.html`.

- Đổi kênh TikTok: sửa `tiktokUsername` trong `config.json`, rồi chạy lại server.
- Chạy thử không kết nối TikTok: `node server.js ""`, rồi giả lập comment, tim và quà ở bảng điều khiển.
- Tắt tiếng màn hình game: thêm `?mute` vào địa chỉ.
- Test: `npm test`.

**Trước mỗi buổi live** nên bấm **Xóa số vòng thắng** ở bảng điều khiển. Nút này cũng xóa bảng vàng cả buổi live. Vòng đang chạy, số vòng thắng, trâu người xem đã chọn và bảng vàng được lưu ở `data/state.json`. Lỡ tắt server thì bật lại, vòng đua chạy tiếp từ số giây còn lại.

## Luật chơi

| Người xem làm gì | Kết quả |
|---|---|
| Comment số báo danh, ví dụ `3`, `số 3`, `trâu 3`, `#3`, `3️⃣` | Chọn trâu số 3 làm trâu của mình. Comment số khác để đổi trâu. Comment **không** cộng mét |
| Thả tim (táp màn hình) trong lúc đang đua | Mỗi người đủ **30 tim** thì trâu của người đó đi **+0,1 m** |
| Quà TikTok (1 xu) | +1 m cho **trâu 1** |
| Hoa hồng / Rose (1 xu) | +1 m cho **trâu 2** |
| GG (1 xu) | +1 m cho **trâu 3** |
| Kem ốc quế / Ice Cream Cone (1 xu) | +1 m cho **trâu 4** |
| Tim cam / Heart Me (1 xu) | +1 m cho **trâu 5** |
| Quà khác | +1 m mỗi quà cho trâu người đó đã chọn. Chưa chọn trâu thì không tính |

Quà combo được tính theo số lượng, ví dụ 10 bông hồng thì +10 m cho trâu 2.

- **Tim tính riêng từng người, trong từng vòng.** Tim của hai người không cộng chung: mỗi người tự dồn đủ 30 tim thì trâu đi 0,1 m (60 tim là 0,2 m...). Sang vòng mới, số tim đang dồn dở về 0. Đổi trâu giữa vòng thì tim đang dồn tính tiếp cho trâu mới.
- **Tim chỉ tính lúc đang đua.** Tim thả lúc công bố kết quả, lúc tạm dừng, hoặc của người chưa comment chọn trâu đều bỏ qua.
- **Comment chọn trâu**: game lấy số báo danh đầu tiên đứng thành từ riêng trong comment. `12` hay `100k` không phải trâu nào, `01` là trâu 1. Chữ dính liền như `so3`, `trau3`, `no3`, `sbd3` cũng được.
- **Mỗi vòng 60 giây** (`roundSeconds`). Hết giờ, trâu đi xa nhất thắng vòng và được cộng 1 vào bảng 🏆 góc trái. Hai trâu bằng mét thì trâu đạt mức đó trước thắng. Cả vòng không trâu nào chạy thì không có trâu thắng.
- **Công bố 12 giây** (`resultSeconds`), bảng giữa màn hình có 2 trang:
  - **6 giây đầu**: con trâu thắng nhảy mừng, số báo danh, số mét, số người cổ vũ trâu đó (`👥 6 NGƯỜI CỔ VŨ`) và **bục vinh danh** 3 người tiếp sức nhiều mét nhất cho trâu thắng trong vòng (tính cả tim và quà): hạng 1 ở giữa, nền vàng.
  - **6 giây sau**: **BẢNG VÀNG BUỔI LIVE**, 5 người tiếp sức nhiều mét nhất từ đầu buổi (cộng dồn mọi vòng, mọi trâu). Chưa ai tiếp sức thì bỏ qua trang này.

  Các trâu thua nằm buồn. Hết giờ công bố, mọi trâu về vạch xuất phát và vòng mới bắt đầu (hiện chữ CHẠY!).
- **Quà gửi trong lúc công bố hoặc lúc tạm dừng không bị mất.** Số mét được để dành và cộng vào lúc vòng mới bắt đầu (hoặc lúc chạy tiếp).

## Màn hình

Từ trên xuống: tên game, bảng số vòng thắng (số báo danh + số vòng) và đồng hồ đếm ngược kèm số vòng. 10 giây cuối đồng hồ chuyển đỏ, đập nhịp và kêu tích tắc. Dải tối bên dưới hiện người vừa tương tác: ảnh đại diện, tên, số trâu, rồi `VÀO ĐỘI!` (vừa chọn hoặc đổi sang trâu này), `✔` (comment lại số trâu đang theo), `❤️ x10` (vừa thả tim), hoặc quà và số mét.

5 làn đua có thẻ đội bên trái và số mét bên phải. Thẻ đội có số báo danh, hạng (#1–#5) và **hàng cổ vũ**: ảnh đại diện 3 người trong đội vừa tương tác gần nhất (chọn trâu, thả tim, tặng quà) và tổng số người đã chọn trâu đó (`👥 12`, nháy lên khi có người mới). Mỗi con trâu cắm biển số báo danh trên lưng, trâu dẫn đầu có vương miện. Vị trí trâu tính theo tỉ lệ so với trâu dẫn đầu, nên trâu dẫn đầu luôn ở gần đích, các trâu khác đuổi theo. Mặt đường trôi về sau cho cảm giác đang chạy.

- Có người mới vào đội: ảnh đại diện của họ bay từ dải tên xuống hàng cổ vũ của làn, trên trâu hiện `Tên VÀO ĐỘI!`, có tiếng "bóc". Nhiều người vào cùng lúc thì mỗi 0,25 giây chỉ diễn một người, nhưng hàng cổ vũ và số người vẫn cập nhật đủ.
- Mỗi lần thả tim: tim bay lên từ con trâu đó. Đủ 30 tim: trâu tăng tốc một nhịp, hiện `+0.1` trên đầu (tối đa 4 lần mỗi giây mỗi làn), có tiếng vó.
- Mỗi quà: ô quà dưới cùng nảy lên, hình quà bay lên con trâu, hiện `+1m` to, tên và ảnh người gửi, trâu chạy nhanh tung bụi, có tiếng chuông.
- Bảng dưới cùng: dòng hướng dẫn đổi qua lại giữa `💬 1 2 3 4 5 CHỌN TRÂU` (comment số để chọn trâu) và `❤️ THẢ 30 TIM +0.1m`; 5 ô quà, mỗi ô có số báo danh, hình quà và `+1m`. Màn hình không có chữ xin quà.

## Giọng đọc số trâu

Khi có quà, MC đọc số trâu bằng tiếng Việt: "Trâu số một!" ... "Trâu số năm!". Giọng lấy từ `VBEE_VOICE` trong `.env` (hiện là `n_hanoi_male_nhabaohoangnam_news_vc`, giọng nam Hà Nội). Muốn game dùng giọng riêng thì thêm `"code": "<mã giọng Vbee>"` vào `voice` trong `config.json`, ví dụ `en-US-AndrewNeural` nếu muốn đọc tiếng Anh.

Khóa Vbee nằm trong `.env` (`VBEE_TOKEN`, `VBEE_APP_ID`, chép từ `dua-tinh`). Phải chạy bằng `start.bat` hoặc `npm start` thì mới đọc `.env`. Thiếu khóa thì game vẫn chạy, chỉ không có giọng. Vbee để hơn 1 giây lặng sau mỗi câu; trang game tự cắt khoảng lặng để đọc các trâu nối nhau nhanh.

- 5 câu được tạo một lần lúc bật server, lưu ở `data/tts/`. Lần sau dùng lại ngay, không tốn lượt Vbee.
- Sửa câu đọc ở `say` của từng trâu trong `config.json`. Đổi câu hay đổi giọng thì server tự tạo lại câu đó.
- Combo quà không làm giọng dồn: cùng một trâu không đọc lại trong 2,5 giây (`voice.repeatGapSeconds`). Nhiều trâu có quà cùng lúc thì xếp hàng, tối đa 3 trâu (`voice.maxQueue`); hàng đầy thì bỏ trâu cũ nhất.
- Quà gửi lúc đang công bố kết quả hay lúc tạm dừng vẫn được đọc số trâu.
- Tắt giọng: `"voice": { "enabled": false, ... }`. Tắt toàn bộ âm thanh màn hình game: thêm `?mute` vào địa chỉ.
- Chạy thử song song với game đang live: `PORT=3098 DATA_DIR=<thư mục khác> npm start`, để vòng đua thử không ghi đè `data/state.json`.

## Ảnh chibi

3 ảnh gốc tạo theo [PROMPT-CHIBI.md](PROMPT-CHIBI.md) nằm trong `art-src/`. Mỗi bộ ảnh vẫn mang tên cũ theo trang phục (`thailand`, `vietnam`, `china`, `cambodia`, `philippines`); trâu nào dùng bộ nào thì đặt ở `sprite` của trâu đó trong `config.json`. Thay ảnh nào thì chạy lại `npm run cat-anh` rồi bấm F5 ở cửa sổ game. Script làm những việc sau:

- Cắt từng con trâu (35 hình), tách nền. Nền trong suốt hoặc nền xanh #00FF00 đều được.
- Xóa quầng sáng màu mờ ChatGPT hay vẽ quanh hình.
- Ghi các hình vào `public/chibi/`.
- Đo dải đất trong `nen.png` và ghi vào `nen.json`. Game dựa vào đó phóng và dời ảnh nền cho dải đất khớp đúng 5 làn đua, nên ảnh nền mới không cần đúng tỉ lệ trong prompt.

Script báo lỗi bố cục (thiếu hình, hai hình dính nhau) thì chưa ghi file nào. Xóa hết ảnh trong `public/chibi/` thì game quay về vẽ trâu và nền bằng hình khối.

Số báo danh (thẻ, biển trên lưng trâu) do game tự vẽ theo `id` và `color` của từng trâu (`public/js/bib.js`).

## Đổi quà, đổi số mét

Trong `config.json`:

- `likesPerStep` (30), `likeMeters` (0.1): mỗi người đủ bao nhiêu tim thì trâu đi bao nhiêu mét.
- `commentMeters` (0): đặt lớn hơn 0 (vd 0.1) thì mỗi comment chọn trâu còn cộng mét như luật cũ.
- `giftMeters` (1), `otherGiftMeters` (1): số mét cho mỗi quà riêng của trâu, mỗi quà khác. Đặt `otherGiftMeters` là 0 thì quà khác không được tính. Số mét lẻ tối đa 1 chữ số.
- `buffaloes[]`: từng con trâu. `id` là số báo danh (người xem comment số này), `name` là tên hiện trên màn hình, `color` là màu áo và màu số, `sprite` là bộ ảnh chibi, `say` là câu MC đọc.
- `buffaloes[].gift`: quà riêng của từng trâu. `names` là tên quà TikTok gửi về (tiếng Anh, có thể thêm tên tiếng Việt), `ids` là mã quà nếu muốn chắc chắn hơn, `icon` là hình trong `public/gifts/`. Khi có quà chưa được tính, cửa sổ server in dòng `[Quà chưa tính] ... TênQuà #mã` để bạn chép tên hoặc mã vào đây.
- `roundSeconds`, `resultSeconds`: số giây mỗi vòng và số giây công bố.

Sửa xong thì khởi động lại server.
