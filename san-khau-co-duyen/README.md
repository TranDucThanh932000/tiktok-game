# Sân Khấu Có Duyên (TikTok LIVE)

Game ghép đôi cho TikTok LIVE, màn hình dọc 1080×1920. Hai MC Duy và Linh dẫn xuyên suốt; khán giả góp lời chúc, hai người trên sân khấu tự quyết định.

Dựng theo kịch bản `../kich-ban-game-ghep-doi-tiktok.md` và bộ layout 450×800 (trang phóng ×2,4 ra 1080×1920, tự co theo cửa sổ).

## Chạy

Bấm đúp `start.bat`. Nó mở cửa sổ server, cửa sổ game (thêm vào LIVE Studio/OBS bằng Window Capture) và bảng điều khiển <http://127.0.0.1:3130/panel.html>. Nếu server đã chạy thì chỉ mở lại cửa sổ, không lỗi trùng cổng.

- **Kênh TikTok:** đặt `tiktokUsername` trong `config.json`. Để trống là chế độ thử, góc màn hình hiện `CHẾ ĐỘ THỬ`.
- **Giọng MC:** `.env` cần `VBEE_TOKEN`, `VBEE_APP_ID`, `VBEE_VOICE_MALE` (Duy), `VBEE_VOICE_FEMALE` (Linh). Thiếu token thì MC chỉ hiện phụ đề, game vẫn chạy. Lần đầu máy tạo toàn bộ lời thoại vào `data/tts/`, các lần sau dùng lại, không tốn lượt.
- **Cảnh báo Telegram:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` trong `.env`. TikTok cảnh báo thì tự bật chế độ an toàn (MC im, game vẫn chạy) và báo qua Telegram.
- **Thử luật:** `npm test`.

## Cách chơi

| Người xem làm gì | Kết quả |
|---|---|
| Vào phòng | Nhân vật có đầu là avatar TikTok của người đó bước vào khán đài. Không đồng nghĩa đăng ký. |
| Gửi quà **Heo** / **Cỏ ba lá** | Vào cuối hàng Nam / Nữ, hiện vị trí. Gửi thêm không tạo suất, không chen hàng. |
| Bình luận `rời hàng` | Đang đợi: hủy đăng ký. Đang trên sân khấu: dừng lượt ngay. |
| Bình luận `đẹp đôi` | +1 điểm cho cặp đang chơi. Phải khớp nguyên câu. |
| Gửi quà khác | Một lời chúc tới hai bạn: bao nhiêu xu cộng bấy nhiêu điểm, thẻ hiện lời chúc, hai MC cảm ơn người gửi rồi chúc phúc cho đôi bạn. |
| Hai người trên sân khấu gõ `đồng ý` / `không đồng ý` | Tính lần cuối trong đúng 10 giây. Giấu đáp án tới hết giờ. |

Cả hai đồng ý là **GHÉP ĐÔI THÀNH CÔNG**; có người không đồng ý là **CHƯA CÙNG NHỊP**; thiếu câu trả lời là **CHƯA ĐỦ PHẢN HỒI**, không ghi thành từ chối. Điểm chỉ là lời cổ vũ, không đổi được kết quả.

Một vòng đo bằng giọng Vbee hiện tại dài khoảng 96–99 giây, nhỉnh hơn mục tiêu 80–95 giây của kịch bản, vì lời thoại đầy đủ đọc lâu hơn thời lượng dự kiến (riêng phần mời khoảng 15 giây so với 8–10 giây). Muốn ngắn lại thì rút câu trong `lines.json`, hoặc đặt `VBEE_SPEED` trong `.env` (đổi tốc độ sẽ tạo lại toàn bộ giọng). Cửa quyết định luôn đúng 10 giây.

Khán đài lấp hàng trước, rồi hàng sau; kín rồi thì xếp chồng thêm lớp, lệch nhau một chút cho đông vui. Trên màn hình có tối đa 150 nhân vật (`MAX_ON_SCREEN` ở `public/js/crowd.js`); đông hơn thì người im lặng lâu nhất tạm ra khỏi hình, vẫn được tính khi tương tác và sẽ quay vào. Người đang xếp hàng hay trên sân khấu không bị mời ra.

## Cặp diễn mẫu

Hai hàng đều trống trong 20 giây thì hai diễn viên của chương trình lên diễn mẫu một lượt, để phòng không vắng và người xem thấy cách chơi.

- Bot chỉ ghép với bot. Có một người thật trong hàng thì không mở lượt mẫu mới, người đó chờ người thật còn lại.
- Đủ hai người thật thì cặp mẫu nhường sân khấu ngay.
- Luôn có nhãn `CẶP DIỄN MẪU` và MC nói rõ đó là diễn viên. Quà thật gửi lúc này không tính điểm cho họ; "đẹp đôi" vẫn làm bảng điểm mẫu nhảy. Họ không vào lịch sử, không lấy số cặp, không ngồi lại khán đài.
- Bật/tắt ở bảng điều khiển hoặc `demo.enabled` trong `config.json`. Tên diễn viên, ý chia sẻ, thời gian chờ ở mục `demo`; lời MC ở `demoInvite`, `demoIntro`, `demoYield` trong `lines.json`.

## Sửa nội dung

- `lines.json`: toàn bộ lời hai MC. `{TEN_NAM}`, `{TEN_NU}`, `{DIEM}`... được điền từ dữ liệu thật. Sửa xong khởi động lại server; câu mới được tạo giọng tự động. Mục `wishes` là lời cảm ơn và chúc phúc theo từng loại quà, thêm câu vào đó để MC đỡ lặp.
- Lời cảm ơn được gom theo đợt, tối đa một lượt mỗi 12 giây; trong phần hướng dẫn và cửa 10 giây MC không đọc tên, quà gửi lúc đó được cảm ơn sau khi có kết quả.
- `config.json` mục `giftWishes`: lời chúc ngắn hiện trên thẻ quà.
- `public/gifts/`: ảnh quà TikTok thật, cùng bộ với game `cau-ca`. Quà ngoài danh mục hiện ảnh TikTok gửi kèm sự kiện.
- `config.json`: `gifts` (tên quà, giá mục tiêu; `coins: null` là chưa chốt giá), `timing` (độ dài từng phần), `milestones`, `bannedWords`.
- **Cửa quyết định 10 giây cố định trong code** (`DECIDE_MS` ở `src/game.js`), không đặt trong config để không vô tình kéo dài.

## Bảng điều khiển

- **Dừng khẩn cấp / Mở lại:** hủy lượt, không công bố lựa chọn. Sau khi mở lại, hai người gõ `tiếp tục` trong 30 giây để vào lượt mới với 10 giây mới và điểm 0; điểm lượt lỗi giữ trong lịch sử để đối soát.
- **Loại / Cấm:** gỡ người khỏi hàng hoặc sân khấu; Cấm thì không đăng ký lại được.
- **Quà chờ xác minh giá:** quà chưa rõ giá không được đoán; nhập số xu ở đây để cộng vào đúng cặp đã nhận, cặp đó hiện `TẠM TÍNH` tới khi xong.
- **Đối chiếu giá:** bảng so giá mục tiêu với giá TikTok. Màn hình chỉ hiện giá đã có.
- **Mô phỏng và Khán đài tự chạy:** chỉ để xem thử. Lần đầu nối LIVE, mọi người giả bị xóa khỏi hàng chờ, sân khấu và khán đài; từ đó mô phỏng tắt hẳn tới khi khởi động lại server, kể cả lúc rớt mạng. Người thật không bị ghép với bot.
- **Nghe thử tiếng khán đài:** vỗ tay, huýt sáo và hò reo do code tạo ra (`public/js/crowdsound.js`), nghe ngay trên bảng để chỉnh mức to nhỏ.

## Chưa kiểm chứng, phải làm trước khi LIVE thật

Các việc này cần tài khoản và phiên LIVE thật nên chưa được thử:

- [ ] Nối phiên LIVE thật, xem sự kiện vào phòng có về không. Nếu không, nhân vật chỉ xuất hiện từ lần tương tác đầu tiên (bảng điều khiển có ghi); không quảng cáo là "mọi người xem đều đã bước vào".
- [ ] Bảng **Đối chiếu giá**: kiểm tra Heo, Cỏ ba lá, Hoa hồng, Bắn tim, Hộp quà khớp đúng quà trong phòng. Tên quà tiếng Anh ở `config.json` lấy theo game `cau-ca`; nếu không khớp thì sửa `names`.
- [ ] **Đo độ trễ bằng hai tài khoản xem thật.** Bảng điều khiển có số độ trễ bình luận. Nếu trễ nhiều tới mức 10 giây không dùng được thì chưa đưa chế độ này lên LIVE; không kéo dài cửa lệnh trong khi vẫn hiển thị 10 giây.
- [ ] Vị trí chữ trên điện thoại: luật, điểm, đồng hồ, kết quả nằm trên y = 500 (khung 450×800), nhưng vùng TikTok che chỉ là ước lượng.
- [ ] Quy trình kiểm duyệt: từ 18 tuổi và tự nguyện. Game không suy ra tuổi hay giới tính từ avatar, giọng nói hay loại quà; nút Loại/Cấm là công cụ, người vận hành vẫn phải theo dõi.
- [ ] Bộ lọc tên và ý chia sẻ (`src/text.js`) chỉ chặn liên hệ, liên kết, từ cấm và câu lệnh điều khiển MC theo danh sách. Nó không thay được người kiểm duyệt.

## Mã nguồn

| File | Việc |
|---|---|
| `src/game.js` | Luật: hàng chờ, điểm, cửa 10 giây, kết quả, tạm dừng. Không phụ thuộc giọng hay hoạt ảnh. |
| `src/director.js` | Điều phối hai MC: mỗi lúc một giọng, ưu tiên theo mục 9.2 của kịch bản. |
| `src/gifts.js` | Danh mục quà, đối chiếu giá. |
| `src/text.js` | Chuẩn hóa bình luận, lọc tên và ý chia sẻ. |
| `src/voice.js` | Thư viện mẩu giọng Vbee, lưu đĩa. |
| `public/js/main.js` | Vẽ màn hình theo trạng thái máy chủ. |
| `public/js/crowd.js` | Khán đài: mỗi tài khoản đúng một nhân vật. |
