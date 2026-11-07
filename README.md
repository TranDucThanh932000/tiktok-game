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
