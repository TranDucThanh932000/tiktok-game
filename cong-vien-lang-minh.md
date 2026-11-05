# KỊCH BẢN GAME CÔNG VIÊN LÀNG MÌNH

**"Cả xóm ơi, ra công viên!"**

Game tương tác trên TikTok LIVE, lấy cảm hứng từ không khí rủ nhau đi chơi công viên và dàn "nhân vật" lập dị trong các meme công viên trên mạng. Người xem xuất hiện thành dân xóm, vào một trong bốn hội và cùng hội thi những môn hài hước ở quảng trường.

Tài liệu này là kịch bản thiết kế, chưa phải phần triển khai. Mọi con số là đề xuất ban đầu, sẽ để trong `config.json` để chỉnh lại sau khi chạy thử.

---

## 1. CƠ CHẾ CỐT LÕI

Người xem chỉ cần nhớ:

> **Comment "đi" để ra công viên. Thả tim và comment để cổ vũ hội mình. Gửi quà để nhân vật thêm chất.**

| Hành động | Phản hồi trong game |
|---|---|
| Comment **đi** | Được xe máy chở tới cổng, tự vào hội đang ít người nhất |
| Comment **trà**, **dép**, **ghế** hoặc **cub** | Vào đúng hội đã chọn |
| Comment bất kỳ sau khi đã vào | Nhân vật hô cổ vũ, hội được +1 điểm (tối đa 1 lần mỗi 15 giây) |
| Thả 50 tim | Hội được +1 điểm |
| Follow hoặc share | Hội được +5 điểm (tính chung, mỗi người 1 lần mỗi phút) |
| Gửi quà | Hội được điểm, nhân vật nhận đúng món đồ của quà đó, camera quay cận |

### Nguyên tắc không đổi

1. **Không cần gửi quà vẫn chơi được, vẫn thắng được và vẫn được vinh danh.**
2. **Quà cho kết quả cố định:** mỗi quà luôn cho cùng số điểm và cùng món đồ. Không có tỉ lệ ẩn, không có món ngẫu nhiên.
3. **Vòng quay luôn miễn phí:** quà và tim không mua được lượt quay hay chọn được ô.
4. **Thi đấu bằng trò vui, không có bạo lực:** các hội chỉ thi kéo co, nhảy, hát và diễu hành.
5. **Sự kiện bất ngờ chỉ để gây cười:** không làm mất điểm, món đồ hay chỗ của ai.

---

## 2. NGUYÊN TẮC NỘI DUNG

Trend gốc có liên quan đến một địa điểm có thật và một vụ xô xát có thật, nên game chỉ giữ lại không khí vui.

### Không sử dụng

- Tên công viên có thật, địa danh có thật và hình ảnh của người có thật.
- Lời hoặc nhạc của bài hát trong trend. Nhạc trong game được tự tạo bằng code.
- Cảnh đánh nhau, vũ khí, thanh máu, tranh địa bàn hoặc từ ngữ kiểu giang hồ như "băng", "đại ca", "trùm", "xử".
- Đua xe, bốc đầu, nẹt pô. Xe máy chỉ chạy chậm, diễu hành và tài xế luôn đội mũ bảo hiểm.
- Rượu bia, thuốc lá và chất kích thích.
- Nội dung chê bai người không gửi quà, hoặc giễu cợt vùng miền và ngoại hình.

### Chữ và giọng đọc trên màn hình

- Tránh các từ "tặng quà", "đánh", "máu", như quy ước đang dùng ở `cau-ca`.
- Bong bóng thoại chỉ dùng câu có sẵn, không hiện nguyên văn comment của người xem.
- Biệt danh và danh hiệu đều lấy từ danh sách có sẵn, người xem không tự nhập được.

---

## 3. BỐI CẢNH VÀ NHÂN VẬT

### 3.1. Công viên

Một công viên xóm hư cấu, cũ nhưng đông vui: quảng trường lát gạch ở giữa, sân khấu nhỏ, ghế đá, cây bàng, xe nước mía, cổng sắt có tấm biển bạc màu "Công Viên Làng Mình", dây đèn màu và loa phường.

Đồ họa: **3D bằng Three.js, cùng phong cách với `cau-ca`**, màu tươi, nhân vật to và biểu cảm rõ. Khung hình dọc 1080×1920. Âm thanh và nhạc đều tạo bằng code, không dùng asset ngoài.

Phần 3D giữ giống `cau-ca`:

- **Góc máy:** bình thường là toàn cảnh quảng trường. Khi có quà, camera bay tới quay cận người đó rồi trở về, nhiều lượt chờ thì rút ngắn thời gian quay.
- **Bầu trời:** có ngày và đêm. Ban đêm dây đèn màu và đèn công viên sáng lên.
- **Thời tiết:** có nắng, mây, gió và mưa. Gió làm cây và cờ dây nghiêng, mưa làm sân ướt và là bối cảnh cho sự kiện "Mưa bất chợt".
- **Điều chỉnh:** có tham số `?cam=` để chỉnh góc máy và `?mute` để tắt tiếng.

### 3.2. Bốn hội

| Hội | Từ khóa | Màu | Tính cách trên màn hình |
|---|---|---|---|
| 🧊 Hội Trà Đá | `trà`, `tra` | Xanh lá | Ngồi đâu cũng bàn chuyện thế giới |
| 🩴 Hội Dép Tổ Ong | `dép`, `dep` | Xanh dương | Đi đâu cũng lẹp xẹp nhưng rất tự tin |
| 🪑 Hội Ghế Nhựa | `ghế`, `ghe` | Đỏ | Đi đâu cũng vác theo một cái ghế |
| 🛵 Hội Cub Cũ | `cub` | Vàng | Xe cũ nhưng lúc nào cũng lau bóng |

### 3.3. Nhân vật phụ

Tất cả đều hư cấu.

| Nhân vật | Vai trò |
|---|---|
| Bác Tám bảo vệ | Trọng tài bất đắc dĩ, lúc nào cũng cầm còi và rất nghiêm nhưng chẳng ai sợ |
| Cô Hai nước mía | Dẫn chuyện bằng loa cầm tay, nhớ rõ ai còn thiếu tiền ly nước tuần trước |
| Đại đội dưỡng sinh của cô Sáu | Bất ngờ kéo ra quảng trường tập thể dục |
| Con Ngỗng | Linh vật khó ở của công viên, thích rượt theo người đang đắc ý nhất |

---

## 4. LUỒNG TƯƠNG TÁC

### 4.1. Ra công viên

Người xem comment `đi`. Từ khóa chỉ có tác dụng khi comment **chỉ gồm đúng từ đó** (có dấu hoặc không dấu), để câu như "đi ngủ thôi" không kéo người vào game.

1. Xe máy chở nhân vật chạy tới cổng, thả xuống rồi chạy đi.
2. Nhân vật mặc áo màu hội, trên đầu có thẻ tên và avatar.
3. Nhân vật đi vào khu của hội mình trên quảng trường.
4. Giọng đọc chào tên, gộp lại nếu nhiều người vào cùng lúc.

> **Cô Hai:** "Lan Anh ra rồi nha bà con! Hội Dép Tổ Ong có thêm người!"

Mỗi tài khoản chỉ có một nhân vật, nhận diện bằng ID tài khoản. Hình dáng nhân vật được tạo từ ID nên lần sau quay lại vẫn giống như cũ.

### 4.2. Đổi hội

- Comment từ khóa của hội khác để đổi, chỉ có hiệu lực giữa hai trận và tối đa 1 lần mỗi 10 phút.
- Điểm đã góp vẫn thuộc hội cũ. Độ chất cá nhân vẫn giữ nguyên.

### 4.3. Rời đi và quay lại

- Quảng trường có tối đa 50 nhân vật. Khi đầy, người lâu nhất chưa tương tác sẽ đi về để nhường chỗ.
- Người không tương tác 2 phút cũng tự đi về.
- Độ chất, món đồ và hội được lưu lại. Người đó tương tác lại thì tự quay về công viên.
- Người chưa có nhân vật mà thả đủ tim, follow, share hoặc gửi quà thì được tự đưa vào, xếp vào hội ít người nhất. Comment khác của người chưa vào không tạo nhân vật.

---

## 5. MỘT TRẬN THI

Một trận kéo dài 2 phút và lặp lại liên tục khi công viên có người.

| Giai đoạn | Thời lượng | Diễn biến |
|---|---|---|
| Báo trước | 10 giây | Cô Hai gọi cả xóm vào vị trí |
| Vòng quay | 6 giây | Quay chọn môn thi, miễn phí và công khai |
| Giới thiệu | 4 giây | Bác Tám thổi còi, hiện tên môn và cách cổ vũ |
| Thi đấu | 60 giây | Bốn hội tích điểm, thanh điểm chạy theo thời gian thực |
| Nước rút | 15 giây cuối của phần thi | Viền màn hình nhấp nháy, tim được tính gấp đôi |
| Trao giải | 10 giây | Hội thắng ăn mừng, vinh danh hai người nổi bật |
| Nghỉ | 30 giây | Tự do đi lại, có thể xảy ra sự kiện bất ngờ |

### Xác định hội thắng

- Hội nhiều điểm nhất khi hết giờ sẽ thắng và nhận 1 cúp.
- Nếu bằng điểm, hội có nhiều người góp điểm hơn sẽ thắng. Nếu vẫn bằng thì cả hai cùng thắng.
- Quà nhận trước khi hết giờ vẫn được tính, dù camera quay cận sau đó.
- Cần ít nhất 2 hội có người góp điểm thì trận mới có cúp. Nếu không, trận đó là "thi cho vui" và không có thưởng thắng.

---

## 6. BỐN MÔN THI

Cả bốn môn dùng **chung một cách tính điểm**, chỉ khác hình ảnh. Người xem không phải học lại luật, và thêm môn mới không làm lệch cân bằng.

| Môn | Hình ảnh theo điểm | Bản đầu |
|---|---|---|
| 🪢 **Kéo co chữ thập** | Bốn hội kéo một nút dây giữa quảng trường, nút nghiêng về hội đang dẫn. Hội tụt lại thì té dúi dụi rồi đứng dậy | Có |
| 💃 **Nhảy quảng trường** | Hội càng nhiều điểm thì đội hình càng đông, động tác càng lớn | Có |
| 🎤 **Karaoke xóm** | Mỗi hội có một loa kẹo kéo, điểm càng cao loa càng to và càng rung | Sau |
| 🛵 **Diễu hành dàn xe** | Xe chạy chậm quanh quảng trường, điểm càng cao xe càng nhiều đèn và cờ | Sau |

### Đại Hội Công Viên

- Cả live thả đủ **3.000 tim** thì trận tới là Đại Hội, tiếp theo là đếm lại từ đầu.
- Đại Hội có phần thi dài 90 giây, cúp tính gấp đôi, thêm pháo hoa và nhạc riêng.
- Thanh tiến độ hiện ở phía trên màn hình.

---

## 7. ĐIỂM, QUÀ VÀ ĐỘ CHẤT

### 7.1. Điểm cho hội

| Nguồn | Điểm cho hội | Món đồ giữ đến hết live | Hiệu ứng |
|---|---|---|---|
| 50 tim | 1 (15 giây cuối: 2) | Không có | Tim bay lên từ khu của hội |
| Comment | 1, mỗi 15 giây | Không có | Bong bóng cổ vũ có sẵn |
| Follow hoặc share | 5, mỗi phút | Không có | Lời cảm ơn trên màn hình |
| 🌹 Hoa hồng (1 xu) | 2 | Kính râm | Quay cận ngắn, tạo dáng |
| 🫰 Bắn tim (5 xu) | 5 | Áo hoa màu hội | Quay cận, cả hội vỗ tay |
| 🐷 Heo may mắn (10 xu) | 10 | Xe Cub lau bóng, gắn đèn màu | Chạy chậm một vòng quanh quảng trường |
| 🎁 Hộp quà (100 xu) | 40 | Danh hiệu "Khách VIP của cô Hai" | Xe ba gác chở loa kẹo kéo vào giữa sân, cả công viên nhún theo, quay cận 5 giây |

- Mức điểm quà lấy từ bảng `damage` của sự kiện cá mập trong `cau-ca`, nên quà lớn không áp đảo theo đúng tỉ lệ xu.
- Quà khác được quy theo số xu, giống `otherGiftsByCoins` của `cau-ca`.
- Combo quà được gộp thành một lần quay cận, số điểm vẫn đủ.
- Khi nhiều quà xếp hàng, thời gian quay cận mỗi lượt được rút ngắn.

### 7.2. Giới hạn để không ai mua đứt trận thi

Trong một trận, 100 điểm đầu tiên từ quà của một người được tính đủ cho hội. Phần vượt chỉ tính 25% cho hội, nhưng người đó vẫn nhận đủ độ chất, món đồ và hiệu ứng.

Ví dụ một người chơi miễn phí trong 60 giây: 4 comment (4 điểm), 500 tim (10 điểm) và 1 lần share (5 điểm) được khoảng **19 điểm**, gần bằng 2 Heo may mắn. Đây là mốc cần kiểm tra lại khi chạy thử.

### 7.3. Độ chất cá nhân

Mỗi điểm góp cho hội đồng thời là 1 độ chất cho người đó, được tính trước khi áp dụng giới hạn ở mục 7.2. Thưởng cuối trận dành cho người có góp điểm trong trận:

| Thứ hạng hội | Thưởng độ chất |
|---|---|
| Nhất | +20 |
| Nhì | +10 |
| Còn lại | +5 |

| Độ chất | Danh hiệu | Hình ảnh thêm |
|---|---|---|
| 0 | Khách vãng lai | Áo màu hội |
| 50 | Dân xóm | Thẻ tên có viền |
| 200 | Chủ ghế đá | Mang theo ghế đá mini |
| 600 | Thổ địa công viên | Có đèn màu quanh thẻ tên |
| 1.500 | Huyền thoại xóm | Có người hâm mộ NPC đi theo |

### 7.4. Vinh danh cuối trận

- **Cổ vũ nhiệt nhất:** người có nhiều điểm nhất **chỉ tính tim, comment, follow và share**.
- **Góp sức nhất:** người có nhiều điểm nhất khi tính tất cả nguồn.

Hai danh hiệu giúp người chơi miễn phí luôn có cơ hội được gọi tên. Người góp điểm có thể nhận cả hai.

### 7.5. Bảng xếp hạng

- Bảng cá nhân theo độ chất, mỗi lần hiện một người với avatar to, tự chuyển sau 3 giây như `cau-ca`.
- Bảng cúp của bốn hội luôn hiện ở phía trên màn hình.
- Dữ liệu lưu ở `data/board.json`. Xóa bằng nút trên bảng điều khiển.

---

## 8. CHUYỆN BẤT NGỜ TRONG CÔNG VIÊN

Sự kiện xảy ra trong lúc nghỉ giữa hai trận, tối đa một sự kiện mỗi lần nghỉ, không có sự kiện nào lặp lại hai lần liền. Không cần người xem làm gì, và không ảnh hưởng đến điểm.

| Sự kiện | Diễn biến | Câu thoại |
|---|---|---|
| 🪿 Ngỗng nổi giận | Ngỗng rượt người vừa nhận danh hiệu chạy một vòng sân | **Cô Hai:** "Thắng thì khiêm tốn thôi con, ngỗng nó nhìn kìa!" |
| 📣 Bác Tám thổi còi | Bác đuổi cả xóm lùi ra sau vạch, ai cũng lùi rồi lại tràn vào | **Bác Tám:** "Lùi! Lùi nữa! Ủa sao đông hơn hồi nãy?" |
| 🧃 Cô Hai đòi tiền nước | Cô cầm sổ đi dọc sân, ai cũng giả vờ nhìn lên trời | **Cô Hai:** "Ly nước tuần trước đó nha, cô nhớ hết!" |
| 🤸 Đại đội dưỡng sinh | Cô Sáu dẫn đội ra giữa sân, dân xóm bị cuốn vào tập theo | **Cô Sáu:** "Hít vào! Thở ra! Ai cho nghỉ mà nghỉ!" |
| 🌧️ Mưa bất chợt | Cả xóm chen dưới một cây bàng, hết mưa thì về chỗ cũ | **Cô Hai:** "Chen vô đi, mưa chút xíu là tạnh!" |
| 🍦 Xe kem đi ngang | Xe kem phát nhạc, cả sân chạy theo một đoạn rồi quay lại | **Bác Tám:** "Về chỗ! Trận sắp bắt đầu rồi!" |

---

## 9. BỐ CỤC MÀN HÌNH 1080×1920

```text
┌──────────────────────────────┐
│ 🧊 12  🩴 9  🪑 7  🛵 11 (cúp) │  Điểm trận và cúp của 4 hội
│ Trận: Kéo co   ⏱ 00:42       │  Tên môn, đồng hồ
│ Đại Hội ▓▓▓▓░░ 1.840/3.000   │  Tiến độ Đại Hội
├──────────────────────────────┤
│        Bảng xếp hạng         │  Một người, tự chuyển 3 giây
│                              │
│                              │
│     QUẢNG TRƯỜNG + 4 KHU     │  Khu vực chính
│       (môn thi ở giữa)       │
│                              │
│                              │
├──────────────────────────────┤
│ Comment "đi" để ra công viên │  Dòng hướng dẫn
│ Bảng quà: 🌹 🫰 🐷 🎁        │  Ảnh quà và món tương ứng
└──────────────────────────────┘
```

Khu vực dưới cùng cần được chạy thử trên LIVE Studio, vì khung comment và các nút của TikTok có thể che mất phần này.

---

## 10. MỘT TÌNH HUỐNG CHƠI HOÀN CHỈNH

1. **Lan** comment `dép`. Xe máy chở Lan tới cổng, Lan đi vào khu Hội Dép Tổ Ong.
2. Vòng quay ra **Kéo co chữ thập**. Bác Tám thổi còi.
3. Lan thả 200 tim và comment "cố lên". Hội Dép được 4 + 1 = 5 điểm, nhân vật Lan hô một câu cổ vũ có sẵn.
4. **Nam** ở Hội Cub gửi 1 Heo may mắn. Hội Cub được 10 điểm, Nam nhận xe gắn đèn màu và chạy một vòng sân, camera quay cận.
5. Trong 15 giây cuối, tim được tính gấp đôi. Lan thả thêm 100 tim, Hội Dép được 4 điểm và vượt lên.
6. Hội Dép thắng, nhận 1 cúp. Lan được thưởng 20 độ chất và được gọi tên "Cổ vũ nhiệt nhất".
7. Trong lúc nghỉ, Con Ngỗng rượt Lan một vòng quanh sân. Điểm và danh hiệu của Lan vẫn giữ nguyên.

---

## 11. TRIỂN KHAI

### 11.1. Công nghệ

Dùng cùng công nghệ với `cau-ca`: Node/Express, `tiktok-live-connector`, SSE, Three.js, cửa sổ Edge `--app` cho LIVE Studio/OBS, và `panel.html` để giả lập. Thư mục `cong-vien-lang-minh/`, cổng **3007**.

### 11.2. Dùng lại từ `cau-ca`

| Phần | Vị trí trong `cau-ca` |
|---|---|
| Kết nối TikTok, chống tính trùng quà, cảnh báo Telegram, chế độ an toàn | `server.js` (`connectTikTok`, `GiftCounter`, `reportModeration`, `setSafeMode`) |
| Giọng đọc Vbee ghép mẩu | `src/voice.js` |
| Vòng quay | `src/wheel.js`, `public/js/wheel.js` |
| Nhân vật và hoạt ảnh, cần chỉnh lại | `public/js/fisher.js` |
| Trời, mưa, ngày và đêm | `src/sky.js`, `public/js/weather.js` |
| Hiệu ứng và âm thanh | `public/js/fx.js`, `public/js/epic.js`, `public/js/audio.js` |
| Bảng điều khiển | `public/panel.html` |

Động tác nhảy có thể tham khảo từ `dance-club`.

### 11.3. Phần làm mới

- `src/park.js`: người chơi, chỗ trên sân, hội, độ chất, món đồ.
- `src/contest.js`: vòng đời trận, tính điểm, giới hạn quà, hội thắng, danh hiệu.
- `public/js/park.js`: cảnh công viên.
- `public/js/contests/`: hình ảnh riêng của từng môn thi.
- `public/js/npc.js`: nhân vật phụ và sự kiện bất ngờ.

Logic điểm nằm hoàn toàn ở server và có `npm test`. Màn hình chỉ hiển thị trạng thái server gửi xuống.

### 11.4. Bảng điều khiển

- Giả lập comment, tim, follow, share và từng loại quà, phân biệt rõ với sự kiện thật.
- Bắt đầu hoặc dừng trận, chọn môn, bật Đại Hội.
- Kích hoạt từng sự kiện bất ngờ.
- Xem danh sách người chơi, điểm trận hiện tại, trạng thái kết nối TikTok.
- Xóa bảng xếp hạng và cúp.

### 11.5. Thứ tự làm

| Giai đoạn | Nội dung | Kết quả kiểm tra được |
|---|---|---|
| 1 | Server, tính điểm, trận thi, test logic | `npm test` đạt, giả lập được một trận trên `panel.html` |
| 2 | Cảnh công viên, nhân vật, xe máy chở tới, bốn hội | 50 nhân vật trên sân vẫn mượt |
| 3 | Kéo co, nhảy quảng trường, vòng quay, trao giải | Chơi đủ một trận từ đầu đến cuối |
| 4 | Quà, món đồ, quay cận, giọng đọc | Mỗi quà cho đúng điểm, món đồ và hiệu ứng |
| 5 | Sự kiện bất ngờ, Đại Hội, bảng xếp hạng | Chạy liên tục 1 giờ không lỗi |
| 6 | Karaoke, diễu hành | Thêm sau khi đã chạy LIVE thật |

---

## 12. TÌNH HUỐNG KIỂM TRA CỐT LÕI

| Tình huống | Kết quả cần đúng |
|---|---|
| Một tài khoản comment `đi` hai lần | Chỉ có một nhân vật; lần sau tính là comment cổ vũ |
| Comment "đi ngủ thôi" khi chưa vào | Không tạo nhân vật |
| Comment `đi` khi các hội lệch người | Vào hội ít người nhất |
| Comment `dép` lúc đang thi, khi đã ở hội khác | Chỉ đổi hội sau khi hết trận |
| Đổi hội lần 2 trong vòng 10 phút | Không đổi, vẫn tính là comment cổ vũ |
| Comment liên tục | Tối đa 1 điểm mỗi 15 giây |
| Thả 49 tim rồi thả thêm 1 | Đủ 50 tim mới được 1 điểm, số tim lẻ được giữ lại |
| Follow rồi share trong cùng một phút | Chỉ được tính 1 lần |
| Combo 10 hoa hồng có nhiều bản cập nhật | Đúng 20 điểm, một lần quay cận |
| Một người gửi quà được 200 điểm trong một trận | Hội nhận 100 + 25 = 125 điểm; người đó nhận đủ 200 độ chất |
| Quà nhận ở giây cuối, chưa kịp quay cận | Vẫn tính điểm cho trận đó |
| Hai hội bằng điểm và bằng số người góp | Cả hai cùng nhận cúp |
| Chỉ một hội có người góp điểm | Trận "thi cho vui", không có cúp |
| Sự kiện bất ngờ đang chạy thì tới giờ thi | Sự kiện kết thúc sớm và không làm mất điểm của ai |
| Mất kết nối TikTok rồi nối lại | Không tính lại quà cũ, màn hình báo đúng trạng thái |
| Tắt rồi mở lại server | Độ chất, cúp và bảng xếp hạng vẫn còn |

---

## 13. CÁC ĐIỂM CẦN CHỐT

1. **Tên quà thật:** đối chiếu tên và số xu với danh sách quà trên kênh khi chạy LIVE thật.
2. **Giới hạn quà:** mức 100 điểm và 25% ở mục 7.2 có thể cần chỉnh theo lượng quà thực tế.
3. **Cỏ ba lá:** bản này không dùng tỉ lệ ẩn nên không có vai trò riêng. Đề xuất tính như quà 1 xu.
4. **Món đồ:** đề xuất giữ đến hết live. Nếu lưu qua các buổi live thì người chơi cũ sẽ có nhiều đồ hơn người mới.
5. **Trend còn nóng hay không:** tên và bối cảnh không phụ thuộc trend, nên game vẫn dùng được khi trend nguội. Cần kiểm tra trên TikTok để quyết định có ưu tiên làm trước Hầm Vàng không.

---

## TINH THẦN CHUNG

> **"Ra công viên không cần lý do. Có hội là có bạn, có ngỗng là có chuyện!"**

Điều giữ người xem ở lại là cảm giác có một hội của mình để cổ vũ, được gọi tên trên live và luôn có chuyện buồn cười xảy ra. Quà làm nhân vật nổi bật hơn, còn niềm vui của cả xóm thì ai cũng có phần.
