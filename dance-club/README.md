# 💃 Virtual Dance Club – game 3D cho TikTok LIVE

Một club 3D tối giản: 1 DJ, 1 sàn nhảy LED và đám đông dancer.

- Người xem **comment `hey`** → có avatar 3D riêng (ngoại hình cố định theo tài khoản) và lên sàn nhảy chill. Sàn đầy thì vào hàng chờ FIFO.
- Người xem **tặng quà** → được lên giữa sàn biểu diễn. Quà càng giá trị thì điệu nhảy, camera, ánh sáng và phản ứng đám đông càng hoành tráng (5 tier, 15 bài choreography).
- Hết màn diễn: performer về chỗ, camera về toàn cảnh.

Làm bằng **Node.js + Three.js** (cùng cách với các game Quán Cô Ba, Thả Vịt...), không cần Unity, Blender hay Mixamo:
nhân vật, điệu nhảy và nhạc đều được tạo bằng code nên không vướng bản quyền.

## Trên màn hình có gì

- **Sân khấu DJ:** DJ, một MC cầm mic đi qua lại hô hào, và 2 vũ công nhảy đồng đều (đổi động tác mỗi 8 nhịp).
- **Màn LED sau lưng DJ:** bảng xếp hạng top 5 người tặng nhiều xu nhất trong phiên live (hạng, ảnh đại diện TikTok, tên, tổng xu).
  Bảng tự xóa khi bắt đầu phiên live mới; xóa tay bằng nút "Xóa bảng xếp hạng" trên bảng điều khiển.
- **Người mới vào sàn** (comment `hey`) rơi từ trên trời xuống rồi vẫy tay chào; camera lia nhanh tới người đó, giữ khoảng 1 giây sau khi chạm sàn rồi quay lại (chỉ lúc không có ai biểu diễn; chỉnh ở `joinFocus`). Dancer tự đi dạo quanh sàn cho đỡ tĩnh.
- **Quà TikTok → đổi nhân vật:** người xem tặng quà *TikTok* thì nhân vật của họ đổi sang ngoại hình khác (3D hoặc GIF khác), giữ luôn cả khi rời sàn rồi quay lại. Quà này không tạo lượt diễn (đặt `swapGift.alsoPerform: true` nếu muốn vẫn diễn). Đổi quà khác ở `swapGift.names`.
- **Camera** lúc không có ai diễn tự lia và đổi góc (toàn cảnh, quét đám đông, góc DJ, góc cao); có quà thì bám người biểu diễn.
- **Đèn** mặc định đứng yên, không nhấp nháy (`display.lightAnimation: false`).
- **Laser mảnh 7 màu** từ 4 góc phòng quét chậm, không nháy; sáng hơn khi có người diễn (`display.rainbowLasers`, `enabled: false` để tắt).

## Dùng meme GIF thay nhân vật 3D

Chép file GIF (hoặc .webp/.png động) vào thư mục `meme/` rồi tải lại cửa sổ game (Ctrl + F5), không cần khởi động lại server:

| Thư mục | Dùng cho |
|---|---|
| `meme/nguoi-xem/` | Người xem trên sàn. Mỗi người được gán cố định 1 GIF. **Trống = dùng nhân vật 3D như cũ.** |
| `meme/bieu-dien/1` … `5` | GIF của người biểu diễn theo tier quà (1 Khởi Động … 5 Huyền Thoại). Trống thì giữ GIF của người đó, phóng to. |
| `meme/san-khau/` | `dj.gif`, `mc.gif`, `vu-cong-1.gif`, `vu-cong-2.gif`. Thiếu file nào thì người đó vẫn là 3D. |

Nên dùng GIF nền trong suốt, dáng đứng (cao hơn rộng), dưới 2 MB. Chỉ dùng GIF bạn có quyền sử dụng.
Chiều cao GIF và độ phóng to khi biểu diễn chỉnh ở `meme` trong `config.json`.

Khi có quà, quanh người biểu diễn có hiệu ứng theo tier (tim, nốt nhạc, lửa, sao, kim cương, vương miện, tia sáng sau lưng),
chỉnh ở `auraFx` trong `config.json`.

## Chạy

Bấm đúp **`start.bat`**. Nó mở 3 thứ:

1. Cửa sổ server (đừng tắt).
2. Cửa sổ game dọc 9:16 (`http://127.0.0.1:3005/`) → thêm vào TikTok LIVE Studio / OBS bằng *Window Capture*.
3. Bảng điều khiển (`http://127.0.0.1:3005/panel.html`) để xem hàng chờ, nhật ký và giả lập comment/quà.

Kênh TikTok đặt trong `config.json` → `tiktokUsername`. Chạy thử không kết nối TikTok: `node server.js ""`.

Nếu muốn nhận cảnh báo kiểm duyệt qua Telegram, chép file `.env` từ game khác sang thư mục này
(`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`).

## Thử không cần LIVE (debug)

Bấm phím trong cửa sổ game:

| Phím | Tác dụng |
|---|---|
| `1` / `2` / `3` | Thêm 1 / 10 / tối đa dancer |
| `Q W E R T` | Quà tier 1–5 (Khởi Động → Huyền Thoại) cho một người đang trên sàn |
| `Y` | Quà TikTok (đổi nhân vật) cho một người đang trên sàn |
| `C` | Kết thúc màn đang diễn, về Chill |
| `F` | Bật/tắt camera tự do (kéo chuột để xoay), hiện fps |
| `M` | Tắt/bật nhạc |

Bảng điều khiển có thêm: giả lập comment tuỳ tên/nội dung, quà tuỳ số xu/số lượng/combo, xoá hàng chờ, làm mới sàn.

`npm test` chạy 25 bài kiểm tra logic (hàng chờ, combo, ưu tiên, chống trùng, timeline choreography, avatar).

## Cách quà được xử lý

1. Adapter TikTok (`server.js`) chuẩn hoá sự kiện, bỏ trùng theo `msgId`, chỉ cộng phần chênh của combo.
2. Quà của cùng một người trong `gifts.comboWindowMs` (2,5 giây) được cộng dồn thành **một** lượt diễn.
3. Tier theo tổng xu, khớp giá các quà hiện trên màn hình: Hoa hồng 1 → Khởi Động · Bắn tim 5 → Nhịp Điệu · Donut 30 → Bùng Nổ · Hộp quà 100 → Siêu Sao · Galaxy 1000 → Huyền Thoại (sửa trong `tiers`, icon trong `public/gifts`).
4. Đang có người diễn thì lượt mới vào hàng chờ, **không cắt ngang**. Hàng chờ ưu tiên tier cao, bằng điểm thì ai đến trước diễn trước,
   và cứ chờ `agingSecondsPerTier` giây được cộng thêm 1 bậc để quà nhỏ không bị chen mãi.
5. Người đã có lượt chờ mà tặng thêm thì được cộng vào lượt đó (có thể lên tier).
6. Hàng chờ dài (≥ `rushQueueLength`) thì các tier thấp diễn rút gọn. Hàng đầy (`maxQueue`) thì bỏ lượt có độ ưu tiên thấp nhất.
7. Người tặng quà luôn được lên sàn: nếu sàn đầy, người đứng im lâu nhất nhường chỗ và về đầu hàng chờ.

## Tuỳ chỉnh (`config.json`)

| Mục | Ý nghĩa |
|---|---|
| `join.keywords` | Từ khoá để lên sàn (mặc định `hey`, chấp nhận cả `heyyy`) |
| `floor.maxDancers` | Số dancer tối đa (mặc định 50) |
| `floor.spawnPerSecond` | Tốc độ cho người vào sàn khi bị spam comment |
| `floor.makeRoomIdleMinutes` / `idleLeaveMinutes` | Đứng im bao lâu thì nhường chỗ (khi có người chờ) / tự rời sàn |
| `tiers` | Ngưỡng xu, thời lượng, màu của từng tier |
| `choreographies` | 15 bài nhảy: mỗi bài gồm các phase `intro → main → highlight → freeze → finale`, mỗi phase có tỉ lệ thời gian và danh sách động tác, cùng preset camera/đám đông/ánh sáng |
| `crowdReactionPresets` | Tỉ lệ đám đông quay nhìn, cổ vũ, vỗ tay, nhảy theo, giãn chỗ, đồng diễn ở finale |
| `cameraPresets` | 6 góc máy `CAM_WIDE`, `CAM_MEDIUM`, `CAM_CLOSE`, `CAM_TRACKING`, `CAM_CINEMATIC`, `CAM_FINALE` |
| `lightingPresets` | Bảng màu, kiểu sàn LED, laser, strobe, confetti, pháo sáng cho từng tier |
| `music` | Bật/tắt nhạc tự tổng hợp, BPM, âm lượng. Tắt nếu bạn phát nhạc riêng qua OBS |
| `display` | `renderScale` (giảm nếu máy yếu), `bloom`, `nameTags` |

Động tác có sẵn để dùng trong choreography: `two_step, bounce_step, shuffle, roll_arms, hype_up, spin, pop_lock, robot, body_roll,
kick_step, glide, krump, jump_split, knee_drop, backflip, spin_fast, vogue, tornado, levitate, headspin, double_flip, jump_hype,
finale_wave, finale_jump` và các tư thế dừng `pose_point, pose_cool, pose_tilt, pose_star, pose_legend`.

## Cấu trúc

```text
server.js            Adapter TikTok LIVE, SSE tới màn hình, API giả lập
src/club.js          Bộ não: roster + hàng chờ, gộp combo, tier, chọn bài, hàng ưu tiên, DanceSessionManager
public/index.html    Màn hình game 9:16
public/panel.html    Bảng điều khiển
public/js/
  main.js            Điều phối: nhận trạng thái, chạy ChoreographyPlayer → Camera/Ánh sáng/Đám đông/Nhạc
  avatar.js          AvatarGenerator: seed theo userId → body, mặt, tóc, outfit theo 7 phong cách
  character.js       Rig 18 xương + mô hình ghép, 1 draw call/nhân vật, IK chân
  moves.js           Thư viện ~40 động tác nhảy procedural theo nhịp
  choreo.js          ChoreographyPlayer + các event PerformanceStarted … PerformanceCompleted
  crowd.js           Spawn/pool, bố trí slot, phản ứng đám đông, giãn chỗ, né ống kính
  camera.js          CameraDirector (thay Cinemachine), chuyển cảnh mượt, giữ khung tối thiểu
  stage.js           Sàn LED, DJ booth, màn LED, moving head, spotlight, laser, confetti, pháo sáng
  audio.js           Nhạc house tự tổng hợp (WebAudio) + hiệu ứng âm thanh, đồng hồ beat
  hud.js             Name tag, banner người diễn, hàng chờ, thông báo quà
```

### Khác với bản brief (Unity)

- Dùng Three.js trên trình duyệt thay Unity 6/URP/Cinemachine. Các module trong brief vẫn được giữ tên/vai trò tương ứng.
- Server → màn hình dùng **SSE** (tự kết nối lại) thay WebSocket; màn hình gửi lệnh debug qua HTTP. Đều chạy nội bộ `127.0.0.1`.
- ScriptableObject được thay bằng `config.json`; server kiểm tra hợp lệ khi khởi động.
- Thư viện `tiktok-live-connector` là nguồn sự kiện không chính thức; nếu TikTok đổi giao thức có thể cần cập nhật thư viện.
