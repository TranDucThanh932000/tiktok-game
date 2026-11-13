# tiktok-game

## Sân Khấu Có Duyên — game ghép đôi 3D

Chạy [start.bat của game](san-khau-co-duyen/start.bat). Nó mở game tại <http://127.0.0.1:3130> và [bảng điều khiển](http://127.0.0.1:3130/panel.html).

- Có hàng chờ Nam/Nữ, hai MC, nhân vật khán giả lên/xuống sân khấu, điểm và combo quà.
- Quyết định đúng 10 giây, giấu đáp án, đủ ba nhánh kết quả và các luồng rút lui/kiểm duyệt/khôi phục.
- Có chế độ mô phỏng chơi được không cần API; mặc định MC dùng phụ đề.
- Đã có adapter TikTok và Vbee với hai mã giọng đã chọn; **chưa kiểm chứng bằng tài khoản/phiên LIVE thật**.
- `start.bat` mở cửa sổ server, game và bảng điều khiển; nếu server đã chạy thì chỉ mở lại trang, không lỗi trùng cổng.

Xem [hướng dẫn chạy game, cấu hình API, kiểm thử và giới hạn](san-khau-co-duyen/README.md).

Phòng thử hai nhân vật độc lập vẫn có tại [characters/start.bat](san-khau-co-duyen/characters/start.bat), cổng 3126. Đây không phải launcher của game chính.

Các thiết kế HTML cũ trong thư mục Desktop được giữ nguyên.

## Rung Chuông Vàng — gameshow loại trực tiếp

Chạy [start.bat của game](rung-chuong-vang/start.bat). Nó mở game tại <http://127.0.0.1:3013> và [bảng điều khiển](http://127.0.0.1:3013/panel.html).

- Người xem comment `VÀO` để lên sàn, trả lời bằng `A` `B` `C` `D`. Sai một câu là rời sàn, có cứu trợ khi sàn còn ít người, người cuối cùng trả lời câu hỏi vàng để rung chuông.
- MC giọng nam đọc câu hỏi, công bố đáp án, gọi tên người chơi (Vbee, dùng chung tài khoản với Lớp Học).
- Bộ 1000 câu chép từ Lớp Học. Quà tính theo giá xu: cổ vũ, phao, quay lại sàn.

Xem [luật chơi, quà và cấu hình](rung-chuong-vang/README.md).

## Sút Penalty — tặng quà để sút

Chạy [start.bat của game](sut-penalty/start.bat). Nó mở game tại <http://127.0.0.1:3017> và [bảng điều khiển](http://127.0.0.1:3017/panel.html).

- 4 cầu thủ áo MU, Real, Barça, PSG và 1 thủ môn. Người xem comment tên đội để vào đội.
- Hoa hồng = 1 lượt sút, Bánh vòng 30 xu = 50 lượt, Hộp quà 100 xu = 200 lượt, 50 tim = 1 lượt. Thủ môn bắt được 50%. Chữ trên màn hình game là tiếng Anh.
- Ảnh chibi nhân vật: làm theo [prompt-nhan-vat.txt](sut-penalty/prompt-nhan-vat.txt) rồi `npm run cat-anh`.

Xem [luật chơi, ảnh nhân vật và cấu hình](sut-penalty/README.md).

## Đám Cưới Online — game cưới 3D, cướp vai chú rể/cô dâu

Chạy [start.bat của game](dam-cuoi/start.bat). Nó mở game tại <http://127.0.0.1:3018> và [bảng điều khiển](http://127.0.0.1:3018/panel.html).

- Làm theo [GAME_PLAN.md](GAME_PLAN.md) nhưng bằng Node + Three.js thay cho Unity, nên không phải cài thêm gì.
- Hoa hồng = đăng ký chú rể, TikTok = đăng ký cô dâu (vai có người thì vào hàng chờ). Kem (5 xu) = đổi vai chú rể, Bắn tim = đổi vai cô dâu (đá văng người cũ). Bánh vòng = hủy hôn, Kem ốc quế (1 xu) = mừng 1 chỉ vàng.
- Đủ đôi thì tự làm 8 nghi lễ cưới Việt Nam, từ rước dâu, gia tiên, lên đèn, trao nhẫn đến cảm ơn hai họ. Có người đổi vai giữa chừng thì lễ làm lại từ đầu. Xong lễ thì cặp sau trong hàng chờ lên thay.
- Quà dồn dập được xếp hàng và diễn lần lượt, hàng dài thì diễn nhanh hơn. `npm run test-mode` sinh quà giả không cần live.

Xem [cách chơi, cách lấy tên quà thật và cấu hình](dam-cuoi/README.md).
