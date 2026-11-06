# Ghi Sớ (TikTok LIVE)

Ông đồ ngồi bên bàn nhỏ, cầm bút lông ghi vào "Sổ Cầu An" cho người xem. Màn hình dọc 1080×1920. Toàn bộ hình vẽ và âm thanh đều bằng code, chỉ dùng thêm các font Playfair Display, Be Vietnam Pro, Dancing Script và 3 ảnh quà.

## Luật chơi

| Người xem làm gì | Trên tờ sớ |
|---|---|
| 100 tim | Ghi tên |
| 1 xu | Ghi tên + vẽ ảnh |
| 5 xu | Tên + ảnh + lời chúc an lành, ông đồ vái một lần, mưa cánh hoa |
| 10 xu trở lên | Như 5 xu + lời đa tạ màu đỏ, ông đồ vái hai lần, cồng vang, mưa tiền vàng |

- **Mọi tương tác đều có phản hồi ngay:** dòng thông báo hiện tên người xem dưới tờ giấy (ví dụ "Lan Anh 40/100 tim"), tim bay lên từ thẻ "Ghi tên", tên vào thẻ hàng chờ bên phải (hiện 2 tên kế tiếp).
- **Thứ tự viết:** mức xu cao viết trước, cùng mức thì ai đến trước viết trước. Cứ sau 4 tờ có xu (`fairEvery`) thì nhường một lượt cho người thả tim đợi lâu nhất.
- **Mỗi người chỉ có 1 tờ đang chờ:** xu gửi thêm được cộng vào tờ đó. Ví dụ 5 hoa hồng 1 xu thành mức 5 xu, tờ sớ ghi thêm "× 5". Nhờ vậy một combo không chiếm hết hàng chờ. Tờ đang viết dở thì không gộp, xu gửi thêm sẽ thành tờ mới.
- **Đông người thì viết nhanh hơn:** tối đa gấp 2,5 lần với tờ chỉ có tên và gấp 1,4 lần với tờ có xu (mục `rush`).
- Tắt server giữa chừng không mất người đang chờ: hàng chờ và số sớ lưu ở `data/ledger.json`.

## Tự chạy khi vắng người

Không có ai trong hàng chờ khoảng 4 giây thì ông đồ tự viết và vẽ cho bộ 100 người trong `demo-people.json` (tên tự đặt, ảnh ở `public/people`, nguồn ảnh ghi trong `public/people/CREDITS.md`).

- **Người thật được ưu tiên ngay:** ai vào hàng chờ thật (đủ tim hoặc có xu) là tờ tự chạy dừng trong tích tắc, giọng đọc cũng cắt theo, ông đồ viết cho người đó luôn. Tờ dở không tính vào số đã ghi. Thả chưa đủ tim thì tờ tự chạy vẫn tiếp tục, người đó vẫn thấy dòng đếm tim.
- **Không trùng người:** đi hết 100 người mới xáo lại.
- **Vẫn hiện lời mời:** cứ sau 6 tờ (`inviteEvery`) nghỉ lâu hơn để tờ "Mời ghi danh" kịp hiện.
- **Mức đa tạ để dành cho người thật:** `demo.weights` đặt `thanks` bằng 0. Muốn tờ tự chạy có cả mức này thì tăng số đó lên.
- **Dừng khi có cảnh báo:** chế độ an toàn tạm dừng tự chạy. Bảng điều khiển có nút bật/tắt; bật lại server thì theo `demo.enabled`.
- **Giọng đọc:** `voice.demo` đặt `false` nếu không muốn đọc tờ tự chạy. Lần đầu bật, Vbee tạo sẵn 100 tên, mỗi tên tốn một lượt. Tên nào chưa tạo xong thì tờ đó viết mà không đọc. Mục `spoken` trong `demo-people.json` là chữ để đọc, dùng khi tên hiển thị kiểu tài khoản khó đọc.
- **Tên người xem thật:** `src/spoken.js` đổi chữ hoa mỹ về chữ thường, bỏ số và ký hiệu trước khi gửi Vbee. Từ không đọc được (dính liền quá 7 chữ cái, không phải chữ Latin) bị bỏ qua; không còn gì đọc được thì đọc "quý khách". Tên mới được chờ tới khi có giọng rồi mới đọc.
- Bộ đếm "Đã ghi" trên màn hình có tính cả tờ tự chạy; bảng điều khiển ghi riêng số tờ tự chạy.

## Chạy

Bấm đúp `start.bat`. Nó mở cửa sổ server, cửa sổ game (thêm vào LIVE Studio/OBS bằng Window Capture) và bảng điều khiển `http://127.0.0.1:3007/panel.html`.

- Đổi kênh TikTok: sửa `tiktokUsername` trong `config.json`.
- Bật giọng đọc và cảnh báo Telegram: tạo file `.env` trong thư mục này với `VBEE_TOKEN`, `VBEE_APP_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, có thể chép từ `.env` của game khác. Giọng mặc định là giọng nữ; muốn giọng nam thì đặt thêm `VBEE_VOICE`.
- Người thử trên bảng điều khiển cũng được lưu vào hàng chờ, nên bấm **Xóa hàng chờ** trước khi live.

## Chỉnh trong `config.json`

- `likesForName`: số tim để được ghi tên.
- `tiers`: các mức xu, chữ trên thẻ (`board`), ảnh quà trên thẻ (`icon`), chữ trên con dấu, câu ông đồ nói, thời gian khoe tờ sớ.
- `wishes`, `thanks`: lời chúc và lời đa tạ. Game rút như rút bài: dùng hết cả bộ mới xáo lại, nên không lặp câu cho tới khi hết bộ (bật lại server thì xáo từ đầu). Thêm câu mới thì giọng Vbee tạo sẵn lúc bật server, mỗi câu tốn một lượt, chỉ lần đầu.
- `timing`: tốc độ viết chữ, vẽ ảnh, đóng dấu.
- `voice.nameTierMaxQueue`: hàng chờ dài hơn mức này thì không đọc tên người chỉ thả tim, kẻo giọng đọc bị dồn và tốn lượt Vbee.

## Mã nguồn

- `src/ledger.js`: hàng chờ và lịch viết. Server giữ đồng hồ nên mở lại trang giữa chừng vẫn đúng chỗ.
- `public/js/paper.js`: viết chữ và vẽ ảnh. Mỗi chặng có một bản mực hoàn chỉnh và một đường bút; bút đi tới đâu, mực hiện tới đó.
- `public/js/official.js`: ông đồ, bàn nhỏ, tay, bút, con dấu.
- `public/js/scene.js`: khung nền, tiêu đề, bộ đếm, giấy, thẻ hàng chờ, bốn thẻ cách chơi, danh sách "Vừa ghi danh".

Kiểm tra logic: `npm test`.
