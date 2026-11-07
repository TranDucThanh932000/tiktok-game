# KỊCH BẢN GAME TIKTOK LIVE — SÂN KHẤU CÓ DUYÊN

> **Thông điệp:** Khán giả góp lời chúc. Hai người giữ quyền quyết định.
>
> **Thể loại:** Game tương tác ghép đôi trên TikTok LIVE, có hai MC nam — nữ dẫn xuyên suốt.
>
> **Nhận diện:** Heo hồng đại diện hàng Nam; Cỏ ba lá đại diện hàng Nữ.
>
> Đây là kịch bản nguyên bản cho game, không sử dụng lời dẫn, nhân vật hay bộ nhận diện của một chương trình truyền hình có sẵn.

## 1. Ý tưởng tổng thể

Một sân khấu hẹn hò nhỏ nằm trong phiên LIVE. Phía trên là hai MC, hai ghế làm quen và bảng **ĐIỂM ĐẸP ĐÔI**. Phía dưới là khán đài có người ra vào liên tục.

- Người vào phòng xuất hiện dưới dạng nhân vật nhỏ, đi từ cửa vào khu khán giả.
- Người muốn tham gia hàng Nam gửi quà **Heo**.
- Người muốn tham gia hàng Nữ gửi quà **Cỏ ba lá**.
- Khi sân khấu trống và có đủ một người ở mỗi hàng, hệ thống mời ngay cặp tiếp theo lên.
- Hai MC giới thiệu, bắt chuyện, tung hứng và kết nối lời cổ vũ từ khán đài.
- Khán giả bình luận **“đẹp đôi”** để cộng điểm, hoặc gửi quà chúc mừng.
- Đến phần quyết định, hai người có đúng **10 giây** để bình luận **“đồng ý”** hoặc **“không đồng ý”**.
- Cả hai cùng đồng ý thì ghép đôi thành công trong game. Các trường hợp khác kết thúc nhẹ nhàng, không gây áp lực.
- Hai người trở lại khán đài; sân khấu đón cặp mới.

**Cách hiểu trong bản này:** “Lên Heo / lên Cỏ ba lá” là gửi hai loại quà đăng ký tương ứng, không phải chỉ gõ tên quà trong bình luận.

**Các mặc định của bản đề xuất:** Xếp hàng theo thứ tự đăng ký; mỗi lúc chỉ có một cặp trên sân khấu; được đổi lựa chọn trong 10 giây; tính lựa chọn hợp lệ mới nhất; điểm không chuyển sang cặp sau.

**Phạm vi:** Đây là kịch bản trải nghiệm, lời dẫn và quy tắc để lập trình game. Chưa phải phần mềm đã tích hợp TikTok hay hệ thống MC đã thu giọng.

**Bản triển khai hiện tại:** [Sân Khấu Có Duyên 3D](san-khau-co-duyen/README.md) đã có vòng game mô phỏng, nhân vật, bảng điều khiển và adapter TikTok/Vbee. Giọng thật và phiên LIVE vẫn cần cấu hình tài khoản, đối chiếu quà, đo độ trễ và kiểm thử trước vận hành; các mục kiểm tra LIVE dưới đây không tự coi là đã hoàn thành.

## 2. Thiết kế sân khấu

### 2.1. Bố cục hình ảnh

Ưu tiên bố cục dọc, chữ lớn, đọc được trên điện thoại. Vị trí cuối cùng phải kiểm tra trong giao diện LIVE để tránh bị bình luận và các nút TikTok che.

| Khu vực | Nội dung |
|---|---|
| Trên cùng | Tên chương trình, số thứ tự cặp, trạng thái hiện tại |
| Hai bên sân khấu | MC nam bên trái, MC nữ bên phải; nhân vật đang nói có chuyển động miệng và cử chỉ |
| Trung tâm | Ghế Nam có biểu tượng Heo; ghế Nữ có biểu tượng Cỏ ba lá; tên và avatar hai người |
| Giữa hai ghế | Trái tim trang trí, không phải thước đo cảm xúc thật |
| Bảng điểm | `ĐIỂM ĐẸP ĐÔI: {DIEM}` và hiệu ứng cộng điểm |
| Khu quyết định | Đồng hồ 10 giây; hai ô `Đang chọn / Đã chọn`; chỉ mở đáp án khi hết giờ |
| Bên dưới sân khấu | Lối vào, khán đài, các nhân vật người xem |
| Thẻ hướng dẫn | `Nam: Heo · Nữ: Cỏ ba lá · “đẹp đôi”: +1` |
| Thẻ quà cổ vũ | `Hoa hồng: 1 xu · Bắn tim: 5 xu · Hộp quà: 100 xu` sau khi xác minh danh mục quà |

Không dùng hai chiếc cân “nam cao điểm hơn nữ” hay bảng chấm ngoại hình. Điểm thuộc về **cả cặp**, không thuộc riêng một người.

### 2.2. Người xem bước vào khán đài

**Khi nhận được sự kiện một người vào phòng:**

1. Tạo nhân vật gắn với ID tài khoản và avatar được phép sử dụng.
2. Nhân vật bước từ cửa bên dưới vào khán đài, vẫy tay rồi tìm vị trí.
3. Hiện tên ngắn trong khoảng hai giây, sau đó thu gọn để không rối màn hình.
4. Người đó bình luận “đẹp đôi”: nhân vật vỗ tay hoặc giơ bảng cổ vũ.
5. Người đó tặng quà: hiệu ứng xuất phát từ khán đài hướng lên cặp đang nhận điểm.
6. Khi được gọi ghép đôi: chính nhân vật ấy đi lên cầu thang sân khấu, không tạo thêm một bản sao.
7. Kết thúc lượt: nhân vật trở lại khán đài.

Khi đông người, cho nhiều nhân vật vào song song và thu nhỏ đám đông ở hàng sau. MC chào theo nhóm, không phải đọc mọi tên. Một tài khoản chỉ có một nhân vật tại một thời điểm; sự kiện gửi lại không tạo thêm người.

**Giới hạn cần nói đúng:** Chỉ dựng người vào phòng từ các sự kiện mà kết nối LIVE thực sự cung cấp. Không giả định có thể lấy đầy đủ danh sách mọi người đang xem. Nếu kết nối không hỗ trợ sự kiện vào phòng, phải ghi rõ chế độ thay thế: nhân vật xuất hiện từ lần tương tác đầu tiên; không quảng cáo chế độ đó là “mọi người xem đều đã bước vào”.

Vào khán đài **không đồng nghĩa đăng ký hẹn hò**.

## 3. Hai MC và chất giọng

### 3.1. Nhân vật

Tên dưới đây là tên nhân vật đề xuất, không mô phỏng người dẫn chương trình có thật.

| | MC nam — Duy | MC nữ — Linh |
|---|---|---|
| Mã giọng Vbee đã chọn | `n_hanoi_male_bountintuc_news_vc` | `n_hanoi_female_quangcao02_advertise_vc` |
| Chất giọng | Ấm, rõ, vui vừa phải | Sáng, gần gũi, linh hoạt |
| Vai trò | Mở chuyện, giới thiệu người chơi, tạo tình huống | Bắt ý, trả miếng, dẫn vào quyết định |
| Điểm duyên | Hay tự trêu mình, đôi lúc làm bộ hồi hộp | Đỡ câu nhanh, thỉnh thoảng chủ động trêu để Duy đáp |
| Cách gọi nhau | “Linh”, “em” khi phù hợp | “Anh Duy”, “anh” khi phù hợp |
| Cách gọi người chơi | Tên hiển thị, “hai bạn”, “bạn” | Tên hiển thị, “hai bạn”, “bạn” |
| Không làm | Đùa về ngoại hình, thu nhập, tuổi tác hoặc chuyện riêng tư | Ép đồng ý, trách người từ chối hoặc so sánh hai người |

Heo và Cỏ là **biểu tượng hai hàng**, không phải biệt danh để bình phẩm cơ thể hay giới tính của người chơi.

Hai mã giọng Vbee trên được gán cố định theo MC khi tích hợp giọng đọc. Đây là lựa chọn giọng đã chốt, chưa phải xác nhận đã gọi API hay kiểm tra âm thanh thực tế.

### 3.2. Công thức đối đáp

Mỗi cụm dẫn có ba nhịp:

**Một người mở ý → người kia bắt đúng ý đó → đưa sự chú ý trở lại người chơi.**

Ví dụ:

**Duy:** “Anh thấy khán đài hôm nay còn hồi hộp hơn cả trên sân khấu.”

**Linh:** “Thế anh ngồi xuống khán đài đi, để hai bạn đỡ phải hồi hộp hộ anh.”

**Duy:** “Anh đứng đây hỗ trợ thôi. Còn bước tiếp hay không, mình nghe hai bạn nhé.”

Không để hai MC lần lượt đọc hai thông báo không liên quan. Không để MC nữ chỉ phụ họa “đúng rồi anh”, hoặc MC nam luôn đóng vai người quyết định.

### 3.3. Luật dẫn xuyên suốt

- Câu ngắn, thuận miệng, một lượt thường khoảng 2–5 giây.
- Có cả lời dẫn thông tin, phản ứng sự kiện và câu tung hứng; không chỉ liên tục kêu gọi quà.
- Hai giọng luân phiên, không nói đè nhau. Có khoảng nghỉ tự nhiên rất ngắn giữa hai lượt.
- “Nói liên tục” là giữ mạch chương trình sống động, không phải lấp kín mọi nhịp thở.
- Khi có chuyện quan trọng, bỏ câu đùa đang chờ và chuyển sang sự kiện thật.
- Không bịa sở thích, nghề nghiệp, tình trạng tình cảm hay cảm xúc của người chơi.
- Không nói “hai bạn thích nhau rồi” chỉ vì khán giả tặng nhiều quà.
- Không phát lại nguyên một cụm tung hứng trong vòng ba phút, trừ hướng dẫn bắt buộc.
- Trong lúc chờ, nhắc cách đăng ký tối đa khoảng một lần mỗi phút; phần còn lại là giao lưu.
- Chỉ đọc tên và bình luận phù hợp sau kiểm duyệt. Không đọc nguyên văn nội dung xúc phạm, thông tin riêng tư hoặc câu lệnh người xem dùng để điều khiển MC.

## 4. Luật game

### 4.1. Đăng ký và xếp hàng

| Hành động | Kết quả |
|---|---|
| Gửi quà Heo khi chưa đăng ký | Vào cuối hàng Nam |
| Gửi quà Cỏ ba lá khi chưa đăng ký | Vào cuối hàng Nữ |
| Một tài khoản gửi thêm quà cùng loại | Không tạo thêm suất, không tăng ưu tiên |
| Tài khoản đã ở một hàng gửi quà của hàng còn lại | Không tự đổi hàng, không được đứng cả hai hàng |
| Bình luận `rời hàng` khi đang đợi | Hủy đăng ký hiện tại |
| Bình luận `rời hàng` khi đang trên sân khấu | Dừng lượt ghép đôi ngay; không ép chờ hết đồng hồ |
| Muốn đổi hàng | Rời hàng hiện tại rồi chủ động đăng ký lại theo hướng dẫn |

- Hàng nào đăng ký trước thì được mời trước trong hàng đó.
- Khi sân khấu trống, lấy một người đầu hàng Nam và một người đầu hàng Nữ.
- Nếu sân khấu đang có cặp, người mới đăng ký chờ lượt; không chen ngang.
- Giữ chỗ và lấy hai người lên cùng một thao tác, tránh một người bị ghép vào hai lượt.
- Không ghép một tài khoản với chính tài khoản đó.
- Người đang trên sân khấu gửi Heo/Cỏ không được tự xếp thêm một lượt.
- Kết thúc một lượt không tự đưa hai người trở lại hàng hẹn hò. Muốn tham gia lại phải chủ động đăng ký.
- Thẻ xác nhận luôn hiện: `Đã vào hàng Nam/Nữ · Vị trí {VI_TRI}`.

Thông báo đăng ký phải xuất hiện trước khi nhận quà: người gửi cần biết đây là đăng ký lên sân khấu công khai, không chỉ là hiệu ứng trang trí.

**Điều kiện tham gia:** Người ghép đôi phải từ 18 tuổi và tự nguyện. Không suy ra tuổi hoặc giới tính từ avatar, giọng nói hay loại quà. Cần quy trình kiểm duyệt phù hợp; không coi một câu xác nhận là bằng chứng đã xác minh tuổi, và không yêu cầu công khai giấy tờ cá nhân trong bình luận.

### 4.2. Điểm đẹp đôi

**Công thức:**

```text
Điểm đẹp đôi của cặp
= số bình luận “đẹp đôi” hợp lệ
+ tổng số xu của quà được ghi nhận hợp lệ cho cặp.
```

| Tương tác | Điểm |
|---|---:|
| Một bình luận `đẹp đôi` | +1 |
| Hoa hồng, giá mục tiêu 1 xu/quà | +1 mỗi quà |
| Bắn tim, giá mục tiêu 5 xu/quà | +5 mỗi quà |
| Hộp quà, giá mục tiêu 100 xu/quà | +100 mỗi quà |
| Quà khác trị giá X xu | +X |
| Heo hoặc Cỏ ba lá gửi trong cửa nhận điểm của cặp | Cộng theo giá xu thực tế, đồng thời xử lý đăng ký nếu người gửi đủ điều kiện |

**Lưu ý về danh mục quà:** Ba mức 1/5/100 xu là bộ quà mục tiêu theo yêu cầu, không phải xác nhận giá TikTok hiện hành. Trước khi LIVE, phải đối chiếu đúng ID quà, tên và giá từ nguồn tích hợp đáng tin cậy. Giá Heo và Cỏ ba lá chưa được chốt trong bản này. Không tự gán giá, không dùng giá quy đổi tiền mặt và không hiển thị thẻ 5 xu cho một quà thực tế có giá khác.

**Cách tính bình luận:**

- Sau khi chuẩn hóa Unicode, chữ hoa/thường và khoảng trắng, nội dung phải khớp toàn bộ `đẹp đôi`.
- Một bình luận chứa `đẹp đôi đẹp đôi` không được tính thành hai điểm.
- Một tài khoản gửi nhiều bình luận riêng biệt hợp lệ thì mỗi bình luận vẫn +1, đúng yêu cầu.
- Không có giới hạn ngầm “mỗi người chỉ được một điểm”.
- Sự kiện của cùng một bình luận bị kết nối gửi lại chỉ tính một lần.
- Không khuyến khích spam; game chỉ xử lý những bình luận thực sự nhận được từ nền tảng.

**Cách tính quà và combo:**

- Quà 5 xu gửi ba cái thì tổng cộng +15.
- Nếu một combo được báo số lượng lũy kế `1 → 2 → 3`, mỗi lần chỉ cộng phần mới tăng: `+5, +5, +5`, không cộng `5 + 10 + 15`.
- Khử trùng theo ID sự kiện hoặc ID giao dịch/combo đúng với dữ liệu kết nối; không dùng tên hiển thị làm khóa.
- Quà chưa xác định được giá phải hiện trạng thái chờ xác minh và được ghi nhận để xử lý; không đoán giá, không âm thầm bỏ mất.

**Ví dụ minh họa:** 7 bình luận hợp lệ + 3 Hoa hồng + 2 Bắn tim + 1 Hộp quà = `7 + 3 + 10 + 100 = 120 điểm`.

### 4.3. Điểm thuộc về cặp nào?

- Mở cửa nhận điểm khi cặp được tạo và bắt đầu xuất hiện trên sân khấu.
- Nhận điểm suốt phần làm quen, quyết định và phần kết quả/chúc mừng.
- Đóng cửa nhận điểm khi hết phần kết quả, trước khi chuyển cặp.
- Quà đăng ký nhận được trước lúc cặp được tạo không được hồi tố thành điểm.
- Khi chưa có cặp, hiện rõ: `ĐANG CHỜ CẶP — TƯƠNG TÁC CHƯA CỘNG ĐIỂM CHO CẶP NÀO`.
- Nếu đang có cặp nhận điểm, Heo/Cỏ gửi lúc ấy có thể vừa đăng ký người gửi cho lượt sau, vừa cộng điểm cho cặp hiện tại. Thẻ hướng dẫn phải nói rõ điều này.
- Không dồn quà lúc trống sân khấu sang cặp tiếp theo.
- Mỗi sự kiện được gắn mã cặp tại lúc hệ thống tiếp nhận lần đầu; không đổi mã cặp do hoạt ảnh hoặc giọng đọc bị trễ.
- Với combo kéo dài qua hai lượt, giữ mã cặp từ lúc combo bắt đầu. Chỉ phần tăng nhận trong cửa điểm của cặp đó được tính; phần sau khi đóng cửa không chuyển sang cặp mới.
- Quà đã gắn cặp nhưng đang chờ xác minh giá chỉ được đối soát về đúng cặp đó, không cộng sang cặp đang diễn ra. Nếu còn khoản chờ, bảng tổng kết phải ghi `TẠM TÍNH`.

Điểm chỉ là mức cổ vũ của khán đài. **Không mua được sự đồng ý, không giúp chen hàng, không mở khóa lời từ chối và không đổi thành tiền thưởng.**

### 4.4. Quyết định trong 10 giây

1. MC đọc xong hướng dẫn trước khi bắt đầu tính giờ.
2. Hiện `BẮT ĐẦU`, phát tiếng chuông và mở cửa nhận quyết định cùng một thời điểm.
3. Chỉ nhận bình luận từ đúng hai ID tài khoản của cặp đang trên sân khấu.
4. Hai nội dung hợp lệ: `đồng ý` và `không đồng ý`.
5. Chuẩn hóa chữ hoa/thường, Unicode và khoảng trắng; sau đó so khớp toàn bộ câu. Không tìm riêng chuỗi `đồng ý` bên trong `không đồng ý`.
6. Được đổi ý bằng cách gửi lại trong cửa 10 giây. Lựa chọn hợp lệ mới nhất được tính; nếu cùng mốc thời gian thì theo thứ tự máy chủ tiếp nhận.
7. Khi một người đã trả lời, chỉ hiện `ĐÃ CHỌN`; chưa công khai họ chọn gì.
8. Chờ đủ 10 giây kể cả khi cả hai trả lời sớm. Không đóng sớm vì một người vừa từ chối.
9. Hết giờ thì khóa lựa chọn trước, sau đó mở đáp án đồng thời.
10. Bình luận trước lúc mở hoặc sau khi hết giờ không sửa kết quả; hiển thị phản hồi trạng thái rõ ràng.

| Nam | Nữ | Kết quả |
|---|---|---|
| Đồng ý | Đồng ý | **GHÉP ĐÔI THÀNH CÔNG** |
| Đồng ý | Không đồng ý | **CHƯA CÙNG NHỊP** |
| Không đồng ý | Đồng ý | **CHƯA CÙNG NHỊP** |
| Không đồng ý | Không đồng ý | **CHƯA CÙNG NHỊP** |
| Bất kỳ lựa chọn nào | Chưa trả lời | **CHƯA ĐỦ PHẢN HỒI** |
| Chưa trả lời | Bất kỳ lựa chọn nào | **CHƯA ĐỦ PHẢN HỒI** |

Im lặng không phải đồng ý và cũng không được MC diễn giải thành từ chối.

**Mốc thời gian kỹ thuật:** Dùng thời điểm máy chủ tiếp nhận: `bắt đầu ≤ thời điểm nhận < bắt đầu + 10 giây`. Lệnh đến đúng mốc đóng hoặc muộn hơn không hợp lệ. Đồng hồ không phụ thuộc giọng MC, tốc độ hoạt ảnh hay máy của người xem.

LIVE có độ trễ. Phải thử từ hai tài khoản xem thật đến hệ thống nhận bình luận trước khi đưa vào vận hành. Nếu độ trễ không cho phép trải nghiệm 10 giây sử dụng được, chưa đưa chế độ này lên LIVE; không âm thầm kéo dài cửa lệnh trong khi vẫn hiển thị 10 giây.

“Ghép đôi thành công” chỉ có nghĩa hai người đồng ý mở cơ hội làm quen trong game; không xác lập một mối quan hệ ngoài đời hoặc cho phép tự động chia sẻ liên hệ cá nhân.

## 5. Nhịp một vòng chơi

Một vòng dự kiến khoảng **80–95 giây**. Các phần dẫn có thể điều chỉnh theo tốc độ giọng; riêng phần quyết định luôn đúng **10 giây**.

| Phần | Thời lượng mục tiêu | Hình ảnh và hệ thống | Nhiệm vụ MC |
|---|---:|---|---|
| Mời lên sân khấu | 8–10 giây | Hai nhân vật bước lên ghế; mở điểm cặp | Gọi tên, tạo không khí |
| Làm quen | 20–25 giây | Hai avatar, tên, một câu hỏi nhẹ | Bắt chuyện, đỡ ngại |
| Khán đài cổ vũ | 12–15 giây | Điểm tăng, hoa và tim bay lên | Nối lời chúc, phản ứng sự kiện |
| Hướng dẫn quyết định | 10–15 giây | Phóng lớn hai câu trả lời hợp lệ | Nói rõ luật trước khi đếm |
| Quyết định | **10 giây** | Đồng hồ chạy; giấu đáp án | Giữ nhịp, không gây sức ép |
| Kết quả | 15 giây | Mở lựa chọn; chúc mừng hoặc kết nhẹ | Tôn trọng cả hai người |
| Chuyển cặp | 5 giây | Khóa điểm; đưa người về khán đài | Kết câu và gọi lượt sau |

Nếu hàng chờ đã đủ, bắt đầu ngay phần mời của cặp tiếp theo sau khi sân khấu được giải phóng. Không thêm thời gian chờ để kêu gọi quà.

## 6. Kịch bản mở phòng

**Hình:** Sân khấu sáng dần. Hai MC bước ra. Nhân vật người xem bắt đầu đi vào khán đài.

**Duy:** “Chào cả nhà đến với Sân khấu Có Duyên! Vào rồi thì tìm một chỗ ngồi nhé, biết đâu hôm nay mình lại được chứng kiến một cuộc làm quen dễ thương.”

**Linh:** “Anh Duy nói khán giả ngồi, còn anh cứ đi qua đi lại. Anh dẫn chương trình hay anh cũng đang chờ tới lượt?”

**Duy:** “Anh kiểm tra sân khấu thôi. Hai chiếc ghế đẹp thế này, phải nhường người có duyên chứ.”

**Linh:** “Vậy mình nói cách tham gia nhé. Bạn nào muốn vào hàng Nam thì gửi quà Heo; vào hàng Nữ thì gửi Cỏ ba lá.”

**Duy:** “Mình chỉ nhận người tham gia từ mười tám tuổi. Đã vào hàng thì cứ chờ đúng lượt, gửi thêm cũng không phải để chen lên đâu nhé.”

**Linh:** “Còn ai thích ngồi xem thì cứ ngồi cùng bọn mình. Không cần tặng quà mới được chung vui.”

**Duy:** “Thấy cặp nào dễ thương, cả nhà gõ đúng hai chữ ‘đẹp đôi’. Mỗi bình luận hợp lệ là thêm một điểm cho cặp ấy.”

**Linh:** “Quà chúc mừng thì bao nhiêu xu cộng bấy nhiêu điểm. Nhưng điểm là lời cổ vũ thôi, không chọn thay hai bạn được.”

**Duy:** “Đến phần quyết định, mỗi người có mười giây để gõ ‘đồng ý’ hoặc ‘không đồng ý’.”

**Linh:** “Cả hai cùng đồng ý thì mình chúc mừng. Chưa cùng ý thì vẫn vui vẻ, vì thành thật với nhau cũng là một điều đáng quý.”

**Duy:** “Luật rõ rồi, ghế cũng sẵn rồi.”

**Linh:** “Giờ chỉ còn chờ hai vị khách đầu tiên thôi!”

**Điều phối:** Nếu đã có đủ cặp, kết thúc câu đang nói rồi chuyển sang mời cặp. Không bắt người chơi đợi nghe hết phần chào phòng; các luật còn thiếu được giữ trên thẻ hướng dẫn và nhắc trước quyết định.

## 7. Kịch bản đầy đủ cho một cặp

Các biến `{TEN_NAM}`, `{TEN_NU}`, `{TEN_KHAN_GIA}`, `{DIEM}`, `{SO_CAP}` chỉ được điền từ dữ liệu thật, đã kiểm duyệt. Ví dụ tên và số dùng khi diễn thử không được phát thành thông tin của người đang chơi.

### Cảnh 1 — Đủ cặp, mời lên sân khấu

**Kích hoạt:** Sân khấu trống và hai hàng đều có người hợp lệ.

**Hình:** Chuông nhẹ. Bảng `CẶP SỐ {SO_CAP}`. Hai nhân vật rời khán đài, bước lên hai bục Heo và Cỏ.

**Duy:** “Bên Heo đã có người, bên Cỏ cũng vừa đủ. Mời {TEN_NAM} và {TEN_NU} lên sân khấu nào!”

**Linh:** “Khán đài mình nhường lối nhé. Hai bạn cứ thong thả, hồi hộp quá thì để anh Duy hồi hộp cùng.”

**Duy:** “Anh nhận phần đấy. Hai bạn chỉ cần thoải mái là được.”

### Cảnh 2 — Làm quen, tạo không khí

**Hình:** Hai ghế quay nhẹ về phía nhau, khoảng cách thoáng. Không tự tạo động tác nắm tay hoặc hôn.

**Linh:** “Hai bạn đang cùng ngồi đây rồi. Nếu muốn, mỗi người kể một điều mình thích trong một buổi gặp đầu tiên nhé.”

**Duy:** “Một chỗ dễ nói chuyện, hay một buổi đi dạo nhẹ nhàng chẳng hạn.”

**Linh:** “Anh đừng đưa đáp án sẵn, để hai bạn còn có chuyện kể chứ.”

**Duy:** “Được, anh cất ví dụ. Hôm nay anh phụ trách lắng nghe.”

**Nếu có bình luận trả lời phù hợp:**

**Linh:** “{TEN_NAM} vừa nhắc đến {Y_NGAN_DA_KIEM_DUYET}. Cảm ơn bạn đã chia sẻ nhé.”

**Duy:** “{TEN_NU} có muốn kể một ý của mình không? Không cần trả lời giống nhau đâu, mình đang làm quen mà.”

**Nếu chưa có ai trả lời:**

**Linh:** “Chưa nghĩ ra cũng không sao. Hai bạn cứ ngồi thoải mái, đây không phải phần thi vấn đáp.”

**Duy:** “May quá, thế anh cũng bớt căng thẳng. Mình nghe khán đài gửi lời chúc nhé.”

Phần chia sẻ là tùy chọn, không phải điều kiện được quyết định. Không kéo dài vòng vì chưa có câu trả lời, không tự bịa phản hồi cho người chơi.

### Cảnh 3 — Khán đài cổ vũ

**Duy:** “Cả nhà thấy hai bạn dễ thương thì gửi một lời ‘đẹp đôi’ nhé. Mỗi bình luận hợp lệ thêm một điểm cổ vũ.”

**Linh:** “Một câu chúc cũng đủ làm sân khấu vui rồi. Ai muốn gửi hoa thì cứ tùy lòng mình nhé.”

**Khi có điểm thật tăng:**

**Duy:** “Bảng điểm đang lên rồi, cặp mình đã có {DIEM} điểm đẹp đôi!”

**Linh:** “Khán đài nhiệt tình quá. Còn hai bạn cứ giữ nhịp của mình, không phải vội theo đâu.”

**Nếu chưa có tương tác:**

**Duy:** “Khán đài hôm nay nghe chăm chú ghê.”

**Linh:** “Có khi mọi người cũng đang hồi hộp đấy. Mình đừng làm hai bạn hồi hộp thêm, anh nhé.”

Không dùng nhánh “điểm đang lên” nếu chưa có sự kiện tương ứng.

### Cảnh 4 — Hướng dẫn trước khi mở 10 giây

**Hình:** Thu gọn hiệu ứng quà. Hai lựa chọn xuất hiện lớn. Đồng hồ đang ở trạng thái `CHUẨN BỊ`, chưa chạy.

**Duy:** “Đến lượt hai bạn chọn rồi. Khi tiếng chuông vang lên, hãy gõ ‘đồng ý’ hoặc ‘không đồng ý’ trong mười giây.”

**Linh:** “Muốn đổi ý thì gửi lại trước khi hết giờ nhé. Mình nhận lựa chọn cuối cùng của mỗi bạn.”

**Chữ phụ:** `Chỉ nhận từ hai tài khoản trên sân khấu · Chưa công khai lựa chọn trước hết giờ`.

### Cảnh 5 — Cửa quyết định đúng 10 giây

Đây là lịch phát mục tiêu. Phải đo độ dài giọng thực tế trước khi dùng; không để câu trước lấn vào mốc đếm tiếp theo.

| Mốc từ lúc mở cửa | Người nói | Lời thoại / hành động |
|---:|---|---|
| 0 giây | Hệ thống + Duy | Hiện `BẮT ĐẦU`, mở cửa nhận lệnh. Duy: “Mười giây, bắt đầu!” |
| Khoảng 2 giây | Linh | “Hai bạn cứ chọn theo lòng mình nhé.” |
| Khoảng 4,5 giây | Duy | “Khán đài cùng chờ câu trả lời nào.” |
| 7 giây | Linh | “Ba.” |
| 8 giây | Duy | “Hai.” |
| 9 giây | Linh | “Một.” |
| 10 giây | Hệ thống + Duy | Khóa lựa chọn đúng hạn. Duy: “Hết giờ!” |

Trong cửa này, không chèn đọc tên người tặng quà hoặc chào người mới. Nhân vật khán giả và bảng điểm vẫn hoạt động, nhưng hiệu ứng phải nhẹ để nhìn rõ hướng dẫn.

### Cảnh 6A — Cả hai đồng ý

**Hình:** Mở đồng thời hai ô `ĐỒNG Ý`. Dải sáng nối hai ghế. Tim và hoa bay lên. Nhân vật vỗ tay, không tự diễn hành động thân mật.

**Duy:** “Cả hai đều đồng ý! Chúc mừng {TEN_NAM} và {TEN_NU}!”

**Linh:** “Vậy là mình có một cơ hội làm quen rồi. Cảm ơn hai bạn đã cùng mở lời nhé.”

**Duy:** “Anh xin góp một tràng pháo tay.”

**Linh:** “Lần này em đồng ý với anh ngay. Cả nhà cùng chúc hai bạn nói chuyện thật vui nào!”

**Hình:** Giữ sân khấu chúc mừng đến hết phần kết quả 15 giây. Điểm vẫn nhận trong phần này; không kéo dài thêm theo lượng quà.

**Cuối phần kết quả:** Khóa điểm, tạo thẻ kỷ niệm gồm tên hiển thị, số cặp và tổng điểm. Nếu còn quà chờ xác minh giá, gắn nhãn `TẠM TÍNH`.

### Cảnh 6B — Có người chọn không đồng ý

**Hình:** Mở lựa chọn cùng lúc. Ánh sáng trở về màu ấm. Hiện `CHƯA CÙNG NHỊP`. Không có tiếng còi sai, tiếng cười chế nhạo hoặc ghế rơi.

**Linh:** “Lần này hai bạn chưa cùng lựa chọn. Cảm ơn cả hai đã nói thật lòng nhé.”

**Duy:** “Mình có một cuộc gặp ngắn thôi, chưa hợp cũng là chuyện bình thường.”

**Linh:** “Cả nhà vẫn gửi hai bạn một lời chúc tử tế nhé.”

**Duy:** “Cảm ơn {TEN_NAM} và {TEN_NU}. Mời hai bạn trở lại khán đài, chung vui cùng mọi người.”

Không truy hỏi “vì sao không đồng ý”, không gọi tên một người để trách và không dùng số điểm làm lý do thuyết phục lại.

### Cảnh 6C — Thiếu phản hồi khi hết giờ

**Hình:** Người chưa có câu trả lời hiện `CHƯA PHẢN HỒI`. Bảng kết quả `CHƯA ĐỦ PHẢN HỒI`, không ghi thành “từ chối”.

**Duy:** “Mình chưa nhận đủ hai câu trả lời trong thời gian quy định.”

**Linh:** “Vậy lượt này chưa thể ghép đôi. Bọn mình không đoán thay lựa chọn của hai bạn nhé.”

**Duy:** “Cảm ơn hai bạn đã tham gia. Mình cùng trở lại khán đài nào.”

### Cảnh 7 — Chuyển cặp

**Hình:** Đóng cửa điểm của cặp cũ. Lưu kết quả. Hai nhân vật xuống khán đài. Chỉ đặt điểm về 0 khi tạo cặp mới.

**Nếu đã có cặp tiếp theo:**

**Linh:** “Sân khấu vừa trống là hàng chờ đã đủ hai bạn tiếp theo rồi.”

**Duy:** “Mình tiếp tục nhé. Mời cặp số {SO_CAP_MOI}!”

**Nếu chưa đủ:**

**Linh:** “Mình nghỉ một nhịp để đón thêm người bạn tiếp theo.”

**Duy:** “Cả nhà cứ ngồi chơi. Khi hai hàng đủ người, bọn mình mời lên ngay.”

## 8. Kho đối đáp theo sự kiện

Các cụm dưới đây dùng để biến đổi nhịp dẫn, không đọc nối thành một bài dài. Chỉ chọn cụm phù hợp trạng thái thật.

### 8.1. Người mới bước vào phòng

**Duy:** “Chào {TEN_KHAN_GIA}, mời bạn vào khán đài nhé!”

**Linh:** “Vừa kịp lúc đấy. Ngồi xem cùng bọn mình, thấy vui thì góp một lời chúc.”

**Biến thể khi nhiều người cùng vào:**

**Linh:** “Khán đài vừa đón thêm một nhóm bạn mới. Chào cả nhà!”

**Duy:** “Mình vào từ từ nhé, chỗ ngồi đang được xếp thêm đây.”

Không thông báo số người mới nếu hệ thống không có số liệu đáng tin cậy.

### 8.2. Chưa có người đăng ký

**Cụm A**

**Duy:** “Hai chiếc ghế này anh chuẩn bị ngay ngắn từ đầu giờ rồi.”

**Linh:** “Ghế sẵn sàng rồi, anh cũng sẵn sàng rồi. Mình cứ thong thả chờ người muốn làm quen nhé.”

**Cụm B**

**Linh:** “Anh Duy có bí quyết bắt chuyện nào không?”

**Duy:** “Có chứ. Chào một câu thật tử tế, rồi nhớ nghe người ta trả lời.”

**Cụm C**

**Duy:** “Hôm nay ai chỉ muốn ngồi xem thì cứ ngồi xem nhé.”

**Linh:** “Đúng rồi. Làm khán giả dễ thương cũng là góp phần cho chương trình vui mà.”

### 8.3. Hàng Nam đã có người, đang chờ hàng Nữ

**Cụm A**

**Duy:** “Hàng Nam đã có bạn đăng ký. Mình đang chờ thêm một bạn vào hàng Nữ.”

**Linh:** “Ai muốn tham gia thì gửi Cỏ ba lá nhé. Còn chưa sẵn sàng, cứ xem cùng bọn mình.”

**Cụm B**

**Linh:** “Một bên đã sẵn sàng rồi, bên còn lại mình cứ chờ đúng người muốn lên.”

**Duy:** “Chuẩn, đủ hai người tự nguyện thì sân khấu mới vui.”

### 8.4. Hàng Nữ đã có người, đang chờ hàng Nam

**Cụm A**

**Linh:** “Hàng Nữ đã có bạn đăng ký rồi. Bên Nam, ai muốn làm quen thì có thể gửi Heo nhé.”

**Duy:** “Đăng ký xong mình hiện vị trí ngay, cả nhà không phải đoán đang tới ai.”

**Cụm B**

**Duy:** “Mình còn chờ thêm một bạn ở hàng Nam.”

**Linh:** “Trong lúc chờ, khán đài cứ trò chuyện. Có đủ cặp là mình lên sân khấu ngay.”

### 8.5. Nhận Hoa hồng

**Hình:** Hoa từ khán đài bay lên, hiện `+1` cho mỗi quà 1 xu đã xác minh.

**Duy:** “Một bông hồng từ {TEN_KHAN_GIA}. Cảm ơn lời chúc của bạn!”

**Linh:** “Bông hoa nhỏ thôi mà sân khấu tươi hẳn lên.”

### 8.6. Nhận Bắn tim

**Hình:** Tim bay về giữa hai ghế, hiện số điểm tăng thực tế.

**Linh:** “Có một lượt Bắn tim gửi tới hai bạn này!”

**Duy:** “Tim bay lên sân khấu, lời cảm ơn gửi về khán đài nhé.”

### 8.7. Nhận Hộp quà

**Hình:** Hộp quà mở thành hoa giấy, hiện `+100` nếu sự kiện đúng quà 100 xu.

**Duy:** “Cảm ơn {TEN_KHAN_GIA} đã gửi Hộp quà chúc mừng cặp mình!”

**Linh:** “Mình nhận lời chúc thật vui. Còn lựa chọn thì vẫn để hai bạn tự nhiên nhé.”

### 8.8. Nhận quà khác

**Duy:** “Cảm ơn món quà {TEN_QUA} từ {TEN_KHAN_GIA}!”

**Linh:** “Lời chúc đã lên sân khấu rồi nhé.”

Tên quà chỉ đọc khi đã ánh xạ đúng danh mục. Khi nhiều quà cùng lúc, cảm ơn theo nhóm; điểm vẫn cộng đầy đủ từng sự kiện hợp lệ.

### 8.9. Nhiều bình luận “đẹp đôi”

**Linh:** “Khán đài đang gửi nhiều lời ‘đẹp đôi’ quá!”

**Duy:** “Mình nhận đủ từng lời chúc nhé. Hai bạn cứ thoải mái, không cần chọn theo số đông.”

Không đọc mỗi lần tăng một điểm. Gom hoạt ảnh trong khoảng ngắn để dễ nhìn nhưng không gom mất điểm.

### 8.10. Vượt mốc điểm

Các mốc đề xuất: **100, 500, 1.000 điểm**. Mỗi mốc chỉ thông báo một lần trong một cặp.

**Duy:** “Cặp mình vừa qua mốc {MOC_DIEM} điểm đẹp đôi!”

**Linh:** “Cảm ơn khán đài đã chung vui với hai bạn.”

Vượt nhiều mốc bằng một quà thì chỉ đọc mốc cao nhất. Không mở thêm thời gian quyết định, quyền lợi hoặc cơ hội ghép đôi vì đạt mốc.

### 8.11. Hai MC đổi vai tung hứng

**Cụm A**

**Linh:** “Em vừa nghĩ ra một lời chào rất hay.”

**Duy:** “Em nói thử xem.”

**Linh:** “Chào bạn. Hôm nay bạn thế nào?”

**Duy:** “Ừ, đôi khi một câu đơn giản lại dễ bắt đầu nhất.”

**Cụm B**

**Duy:** “Anh dẫn được một lúc mà quên mất mình đang đứng.”

**Linh:** “Ghế dưới khán đài còn đấy, nhưng anh ngồi xuống là em phải dẫn hai vai.”

**Duy:** “Thế anh đứng tiếp. Đồng nghiệp có duyên thì phải giữ.”

**Cụm C**

**Linh:** “Làm quen thì anh sợ nhất điều gì?”

**Duy:** “Mình hỏi một câu, rồi mình nói luôn cả phần trả lời.”

**Linh:** “Vậy câu tiếp theo anh nhớ chừa phần cho người ta nhé.”

Các cụm trò chuyện giữa MC chỉ dùng khi chờ hoặc làm cầu nối. Khi người chơi đang chia sẻ, không giành sự chú ý về MC.

## 9. Điều phối MC tự động

### 9.1. Luồng trạng thái

```text
CHỜ ĐỦ CẶP
    → MỜI LÊN
    → LÀM QUEN
    → CỔ VŨ
    → HƯỚNG DẪN
    → QUYẾT ĐỊNH 10 GIÂY
    → KẾT QUẢ
    → KHÓA ĐIỂM VÀ CHUYỂN CẶP
    → CHỜ ĐỦ CẶP / MỜI CẶP TIẾP
```

Mỗi cặp có mã riêng, hai ID người chơi, trạng thái, điểm, lựa chọn mới nhất của từng người và các mốc thời gian. MC đọc từ trạng thái này, không tự suy luận kết quả từ nội dung chat chung.

### 9.2. Thứ tự ưu tiên lời dẫn

1. Dừng khẩn cấp, người chơi rút lui hoặc lỗi khiến lượt không còn hợp lệ.
2. Hướng dẫn, mở/đóng cửa 10 giây và công bố kết quả.
3. Mời cặp, chuyển cặp.
4. Phản hồi chia sẻ phù hợp của hai người đang chơi.
5. Mốc điểm và lời cảm ơn quà.
6. Chào người mới, thông báo hàng chờ.
7. Kho tung hứng lúc trống.

- Mỗi lúc chỉ phát một giọng. Câu tung hứng được xếp theo cặp thoại, không bốc ngẫu nhiên từng câu rời.
- Hướng dẫn trước quyết định phải được phát xong rồi mới mở đồng hồ.
- Câu thuộc cặp cũ hết hiệu lực khi chuyển cặp; không phát lời chúc mừng cũ lên hình cặp mới.
- Các sự kiện quà hoặc vào phòng đến dồn dập được gom lời cảm ơn theo đợt, không làm dài vòng.
- Câu có `{DIEM}` lấy số mới nhất lúc bắt đầu phát; không dùng số cũ trong hàng đợi lời thoại.
- Kết quả và thời hạn do hệ thống game quyết định. Nếu dùng AI viết biến thể lời dẫn, AI chỉ diễn đạt dữ liệu đã khóa, không được sửa điểm, chọn người hoặc kéo giờ.
- Tiếng đếm, hướng dẫn và các nhánh kết quả nên có bản thu sẵn để không lệ thuộc thời gian sinh giọng.
- Nhạc nền và âm thanh quà phải hạ khi MC nói; hiệu ứng không che tên, lựa chọn và đồng hồ.

## 10. Tình huống đặc biệt

| Tình huống | Xử lý game | Cách MC phản ứng |
|---|---|---|
| Người xem ngoài cặp gõ “đồng ý” | Không thay lựa chọn của cặp | Không đọc thành đáp án; giữ thông báo chỉ nhận hai tài khoản trên sân khấu |
| Người chơi gõ “không đồng ý” | Ghi đúng lựa chọn không đồng ý nếu trong hạn | Không diễn giải là đồng ý do trùng một phần chữ |
| Người chơi đổi từ đồng ý sang không đồng ý trước hết giờ | Ghi lựa chọn mới nhất | Chỉ hiện “Đã chọn”; chưa nói nội dung lựa chọn |
| Cả hai trả lời ở giây thứ ba | Vẫn đợi hết đủ 10 giây | Dẫn theo lịch, không mở đáp án sớm |
| Bình luận tới muộn | Không sửa kết quả | Thẻ trạng thái: “Đã hết thời gian nhận lựa chọn” |
| Một người không trả lời | Kết quả “Chưa đủ phản hồi” | Không nói người đó đã từ chối |
| Một người chủ động rút lui | Hủy khả năng ghép đôi ngay, đóng nhận điểm và chuyển sang kết nhẹ | “Bạn đã chọn dừng lượt này. Mình tôn trọng lựa chọn của bạn nhé.” |
| Cả hai không đồng ý | Kết thúc bình thường | Không dùng âm thanh thất bại hoặc hỏi lý do |
| Được nhiều quà nhưng có người không đồng ý | Giữ nguyên kết quả | “Lời chúc của khán đài vẫn rất quý. Còn lựa chọn là của hai bạn.” |
| Gửi Heo/Cỏ nhiều lần | Một suất đăng ký; xử lý điểm quà theo cửa điểm hiện tại | “Vị trí của bạn đã được ghi nhận rồi nhé.” |
| Sự kiện bình luận hoặc quà bị gửi lại | Khử trùng; combo chỉ tính phần tăng | Không phát lại thông báo như một tương tác mới |
| Quà chưa có giá đáng tin cậy | Gắn mã cặp, đánh dấu chờ xác minh, cảnh báo vận hành | Không đọc một số điểm tự đoán |
| Hàng chờ dài | Giữ thứ tự, hiện vị trí; cho phép rời hàng | “Mình đi lần lượt, không ai cần gửi thêm để giữ chỗ.” |
| Không có dữ liệu chắc chắn người chơi đã rời LIVE | Không suy đoán chỉ từ việc im lặng | Chờ đúng cửa phản hồi; dùng nhánh thiếu phản hồi khi cần |
| Kết nối nhận tương tác bị lỗi trong lượt | Tạm dừng chương trình, hủy lượt lỗi, không công bố từ chối; đánh dấu điểm chưa đối soát | “Kết nối đang gián đoạn, mình tạm dừng để không ghi sai lựa chọn của hai bạn.” |
| Kết nối phục hồi | Chỉ mở lại lượt sau khi kiểm tra nhận sự kiện; giữ quyền tham gia cho cặp bị ảnh hưởng, không đòi tặng lại quà | Mời hai người xác nhận vẫn muốn tiếp tục rồi mở lượt mới với cửa 10 giây mới |
| Giọng MC gặp lỗi nhưng dữ liệu game còn hoạt động | Dùng bản thu dự phòng; không tự thay đổi đồng hồ | Hiện trạng thái rõ, không dựng lời giả về kết quả |
| Phát hiện người tham gia chưa đủ tuổi hoặc nội dung quấy rối | Moderator dừng/loại đăng ký theo quy định; không ghép tiếp | Nói ngắn gọn, không công khai thông tin riêng tư hoặc biến thành màn trêu chọc |

Các quà và quyết định của lượt bị lỗi không tự chuyển sang lượt mở lại. Điểm cũ được giữ trong bản ghi lượt lỗi để đối soát; không hứa hoàn tiền vì việc hoàn quà không do kịch bản game quyết định.

## 11. Checklist trước khi đưa lên LIVE

### Trải nghiệm

- [ ] Có đúng hai MC nam — nữ, nghe phân biệt rõ; các câu đối đáp thật sự nối ý nhau.
- [ ] Có lời dẫn phù hợp khi phòng vắng, khi thiếu một bên và khi liên tục đủ cặp.
- [ ] Sân khấu chỉ có một cặp; đủ hai hàng thì tiến hành lượt tiếp theo, không câu giờ chờ quà.
- [ ] Người mới có hoạt cảnh bước vào từ sự kiện hỗ trợ thực tế; không tự đưa họ vào hàng hẹn hò.
- [ ] Thẻ đăng ký, tổng điểm và đồng hồ đọc được trên màn hình điện thoại.
- [ ] Không bịa người xem, điểm số, món quà, lời trả lời hoặc cảm xúc người chơi.

### Điểm và quà

- [ ] Đối chiếu ID/giá Heo, Cỏ ba lá và bộ quà Hoa hồng 1 xu, Bắn tim 5 xu, Hộp quà 100 xu.
- [ ] 10 bình luận “đẹp đôi” riêng biệt từ cùng một người tạo đúng 10 điểm.
- [ ] Phát lại cùng một sự kiện bình luận không làm tăng điểm.
- [ ] Combo quà 5 xu với số lượng lũy kế 1, 2, 3 tạo tổng đúng 15 điểm.
- [ ] Ví dụ 7 bình luận + 3 Hoa hồng + 2 Bắn tim + 1 Hộp quà tạo đúng 120 điểm khi giá quà khớp cấu hình.
- [ ] Quà Heo/Cỏ vừa đăng ký vừa tính điểm đúng cặp hiện tại; không tạo nhiều suất.
- [ ] Quà lúc chưa có cặp không được cộng ngầm sang cặp sau.
- [ ] Combo, hoạt ảnh và lời cảm ơn đến trễ không ghi điểm hoặc gọi nhầm cặp.
- [ ] Quà thiếu giá có trạng thái chờ và đường đối soát; bảng chưa đủ dữ liệu không ghi là tổng cuối cùng.

### Quyết định và an toàn

- [ ] Đúng ID người chơi mới có quyền trả lời; trùng tên hiển thị không giả được quyền.
- [ ] “Không đồng ý” không bao giờ bị nhận thành “đồng ý”.
- [ ] Lựa chọn mới nhất trước hạn được dùng; lựa chọn sau hạn bị từ chối rõ ràng.
- [ ] Cửa nhận lệnh đóng chính xác sau 10 giây, kể cả khi MC hoặc hoạt ảnh bị chậm.
- [ ] Cả hai trả lời sớm vẫn không công bố trước hạn.
- [ ] Đã thử toàn bộ các nhánh: cả hai đồng ý, một người không đồng ý, cả hai không đồng ý, thiếu phản hồi.
- [ ] Điểm cao hoặc quà lớn không làm thay đổi kết quả.
- [ ] Đã thử độ trễ thực tế bằng hai tài khoản người xem.
- [ ] Có cơ chế rút lui, kiểm duyệt, xử lý người chưa đủ tuổi và dừng khi mất kết nối.
- [ ] Không tự công bố số điện thoại, địa chỉ, liên hệ riêng hoặc chuyển người chơi sang trò chuyện riêng.
- [ ] Đã đo thời lượng giọng cho chuỗi đếm; không chỉ dựa vào ước lượng câu chữ.

## 12. Câu chốt tinh thần chương trình

**Duy:** “Có duyên thì mình mở một lời chào.”

**Linh:** “Còn có bước tiếp hay không, mình để hai người tự chọn.”

**Cùng thông điệp trên màn hình:** **CỔ VŨ THẬT VUI — LỰA CHỌN THẬT LÒNG.**
