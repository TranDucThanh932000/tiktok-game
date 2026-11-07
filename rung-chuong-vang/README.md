# Rung Chuông Vàng — trụ lại cuối cùng để rung chuông

Game TikTok LIVE màn dọc 1080×1920, theo kiểu gameshow Rung Chuông Vàng. Người xem comment `VÀO` để lên sàn thi, rồi trả lời câu hỏi trắc nghiệm bằng cách comment `A`, `B`, `C` hoặc `D`. Sai một câu là rời sàn. Khi sàn còn ít người thì có **cứu trợ** cho người đã rời sàn quay lại. Người cuối cùng trên sàn trả lời các **câu hỏi vàng**, đúng hết thì **rung chuông vàng**.

Node + Express + `tiktok-live-connector`, màn hình là trang web mở bằng cửa sổ Edge `--app` để LIVE Studio/OBS bắt hình. Cổng 3013. Cách chạy, cách kết nối TikTok và cảnh báo Telegram giống các game khác trong thư mục này.

## Chạy

Bấm đúp `start.bat`: mở cửa sổ server, cửa sổ game 9:16 và bảng điều khiển `http://127.0.0.1:3013/panel.html`.

- Đổi kênh TikTok: sửa `tiktokUsername` trong `config.json` (đang là `c.hoi.thanh021`), rồi chạy lại server.
- Chạy thử không kết nối TikTok: mở `cmd` trong thư mục game rồi chạy `node server.js ""`, sau đó vào bảng điều khiển để giả lập comment và quà. Trong PowerShell, `""` bị bỏ mất nên server vẫn kết nối kênh trong `config.json`; dùng `cmd` hoặc tạm xóa `tiktokUsername`.
- Tắt tiếng màn hình game: thêm `?mute` vào địa chỉ.
- Test: `npm test`.
- `.env` có `TELEGRAM_BOT_TOKEN` và `TELEGRAM_ADMIN_CHAT_ID` (chép từ Sơn Tinh Thủy Tinh): TikTok cảnh báo phiên live thì báo qua Telegram. `VBEE_TOKEN`, `VBEE_APP_ID` (chép từ Lớp Học) và `VBEE_VOICE` cho giọng MC, xem mục **Giọng MC**.

**Trước mỗi buổi live** nên bấm **Trận mới** ở bảng điều khiển, vì người thử cũng được lên sàn như người xem thật. Trận đấu chỉ nằm trong bộ nhớ: tắt server là mất trận đang dở, bật lại thì mở sàn trận mới.

## Luật chơi

| Người xem làm gì | Chuyện gì xảy ra |
|---|---|
| Comment `VÀO`, `vô`, `tham gia`, `cho em vào với`... | Lên sàn thi, có một ô ảnh đại diện mang tên mình trên sàn |
| Comment `A`, `B`, `C`, `D` | Trả lời câu đang hỏi. Chỉ tính **đáp án đầu tiên**, đổi ý không được |
| Gửi quà | Cổ vũ, nhận phao hoặc quay lại sàn, xem bảng quà bên dưới |

- **Mở sàn:** 40 giây cho mọi người comment `VÀO`. Cần ít nhất 2 người; hết giờ mà chưa đủ thì game chờ, đủ người thì đếm thêm 5 giây rồi hỏi câu 1. **Trong câu 1** ai comment đáp án cũng được tự lên sàn luôn; từ câu 2 sàn đóng.
- **Mỗi câu:** MC đọc câu hỏi và 4 đáp án (phương án đang đọc sáng lên), đọc xong mới bắt đầu đếm 15 giây; trong lúc MC đọc ai trả lời cũng được tính. Màn hình chỉ hiện số người đã chốt đáp án, không lộ ai chọn gì. Mọi người trên sàn đã trả lời thì 2 giây sau công bố luôn (nhưng vẫn chờ MC đọc xong câu hỏi).
- **Công bố:** phương án đúng sáng xanh, mỗi phương án có số người chọn, bảng con của từng người lật ra đáp án đã chọn. Ai **sai hoặc không trả lời thì rời sàn**. Người trả lời đúng nhanh nhất được ghi tên.
- **Cả sàn cùng sai** (hoặc không ai trả lời) thì không ai bị loại, để trận không kết thúc mà không có người thắng.
- **Cứu trợ:** từ câu 4, khi số người trên sàn còn từ 30% số người đã tham gia trở xuống, game chiếu màn **CỨU TRỢ** và hỏi một câu chỉ dành cho người đã rời sàn. Ai đúng thì quay lại sàn. Mỗi trận tối đa 2 lần cứu trợ, không có hai lần cứu trợ liền nhau.
- **Câu hỏi vàng:** còn đúng 1 người trên sàn thì người đó vào 3 câu hỏi vàng, người khác không trả lời được. Đúng cả 3 câu là **RUNG CHUÔNG VÀNG**. Sai một câu thì dừng lại, vẫn được vinh danh là người cuối cùng trên sàn.
- **Hết 40 câu** mà còn nhiều người thì tất cả **cùng về đích**.
- Màn kết thúc hiện 18 giây kèm 3 người trả lời đúng nhiều nhất trận, rồi mở sàn trận mới.
- **Cách gõ đáp án:** chữ hoa, chữ thường, lặp chữ (`aaa`, vì TikTok chặn comment trùng), kèm `đáp án`, `chọn`, `là`, `câu` ở đầu hay `nha`, `nhé`, `ạ` ở cuối đều được. `à`, `á`, `ạ` là tiếng đệm, không tính là đáp án A.
- **Người chưa lên sàn** comment đáp án lúc sàn đã đóng thì màn hình nhắc chờ trận sau, mỗi người tối đa một lần mỗi phút.
- **Đông người:** sàn hiện tối đa 32 người, người vừa trả lời hay vừa gửi quà được ưu tiên; số còn lại hiện thành `+N người nữa`.

## Quà

Quà được tính theo **giá xu**, không theo tên: quà đắt nhất mà giá với tới được dùng, nên quà nào từ 10 xu trở lên cũng là "Quay lại sàn".

| Giá | Ví dụ | Tác dụng |
|---|---|---|
| 1 xu trở lên | Hoa hồng | Cổ vũ (tim bay trên màn hình). Lúc đang mở sàn thì người gửi được lên sàn luôn |
| 5 xu trở lên | Bắn tim | **+1 phao** mỗi quà: trả lời sai một câu thường mà vẫn ở lại sàn, mỗi phao dùng một lần. Đang mở sàn hay đang ở câu 1 thì người gửi được lên sàn kèm phao; sàn đã đóng mà người gửi chưa có tên trong trận thì chỉ là cổ vũ |
| 10 xu trở lên | Heo may mắn | Đã rời sàn thì **quay lại sàn**. Chưa có trong trận thì **lên thẳng sàn** dù sàn đã đóng. Đang trên sàn thì thành +1 phao. Gửi nhiều thì quà thứ hai trở đi thành phao |

- Phao không có tác dụng ở câu hỏi vàng. Lúc đang hỏi câu vàng hay lúc ăn mừng, quà lớn chỉ còn là cổ vũ.
- Combo quà được tính đủ từng quà. Quà dưới 1 xu (hoặc không rõ giá) không có tác dụng, chỉ ghi ở cửa sổ server.

## Giọng MC

MC đọc bằng giọng Vbee **nam Hà Nội giọng bản tin** (`n_hanoi_male_bountintuc_news_vc`, giống MC Duy của Sân Khấu Có Duyên), dùng chung tài khoản Vbee với Lớp Học. Đổi giọng: sửa `VBEE_VOICE` trong `.env` (ví dụ `hn_female_ngochuyen_full_48k-fhg` là giọng cô giáo Lớp Học), `VBEE_SPEED` để đọc nhanh/chậm, rồi chạy lại server. Thiếu `VBEE_TOKEN` hoặc `VBEE_APP_ID` thì game vẫn chạy, chỉ không có tiếng MC.

| Lúc nào | MC nói gì |
|---|---|
| Đang mở sàn | Chào từng người lên sàn bằng tên; cứ 25 giây mời comment VÀO |
| Hỏi câu | "Câu hỏi số 5." rồi đọc câu hỏi, "A. …, Bê. …, Xê. …, Đê. …", "Mời các bạn trả lời." Câu 1 có lời chào mở màn |
| Sắp hết giờ | "Nhanh lên nào, sắp hết giờ rồi!" (khi còn người chưa trả lời) |
| Công bố | "Hết giờ! Đáp án đúng là Bê." đọc lời giải, số người rời sàn, người được phao giữ lại, người trả lời nhanh nhất, số người còn trên sàn |
| Cứu trợ | Giới thiệu cứu trợ, sau đó báo bao nhiêu người quay lại sàn |
| Câu hỏi vàng | Gọi tên người cuối cùng, đọc luật, mỗi câu báo còn mấy câu nữa |
| Kết thúc | Chúc mừng người rung chuông vàng / người cuối cùng / những người cùng về đích |
| Quà | Cảm ơn cổ vũ, báo nhận phao, chào người quay lại sàn |

- **Đồng hồ chờ MC:** 15 giây chỉ bắt đầu khi MC đọc xong câu hỏi (đồng hồ đứng ở 15, viền vàng); màn công bố, giới thiệu và kết thúc kéo dài cho đủ lời MC.
- **Mẩu giọng:** mỗi câu được ghép từ các mẩu (một cụm từ, một tên, một con số) tạo bằng Vbee và lưu ở `data/tts`, nên lần sau không tốn lượt Vbee. Lần chạy đầu tiên server tạo khoảng 145 mẩu lời MC dùng chung (vài phút). Giọng 3 câu sắp hỏi luôn được tạo trước; nếu câu sắp hỏi chưa kịp có giọng thì game chờ tối đa 12 giây, quá thì vẫn hỏi và MC chỉ mời đọc câu hỏi trên màn hình.
- **Tên người chơi** được tạo giọng ngay khi họ lên sàn hay trả lời. Tên chỉ có biểu tượng, chữ nước ngoài hay chữ số thì MC bỏ qua câu có tên đó chứ không đọc sai (`Hùng 1995` đọc là `Hùng`).
- **Lời phụ** (chào, cảm ơn, giục giờ) chỉ nói khi MC đang rảnh và nói kịp trước phần chính kế tiếp; không kịp thì bỏ.
- **Sửa lời thoại:** trong `mc.json`. Mỗi mục là một danh sách câu để MC đổi qua lại, `{name}` là tên người chơi, `{n}` là con số, `{letter}` là chữ cái đáp án. `fixes` là bảng sửa cách đọc (ví dụ `H₂O` → `hát hai ô`). Sửa xong chạy lại server, mẩu mới được tạo tự động.
- **Tắt tiếng MC:** nút trên bảng điều khiển. MC tự tắt tiếng khi TikTok cảnh báo phiên live (trận vẫn chạy), bật lại bằng tay.

## Chỉnh trong `config.json`

Sửa xong thì khởi động lại server.

- `tiktokUsername`, `port`, `title`, `subtitle`.
- `minPlayers`: số người tối thiểu trên sàn trước khi hỏi câu 1. `joinUntilQuestion`: tới câu này vẫn cho người mới trả lời để lên sàn (`0` là chỉ lên sàn lúc mở sàn). `maxQuestions`: số câu thường tối đa mỗi trận. `goldenQuestions`: số câu hỏi vàng.
- `rescue`: `minQuestion` (từ câu nào mới có cứu trợ), `alivePercent` (sàn còn từ bao nhiêu % số người tham gia trở xuống thì cứu trợ), `maxTimes` (số lần cứu trợ mỗi trận, `0` là tắt).
- `timing`: `lobbySeconds` (mở sàn), `introSeconds` (màn giới thiệu cứu trợ / câu hỏi vàng), `askSeconds` (mỗi câu), `earlyCloseSeconds` (mọi người đã trả lời thì chờ thêm bao lâu), `revealSeconds` (công bố đáp án), `endSeconds` (màn kết thúc).
- `gifts`: mỗi bậc quà có `coins` (giá tối thiểu), `effect` (`cheer` cổ vũ, `shield` phao, `revive` quay lại sàn), `shields` (số phao mỗi quà), `label`, `giftLabel` và `icon` (hiện trên màn hình).
- `questionsFile` (không bắt buộc): đường dẫn bộ câu hỏi khác, mặc định `questions.json`.

## Bộ câu hỏi

`questions.json` là bộ **1000 câu** chép từ Lớp Học (`lop-hoc/questions.json`), cùng dạng:

```json
{ "s": "Toán", "q": "12 × 8 bằng bao nhiêu?", "o": ["96", "86", "106", "92"], "e": "12 × 8 = 96" }
```

`s` là môn (hiện trên thẻ câu hỏi), `q` là câu hỏi, `o` là 4 đáp án với **đáp án đúng đứng đầu**; lúc hỏi game tự xáo thứ tự A B C D. `e` (giải thích) không bắt buộc. File sai thì server báo rõ câu nào lỗi và không chạy. Hết 1000 câu thì bộ câu được xáo lại từ đầu. Sửa bộ câu ở đây không ảnh hưởng Lớp Học.

## Bảng điều khiển

- Trên cùng là trạng thái kết nối TikTok, tình hình trận, **đáp án đúng của câu đang hỏi** (chỉ bảng điều khiển thấy, màn hình game không nhận trước), kim cương của phiên live, giọng MC, nút tắt/bật tiếng MC và cảnh báo TikTok. Vbee lỗi thì hiện ở dòng nhật ký.
- **Người xem giả lập:** comment VÀO, A/B/C/D, trả lời đúng, trả lời sai, comment bất kỳ, gửi từng bậc quà.
- **Thử đông người:** thêm nhiều người lên sàn, cả sàn trả lời câu đang hỏi theo tỉ lệ đúng tùy chọn, bật tự trả lời mọi câu, mưa quà.
- **Điều khiển:** sang bước tiếp (đang mở sàn thì hỏi câu 1 ngay, đang hỏi thì công bố ngay, đang công bố thì sang câu sau), đổi câu khác (câu lỗi hay quá khó: bỏ câu, không loại ai), kết thúc trận ngay, trận mới, gửi thử Telegram.
- Bảng người chơi: ai còn trên sàn, ai đã rời sàn, số phao và số câu đúng.

## Mã nguồn

- `src/game.js`: luật chơi (mở sàn, hỏi, loại, phao, cứu trợ, câu hỏi vàng, quà) và cách đọc comment, không dính TikTok hay trình duyệt nên test được bằng đồng hồ giả.
- `src/mc.js`: MC quyết định nói gì, nói lúc nào; báo cho luật chơi biết cần bao lâu để đồng hồ chờ. `src/voice.js`: tạo và lưu mẩu giọng Vbee. `src/spoken.js`: đổi chữ, số, tên thành chữ đọc được (hai file này chép từ Lớp Học).
- `src/questions.js`: kiểm tra, xáo bộ câu hỏi và cho xem trước câu sắp hỏi.
- `server.js`: kết nối TikTok (dùng `shared/tiktok-events.mjs` để đọc comment, quà, combo và `shared/event-deduplicator.mjs` để bỏ tin trùng), cảnh báo Telegram, API cho bảng điều khiển.
- `public/js/main.js`: màn hình game. `public/js/art.js`: chuông vàng và phao vẽ bằng SVG. `public/js/audio.js`: tiếng động và tiếng chuông tổng hợp bằng WebAudio, phát giọng MC (hiệu ứng nhỏ lại khi MC nói).
- `public/panel.html`: bảng điều khiển.
