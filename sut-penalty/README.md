# Sút Penalty — tặng quà để cầu thủ đội mình sút

Game TikTok LIVE màn dọc 1080×1920. Bốn cầu thủ mặc áo **MU**, **Real**, **Barça**, **PSG** đứng dưới sân, một thủ môn trong khung thành. Người xem comment tên đội để vào đội, mỗi quà tặng đổi ra lượt sút cho cầu thủ đội mình. Thủ môn bắt được **50%** cú sút.

Node + Express + `tiktok-live-connector`, màn hình là trang web mở bằng cửa sổ Edge `--app` để LIVE Studio/OBS bắt hình. Cổng 3017.

## Chạy

Bấm đúp `start.bat`: mở cửa sổ server, cửa sổ game 9:16 và bảng điều khiển `http://127.0.0.1:3017/panel.html`.

- Đổi kênh TikTok: sửa `tiktokUsername` trong `config.json`, rồi chạy lại server.
- Chạy thử không kết nối TikTok: mở `cmd` trong thư mục game rồi chạy `node server.js ""`, sau đó vào bảng điều khiển để giả lập comment và quà.
- Tắt tiếng màn hình game: thêm `?mute` vào địa chỉ.
- Test: `npm test`.

**Trước mỗi buổi live** bấm **Trận mới** và **Xóa hàng chờ** ở bảng điều khiển để bỏ các lượt thử.

## Luật chơi

| Người xem làm gì | Chuyện gì xảy ra |
|---|---|
| Comment `MU`, `Real`, `Barca`, `PSG` (có dấu, không dấu, chữ hoa thường đều được; cả `manu`, `quỷ đỏ`, `real madrid`, `barcelona`, `paris`...) | Vào đội đó. Comment nhắc hai đội cùng lúc (`MU hơn Real`) thì không tính. Comment đội khác là chuyển đội |
| Tặng **Hoa hồng** (1 xu) | 1 lượt sút |
| Tặng **Bánh vòng** (30 xu) | 50 lượt sút |
| Tặng **Hộp quà** (100 xu) | 200 lượt sút |
| Tặng quà khác | 1 lượt sút cho mỗi xu (`otherGiftShotsPerCoin`, đặt 0 để bỏ qua quà khác) |
| Thả **50 tim** | 1 lượt sút. Tim cộng dồn theo từng người, tim lẻ để dành cho lần sau (`likesPerShot`, đặt 0 để tắt) |

- Quà tính theo **giá xu**, nên mọi quà 1 xu đều là 1 lượt, mọi quà 30 xu là 50 lượt...
- Tặng quà hoặc đủ tim khi **chưa chọn đội** thì được xếp vào đội ít fan nhất, màn hình báo tên đội.
- Lượt sút xếp hàng theo từng đội. Các đội **sút xoay vòng** (MU, Real, Barça, PSG, MU...), nên một hộp quà 200 lượt không chặn đội khác. Trong một đội, ai tặng trước sút trước.
- Mỗi cú sút: thủ môn bắt được với tỉ lệ `saveChance` (0.5 = 50%). Bắt được thì thủ môn bay đúng hướng (bóng giữa thì ôm gọn), thủng lưới thì thủ môn bay sai hướng hoặc đứng nhìn.
- **Sút liên hoàn:** hàng chờ càng dài sút càng nhanh, từ 1,6 giây/cú xuống nhanh nhất 0,14 giây/cú. Một hộp quà 200 lượt sút hết trong khoảng 45 giây. Màn hình hiện `⚡ RAPID FIRE · N shots left`.
- Bảng tỉ số: số bàn mỗi đội, vương miện cho đội dẫn đầu (số lần bị thủ môn cản chỉ xem ở bảng điều khiển). Dòng **Top scorers** là 3 người ghi nhiều bàn nhất.
- **Chữ trên màn hình game là tiếng Anh** (tiêu đề, quà, tỉ số, thông báo, `GOAL!` / `SAVED!` / `CAUGHT!`); bảng điều khiển và log server vẫn tiếng Việt. Tiêu đề và dòng hướng dẫn sửa ở `title`, `subtitle` trong `config.json`, các chữ khác trong `public/js/main.js` và `public/js/scene.js`.
- Trên đầu mỗi cầu thủ là tên người đang được sút và số lượt còn lại của đội; cạnh tên đội là số fan.
- Tỉ số, fan và lượt sút chờ được lưu vào `data/state.json`: tắt/bật server không mất lượt người xem đã tặng. **Trận mới** đưa tỉ số về 0 nhưng giữ lượt đã tặng mà chưa sút.

## Ảnh nhân vật chibi

Chưa có ảnh thì game tự vẽ nhân vật bằng hình khối. Muốn dùng ảnh chibi:

1. Làm theo `prompt-nhan-vat.txt`: 5 prompt tạo 5 ảnh (4 cầu thủ, 1 thủ môn), mỗi ảnh 6 động tác, nền xanh lá.
2. Đặt ảnh vào `anh-goc/` với tên `mu.png`, `real.png`, `barca.png`, `psg.png`, `thu-mon.png`.
3. Chạy `npm run cat-anh`: script tách nền, cắt từng động tác thành `public/nhan-vat/<đội>-<động tác>.png` (ví dụ `mu-sut.png`, `thu-mon-bay-trai.png`).
4. Bấm F5 ở cửa sổ game.

Có ảnh của đội nào thì đội đó dùng ảnh, đội khác vẫn vẽ hình khối. Thiếu một động tác thì game dùng ảnh đứng rồi nghiêng/nhấc cho gần giống.

| Ảnh | Động tác (trái sang phải, trên xuống dưới) |
|---|---|
| Cầu thủ | `dung` đứng chờ · `chay` chạy đà · `sut` sút · `mung` ăn mừng · `buon` tiếc nuối · `vay` vẫy tay (khi có người vào đội) |
| Thủ môn | `dung` thủ thành · `bay-trai` · `bay-phai` · `bat` ôm bóng · `mung` ăn mừng cản phá · `thua` ngồi bệt thua bàn |

## Logo đội trên bảng tỉ số

Bỏ file logo vào `public/logo/`, đặt tên theo id đội: `mu.png`, `real.png`, `barca.png`, `psg.png` (nhận `.png`, `.webp`, `.svg`, `.jpg`). Logo hiện mờ phía sau số bàn của ô đội đó; đội nào chưa có file thì ô vẫn như cũ. Thêm hoặc đổi logo xong thì bấm F5 ở cửa sổ game. Nên dùng ảnh nền trong suốt.

Game không kèm sẵn logo câu lạc bộ thật vì đó là nhãn hiệu có bản quyền; dùng trên livestream có thể bị TikTok báo vi phạm, bạn tự cân nhắc.

## Cấu hình (`config.json`)

- `saveChance`: tỉ lệ thủ môn bắt được, 0 đến 1.
- `teams`: id, tên hiện trên màn hình, số áo, các cách gọi (`aliases`, viết không dấu). Màu áo nằm ở `public/js/art.js`.
- `gifts`: giá xu → số lượt sút, tên quà và ảnh hiện ở đầu màn hình.
- `otherGiftShotsPerCoin`: lượt sút mỗi xu cho quà không có trong `gifts`.
- `likesPerShot`: số tim đổi 1 lượt sút (50), đặt 0 để tắt.
- `timing.shotMs`: khoảng cách giữa hai cú sút khi hàng chờ ngắn; `fastestShotMs`: nhanh nhất; `speedupEvery`: hàng chờ dài thêm bấy nhiêu lượt thì nhịp nhanh thêm một bậc.
