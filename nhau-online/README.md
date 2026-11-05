# Quán Cô Ba Đầu Hẻm (Quán Nhậu Online)

Game TikTok LIVE theo kịch bản `../quan-nhau-online.md`.

> Comment **“vào”** để vào quán · **“vào bàn 3”** để chọn hoặc đổi bàn · **“về”** để ra về · **“dô”** để cả quán cụng ly · vào là Tí tự bưng **nước lã** ra, uống hết tự châm · gửi quà thì nhận **món theo thực đơn**.

## Chạy

1. Đặt tên kênh TikTok vào `tiktokUsername` trong `config.json` (hoặc chạy `npm start -- ten_kenh`).
2. Bấm đúp `start.bat`: mở cửa sổ server, cửa sổ game dọc 9:16 (dùng làm nguồn cửa sổ trong LIVE Studio) và bảng điều khiển.
   - Màn hình game: http://127.0.0.1:3004/ (thêm `?mute` nếu muốn bản không tiếng)
   - Bảng điều khiển: http://127.0.0.1:3004/panel.html
3. Không đặt kênh thì game chạy ở chế độ thử; dùng bảng điều khiển để giả lập bình luận, quà, sự kiện.

Kiểm tra luật chơi (các tình huống mục 14 của kịch bản): `npm test`.

## Luật đã làm

Quán có **8 bàn**, mỗi bàn **4 ghế**, tổng cộng **32 khách ngồi**. Số bàn từ **1 đến 8**.

| Hành động | Kết quả |
|---|---|
| Comment “vào” / “vô” / “vào quán” khi chưa có nhân vật | Nhân vật đi từ đầu hẻm vào ghế trống, Cô Ba chào |
| Vừa vào ghế | Tí tự bưng ly nước lã ra. Ly vơi dần (mỗi `water.glassMinutes` = 3 phút hết một ly, 4 ngụm), uống cạn thì Tí tự mang ly mới |
| Comment bất kỳ sau khi đã vào | Chỉ hiện bong bóng thoại, không gọi món, không gọi nước |
| Comment khi chưa vào quán | Không tạo nhân vật, Cô Ba thỉnh thoảng nhắc comment “vào” |
| Gửi quà có trong thực đơn | Phiếu order + chuông bếp, Tí bưng đúng món tới đúng bàn |
| Gửi quà khi chưa vào quán | Tự đón khách (ưu tiên ghế trống tiếp theo nếu quán đầy) rồi phục vụ |
| Quà chưa có trong thực đơn | Cô Ba cảm ơn, bảng điều khiển báo “quà chưa có món”; không tự đổi thành món khác |
| Comment “vào bàn 3” (hoặc “vao ban 3”, “vào bàn số 3”) | Đi sang bàn 3 nếu còn ghế, món trên bàn và đơn đang chờ mang theo. Bàn đầy / sai số / đang ngồi đó thì Cô Ba nói lại. Mỗi người 10 giây mới đổi tiếp. Người chưa vào quán gõ lệnh này thì vào thẳng bàn đó |
| Comment “về” (“về nha”, “về thôi”, “đi về”) khi đang trong quán | Ra đầu hẻm lên xe về. Ai từng uống sinh tố lúa mạch thì bị công an chặn, đo nồng độ cồn, khuyên “Đã uống thì không lái xe!” và giữ xe. Còn món đang ra thì chờ nhận xong mới về |
| Comment “dô” (“dô dô”, “dzô”, “1 2 3 dô”), ai cũng gõ được | Mở hoặc góp vào lượt cụng ly: thanh đếm thay chỗ bảng hướng dẫn. Đủ số tiếng dô trong thời hạn thì “MỘT! HAI! BA! DÔ!!!”, cả quán giơ ly cụng. Mỗi người tính tối đa một tiếng mỗi 1,5 giây |
| Thả tim (tap màn hình) | Cứ đủ 100 tim (cộng dồn theo từng người) được 1 cốc sinh tố lúa mạch; không áp ưu đãi. Chỉnh `likes` trong config.json |

Thực đơn mặc định (sửa trong `config.json` → `menu`):

| Quà | Món |
|---|---|
| Hoa hồng (Rose) | 1 đĩa đậu phộng rang |
| Tim tay (Finger Heart) | 1 cốc sinh tố lúa mạch |
| Bánh donut (Doughnut) | 1 đĩa nem |
| Hộp quà (Gift Box) | 1 đĩa mực nướng |
| Galaxy | 1 nồi lẩu giữa bàn (Tí bưng mâm lớn, cả quán reo) |

Nhận diện khách bằng ID tài khoản (hai người trùng tên vẫn là hai nhân vật). Combo quà được trừ phần cộng dồn nên không tính lặp.

## Sự kiện

- **Cô Ba chơi lớn – mua 1 tặng 2** (60 giây): 1 quà = 3 phần.
- **Chiếc quạt số hên**: vòng quay chung cho cả quán, chọn một quà được chỉ định; các ô: gấp đôi, kèm đậu phộng, phần lớn, mua 1 tặng 2, mua 1 tặng 3 (tỉ lệ trong `wheel.slots`).
- **Bóng lăn, quán có lộc**: trận mô phỏng trên tivi (ghi rõ “trận mô phỏng trong game”), Chú Tư đoán trật; đội nhà thắng thì mở mua 1 tặng 3 trong 90 giây (1 quà = 4 phần).
- Chuyện trong quán: mưa kéo bạt, Mèo Mướp ghé bàn, Tí suýt giao nhầm, karaoke đầu hẻm, Chú Tư bình luận, xe máy chạy ngang.
- **Va chạm xe ngoài đường** (tự diễn ra mỗi 2 phút, dài 24 giây; chỉnh `crash.everySeconds`, `crash.seconds`, đặt `everySeconds` = 0 để tắt): hai xe tông nhẹ, cả quán bật dậy “Ồ! Hóng biến!”, hai người lái cãi nhau, công an hú còi tới giải quyết, hai bên bắt tay rồi ai đi đường nấy. Không ai bị thương; chế độ an toàn tạm dừng sự kiện này.
- **Dì Năm bán hàng rong** (tự ghé mỗi 2 phút rưỡi khi quán có khách; chỉnh `vendor.everySeconds`, đặt 0 để tắt; `vendor.maxTables` là số bàn tối đa dì ghé; `vendor.products` là danh sách món dì gánh, mỗi lần bốc một món): dì gánh hàng vào rao, Cô Ba mời bà con ủng hộ, rồi dì ghé lần lượt các bàn có khách (bàn gần cửa trước), mỗi bàn hỏi một người. Khách mua hay từ chối **tùy người**: đang ngà ngà sinh tố lúa mạch thì rộng rãi hơn, ai tặng quà nhiều (từ 3 quà) thì dễ mua hơn, bàn đã nhiều đồ ăn thì hay kêu “no rồi”. Khách mua thì vui mặt, hiện “+2 trái bắp luộc”; khách sộp mua 4 phần mời cả bàn, khách say mua 3 phần. Đây chỉ là cảnh vui, không cộng món lên bàn.
- **Một, hai, ba, dô!** (Cô Ba tự rủ mỗi 4 phút khi quán có khách; người xem gõ “dô” lúc nào cũng mở được lượt mới, trừ 45 giây nghỉ sau mỗi lượt): cần `toast.need` tiếng dô (mặc định 10) trong `toast.seconds` giây (30). Đủ thì cả quán đứng dậy cụng ly, bọt bay khắp bàn; thiếu thì Cô Ba hẹn lát làm lại. Đặt `toast.promptEveryMinutes` = 0 để Cô Ba thôi tự rủ.
- **Vợ tới kiếm** (khoảng mỗi `wife.everyMinutes` = 6 phút, chỉ chọn khách trên bàn không còn món và không có món đang chờ, ưu tiên người đã uống; ai kịp tặng quà gọi món trong lúc bị réo thì thoát): chị vợ mặc đồ bộ hoa, cầm dép xông vào réo tên, cả quán “Ối...”, khách năn nỉ “Cho ly cuối thôi mà...”. Tùy may rủi (`wife.spareChance` = 35% được tha): được ngồi tiếp “ly cuối”, hoặc bị **xách tai lôi về** (khách rời quán, cả quán cười, Chú Tư than “Vợ tui cũng y chang”). Khách bị lôi về gõ “vào” để quay lại.
- **Cúp điện** (khoảng mỗi `blackout.everyMinutes` = 9 phút, dài `blackout.seconds` = 14 giây, không cúp giữa trận bóng): đèn chập chờn rồi tắt phụt, cả quán “Ơ! Cúp điện rồi!”, Tí soi đèn pin quét quanh quán, Cô Ba thắp đèn cầy, vài khách bật đèn điện thoại. Có điện lại thì cả quán reo.
- **Animation nhỏ**: Tí trượt chân “Oái oái!” khi bưng món tới bàn có vũng nôn chưa lau xong; khách say từ 2 cốc ngồi im hơn 40 giây thì gục ngủ “z Z z” (comment là giật mình dậy); thiêu thân bay quanh bóng đèn, lá rơi lác đác; gọi mực nướng thì bếp than bùng lửa; đông đơn (từ 3 đơn chờ) thì Tí đổ mồ hôi và Cô Ba hối “Lẹ lên Tí ơi!”; quán từ 12 khách mà Tí đang rảnh thì có khách mới là Tí bưng chồng ghế nhựa ra (chỉ là hiệu ứng, không thêm chỗ).

## Giọng gọi tiểu nhị

Mỗi khi có người gọi món bằng quà, khách đó hô câu riêng của món (có bong bóng thoại trên đầu):

| Quà | Câu gọi |
|---|---|
| Hoa hồng | Tiểu nhị, 1 đậu phộng! |
| Tim tay | Tiểu nhị, 1 cốc! |
| Bánh donut | Tiểu nhị, 1 nem! |
| Hộp quà | Tiểu nhị, 1 mực! |
| Galaxy | Tiểu nhị, 1 lẩu! |

Khách gọi xong thì Tí đáp lại bằng `public/voice/co_ngay.mp3` (thay file này để đổi câu đáp). Mỗi lần gọi bốc ngẫu nhiên một trong 4 giọng trong `callVoices` (config.json), tốc độ đọc `callSpeed` (đang là 1.2; đổi số này rồi chạy lại script thì toàn bộ giọng được tạo lại theo tốc độ mới). Quà dồn dập thì không đọc chồng: đang đọc thì lượt sau chỉ hiện bong bóng. Món từ thả tim không gọi. Mở game với `?mute` thì không đọc.

Các giọng là file mp3 tạo sẵn trong `public/voice/` (5 câu × 4 giọng = 20 file, danh sách ở `manifest.json`), nên khi live **không tốn token Vbee**. Đổi câu (`call` trong `menu`) hoặc thêm giọng (`callVoices`) thì chạy:

```
node scripts/make-voices.mjs ../chua-online/.env
```

(đường dẫn tới file .env có `VBEE_TOKEN`, `VBEE_APP_ID`; bỏ trống thì đọc `.env` của nhau-online). Script chỉ tạo file còn thiếu; muốn tạo lại một câu đã có thì xóa file mp3 đó trước. Nếu thiếu file của món nào, game dùng `tieu-nhi.mp3` (“Tiểu nhị, mang đồ đến đây!”).

## Camera theo người tặng quà

Ai tặng quà gọi món thì camera zoom vào người đó, có viền sáng và chú thích “Tên · gọi …”, giữ tới khi Tí đặt món xuống bàn rồi thu về. Nhiều người tặng liên tục thì lần lượt từng người (mỗi người ngắn hơn, hàng chờ tối đa 6). Một người tặng dồn dập được giữ tối đa 12 giây. Bảng ưu đãi (dạng thu gọn), phiếu order và vòng quay vẫn hiện cố định khi đang zoom.

Quy tắc ưu đãi: chỉ một sự kiện lớn chạy tại một thời điểm (cái sau xếp hàng), không cộng dồn hệ số, ưu đãi chốt lúc nhận quà nên chờ phục vụ không mất quyền lợi, món tặng không sinh thêm món tặng.

Ca quán 20 phút tự chạy lịch trong `shift.schedule` (phút 3 mua 1 tặng 2, phút 5–8 vòng quay, phút 10 bóng đá, phút 14–15 một chuyện bất ngờ, phút 18 lời cuối ca). Đổi ca không xóa khách hay món.

## Ăn uống, say và cô lao công

- Khách có món trên bàn thì thỉnh thoảng gắp đũa ăn (nhai nhóp nhép) hoặc nâng cốc uống; vừa nhận bia thì nốc ngay một hơi ("Ực ực!").
- **Càng nhiều cốc sinh tố lúa mạch càng đỏ mặt**: má đỏ, mũi đỏ, mắt lim dim, người lắc lư, thỉnh thoảng nấc "hic!".
- **Uống tới cốc thứ 2** thì khoảng 4 giây sau khách nôn ọe (khách ngồi sau bàn nôn ra mặt bàn, khách đầu bàn quay ra ngoài nôn xuống đất), người cùng bàn kêu "Eo ơi!". **Cô lao công** đội nón lá phi từ đầu hẻm vào ("Trời ơi là trời!", có giọng đọc `public/voice/troi_oi_la_troi.mp3`), lau sạch rồi lại than **"Trời ơi là trời!"** (cũng có giọng đọc). Nhiều người nôn cùng lúc thì cô dọn lần lượt.
- Sau đó cứ thêm 2 cốc lại nôn tiếp (cốc 4, 6…). Mỗi người cách nhau tối thiểu 30 giây mới nôn lần nữa; combo nhiều cốc một lúc chỉ nôn một lần. Không uống thêm thì cứ 3 phút tỉnh bớt một cốc (mặt hồng lại dần).
- Chỉnh trong `config.json` → `drunk`: `vomitAtCup` (cốc thứ mấy thì nôn), `vomitDelaySeconds`, `cooldownSeconds`, `soberMinutes`. Chế độ an toàn không có cảnh nôn.

## Ra về và chú công an

- Khách trong quán **comment “về”** (hoặc “về nha”, “về thôi”, “đi về”, “ve”…) thì đứng dậy đi ra đầu hẻm, lên xe máy chạy về; Cô Ba dặn đi đường cẩn thận. Khách đang chờ ghế gõ “về” thì rời hàng chờ.
- **Ai từng uống sinh tố lúa mạch** (dù đã tỉnh) thì vừa lạng lách ra đường là bị hai chú công an hú còi chặn lại, đo nồng độ cồn (máy báo **CÓ CỒN!**), chú khuyên **“Đã uống thì không lái xe!”**, gắn biển **TẠM GIỮ** rồi chạy xe đó về phường; khách lủi thủi đi bộ về. Cả quán quay ra hóng, Chú Tư và Cô Ba nói theo.
- Còn món đang làm hoặc đang bưng ra thì chưa cho về (báo “Món đang ra, nhận xong rồi về nha!”) để không mất quà. Chế độ an toàn thì ai cũng về bình thường, không có cảnh công an.

## Bàn ghế và món trên bàn

- 6 bàn × 4 ghế = 24 khách. Quán đầy thì khách chờ ghế (hiện “Đang chờ ghế”).
- Món được thưởng thức dần theo `items.*.consumeSeconds`; số lượng lớn hiện nhãn ×N thay vì vẽ chồng.
- Khách im lặng `idleLeaveMinutes` phút **và** bàn đã hết món thì ra về; khi có người chờ ghế thì mốc này là `makeRoomIdleMinutes`. Khách còn món hoặc còn đơn đang chờ không bao giờ bị mời về.

## An toàn

- Bình luận hiển thị được cắt ngắn (`chat.maxLength`), bỏ link, ẩn nếu chứa từ trong `chat.bannedWords`.
- Cảnh báo kiểm duyệt TikTok tự bật **chế độ an toàn** (dừng sự kiện tự động, ẩn chữ bình luận) và báo Telegram nếu có `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` trong `.env`.
- Toàn bộ đồ ăn, đồ uống là vật phẩm trong game, không quy đổi thành tiền hay đồ thật; không có thi uống.
