# THẢ VỊT – ĐẠI CHIẾN DÒNG SÔNG

Game đua vịt tương tác cho TikTok LIVE. Mỗi người xem có một chú vịt riêng trên dòng sông. Game chạy trên máy streamer và được đưa vào livestream bằng OBS / TikTok LIVE Studio. Người xem không phải vào website nào.

## Luật chơi

**Comment gì cũng được là có vịt. Tương tác là vịt lao lên. Về đích trước là thắng.**

| Người xem làm gì | Vịt được gì |
|---|---|
| Comment bất kỳ | Có vịt ngay, +5m. Mỗi 3 giây tính 1 comment |
| Thả tim | Có vịt ngay, cứ 5 tim +1m |
| Share | Có vịt ngay, +20m và mọc cánh bay qua vật cản. Mỗi vòng tính 1 lần |
| Hoa hồng (1 xu) | +8m mỗi quà |
| Bắn tim (5 xu) | +40m mỗi quà, kèm lá chắn |
| Heo may mắn (10 xu) | +80m mỗi quà, kèm hiệu ứng lửa |
| Hộp quà (100 xu) | +400m mỗi quà, kèm hiệu ứng cầu vồng |
| Cỏ ba lá (10 xu) | Đổi sang một skin hài ngẫu nhiên, +20m. Xem bên dưới |
| Quà khác | Tính theo giá: từ 1 xu như Hoa hồng, từ 5 xu như Bắn tim, từ 10 xu như Heo may mắn, từ 99 xu như Hộp quà |

- Đường đua dài 500m. Vịt tự bơi chỉ được khoảng 310m trong 90 giây, nên phải tương tác mới về đích.
- Số mét không cộng tức thì mà vịt lao lên dần, nhanh nhất gấp 2,5 lần tốc độ thường (`rewards.maxDashBonus`). Quà rất to cũng chỉ là lao lâu hơn, không về đích ngay.
- Thả đủ 3.000 tim cả phòng trong 2 phút thì có **Sóng Thần** đẩy cả đàn lên 30m. Gió Thuận, Đại Hội Cổ Vũ và Bão Gift vẫn còn trong code nhưng mặc định tắt, bật lại trong Admin nếu muốn.
- Comment, thả tim hay gửi quà lúc đang hiện kết quả thì được vào luôn vòng sau, quà vẫn giữ nguyên số mét.
- **Vịt bot:** mỗi vòng có sẵn 8 vịt bot tên kiểu "Vịt Bầu", "Vịt Deadline", nên sông không bao giờ trống và vòng đua tự chạy kể cả khi chưa có ai. Bot chỉ tự tích mét theo đúng luật thả tim và comment, chạy nội bộ trong game, không gửi gì lên TikTok. Mọi thứ đều ngẫu nhiên để các vòng không lặp lại: tên, độ hăng của cả vòng và của từng con, tỉ lệ thả tim so với comment, số tim mỗi lần, nhịp lúc dồn dập lúc im. Bot không cộng vào Sóng Thần, thống kê, bảng vô địch, và không ăn vật phẩm trên sông. Bot bám sát nhưng không vượt người xem đang dẫn đầu. Mỗi người chơi thật thay 1 bot từ lần xuất phát tiếp theo. Vòng chỉ có bot thì không lưu kết quả. Chỉnh ở `bots` trong `config/game.json` hoặc trong Admin.
- **Camera:** khi đang đua, thỉnh thoảng camera zoom vào vịt dẫn đầu (mỗi 18 giây, lúc nước rút mỗi 10 giây, mỗi lần 5 giây): vịt gồng sức, văng mồ hôi, cảnh vật lao vun vút. Ai gửi quà thì camera cắt ngay sang vịt đó, kèm bùng nổ theo cỡ quà và chữ hiện số mét vừa nhận. Nhiều quà cùng lúc thì xếp hàng, quà to trước, mỗi cảnh ít nhất 1,6 giây. Tốc độ lao vút trong cảnh zoom chỉ là hiệu ứng, thứ hạng không đổi vì nó. Chỉnh ở `camera` trong `config/game.json` hoặc trong Admin.
- **Skin:** trực thăng, cánh thiên nga, ván trượt, tên lửa, động cơ ca nô, thau nhôm, bồn cầu, bóng bay, dân chơi, nón lá. Mỗi lần Cỏ ba lá đổi sang skin khác skin đang có. Skin chỉ để nhìn, không đổi tốc độ, và theo người chơi qua các vòng, kể cả tắt server mở lại, cho tới khi bấm **Reset Game** trong Admin (lưu ở `data/results.json`). Hình vẽ ở `public/js/render/SkinRenderer.js`, tên hiện trên màn hình ở `skins` trong `config/gifts.json`.
- 5 quà trên hiện thành thẻ có ảnh, tên, số mét và giá ngay dưới bảng cách chơi. Muốn đổi quà thì sửa `list` trong `config/gifts.json` (`names` là tên TikTok gửi về, ảnh để ở `public/assets/gifts/`).
- Đổi con số nào thì sửa `config/balance.json` (`rewards`) và `config/gifts.json` (`meters`). Khi viết thêm chữ lên màn hình, tránh các từ như "tặng quà".

## 1. Cấu trúc source code

```text
dua-vit/
├── server.js                    Ghép mọi thứ: config, nguồn sự kiện, vòng lặp game 20 Hz, SSE, API admin
├── start.bat                    Nhấp đúp để chạy (server + cửa sổ game + bảng điều khiển)
├── config/
│   ├── game.json                Kênh TikTok, cổng, thời gian các giai đoạn, số lane...
│   ├── balance.json             Số mét cho mỗi tương tác, hiệu ứng, sóng thần, vật cản
│   └── gifts.json               Nhóm quà → số mét + hiệu ứng, gán quà theo gift ID / kim cương
├── data/                        (tự tạo) settings.json = thay đổi từ Admin, results.json = kết quả, vô địch & skin
├── src/
│   ├── config/loadConfig.js     Đọc, gộp, kiểm tra cấu hình; danh sách cấu hình Admin được sửa
│   ├── events/
│   │   ├── EventAdapter.js      Interface chung cho mọi nguồn sự kiện
│   │   ├── TikTokAdapter.js     Nguồn TikTok LIVE thật (tiktok-live-connector), tự kết nối lại
│   │   ├── MockAdapter.js       Nguồn giả lập cho TEST MODE (đi qua cùng normalizer với LIVE)
│   │   ├── mockScenarios.js     12+ kịch bản kiểm thử
│   │   ├── EventNormalizer.js   Payload TikTok → schema nội bộ; xử lý gift combo, like total
│   │   ├── EventDeduplicator.js Lọc event trùng theo eventId (TTL 10 phút)
│   │   └── EventQueue.js        Hàng đợi có giới hạn, gộp like, không bao giờ bỏ quà
│   └── game/
│       ├── GameEngine.js        Luật chơi, xử lý event, vòng đua, output cho renderer
│       ├── RoundManager.js      Các giai đoạn: chờ → đăng ký → đua → nước rút → kết thúc
│       ├── DuckManager.js       Người chơi / vịt (1 người = 1 vịt / vòng, theo user ID)
│       ├── RewardManager.js     Đổi tim / comment / share thành số mét
│       ├── BotManager.js        Vịt bot: tên, tính cách, lúc nào thả tim / comment
│       ├── BuffManager.js       Hiệu ứng có thời hạn (làm chậm, lá chắn, cánh), công thức tốc độ
│       ├── SkillManager.js      Bật hiệu ứng + map quà → nhóm quà
│       ├── CommunityManager.js  Sóng Thần (và 3 sự kiện cộng đồng mặc định tắt)
│       ├── ObstacleManager.js   Vật cản & power-up công bằng
│       ├── RankingManager.js    Xếp hạng tất định, người thắng
│       └── ResultStore.js       Lưu kết quả & bảng vô địch
├── public/
│   ├── index.html               Màn hình game (đưa vào OBS) – Canvas dọc 1080×1920
│   ├── admin.html               Bảng điều khiển streamer
│   └── js/
│       ├── main.js              Nhận dữ liệu, nội suy vị trí, vòng lặp vẽ 60 FPS
│       ├── admin.js
│       ├── sound.js             Âm thanh tạo bằng WebAudio (không cần file)
│       └── render/              RiverRenderer, DuckRenderer, SkinRenderer, ObstacleRenderer, EffectsRenderer, UIManager, Camera, layout
└── tests/                       Unit test (node:test)
```

Luồng sự kiện:

```
TikTok LIVE → TikTokAdapter → EventNormalizer → EventDeduplicator → EventQueue → GameEngine (20 Hz, delta time) → SSE → Renderer (Canvas)
Admin TEST MODE → MockAdapter ↗ (cùng normalizer, gắn source = "mock")
```

Server là nơi duy nhất giữ trạng thái game, nên mở nhiều cửa sổ game / tải lại trang OBS không làm lệch hay mất cuộc đua.

## 2. Tính năng đã hoàn thành

- Vòng đua tự động: Đăng ký 15s → Đua chính 60s → Nước rút 30s → Kết thúc 15s → vòng mới (cấu hình được). Tắt bot thì game chờ người chơi đầu tiên rồi mới đếm ngược.
- Mỗi người xem tương tác được 1 vịt (theo TikTok user ID, không theo tên hiển thị). Tương tác tiếp theo cộng mét cho đúng vịt đó. Luật xem ở mục **Luật chơi**.
- Like không rõ người chỉ tính vào Sóng Thần. Like được tính theo mức tăng, và phần chênh của tổng like phòng đi vào cộng đồng, không cộng trùng.
- Gift combo/streak được tính đúng số quà thật. Mét nhận trước giờ xuất phát được thả ra khi bắt đầu đua.
- Cân bằng: tốc độ cơ bản như nhau; tốc độ lao có giới hạn; vật cản chỉ làm chậm tạm thời (không dưới 60%), có thời gian miễn nhiễm.
- Vật cản (đá, khúc gỗ, nước xoáy, ghềnh thác, rong), vật phẩm cộng mét (đồng xu, tên lửa, ngôi sao, cầu vồng, vùng tăng tốc) và lá chắn, xuất hiện có cảnh báo trước.
- Vịt hoạt hình vẽ bằng Canvas: bơi, vỗ cánh, chân quạt nước, sóng nước, vệt tốc độ, lửa, cầu vồng, cánh thiên thần, lá chắn, choáng khi va chạm, vương miện khi về đích. Ai vừa tương tác thì hiện tên to hơn để dễ tìm vịt của mình.
- Giao diện dọc 1080×1920 (tự co giãn): 96px trên cùng để trống cho thanh của TikTok, rồi đến header, bảng cách chơi và bảng xếp hạng TOP 5 cạnh nhau, danh sách quà, thanh Sóng Thần, đường đua, dải cỏ dưới cùng để trống cho comment và nút quà của TikTok. Bố cục khai báo ở `public/js/render/layout.js`. Ngoài lúc đua, bảng xếp hạng đổi thành TOP vô địch. Có notification giới hạn số lượng + gộp khi đông, banner, bục vinh quang + pháo hoa.
- Âm thanh tạo bằng WebAudio, bật/tắt từ Admin.
- Admin Panel: Start/Stop/Pause/Resume/Reset/New Round/Chuyển giai đoạn, chỉnh cấu hình khi đang chạy, gán quà thật vào nhóm quà, xem người chơi, event gần nhất, kết quả, bảng vô địch, thống kê (event/giây, trùng, trễ, hàng đợi).
- TEST MODE với form gửi Like/Comment/Share/Gift/Like cộng đồng và các kịch bản kiểm thử; sự kiện giả lập luôn gắn nhãn TEST, bị từ chối khi tắt TEST MODE, và khi tắt thì vịt giả lập bị xóa khỏi vòng.
- Kết quả và số lần vô địch được lưu vào `data/results.json` (vô địch TEST tách riêng).
- Unit test: `npm test`.

## 3. Cài đặt

Cần Node.js ≥ 22.9 (máy này dùng sẵn `d:\laragon\bin\nodejs\node-v26.3.1-win-x64`).

```bash
cd dua-vit
npm install
```

## 4. Chạy game

- Cách nhanh: nhấp đúp `start.bat` (tự `npm install` lần đầu, mở server, cửa sổ game và bảng điều khiển).
- Hoặc: `npm start` rồi mở
  - Màn hình game: http://127.0.0.1:3003/  (nhấp đúp hoặc phím F để toàn màn hình)
  - Bảng điều khiển: http://127.0.0.1:3003/admin.html

Đưa vào OBS: thêm **Browser Source**, URL `http://127.0.0.1:3003/`, Width 1080, Height 1920, tick "Control audio via OBS" nếu muốn chỉnh âm lượng game. Với TikTok LIVE Studio: dùng cửa sổ game (`npm run window`, cửa sổ dọc 456×820) và thêm nguồn "Window capture".

## 5. TEST MODE

TEST MODE mặc định bật (`config/game.json → testMode`). Trong Admin:

- Ô "Tên người xem" + nút Like / Comment / Share / Tặng quà (chọn nhóm quà, số lượng, tick "combo streak" để gửi dạng streak như TikTok).
- Nút kịch bản: 100 người tham gia, 1 người like liên tục, 1 người comment liên tục, nhiều người share, nhiều người tặng quà, gift combo, 2 người cùng lao lên, Sóng Thần + quà đặc biệt, event trùng, mất kết nối, vào giữa vòng, kết thúc & vòng mới, bot tự chơi.
- Bỏ tick TEST MODE trước khi lên live thật: vịt giả lập bị xóa và mọi sự kiện giả lập bị từ chối.

Unit test: `npm test`.

## 6. Kết nối TikTok LIVE thật

1. Đặt tên kênh (không có @) vào `config/game.json → "tiktokUsername"`, hoặc chạy `npm start -- ten_kenh`.
2. Bật live trên TikTok, chạy game. Header Admin hiển thị trạng thái "Đã kết nối live @... (room ...)". Nếu kênh chưa live, game tự chờ và thử lại; mất kết nối thì tự nối lại sau 10–30 giây, game vẫn chạy bình thường trong lúc đó.
3. Tắt TEST MODE.
4. Khi có quà thật, quà xuất hiện ở mục "Cấu hình Gift" trong Admin: chọn nhóm (small/medium/large/special) để gán theo gift ID. Quà chưa gán được chia nhóm theo số kim cương TikTok gửi (`gifts.json → byDiamonds`).

Nguồn sự kiện dùng thư viện [`tiktok-live-connector`](https://www.npmjs.com/package/tiktok-live-connector) 2.x (cùng thư viện các game khác trong repo này đang dùng). Đây là thư viện **không chính thức**: nó đọc luồng sự kiện công khai của phòng live, không cần đăng nhập hay API key của TikTok. Toàn bộ code dùng thư viện nằm trong `src/events/TikTokAdapter.js`; muốn đổi sang nguồn khác (ví dụ TikFinity, một bridge WebSocket riêng), chỉ cần viết adapter mới phát ra event theo schema trong `EventNormalizer.js`.

## 7. Các phần cần cấu hình

- `config/game.json → tiktokUsername` (bắt buộc cho LIVE thật), `testMode: false` khi lên live.
- Gán quà thật: `gifts.json → byId` (qua Admin) và ngưỡng `byDiamonds`, `defaultTier`.
- Cân bằng: `balance.json` (số mét, sóng thần, vật cản). Nhiều mục chỉnh được ngay trong Admin, lưu vào `data/settings.json`; sửa file JSON thì bấm "Nạp lại file cấu hình" (riêng số lane áp dụng từ vòng sau).
- Cổng web: `game.json → port` (mặc định 3003, tránh trùng 3000/3001 của Chùa Online và Cá chép).

## 8. Giới hạn của nguồn sự kiện TikTok LIVE

- `tiktok-live-connector` là thư viện không chính thức, có thể ngừng hoạt động khi TikTok thay đổi giao thức; khi đó cần cập nhật phiên bản thư viện.
- TikTok **không gửi mọi lượt like**: sự kiện like được gửi theo đợt kèm số like của một người. Like của người không được nêu tên chỉ thấy qua tổng like của phòng, nên game đưa phần đó vào Sóng Thần (không gán cho ai). Con số này là gần đúng nếu các tin đến lệch thứ tự.
- Sự kiện share không phải lúc nào cũng được gửi, và chỉ được tính khi có danh tính người share.
- Comment, quà và share của người xem đều có user ID; tên hiển thị (nickname) có thể đổi nên game dùng ID làm định danh.
- Quà combo được gửi nhiều lần với số đếm cộng dồn; game chỉ cộng phần tăng thêm. Sau khi kết nối lại, các tin cũ không được phát lại (`processInitialData: false`) và tin trùng bị lọc theo `msgId`.
- Trong lúc mất kết nối, sự kiện trên TikTok bị mất (thư viện không lấy lại được); game vẫn chạy tiếp với trạng thái hiện có.
- Sự kiện đến trễ quá `maxEventAgeSeconds` (60s) hoặc gửi trước khi vòng hiện tại mở chỉ được cộng vào tổng, không ảnh hưởng cuộc đua; riêng quà luôn được tính.
