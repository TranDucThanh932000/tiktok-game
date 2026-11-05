# PROJECT: THẢ VỊT – TIKTOK LIVE INTERACTIVE RACING GAME

## 1. VAI TRÒ

Bạn là Senior Game Developer, chuyên phát triển real-time interactive games, 2D game rendering, event-driven architecture và tích hợp TikTok LIVE.

Hãy phát triển một game có tên **THẢ VỊT – ĐẠI CHIẾN DÒNG SÔNG**.

Đây là game tương tác trực tiếp trên TikTok LIVE.

Người xem không cần truy cập website, không cần đăng nhập vào ứng dụng riêng và không cần tải game.

Toàn bộ game được chạy trên máy tính của streamer và hiển thị trực tiếp trong livestream thông qua OBS hoặc phần mềm phát trực tiếp tương đương.

Người xem tương tác bằng:
- Like.
- Comment.
- Share.
- Gift.

Các hành động này sẽ điều khiển những chú vịt xuất hiện trên màn hình livestream.

**Yêu cầu: Hãy xây dựng game thực sự có thể chạy, có gameplay, animation, xử lý sự kiện và quản lý trạng thái. Không được chỉ tạo UI mockup.**

---

# 2. Ý TƯỞNG TỔNG QUAN

Game mô phỏng một cuộc đua vịt trên dòng sông.

Mỗi người xem TikTok khi tương tác hợp lệ sẽ được tạo một chú vịt riêng.

Mỗi chú vịt có:
- Username TikTok.
- Avatar nếu nguồn sự kiện cung cấp.
- Màu sắc riêng.
- Vị trí trên đường đua.
- Tốc độ cơ bản.
- Thanh năng lượng.
- Điểm đóng góp.
- Kỹ năng.
- Thành tích.

Ví dụ:

Người dùng `@minh123` comment hoặc tặng quà.

Hệ thống tạo một chú vịt có tên `minh123` và đưa vào đường đua.

Khi người này tiếp tục Like, Comment, Share hoặc Gift, chú vịt của họ sẽ nhận được buff tương ứng.

Các hiệu ứng cộng đồng cũng có thể tác động lên toàn bộ dòng sông và tất cả vịt đang tham gia.

## Nguyên tắc thiết kế

1. Người không tặng quà vẫn có khả năng chiến thắng.
2. Người tặng quà có thêm kỹ năng và hiệu ứng đặc biệt.
3. Không cho phép một người mua lợi thế tốc độ vô hạn.
4. Like, Comment, Share phải có giá trị thực sự.
5. Mọi tương tác đều phải được phản hồi trực quan trên màn hình.
6. Game phải dễ hiểu ngay cả với người lần đầu xem livestream.

---

# 3. GIAO DIỆN GAME

Thiết kế game theo phong cách 2D Cartoon, màu sắc tươi sáng, đáng yêu, vui nhộn.

Tỷ lệ màn hình: 16:9.

Độ phân giải mặc định: 1920x1080.

Có thể scale xuống 1280x720 mà không vỡ giao diện.

## 3.1. Bố cục màn hình

Chia giao diện thành 5 khu vực:

### Khu vực A: Header

Hiển thị:
- Logo THẢ VỊT.
- Tên cuộc đua.
- Số người tham gia.
- Thời gian còn lại.
- Trạng thái cuộc đua.

### Khu vực B: Đường đua

Đây là khu vực quan trọng nhất.

Thiết kế một dòng sông rộng, có:
- Mặt nước chuyển động liên tục.
- Sóng nước.
- Bọt nước.
- Rong biển.
- Đá.
- Khúc gỗ.
- Vùng nước xoáy.
- Vùng tăng tốc.
- Các hiệu ứng thời tiết.

Các chú vịt sẽ di chuyển từ trái sang phải.

Mỗi vịt có:
- Sprite vịt hoạt hình.
- Username TikTok phía trên.
- Thanh năng lượng.
- Hiệu ứng buff khi được tăng tốc.

Vịt phải có animation bơi liên tục, không được đứng im rồi chỉ dịch chuyển tọa độ.

Khi tăng tốc:
- Tạo hiệu ứng nước bắn.
- Có vệt sáng phía sau.
- Animation bơi nhanh hơn.
- Có hiệu ứng riêng cho từng kỹ năng.

Khi bị chậm:
- Animation thể hiện rõ sự thay đổi.
- Không để vịt biến mất khỏi màn hình.

### Khu vực C: Bảng xếp hạng

Hiển thị TOP 10 người đang dẫn đầu.

Thông tin:
- Thứ hạng.
- Username.
- Avatar nếu có.
- Khoảng cách đến đích.
- Tổng điểm đóng góp.

Bảng xếp hạng cập nhật real-time.

Khi thứ hạng thay đổi, có animation chuyển vị trí.

### Khu vực D: Thanh tương tác cộng đồng

Hiển thị các chỉ số:

- Tổng Like.
- Tổng Comment hợp lệ.
- Tổng Share.
- Tổng Gift.
- Thanh năng lượng cộng đồng.

Khi đạt một mốc tương tác sẽ kích hoạt hiệu ứng toàn dòng sông.

### Khu vực E: Notification

Khi có người tương tác, hiển thị thông báo nổi:

Ví dụ:
- `minh123 đã triệu hồi một chú vịt!`
- `lananh vừa kích hoạt TURBO!`
- `hoang đã tạo ra một cơn gió thuận!`
- `CỘNG ĐỒNG ĐÃ KÍCH HOẠT SÓNG THẦN!`

Thông báo phải tự động biến mất sau vài giây.

Không để quá nhiều notification che mất đường đua.

---

# 4. HỆ THỐNG NGƯỜI CHƠI

## 4.1. Tạo người chơi

Khi nhận được sự kiện hợp lệ từ một tài khoản TikTok chưa có trong vòng đua hiện tại:

- Tạo một người chơi mới.
- Tạo một chú vịt.
- Gắn username TikTok.
- Sinh màu sắc riêng.
- Đưa vịt vào vị trí xuất phát.

Một username chỉ được sở hữu một chú vịt trong một vòng đua.

Nếu người đó tương tác nhiều lần thì phải cập nhật chú vịt hiện tại, không tạo thêm vịt mới.

Nếu người chơi đã có trong vòng đua tiếp tục tương tác, cộng điểm và buff vào đúng nhân vật đó.

## 4.2. Thông tin người chơi

```javascript
{
  id: "unique-player-id",
  username: "minh123",
  avatar: null,

  position: 0,
  baseSpeed: 100,

  energy: 0,
  maxEnergy: 100,

  contributionScore: 0,
  totalLikes: 0,
  totalComments: 0,
  totalShares: 0,
  totalGifts: 0,

  activeBuffs: [],
  cooldowns: {},

  isFinished: false,
  finishTime: null,
  rank: null
}
```

Không sử dụng username hiển thị làm định danh duy nhất nếu nguồn sự kiện cung cấp user ID ổn định.

---

# 5. HỆ THỐNG LIKE – COMMENT – SHARE – GIFT

Đây là phần gameplay quan trọng nhất.

Phải thiết kế hệ thống tương tác cân bằng.

Chia thành hai nhóm:

**Nhóm 1: Personal Buff**

Chỉ tác động đến chú vịt của người tương tác.

**Nhóm 2: Community Buff**

Tác động đến toàn bộ dòng sông và tất cả người chơi.

## 5.1. LIKE – TÍCH LŨY NĂNG LƯỢNG

Like là cách tương tác miễn phí.

Mỗi người Like sẽ đóng góp năng lượng cho vịt của mình nếu nguồn sự kiện cung cấp được danh tính người dùng.

Quy tắc:

- 10 Like hợp lệ = 1 Energy.
- 100 Like = 10 Energy.
- Mỗi người có giới hạn 20 Energy từ Like trong một vòng đua.
- Khi đủ năng lượng, vịt có thể kích hoạt Turbo.

Hiệu ứng:

- Vịt phát sáng nhẹ.
- Tốc độ bơi tăng.
- Nước bắn mạnh hơn.
- Có biểu tượng tia sét.

Nếu nguồn TikTok chỉ cung cấp tổng số Like hoặc sự kiện Like không gắn với username:

- Không tự ý gán Like cho người chơi bất kỳ.
- Chuyển Like thành Community Energy.
- Cứ mỗi 1.000 Like cộng đồng nhận một mốc năng lượng.
- Có thể kích hoạt buff toàn dòng sông khi đủ mốc.

Phải xử lý việc số Like được gửi dưới dạng tổng tích lũy hoặc sự kiện tăng thêm để tránh cộng trùng.

## 5.2. COMMENT – COMBO TĂNG TỐC

Comment hợp lệ giúp người chơi tăng năng lượng.

Ví dụ các từ khóa:

- GO
- VỊT ƠI
- CỐ LÊN
- TURBO
- CHẠY ĐI

Quy tắc:

- Một comment hợp lệ = 3 Energy.
- Cooldown cá nhân: 5 giây.
- Tối đa 15 Energy từ Comment trong một vòng đua.
- Không tính comment spam.
- Không tính comment trùng lặp liên tục trong thời gian cooldown.

Khi người chơi comment liên tiếp đúng thời điểm, tạo combo.

Combo:
- 2 lần hợp lệ: x1.2.
- 3 lần hợp lệ: x1.5.
- 5 lần hợp lệ: kích hoạt Turbo Combo.

Combo chỉ áp dụng cho phần thưởng Comment, không nhân lên vô hạn.

Hiệu ứng:
- Hiển thị chuỗi COMBO trên vịt.
- Tăng animation bơi.
- Có hiệu ứng chữ nổi.

## 5.3. SHARE – CÁNH THIÊN THẦN

Share là hành động hỗ trợ cộng đồng và người chơi.

Nếu nhận được sự kiện Share có định danh người dùng:

- Một Share hợp lệ = 10 Energy cho vịt của người share.
- Mỗi người chỉ được nhận thưởng tối đa 1 lần Share trong một vòng đua.
- Chống xử lý trùng event.

Hiệu ứng cá nhân:

- Vịt mọc đôi cánh.
- Bay lướt trên mặt nước.
- Tăng tốc trong một khoảng thời gian.

Community Buff:

- Khi có 5 người share khác nhau trong vòng 30 giây: kích hoạt Gió Thuận.
- Tất cả vịt được tăng 3% tốc độ trong 5 giây.

Nếu nguồn sự kiện không cung cấp người share cụ thể, chỉ cộng tiến trình cộng đồng khi có dữ liệu đáng tin cậy.

Không giả lập hoặc tự tạo sự kiện Share.

## 5.4. GIFT – KỸ NĂNG ĐẶC BIỆT

Gift có hai tác dụng:

1. Tăng Energy cho vịt cá nhân.
2. Kích hoạt kỹ năng đặc biệt tùy loại quà.

Thiết kế hệ thống mapping quà bằng cấu hình, không hardcode logic vào Game Engine.

Ví dụ cấu hình:

```javascript
const giftConfig = {
  small: {
    energy: 15,
    skill: "TURBO"
  },

  medium: {
    energy: 30,
    skill: "SHIELD"
  },

  large: {
    energy: 50,
    skill: "SUPER_TURBO"
  },

  special: {
    energy: 50,
    skill: "RAINBOW_BOOST"
  }
};
```

Đây là nhóm quà logic minh họa. Khi tích hợp thật, phải mapping theo gift ID hoặc thông tin quà thực tế từ nguồn TikTok LIVE, không giả định tên hoặc giá trị quà.

Các kỹ năng:

**TURBO**
- Tăng 12% tốc độ trong 5 giây.

**SHIELD**
- Tạo lá chắn.
- Bảo vệ vịt khỏi một chướng ngại vật.

**SUPER TURBO**
- Tăng 18% tốc độ trong 5 giây.
- Có hiệu ứng lửa hoặc tia sét.

**RAINBOW BOOST**
- Tăng 20% tốc độ trong 6 giây.
- Có hiệu ứng cầu vồng.
- Có cooldown.

Tất cả tốc độ phải bị giới hạn bởi hệ thống cân bằng.

Không cho phép buff Gift cộng dồn vô hạn.

Nếu Gift có số lượng combo hoặc streak, phải xử lý đúng số lượng quà thực tế và tránh cộng trùng.

---

# 6. HỆ THỐNG ENERGY

Mỗi vịt có thanh Energy từ 0 đến 100.

Energy được tạo từ:
- Like.
- Comment.
- Share.
- Gift.

Bảng năng lượng:

| Hành động | Energy |
|---|---:|
| 10 Like | 1 |
| 1 Comment hợp lệ | 3 |
| 1 Share hợp lệ | 10 |
| Gift nhỏ | 15 |
| Gift vừa | 30 |
| Gift lớn | 50 |

Giới hạn đóng góp miễn phí mỗi vòng:
- Like: tối đa 20 Energy.
- Comment: tối đa 15 Energy.
- Share: tối đa 10 Energy nếu xác minh được danh tính.

Energy có thể được tích lũy tối đa 100.

Khi đủ 25 Energy, người chơi có thể tự động kích hoạt một lần Turbo:

- 25 Energy: +5% tốc độ trong 3 giây.
- 50 Energy: +10% tốc độ trong 4 giây.
- 75 Energy: +15% tốc độ trong 5 giây.
- 100 Energy: +20% tốc độ trong 6 giây.

Thiết kế sao cho việc tiêu thụ Energy và kích hoạt kỹ năng không xảy ra đồng thời nhiều lần.

Không cho phép kích hoạt Turbo khi đang có kỹ năng Turbo khác nếu không đủ điều kiện.

Lưu ý: Các con số trên là thông số khởi đầu. Hãy đưa toàn bộ vào file config để có thể điều chỉnh mà không phải sửa source code.

---

# 7. COMMUNITY BUFF – SỨC MẠNH CỘNG ĐỒNG

Đây là tính năng tạo sự khác biệt cho game.

Ngoài việc buff vịt cá nhân, tất cả người xem còn có thể cùng nhau kích hoạt hiệu ứng toàn dòng sông.

Thiết kế 4 sự kiện:

## 7.1. Gió Thuận

Điều kiện:
- 5 người Share khác nhau trong 30 giây.

Hiệu ứng:
- Tất cả vịt tăng 3% tốc độ trong 5 giây.
- Dòng nước xuất hiện gió thuận.
- Có animation lá cây bay.

## 7.2. Sóng Thần

Điều kiện:
- Đạt 5.000 Like cộng đồng trong một khoảng thời gian.

Hiệu ứng:
- Một con sóng lớn xuất hiện.
- Tất cả vịt được đẩy về phía trước.
- Tăng 5% tốc độ trong 5 giây.

## 7.3. Đại Hội Cổ Vũ

Điều kiện:
- Đạt 100 Comment hợp lệ từ nhiều tài khoản trong 30 giây.

Hiệu ứng:
- Khán đài hai bên sông xuất hiện.
- Pháo giấy.
- Tất cả vịt nhận 3% tốc độ trong 5 giây.

## 7.4. Cơn Bão Gift

Điều kiện:
- Đạt một ngưỡng số Gift được cấu hình trong 30 giây.

Hiệu ứng:
- Bầu trời chuyển màu.
- Xuất hiện hiệu ứng đặc biệt trên dòng sông.
- Tất cả vịt nhận 3% tốc độ trong 5 giây.

Community Buff phải:
- Có cooldown.
- Không cộng dồn vô hạn.
- Có thời gian tồn tại rõ ràng.
- Có notification khi kích hoạt.

Tổng Community Speed Bonus không được vượt quá 8%.

Gift không được tạo ra Community Buff mạnh đến mức làm mất cân bằng giữa người chơi.

---

# 8. HỆ THỐNG VẬT CẢN VÀ POWER-UP TRÊN DÒNG SÔNG

Tạo các vật thể xuất hiện ngẫu nhiên:

**Chướng ngại vật:**
- Đá.
- Khúc gỗ.
- Vùng nước xoáy.
- Thác nước.
- Rong biển.

**Power-up:**
- Đồng xu: tăng một ít Energy.
- Tên lửa: tăng tốc.
- Lá chắn: bảo vệ.
- Ngôi sao: tăng điểm.
- Cầu vồng: tăng tốc đặc biệt.

Các vật thể phải được phân bố hợp lý, không tạo tình huống một vịt bị mắc kẹt hoặc bị loại chỉ vì may rủi.

Người chơi có thể sử dụng Shield để bảo vệ mình.

Không được để chướng ngại vật khiến vịt bị mất hoàn toàn cơ hội chiến thắng.

---

# 9. QUY TRÌNH MỘT VÒNG ĐUA

Mỗi vòng đua kéo dài khoảng 120 giây.

## Giai đoạn 1: ĐĂNG KÝ (15 giây)

- Hiển thị thông báo ĐĂNG KÝ THAM GIA.
- Người xem Like, Comment, Share hoặc Gift.
- Tạo nhân vật vịt.
- Hiển thị username.
- Tất cả vịt xuất hiện tại vạch xuất phát.

## Giai đoạn 2: ĐUA CHÍNH (60 giây)

- Bắt đầu đua.
- Vịt tự động di chuyển.
- Like, Comment, Share, Gift được xử lý.
- Cập nhật tốc độ.
- Kích hoạt kỹ năng.
- Cập nhật bảng xếp hạng.

## Giai đoạn 3: NƯỚC RÚT (30 giây)

- Tăng độ kịch tính.
- Xuất hiện vật cản.
- Dòng nước thay đổi.
- Các vịt có thể sử dụng Energy còn lại.
- Hiển thị TOP 3 liên tục.

## Giai đoạn 4: KẾT THÚC (15 giây)

- Xác định người chiến thắng.
- Dừng vịt tại vị trí kết thúc.
- Hiển thị TOP 10.
- Hiệu ứng pháo hoa.
- Hiển thị người thắng cuộc.
- Lưu kết quả.

Sau đó tự động chuẩn bị vòng đua mới.

Có thể cấu hình thời gian từng giai đoạn.

---

# 10. CÁCH TÍNH TỐC ĐỘ VÀ CHIẾN THẮNG

Tốc độ cơ bản của tất cả vịt phải như nhau.

Ví dụ:

```javascript
baseSpeed = 100;

finalSpeed =
  baseSpeed *
  (1 + personalBuff + communityBuff);
```

Tốc độ tối đa từ buff không được vượt quá giới hạn đã cấu hình.

Đường đua phải sử dụng hệ thống simulation dựa trên delta time, không phụ thuộc trực tiếp vào FPS.

Mỗi người chơi có vị trí độc lập.

Khi hết thời gian:
- Người có quãng đường xa nhất chiến thắng.
- Nếu đã về đích thì xếp hạng theo thời điểm về đích.
- Nếu hai người có cùng vị trí, sử dụng thời điểm đạt vị trí đó làm tiêu chí phụ.

Không để thứ hạng thay đổi ngẫu nhiên.

Không để người chơi vừa tạo mới có thể xuất hiện ở gần vạch đích.

---

# 11. HỆ THỐNG BẢNG XẾP HẠNG

Hiển thị TOP 10.

Mỗi dòng có:
- Rank.
- Username.
- Số điểm đóng góp.
- Vị trí trên đường đua.

Có các loại bảng xếp hạng:

1. TOP tốc độ.
2. TOP người đóng góp.
3. TOP người thắng nhiều vòng.
4. TOP cộng đồng.

Phải phân biệt rõ:
- Người có tốc độ cao nhất.
- Người đóng góp nhiều nhất.
- Người chiến thắng cuộc đua.

Không lấy số quà tặng làm tiêu chí duy nhất để xếp hạng chiến thắng.

---

# 12. ADMIN PANEL – BẢNG ĐIỀU KHIỂN CHO STREAMER

Tạo một bảng điều khiển riêng dành cho streamer.

Các chức năng:

- Start Game.
- Stop Game.
- Pause Game.
- Resume Game.
- Reset Game.
- Start New Round.
- Thay đổi thời gian vòng đua.
- Thay đổi tốc độ cơ bản.
- Điều chỉnh Energy.
- Điều chỉnh giới hạn Buff.
- Điều chỉnh Cooldown.
- Bật/Tắt Community Buff.
- Bật/Tắt hiệu ứng âm thanh.
- Bật/Tắt notification.
- Thay đổi số lượng vịt tối đa.
- Xem danh sách người chơi.
- Xem event gần nhất.
- Xem bảng xếp hạng.

Có chức năng TEST MODE.

TEST MODE cho phép streamer tự tạo:
- Like giả lập.
- Comment giả lập.
- Share giả lập.
- Gift giả lập.

Chỉ dùng trong môi trường test.

Phải phân biệt rõ sự kiện giả lập và sự kiện LIVE thật.

---

# 13. TIKTOK LIVE EVENT INTEGRATION

Đây là yêu cầu đặc biệt quan trọng.

Game phải có một lớp Event Adapter riêng biệt để nhận sự kiện từ TikTok LIVE.

Không được gắn trực tiếp logic game vào thư viện nhận sự kiện TikTok.

Kiến trúc:

TikTok LIVE Event Source
        |
        v
TikTok Event Adapter
        |
        v
Event Normalizer
        |
        v
Event Queue
        |
        v
Game Event Processor
        |
        v
Game State
        |
        v
Renderer

Các event cần hỗ trợ:

```javascript
{
  type: "gift",
  eventId: "unique-event-id",
  userId: "user-123",
  username: "minh123",
  giftId: "gift-001",
  giftName: "Example Gift",
  repeatCount: 1,
  timestamp: 0
}
```

```javascript
{
  type: "comment",
  eventId: "comment-001",
  userId: "user-123",
  username: "minh123",
  message: "GO",
  timestamp: 0
}
```

```javascript
{
  type: "like",
  eventId: "like-001",
  userId: "user-123",
  username: "minh123",
  count: 1,
  timestamp: 0
}
```

```javascript
{
  type: "share",
  eventId: "share-001",
  userId: "user-123",
  username: "minh123",
  timestamp: 0
}
```

Lưu ý:
- Schema trên là schema nội bộ chuẩn hóa, không phải payload gốc của TikTok.
- Adapter phải chuyển đổi payload thực tế sang schema này.
- Không giả định tất cả nguồn TikTok LIVE đều cung cấp đầy đủ Like và Share cá nhân.
- Nếu nguồn không cung cấp username, phải chuyển sang Community Event.
- Không tự tạo username giả.
- Không tự giả lập gift thật.
- Không xử lý trùng event.
- Phải xử lý reconnect.
- Phải xử lý event đến trễ.
- Phải hỗ trợ Gift combo và repeat count đúng cách.
- Không xử lý một Gift nhiều lần khi có nhiều callback liên tiếp.

Nếu project chưa có thư viện hoặc kết nối TikTok LIVE:

1. Kiểm tra các dependency hiện có.
2. Đề xuất thư viện hoặc connector tương thích với môi trường thực tế.
3. Không tự bịa tên API hoặc phương thức của thư viện.
4. Tạo TikTok Live Adapter theo interface độc lập.
5. Tạo Mock Adapter để game có thể chạy và test ngay.
6. Đánh dấu rõ phần nào cần cấu hình kết nối TikTok LIVE thật.

Không được yêu cầu người xem truy cập website để tham gia game.

---

# 14. KIẾN TRÚC SOURCE CODE

Ưu tiên sử dụng kiến trúc module hóa.

Nếu repository đã có công nghệ và cấu trúc sẵn thì hãy tận dụng, không tự ý thay đổi toàn bộ stack.

Nếu bắt đầu dự án mới, ưu tiên:

- TypeScript.
- Vite.
- HTML5 Canvas hoặc PixiJS.
- CSS.
- Node.js nếu cần backend hoặc event bridge.

Không cần xây dựng website cho người chơi.

Chỉ cần ứng dụng game chạy trên máy streamer và giao diện Admin.

Cấu trúc tham khảo:

```text
tha-vit-game/
│
├── src/
│   ├── game/
│   │   ├── GameEngine.ts
│   │   ├── GameState.ts
│   │   ├── RaceManager.ts
│   │   ├── DuckManager.ts
│   │   ├── EnergyManager.ts
│   │   ├── BuffManager.ts
│   │   ├── SkillManager.ts
│   │   ├── ObstacleManager.ts
│   │   ├── RankingManager.ts
│   │   └── RoundManager.ts
│   │
│   ├── events/
│   │   ├── EventAdapter.ts
│   │   ├── TikTokAdapter.ts
│   │   ├── MockAdapter.ts
│   │   ├── EventNormalizer.ts
│   │   ├── EventQueue.ts
│   │   └── EventDeduplicator.ts
│   │
│   ├── rendering/
│   │   ├── GameRenderer.ts
│   │   ├── RiverRenderer.ts
│   │   ├── DuckRenderer.ts
│   │   ├── EffectsRenderer.ts
│   │   └── UIManager.ts
│   │
│   ├── admin/
│   │   ├── AdminPanel.ts
│   │   └── SettingsManager.ts
│   │
│   ├── config/
│   │   ├── game.config.ts
│   │   ├── gift.config.ts
│   │   └── balance.config.ts
│   │
│   └── main.ts
│
├── public/
│   ├── assets/
│   │   ├── ducks/
│   │   ├── backgrounds/
│   │   ├── effects/
│   │   └── sounds/
│
├── tests/
│
├── package.json
└── README.md
```

Đây là cấu trúc tham khảo, có thể điều chỉnh theo kiến trúc thực tế.

---

# 15. YÊU CẦU VỀ HIỆU NĂNG

Game phải hoạt động tốt trong livestream dài.

Yêu cầu:

- Mục tiêu 60 FPS.
- Có thể xử lý hàng trăm người chơi trong cùng một vòng.
- Event Queue không được làm treo game.
- Dùng object pooling cho particle và hiệu ứng.
- Không tạo hàng nghìn DOM element.
- Renderer phải tách khỏi logic xử lý event.
- Có giới hạn notification.
- Có cơ chế gộp event khi nhận lượng tương tác lớn.
- Không render lại toàn bộ game không cần thiết.
- Có xử lý lỗi khi mất kết nối TikTok LIVE.
- Khi mất kết nối, game vẫn chạy bình thường bằng trạng thái hiện tại.
- Khi kết nối lại, không xử lý lại các event cũ nếu đã được xác nhận.

---

# 16. KIỂM THỬ

Phải xây dựng TEST MODE có thể mô phỏng các tình huống:

1. 100 người tham gia cùng lúc.
2. Một người Like liên tục.
3. Một người Comment liên tục.
4. Nhiều người Share cùng lúc.
5. Nhiều người tặng Gift cùng lúc.
6. Gift combo.
7. Hai người cùng kích hoạt Turbo.
8. Community Buff và Personal Buff cùng hoạt động.
9. Event bị gửi trùng.
10. TikTok LIVE bị mất kết nối.
11. Người chơi vào giữa vòng đua.
12. Một vòng đua kết thúc và bắt đầu vòng mới.

Viết unit test cho:
- Energy calculation.
- Speed calculation.
- Buff stacking.
- Cooldown.
- Event deduplication.
- Ranking.
- Winner calculation.
- Community event thresholds.

---

# 17. YÊU CẦU VỀ THIẾT KẾ HÌNH ẢNH

Game phải đẹp và vui nhộn.

Phong cách:
- Cartoon 2D.
- Màu sắc tươi sáng.
- Vịt đáng yêu.
- Mặt nước có chuyển động.
- Animation mượt.
- Hiệu ứng buff rõ ràng.
- Không dùng giao diện quản trị làm màn hình livestream.

Đường đua phải chiếm phần lớn diện tích màn hình.

Username phải đủ lớn để người xem nhận ra nhân vật của mình.

Nếu chưa có asset hình ảnh, hãy tạo các sprite bằng SVG hoặc Canvas procedural graphics để game có thể chạy ngay.

Không dùng emoji đơn giản thay cho toàn bộ nhân vật vịt. Hãy tạo nhân vật có hình dáng rõ ràng, có animation.

---

# 18. CÁCH TRIỂN KHAI

Hãy làm theo các giai đoạn:

### Phase 1: Kiểm tra môi trường

- Đọc toàn bộ repository hiện có.
- Kiểm tra package và dependency.
- Xác định cách chạy game.
- Xác định nguồn TikTok LIVE event nếu đã có.
- Không tự ý xóa hoặc ghi đè code hiện tại.

### Phase 2: Xây dựng game core

- Game Engine.
- Duck Manager.
- Race Manager.
- Energy System.
- Buff System.
- Community Buff.
- Ranking.
- Round Management.

### Phase 3: Xây dựng giao diện

- River.
- Duck Animation.
- Ranking.
- Notification.
- Community Progress.
- Sound Effects.

### Phase 4: Tích hợp sự kiện

- Mock Adapter.
- TikTok Adapter.
- Event Queue.
- Event Normalizer.
- Deduplication.
- Reconnect.

### Phase 5: Admin Panel

- Start/Stop/Pause.
- Reset.
- Test Event.
- Configuration.
- Ranking.
- Player Management.

### Phase 6: Kiểm thử và tối ưu

- Test 100–500 vịt.
- Test lượng event lớn.
- Test tốc độ render.
- Test cooldown.
- Test tính công bằng.
- Test nhiều vòng đua liên tiếp.

---

# 19. TIÊU CHÍ HOÀN THÀNH

Chỉ xem là hoàn thành khi:

1. Game có thể chạy được trên máy tính.
2. Có thể mở game ở chế độ toàn màn hình.
3. Có thể đưa game vào OBS.
4. Có ít nhất 10 chú vịt với tên người chơi khác nhau.
5. Vịt có animation bơi.
6. Like, Comment, Share và Gift có thể được test bằng Mock Adapter.
7. Mỗi hành động có hiệu ứng chính xác.
8. Community Buff hoạt động.
9. Có bảng xếp hạng real-time.
10. Có vòng đua tự động.
11. Có Admin Panel.
12. Có thể cấu hình Gift.
13. Không bị crash khi nhiều event cùng đến.
14. Có hướng dẫn cài đặt và chạy.
15. Có hướng dẫn kết nối nguồn TikTok LIVE thật.

Không được tuyên bố đã tích hợp TikTok LIVE thật nếu mới chỉ dùng Mock Adapter.

---

# 20. YÊU CẦU ĐẦU RA

Hãy thực hiện trực tiếp trên source code.

Không chỉ trả về các đoạn code minh họa.

Không bỏ trống những module quan trọng bằng TODO.

Không sử dụng dữ liệu giả lập trong chế độ LIVE thật.

Hãy hoàn thành một phiên bản MVP có giao diện đẹp và gameplay chạy được trước, sau đó tiếp tục hoàn thiện các tính năng còn lại.

Sau khi code xong, hãy cung cấp:

1. Cấu trúc source code.
2. Danh sách tính năng đã hoàn thành.
3. Hướng dẫn cài đặt.
4. Lệnh chạy game.
5. Cách chạy TEST MODE.
6. Cách kết nối TikTok LIVE thật.
7. Các phần còn cần cấu hình.
8. Các giới hạn kỹ thuật của nguồn sự kiện TikTok LIVE đang sử dụng.

**ƯU TIÊN CAO NHẤT: GAME PHẢI CHẠY ĐƯỢC, NHÌN ĐẸP TRÊN TIKTOK LIVE VÀ CÓ CƠ CHẾ TƯƠNG TÁC THỰC SỰ.**