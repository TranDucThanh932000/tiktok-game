# Ball Factory — nhà máy avatar TikTok LIVE

Robot nhận tương tác, pha màu từ **ảnh đại diện thật của người gửi**, rồi thả các quả bóng nhỏ ghép thành chân dung. Khi hoàn thành, xưởng hiện **“Thank you!”** kèm tên người xem và chuyển sang lượt kế tiếp.

Giao diện dùng chữ tiếng Anh ngắn gọn. Máy nằm sát bên trái khung LIVE 9:16; danh sách **Rose / Heart / Lucky Pig** nằm bên phải máy, hiển thị ảnh quà TikTok và độ chi tiết. Tên thật của người xem được giữ nguyên, không dịch.

## Chạy trên Windows

Nhấp đúp [start.bat](start.bat). Launcher dùng Node.js 22.9+, tự cài thư viện còn thiếu, rồi mở 3 thứ giống các game khác: cửa sổ server, cửa sổ game 9:16 riêng (thêm vào LIVE Studio/OBS bằng Window Capture) và trang điều khiển.

- **Điều khiển + xem game:** <http://127.0.0.1:3140>
- **Khung sạch cho OBS / TikTok LIVE Studio:** <http://127.0.0.1:3140/?overlay=1> (chính là cửa sổ game riêng)
- Kích thước Browser Source: **540 × 960**, hoặc **1080 × 1920**. Không quay cả trang điều khiển.

Hoặc chạy trong PowerShell:

```powershell
Set-Location D:\laragon\www\tiktok-game\nha-may-avatar
npm.cmd install
npm.cmd start
```

Nếu cổng đã có đúng game chạy, launcher chỉ mở lại giao diện; không tự tắt chương trình khác.

## Luật đã triển khai

| Tương tác | Chất lượng | Lưới bóng | Số bóng / ảnh |
|---|---|---|---:|
| Đủ **50 tim / người** | Basic | 24 × 24 | 576 |
| **Hoa hồng / Rose — 1 xu** | Clear | 36 × 36 | 1.296 |
| **Bắn tim / Heart — 5 xu** | Sharp | 52 × 52 | 2.704 |
| **Heo may mắn / Lucky Pig — 10 xu** | HD | 72 × 72 | 5.184 |

- **Mỗi món quà = 1 lượt.** Combo ×10 nhận 10 lượt, không gộp thành một lượt.
- Chất lượng dựa vào **giá mỗi món**, không phải tổng giá combo: Hoa hồng ×10 vẫn là 10 ảnh 36 × 36, không nâng thành mức Heo.
- Quà khác hiển thị là **Gift**: **1–4 xu → 36**, **5–9 xu → 52**, **từ 10 xu → 72**. Nếu TikTok thiếu giá, tên ba quà đã biết (Anh hoặc Việt) được dùng để nhận dạng; quà chưa rõ giá dùng mức Hoa hồng và hiện cảnh báo trong nhật ký.
- Cùng **9 giây thả bóng** ở tất cả mức; mức cao hơn thả nhiều bóng nhanh hơn. Mỗi lượt có thêm 1 giây chuẩn bị và 3,5 giây cảm ơn: tổng **13,5 giây**.
- Tim tính theo **ID tài khoản**, giữ số dư qua các mốc 50. Hai người trùng tên không bị gộp. Không lấy tổng tim của phòng để gán cho một người.
- Hàng chờ FIFO, các lượt trong một combo chạy liên tiếp. Máy biểu diễn liên tục, không có thưởng tiền hay kết quả ngẫu nhiên.
- Tạm dừng chỉ dừng dây chuyền; tương tác mới vẫn vào hàng chờ.

## Âm thanh

Mọi âm thanh do code tạo ra (`public/sound.js`), không cần file ngoài.

| Khi | Tiếng |
|---|---|
| Thả tim | Tiếng bóp nhỏ, đủ 50 tim thì hai nốt chuông |
| Tặng quà | Hoa hồng 2 nốt, Bắn tim 3 nốt, Lucky Pig 5 nốt kèm tiếng xu |
| Bắt đầu vẽ | Máy khởi động và bi rơi vào phễu |
| Đang vẽ | Bi thủy tinh lách cách đúng lúc đặt vào khung, tạm dừng thì im |
| Xong ảnh | Ba nốt chuông; lượt thật có thêm tiếng thùng hàng đặt xuống băng chuyền |
| Mẫu nhường cho người thật | Tiếng vút |
| Tạm dừng / chạy lại | Hai nốt xuống / lên |

Lượt mẫu nhỏ tiếng hơn lượt thật để nghe lâu không mệt.

- Cửa sổ game 9:16 (`?overlay=1`) luôn có tiếng. Trang điều khiển mặc định im để không bị tiếng đôi; bật ô **Sound on this page** nếu chỉ dùng trang này (có thêm tiếng bấm nút và báo nối/mất LIVE, hai tiếng này không phát ở cửa sổ game).
- LIVE Studio/OBS dùng Window Capture không tự lấy tiếng: cần bật thu âm thanh hệ thống, hoặc âm thanh riêng của cửa sổ này.

## Vẽ mẫu khi phòng chưa có ai

Không có lượt nào trong 3 giây thì máy tự vẽ mẫu liên tục, kể cả khi đang LIVE.

- Kho có **1.000 tài khoản hư cấu** (`src/samples.js`), ảnh là hình vẽ gồm người và thú cưng, tên và ảnh đều không trùng. Dùng hết cả kho mới xoay lại, và 30 tài khoản vừa hiện không quay lại ngay. Mỗi lượt khoảng 13,5 giây, nên khoảng 3 giờ 45 phút mới hết một vòng.
- Có người thật tặng quà hoặc đủ tim thì lượt mẫu dừng ngay, máy chuyển sang người đó.
- Lượt mẫu ghi **Sample** trên thẻ, không hiện "Thank you", không sáng ô quà, không tính vào thống kê hay ảnh gần đây.
- Bật/tắt bằng ô **Draw samples while idle** ở trang điều khiển.
- Muốn thêm ảnh riêng: thả PNG, JPG, WEBP hoặc SVG vào `public/samples/` rồi khởi động lại server. Chỉ dùng ảnh bạn có quyền dùng; không dùng ảnh người thật nếu họ chưa đồng ý.

## Kết nối LIVE thật

1. Mở livestream TikTok của bạn.
2. Nhập **tên kênh**, ví dụ `ten_kenh`, rồi bấm **Connect**.
3. Chỉ khi có trạng thái **“LIVE @tên_kênh”** mới coi là đã vào phòng. Lỗi / chưa LIVE hiển thị rõ, tự thử lại sau 15 giây.
4. Khi đang dùng nguồn LIVE, các nút mô phỏng bị khóa. Kết nối sẽ xóa lượt thử, nhưng không xóa lượt LIVE đã nhận.
5. Dùng **Disconnect** để thử lại. Ngắt nguồn không xóa hàng chờ LIVE.

Có thể sao chép [.env.example](.env.example) thành `.env` **trong thư mục game này** để đặt `PORT`, `TIKTOK_USERNAME`, và tùy chọn `TIKTOK_SIGN_API_KEY`. Không dùng lại `.env` của game khác; không đưa khóa vào mã nguồn hoặc giao diện.

Adapter dùng `tiktok-live-connector` 2.x, giao thức không chính thức. Việc bắt tay phụ thuộc TikTok và dịch vụ ký Euler Stream, có thể cần khóa của dịch vụ tùy chính sách tại thời điểm chạy. Không đọc mật khẩu, cookie hay session TikTok; `authenticateWs` luôn tắt. Kiểm tra giấy phép AGPL-3.0 của thư viện nếu phân phối/triển khai dịch vụ.

**Giới hạn thực tế:** TikTok có thể gom, lấy mẫu hoặc không chuyển đầy đủ sự kiện tim theo người. Mốc 50 là số tim có danh tính mà connector thực sự nhận được; không thể cam kết mọi lần chạm màn hình đều có sự kiện. Dữ liệu thiếu ID chỉ được báo trong nhật ký, không bịa người nhận ảnh.

## Thử trước khi LIVE

- Chọn Mia, Alex hoặc Milo; dùng **+10 likes / +50 likes** và thử ba nút quà.
- Chọn **×10** để kiểm tra số lượt của combo.
- Nút ảnh cạnh người xem cho phép tải ảnh trên máy (PNG/JPEG/WebP, tối đa 8 MB) và nhập tên. Ảnh được cắt vuông, thu nhỏ trên trình duyệt rồi chuyển cho **server nội bộ**; không gửi sang dịch vụ AI.
- Khi tải avatar LIVE lỗi, xưởng **hiện cảnh báo** và dùng ảnh chữ cái có ghi rõ là thay thế; không giả vờ đã vẽ được ảnh thật.
- Khi hết hàng chờ, giữ lại bức vừa hoàn thành. Mở nhiều cửa sổ hoặc tải lại trang không nhận thêm lượt.

Ảnh mẫu và cảnh nhà máy là SVG vẽ riêng trong [public](public). Renderer lấy màu từng ô ảnh, vẽ bóng có ánh sáng và mô phỏng rơi/nảy, không gọi API AI. Nhiều bóng hơn tăng độ chi tiết nhưng không khôi phục được chi tiết không có trong ảnh gốc.

## Kiểm thử và cấu trúc

```powershell
npm.cmd test
node --check server.js
```

- [public/rules.js](public/rules.js): một nguồn chung cho mốc tim, ba quà, chất lượng và thời lượng.
- [src/factory.js](src/factory.js): hàng chờ, lượt riêng cho từng món quà, số dư tim, tạm dừng và trạng thái server.
- [src/tiktok.js](src/tiktok.js): nối LIVE, tự nối lại, chống sự kiện cũ sau khi ngắt.
- [public/portrait.js](public/portrait.js): cắt ảnh, lấy màu, bóng theo thứ tự từ dưới lên, cache các bóng đã ổn định.
- [src/avatar.js](src/avatar.js): tải ảnh qua server để canvas không vướng CORS; chỉ CDN TikTok HTTPS, kiểm tra từng redirect, giới hạn 2 MB, timeout và cache có giới hạn.
- Các bộ chuẩn hóa/chống trùng được dùng chung tại [shared](../shared); các đường import cũ của game Đua Vịt vẫn được giữ bằng re-export.

Game chỉ lắng nghe trên `127.0.0.1`, không mở bảng điều khiển ra mạng LAN. Hàng chờ, số dư, ảnh tải lên và thống kê ở **RAM**, mất khi tắt server. Chuyển phòng LIVE xóa số dư tim cũ nhưng giữ lượt đã nhận. Khi browser mất kết nối server, hình tạm dừng và hiện cảnh báo rồi tự nối lại.

Kiểm thử tự động dùng payload/connector giả lập, bao gồm combo gửi tăng dần, lặp bản tin kết thúc, ngưỡng xu, số bóng chính xác và HTTP/SSE. **Cần thử thêm bằng tài khoản đang LIVE thật trước buổi phát chính thức**; kiểm thử mô phỏng không thay thế xác minh với TikTok.
