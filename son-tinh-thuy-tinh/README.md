# Sơn Tinh · Thủy Tinh — đoán chữ rước Mị Nương

Game TikTok LIVE màn dọc 1080×1920. Người xem chọn phe Sơn Tinh hoặc Thủy Tinh rồi thi nhau đoán chữ: đoán đúng thì phe kia mất máu. Phe nào thắng 5 hiệp trước rước được Mị Nương. Nhân vật vẽ kiểu chibi, mỗi người tham chiến là một chú lính đứng bên phe mình.

Node + Express + `tiktok-live-connector`, màn hình là trang web mở bằng cửa sổ Edge `--app` để LIVE Studio/OBS bắt hình. Cổng 3012. Cách chạy, cách kết nối TikTok và cảnh báo Telegram giống các game khác trong thư mục này.

## Chạy

Bấm đúp `start.bat`: mở cửa sổ server, cửa sổ game 9:16 và bảng điều khiển `http://127.0.0.1:3012/panel.html`.

- Đổi kênh TikTok: sửa `tiktokUsername` trong `config.json` (đang là `linh.phng2903`), rồi chạy lại server.
- Chạy thử không kết nối TikTok: `node server.js ""`, rồi vào bảng điều khiển để giả lập comment và quà.
- Tắt tiếng màn hình game: thêm `?mute` vào địa chỉ.
- Test: `npm test`.
- `.env` có `TELEGRAM_BOT_TOKEN` và `TELEGRAM_ADMIN_CHAT_ID` (chép từ Lớp Học): TikTok cảnh báo phiên live thì báo qua Telegram. Game không dùng giọng Vbee.

**Trước mỗi buổi live** nên bấm **Trận mới** ở bảng điều khiển, vì người thử cũng được tính vào trận. Trận đang dở được lưu ở `data/battle.json`: lỡ tắt server thì bật lại vẫn còn tỉ số, quân hai phe và quà; hiệp đang dở được đấu lại từ đầu sau 30 giây chọn phe.

## Luật chơi

| Người xem làm gì | Chuyện gì xảy ra |
|---|---|
| Comment `Sơn Tinh`, `ST` hoặc `1` | Vào phe Sơn Tinh, có một chú lính mang tên mình đứng bên núi |
| Comment `Thủy Tinh`, `TT` hoặc `2` | Vào phe Thủy Tinh, có một chú lính đứng bên biển |
| Comment đáp án | Người đoán đúng **đầu tiên** làm phe kia mất 5 máu, cộng thêm quà của phe mình trong hiệp |
| Gửi quà | Phe của quà được trừ thêm máu cho mỗi từ đoán đúng, xem bảng quà bên dưới |

- **Một trận:** 30 giây chọn phe, rồi các hiệp nối nhau. Mỗi hiệp tối đa **3 phút**, mỗi phe **100 máu**. Phe nào hết máu thì thua hiệp ngay. Hết 3 phút thì phe còn nhiều máu hơn thắng, bằng máu thì hòa và không ai được tính.
- **Rước Mị Nương:** phe thắng **5 hiệp** trước rước Mị Nương, màn hình ăn mừng 15 giây, hiện 3 người đoán giỏi nhất trận. Sau đó trận mới bắt đầu: tỉ số về 0, mọi người chọn phe lại.
- **Chọn phe:** comment có dấu hay không dấu, viết hoa, kèm chữ (`phe sơn tinh`, `team thuy tinh`, `11`) đều được. Chọn rồi thì giữ phe tới hết trận. Hết 30 giây mà phe nào chưa có ai thì game chờ; đủ người thì đếm thêm 5 giây rồi vào hiệp.
- **Đoán chữ:** hai phe cùng đoán một từ. Màn hình hiện chủ đề và khoảng 30% chữ cái, cứ 12 giây mở thêm 1 chữ, mở tối đa 70%. 45 giây không ai đoán ra thì lộ đáp án và sang từ khác. Có người đoán đúng thì 3 giây sau ra từ mới.
- **Cách gõ đáp án:** không dấu, viết liền, viết hoa đều được (`ca chep`, `CÁCHÉP`). Kèm `đáp án là`, `là` ở đầu hay `nha`, `nhé`, `ạ`, `rồi` ở cuối cũng được. Bỏ chữ `con`, `quả`, `cái`, `cây` cũng được (`mèo` cho `con mèo`), gọi `trái` thay `quả` cũng được. Câu dài có lẫn đáp án thì không tính, để không ai gõ một lần cả chục đáp án.
- **Chưa chọn phe** thì đoán đúng cũng không được tính. Màn hình nhắc người đó comment tên phe, mỗi người tối đa một lần mỗi phút.
- **Đông người:** mỗi phe hiện tối đa 30 chú lính, người vừa chọn phe, vừa đoán đúng hay vừa gửi quà được đứng; số còn lại hiện thành `+N quân`.

## Quà

| Phe | Quà | Giá | Mỗi từ đoán đúng trừ thêm | ID quà TikTok |
|---|---|---|---|---|
| Sơn Tinh | Hoa hồng (Rose) | 1 xu | +1 máu | 5655 |
| Sơn Tinh | Bắn tim (Finger Heart) | 5 xu | +5 máu | 5487 |
| Sơn Tinh | Heo may mắn (Lucky Pig) | 10 xu | +10 máu | 8825 |
| Thủy Tinh | TikTok | 1 xu | +1 máu | 5269 |
| Thủy Tinh | Bing Chilling (Ice cream) | 5 xu | +5 máu | 7412 |
| Thủy Tinh | Cỏ ba lá (Shamrock) | 10 xu | +10 máu | 9875 |

- **Quà cộng dồn trong hiệp:** ví dụ phe Sơn Tinh có 3 Hoa hồng và 1 Heo may mắn thì mỗi từ Sơn Tinh đoán đúng làm Thủy Tinh mất 5 + 3 + 10 = 18 máu. Combo được tính đủ từng quà.
- **Quà chỉ tính trong hiệp đang đấu.** Hết hiệp thì sức mỗi từ của cả hai phe về lại 5. Quà gửi lúc chọn phe, lúc nghỉ giữa hai hiệp hay lúc ăn mừng thì tính cho hiệp kế tiếp.
- **Quà thuộc phe của quà, không theo người gửi.** Người chưa chọn phe gửi quà thì được vào luôn phe của quà; người đã có phe thì vẫn giữ phe cũ.
- Game nhận quà theo ID, nếu không có ID thì theo tên (`names` trong `config.json`). Quà khác không có tác dụng trong game, chỉ được ghi ở cửa sổ server.
- Tên quà, giá và ID lấy từ danh sách quà TikTok Việt Nam ngày 7/11/2026. Ở đó quà Cỏ ba lá 10 xu có tên "Cỏ bốn lá" (Shamrock). Quà 1 xu "Cỏ bốn lá quý báu" (Treasure Clover, ID 637990) trông giống nhưng **không** được tính; muốn tính thì thêm ID hoặc tên của nó vào mục quà tương ứng.

## Chỉnh trong `config.json`

Sửa xong thì khởi động lại server.

- `tiktokUsername`, `port`, `title`, `subtitle`.
- `hp`: máu mỗi phe. `wordDamage`: máu phe kia mất khi đoán đúng một từ, chưa tính quà. `winsToMarry`: số hiệp phải thắng để rước Mị Nương. `minPlayersPerSide`: số người tối thiểu mỗi phe trước khi vào hiệp.
- `timing`: `lobbySeconds` (chọn phe), `roundSeconds` (tối đa mỗi hiệp), `wordSeconds` (tối đa mỗi từ), `hintEverySeconds` (bao lâu mở thêm một chữ, `0` là không mở thêm), `solvedSeconds` (hiện đáp án bao lâu rồi ra từ mới), `roundEndSeconds` (nghỉ giữa hiệp), `matchEndSeconds` (ăn mừng rước Mị Nương).
- `hints`: `start` là tỉ lệ chữ cái hiện sẵn, `max` là tỉ lệ mở tối đa. Luôn chừa ít nhất một chữ chưa mở.
- `sides`: tên hai phe và các từ khóa chọn phe.
- `gifts`: mỗi quà có `side` (`son` hoặc `thuy`), `bonus` (máu trừ thêm mỗi từ), `label` và `icon` (hiện trên màn hình), `coins` (chỉ để hiện trên bảng điều khiển), `ids` và `names` (để nhận quà).

## Bộ từ

`words.json` có **1000 từ** chia 25 chủ đề (con vật, món ăn, địa danh, truyện cổ tích...), dạng:

```json
{ "Con vật": ["con mèo", "cá chép", "hươu cao cổ"] }
```

Chủ đề hiện trên màn hình làm gợi ý. Mỗi từ có 4 đến 14 chữ cái, tối đa 4 tiếng, chỉ có chữ cái và dấu cách. Hai từ không được trùng nhau khi bỏ dấu (`con dê` và `con dế` là trùng, vì người xem gõ không dấu thì không phân biệt được), cũng không được trùng từ khóa chọn phe. File sai thì server báo rõ từ nào lỗi và không chạy. Hết 1000 từ thì bộ từ được xáo lại từ đầu.

## Bảng điều khiển

- **Người xem giả lập:** chọn phe, đoán đúng (gửi đúng đáp án đang đoán), đoán sai, comment bất kỳ, gửi từng loại quà.
- **Thử đông người:** mỗi phe thêm 10 người, hai phe tranh đoán trong 30 giây, mưa quà.
- **Điều khiển:** sang bước tiếp (đang chọn phe thì vào hiệp ngay, đang nghỉ thì sang hiệp sau), mở thêm 1 chữ, đổi từ khác, kết thúc hiệp ngay (phân thắng thua theo máu), trận mới, gửi thử Telegram.
- Trên cùng là trạng thái kết nối TikTok, kim cương của phiên live, cảnh báo TikTok và tình hình trận đấu.

## Từ ngữ trên màn hình

Giống các game khác, màn hình tránh chữ "máu", "đánh", "tặng quà": thanh của mỗi phe chỉ ghi số, hết máu thì ghi "cạn sức", ô quà ghi "mỗi từ đúng trừ thêm". Sơn Tinh ném đá núi, Thủy Tinh phun nước, không có cảnh máu me.

Hướng dẫn kiếm tiền LIVE của TikTok có thể không cho nhận quà với nội dung chỉ đưa ra hai phe đối đầu rồi kêu gọi người xem tặng quà. Game này lấy đoán chữ làm chính và màn hình chỉ ghi quà có tác dụng gì; khi live nên dẫn dắt phần đoán chữ, tránh nói kiểu "phe nào muốn thắng thì tặng quà".

## Mã nguồn

- `src/battle.js`: luật trận đấu (chọn phe, hiệp, máu, quà, rước Mị Nương, lưu và nạp lại), không dính TikTok hay trình duyệt nên test được bằng đồng hồ giả.
- `src/words.js`: bộ từ, gợi ý chữ cái, nhận đáp án và từ khóa chọn phe.
- `public/js/art.js`: nhân vật chibi Sơn Tinh, Thủy Tinh, Mị Nương và lính hai phe, vẽ bằng SVG.
- `public/js/main.js`: màn hình game. `public/js/audio.js`: tiếng động tổng hợp bằng WebAudio, không cần file.
- `public/panel.html`: bảng điều khiển.
