# Game đám cưới tương tác TikTok LIVE – Kế hoạch thực hiện

> **Dành cho Claude Code.** File này là bản đặc tả và kế hoạch đầy đủ. Hãy đọc hết trước khi làm. Thực hiện lần lượt từng giai đoạn ở mục 5. Mỗi giai đoạn có **tiêu chí hoàn thành**: chỉ chuyển sang giai đoạn sau khi đạt. Những bước đánh dấu **[NGƯỜI DÙNG]** cần con người làm (đăng nhập tài khoản, tải tài nguyên, xem bằng mắt): khi gặp, hãy dừng lại, hướng dẫn cụ thể từng thao tác, rồi chờ xác nhận.
>
> Người dùng là lập trình viên nhưng **chưa từng dùng Unity**. Khi cần họ thao tác trong Unity Editor, hãy chỉ rõ menu, cửa sổ và nút bấm.

---

## 1. Mô tả game

Game 3D chạy trên PC, được phát lên TikTok LIVE. Người xem tặng quà TikTok để điều khiển những gì diễn ra trên màn hình. Mẫu tham khảo là game "Trăm Năm Hạnh Phúc".

**Khung cảnh:** sảnh tiệc cưới (tông hồng đỏ, hoa, sân khấu). Chính giữa có hai nhân vật 3D: **chú rể** (vest) và **cô dâu** (váy cưới). Có thể thêm khách mời, MC làm nền.

**Giao diện (khung dọc 9:16):**

- Hai khung tròn ở trên, hiển thị **ảnh đại diện TikTok** của người đang làm chú rể và cô dâu, kèm tên bên dưới.
- **Tên người chơi nổi trên đầu** nhân vật 3D tương ứng.
- **Thanh quà** ở dưới: mỗi ô là một quà TikTok và hành động tương ứng, ví dụ "Hoa hồng → Làm cô dâu".
- **Bộ đếm:** tổng "chỉ vàng" mừng cưới, thanh tiến độ mục tiêu (ví dụ "323 / 3.000 → bắn pháo hoa").
- **Thông báo chạy** khi có sự kiện (ví dụ "⚡ Nam đã cướp vai chú rể của Huy").
- **Bảng "Cách chơi"** liệt kê quà → hành động.

**Các hành động:**

| Mã hành động | Kịch bản trên màn hình |
| --- | --- |
| `become_groom` | Nếu chưa có chú rể: người tặng trở thành chú rể (gắn avatar và tên). Nếu đã có: xử lý như `steal_groom`. |
| `become_bride` | Tương tự cho cô dâu. |
| `steal_groom` | Một nhân vật mới (vest) đi vào từ cạnh màn hình → tới cạnh chú rể → tung cú đá (camera cận cảnh, hiệu ứng nổ kiểu truyện tranh, rung màn hình) → chú rể cũ văng ra khỏi khung hình → nhân vật mới đứng vào vị trí chú rể, mang avatar và tên người tặng. |
| `steal_bride` | Tương tự cho cô dâu. |
| `cancel_wedding` | Cả hai nhân vật bị loại (văng ra hoặc bỏ đi), xóa avatar và tên, sinh lại hai nhân vật trống. |
| `gold` | Cộng `count` chỉ vàng vào bộ đếm, rắc hoa giấy. Khi đạt mục tiêu: bắn pháo hoa, rồi đặt lại mục tiêu. |

Danh sách này được thiết kế để mở rộng sau (ví dụ "động phòng", "mừng cưới lớn").

---

## 2. Môi trường và công nghệ

| Thành phần | Lựa chọn |
| --- | --- |
| Hệ điều hành | Windows 10 21H1+ / Windows 11 |
| Game engine | **Unity 6 LTS** (bản LTS mới nhất trong Unity Hub), template **Universal 3D (URP)** |
| Ngôn ngữ game | C# |
| Nhập liệu | **Input System mới** (mặc định của Unity 6). Không dùng `Input.GetKeyDown` kiểu cũ. |
| Chữ | TextMeshPro (có sẵn trong Unity 6) |
| Nhân vật và animation | **Mixamo** (Adobe, miễn phí) |
| Cảnh | Unity Asset Store (gói sảnh cưới, nội thất, hoa) |
| Cầu nối TikTok | **Node.js** (bản LTS) + `tiktok-live-connector` (đã thử bản 2.5.0) + `ws` |
| Phát live | **TikTok LIVE Studio** trên PC |
| Công cụ AI | VS Code + extension Unity (Microsoft) + Claude Code + **MCP for Unity** (CoplayDev, miễn phí, MIT; cần Python 3.10+ và `uv`) |

**Cấu hình máy:** tối thiểu 8 GB RAM (khuyên 16 GB), trống 30–50 GB trên SSD. Khi phát live, máy vừa chạy game vừa mã hóa video, nên nên có card đồ họa rời.

---

## 3. Kiến trúc

```
Người xem tặng quà / bình luận
        │
        ▼
   TikTok LIVE
        │  (thư viện không chính thức, kết nối WebCast push)
        ▼
 bridge/bridge.js  (Node.js)
   - đọc gifts.json: quà → hành động
   - xử lý combo quà
   - chế độ --test sinh quà giả
        │  WebSocket ws://localhost:8765, mỗi sự kiện 1 JSON
        ▼
 Game Unity
   - TikTokBridgeClient: nhận JSON, tự kết nối lại
   - ActionQueue: xếp hàng, chạy từng kịch bản một
   - WeddingGameManager: trạng thái + kịch bản
   - WeddingCharacter: animation, di chuyển, nhãn tên
   - UI: avatar, tên, bộ đếm, thông báo
        │
        ▼
 Cửa sổ game  →  TikTok LIVE Studio (quay cửa sổ)  →  người xem
```

**Lý do tách cầu nối Node riêng:** thư viện Node được cập nhật nhanh nhất mỗi khi TikTok thay đổi; Unity không phụ thuộc TikTok; test được toàn bộ game mà không cần lên live.

**Định dạng tin nhắn bridge → Unity** (UTF-8 JSON, mỗi tin một sự kiện):

```json
{"action":"steal_groom","user":"nam123","nickname":"Nam","avatarUrl":"https://...jpeg","giftName":"Heart Me","count":1}
```

---

## 4. Việc người dùng phải tự làm [NGƯỜI DÙNG]

- [ ] Cài Unity Hub, đăng nhập, nhận license Personal. Cài Unity 6 LTS kèm module **Windows Build Support**.
- [ ] Cài VS Code, extension **Unity** (Microsoft), Node.js LTS, Python 3.10+, `uv`, Git.
- [ ] Tạo tài khoản Adobe để dùng Mixamo; tải nhân vật và animation theo danh sách Claude Code đưa ra (giai đoạn 1).
- [ ] Chọn và nhập gói cảnh từ Asset Store (cần tài khoản Unity; kiểm tra giấy phép).
- [ ] Xem bằng mắt và duyệt: góc camera, ánh sáng, độ "đã" của animation.
- [ ] Tặng quà thử trên live để lấy tên và mã quà thật cho `gifts.json`.
- [ ] Tài khoản TikTok đủ điều kiện LIVE và dùng được **TikTok LIVE Studio**.

---

## 5. Các giai đoạn

### Giai đoạn 0 – Thiết lập project và nối Claude Code vào Unity

1. [NGƯỜI DÙNG] Tạo project Unity mới, template **Universal 3D**, tên `TikTokWedding`.
2. Khởi tạo git với `.gitignore` chuẩn cho Unity (bỏ `Library/`, `Temp/`, `Logs/`, `obj/`, `Build/`, `UserSettings/`).
3. Cài **MCP for Unity** (CoplayDev/unity-mcp) theo README: thêm package vào Unity qua Package Manager, rồi đăng ký server với Claude Code. Hướng dẫn người dùng từng bước nếu cần thao tác trong Editor.
4. Tạo `CLAUDE.md` ở thư mục gốc project (xem mục 9).
5. Đặt Game view sang độ phân giải **1080×1920**.

**Hoàn thành khi:** Claude Code đọc được Hierarchy của scene qua MCP và đọc được Console của Unity.

### Giai đoạn 1 – Nhân vật Mixamo và animation (mốc quan trọng nhất)

1. [NGƯỜI DÙNG] Tải từ Mixamo (FBX for Unity):
   - Nhân vật nam mặc vest và nhân vật nữ (dùng làm cô dâu): **With Skin**.
   - Animation: Idle, Walking, Kick (đá), Falling/Knocked Down (bị đá văng), Clapping hoặc Waving (khách mời). Chọn **Without Skin**, tích **In Place** nếu có.
   - Bỏ vào `Assets/Art/Characters/` và `Assets/Art/Animations/`.
2. Đặt **Rig → Animation Type = Humanoid** cho mọi file. Animation lấy Avatar từ model gốc.
3. Tạo Animator Controller dùng chung: các state Idle (mặc định), Walk, Kick, Fall; tham số `bool Walking`, `trigger Kick`, `trigger Fall`.
4. Trên component Animator: **tắt Apply Root Motion**. Vị trí do code điều khiển.
5. Dựng scene test: một nhân vật đứng giữa. Phím **K** = đá, **F** = ngã, **W** = đi bộ tại chỗ (dùng Input System mới).

**Hoàn thành khi:** [NGƯỜI DÙNG] bấm Play, bấm phím thì nhân vật đá, ngã, đi bộ mượt, không trượt hay xoay sai.

### Giai đoạn 2 – Dựng cảnh, camera, giao diện

1. [NGƯỜI DÙNG] Chọn gói sảnh cưới trên Asset Store. Nếu chưa có, Claude Code dựng tạm bằng khối cơ bản và vật liệu màu.
2. Đặt vị trí cố định: `GroomSlot`, `BrideSlot`, `GroomEntry`, `BrideEntry` (điểm nhân vật mới đi vào), `ExitPoint`.
3. Camera chính khung dọc, nhìn hai nhân vật từ trước, hơi cao. Thêm camera cận cảnh cho cú đá. Có thể dùng **Cinemachine** để chuyển góc.
4. UI Canvas (Screen Space – Overlay, tham chiếu 1080×1920):
   - 2 khung avatar tròn (RawImage + mask) kèm tên.
   - Thanh quà ở dưới (ảnh quà + tên hành động), cấu hình được.
   - Bộ đếm chỉ vàng + thanh tiến độ mục tiêu.
   - Dòng thông báo chạy.
   - Bảng "Cách chơi".
5. Nhãn tên world-space (TextMeshPro) trên đầu mỗi nhân vật, luôn quay về camera.

**Hoàn thành khi:** [NGƯỜI DÙNG] duyệt ảnh chụp màn hình khung 1080×1920 trông giống tinh thần game mẫu.

### Giai đoạn 3 – Logic game và giả lập bằng bàn phím

1. `GameAction` (lớp dữ liệu khớp JSON ở mục 3).
2. **`ActionQueue`:** mọi hành động vào hàng đợi; một coroutine chạy **từng kịch bản một** cho tới khi xong. Giới hạn độ dài hàng đợi (ví dụ 50). Riêng `gold` chỉ cộng số, có thể chạy ngay không cần xếp hàng.
3. `WeddingGameManager` giữ trạng thái: ai đang là chú rể, ai là cô dâu (user, nickname, avatar) và tổng chỉ vàng; cài đặt các kịch bản ở mục 1.
4. `WeddingCharacter` gồm:
   - `SetOwner(nickname)`
   - `WalkTo(target)` (bật `Walking`, quay mặt theo hướng đi)
   - `Kick()`
   - `KnockAway(direction)`: trigger `Fall`, bay theo đường cong parabol, xoay, rồi tự hủy.
   - Nâng cấp sau: dùng ragdoll.
5. Nhân vật mới sinh từ **prefab** (chú rể, cô dâu).
6. `AvatarLoader`: tải ảnh bằng `UnityWebRequestTexture`; lỗi hoặc rỗng thì dùng ảnh mặc định; có cache theo URL.
7. **Giả lập bàn phím:** phím 1–6 tương ứng sáu hành động, với tên ngẫu nhiên. Phím 7 bắn liên tiếp 10 hành động để thử hàng đợi.

**Hoàn thành khi:** bấm phím chạy đúng mọi kịch bản; bấm dồn dập thì các kịch bản xếp hàng chạy lần lượt, không chồng nhau; Console không có lỗi.

### Giai đoạn 4 – Hiệu ứng ("độ đã")

- Khi đá: chuyển camera cận cảnh 0,5–1 giây, hình nổ kiểu truyện tranh (sprite hoặc particle), rung camera, âm thanh.
- Hoa giấy và cánh hoa khi có chú rể hoặc cô dâu mới và khi mừng vàng; pháo hoa khi đạt mục tiêu.
- Thông báo chạy cho mọi sự kiện.
- Nhạc nền đám cưới **có bản quyền phù hợp** (nhạc miễn phí bản quyền), âm lượng chỉnh được.

**Hoàn thành khi:** [NGƯỜI DÙNG] duyệt.

### Giai đoạn 5 – Cầu nối TikTok (Node.js)

Thư mục `bridge/` ở thư mục gốc project:

- `package.json`: `"type": "module"`, phụ thuộc `tiktok-live-connector`, `ws`.
- `gifts.json`: danh sách `{ "match": "<tên quà hoặc mã quà>", "action": "<mã hành động>" }` và bảng lệnh chat để test (ví dụ `"!chure": "become_groom"`).
- `bridge.js`:
  - Chạy WebSocket server cổng **8765**, phát JSON tới mọi client.
  - `node bridge.js --test`: không kết nối TikTok, mỗi 2 giây gửi một sự kiện giả.
  - `node bridge.js <username>`: nghe live thật; **in log mọi quà** (tên, mã, giftType, repeatCount, repeatEnd) để người dùng điền `gifts.json`.
  - Nghe bình luận khớp bảng lệnh chat.
  - Tự kết nối lại khi lỗi hoặc mất kết nối, có cờ chống hẹn lặp.
- Xem các lưu ý đã kiểm chứng ở mục 6.1.

**Hoàn thành khi:** `--test` chạy và một client WebSocket thử nghiệm nhận được JSON đúng định dạng.

### Giai đoạn 6 – Nối Unity với cầu nối

1. `TikTokBridgeClient` dùng `System.Net.WebSockets.ClientWebSocket` (không cần package ngoài):
   - Đọc đủ khung tin (tới `EndOfMessage`).
   - Giải mã UTF-8, parse bằng `JsonUtility.FromJson<GameAction>`.
   - Đẩy vào `ActionQueue` **trên main thread** (dùng `ConcurrentQueue` + xử lý trong `Update`).
   - Tự kết nối lại sau 3 giây nếu rớt; hủy bằng `CancellationToken` trong `OnDestroy`.
2. Chỉ báo trạng thái kết nối nhỏ ở góc màn hình (chỉ trong bản dev).

**Hoàn thành khi:** chạy `node bridge.js --test` + Play Unity thì các kịch bản tự chạy theo quà giả. Tắt rồi bật lại bridge, Unity tự nối lại.

### Giai đoạn 7 – Build và lên live

1. Build Windows (.exe), chế độ cửa sổ 1080×1920 (hoặc 540×960 nếu màn hình nhỏ), khóa 30–60 FPS.
2. [NGƯỜI DÙNG] Trong TikTok LIVE Studio: thêm nguồn quay cửa sổ game, bố cục dọc.
3. Chạy `node bridge.js <username>` khi đã lên live; tặng thử từng quà, chép tên và mã vào `gifts.json`, khởi động lại bridge.
4. Chạy thử **ít nhất 2 giờ** liên tục để kiểm tra rò bộ nhớ, nhân vật sinh ra mà không bị hủy, mất kết nối.

**Hoàn thành khi:** buổi live thử 2 giờ không lỗi, mọi quà trong bảng kích hoạt đúng.

---

## 6. Lưu ý kỹ thuật

### 6.1 Thư viện TikTok (đã kiểm chứng trên `tiktok-live-connector` 2.5.0)

- Import: `import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector'`.
- **Phải truyền object tùy chọn:** `new TikTokLiveConnection(username, {})`. Chỉ truyền username sẽ lỗi ngay (`options.processInitialData` của undefined).
- Sự kiện: `WebcastEvent.GIFT`, `WebcastEvent.CHAT`, `WebcastEvent.STREAM_END`, `ControlEvent.DISCONNECTED`. Trong `WebcastEvent` **không có** `DISCONNECTED`.
- Trường của sự kiện quà:
  - `data.giftId`, `data.repeatCount`, `data.repeatEnd` (kiểu số).
  - `data.giftDetails.giftName`, `data.giftDetails.giftType`, `data.giftDetails.diamondCount`.
  - `data.user.uniqueId`, `data.user.nickname`, `data.user.profilePicture.urls` (mảng).
  - Nên đọc phòng thủ: thử thêm `data.giftName`, `data.giftType`, `data.uniqueId` nếu trường trên trống.
- **Quà combo:** với `giftType === 1`, sự kiện bắn liên tục khi combo đang chạy. Chỉ xử lý khi `repeatEnd` là true; quà loại khác xử lý ngay. Số lượng = `repeatCount`.
- Khi tài khoản không đang LIVE, `connect()` ném lỗi "Failed to retrieve Room ID from all sources" → thử lại sau 10 giây.
- Thư viện gọi **dịch vụ ký request bên ngoài** (`api.eulerstream.com`). Máy chạy bridge phải truy cập được địa chỉ này; khi dùng nhiều có thể cần đăng ký API key (tùy chọn `signApiKey`).
- Đây là thư viện **không chính thức** (dịch ngược), có thể hỏng khi TikTok thay đổi. Hãy ghim phiên bản trong `package.json` và cập nhật khi lỗi.
- **Ảnh đại diện:** Unity không đọc được `.webp`. Trong `profilePicture.urls` ưu tiên link `.jpeg`/`.jpg`/`.png`.
- **Tên quà có thể khác ngôn ngữ.** Luôn lấy tên và mã thật từ log, không đoán.

### 6.2 Unity

- Unity 6 dùng **Input System mới**: dùng `UnityEngine.InputSystem.Keyboard.current`.
- Animation Mixamo: Rig **Humanoid**, **In Place**, tắt **Apply Root Motion**. Nếu nhân vật trượt hoặc xoay sai thì kiểm tra lại ba điểm này đầu tiên.
- Nhân vật bị loại phải được `Destroy` sau khi ra khỏi màn hình (tránh rò bộ nhớ khi live dài).
- Không gọi API Unity từ thread nền; mọi thứ nhận từ WebSocket phải đưa về main thread.
- Không chạy hai kịch bản cùng lúc trên cùng một vị trí: mọi thứ đi qua `ActionQueue`.
- Tách cấu hình (tốc độ đi, thời gian camera cận cảnh, mục tiêu chỉ vàng) ra `ScriptableObject` để chỉnh trong Inspector mà không cần sửa code.

---

## 7. Chính sách và rủi ro

- Người phát chịu trách nhiệm cho mọi thứ xảy ra trong buổi live, **kể cả công cụ bên thứ ba**. Đọc kỹ Community Guidelines và chính sách LIVE / LIVE Gifts của TikTok trước khi phát.
- **Không** thiết kế cơ chế mang tính may rủi hoặc cờ bạc (vòng quay, rút thăm trúng thưởng đổi bằng quà).
- Tránh nội dung bạo lực quá mức: cú đá giữ phong cách hài, hoạt hình.
- Chỉ dùng tài nguyên có giấy phép phù hợp (Mixamo, Asset Store, nhạc miễn phí bản quyền). Không dùng nhân vật hay nhạc có bản quyền của người khác.
- Thư viện TikTok không chính thức có thể ngừng hoạt động bất cứ lúc nào. Game vẫn phải chạy được ở chế độ giả lập.

---

## 8. Cấu trúc thư mục đề xuất

```
TikTokWedding/
├─ CLAUDE.md
├─ GAME_PLAN.md            (file này)
├─ bridge/
│  ├─ package.json
│  ├─ bridge.js
│  └─ gifts.json
└─ Assets/
   ├─ Art/
   │  ├─ Characters/
   │  ├─ Animations/
   │  └─ Environment/
   ├─ Audio/
   ├─ Prefabs/             (Groom, Bride, hiệu ứng)
   ├─ Scenes/
   │  ├─ Wedding.unity
   │  └─ AnimationTest.unity
   ├─ Scripts/
   │  ├─ Core/             (GameAction, ActionQueue, WeddingGameManager)
   │  ├─ Characters/       (WeddingCharacter, FaceCamera)
   │  ├─ Network/          (TikTokBridgeClient)
   │  ├─ UI/               (AvatarLoader, HUD, Announcer)
   │  └─ Dev/              (KeyboardSimulator)
   └─ Settings/            (ScriptableObject cấu hình)
```

---

## 9. Nội dung gợi ý cho `CLAUDE.md`

```markdown
# TikTokWedding – ghi chú cho Claude Code
- Đặc tả và kế hoạch đầy đủ: GAME_PLAN.md. Đọc trước khi làm.
- Unity 6 LTS, URP, Input System MỚI (không dùng UnityEngine.Input).
- Người dùng chưa từng dùng Unity: thao tác Editor phải hướng dẫn từng bước.
- Dùng MCP for Unity để đọc scene/Console; sau mỗi thay đổi kiểm tra Console sạch lỗi.
- Mọi hành động game đi qua ActionQueue; không gọi API Unity ngoài main thread.
- Cầu nối TikTok ở bridge/, Node.js, WebSocket cổng 8765, xem mục 6.1 của GAME_PLAN.md.
- Làm từng giai đoạn; dừng ở bước [NGƯỜI DÙNG] để chờ xác nhận.
- Tiến độ hiện tại: Giai đoạn 0.  (cập nhật dòng này sau mỗi giai đoạn)
```

---

## 10. Tài liệu tham khảo

- Unity – System requirements (Unity 6): https://docs.unity.com/en-us/engine/6000.0/manual/get-started/install-and-upgrade/getting-started-installing-unity/system-requirements
- MCP for Unity (CoplayDev): https://glama.ai/mcp/servers/@CoplayDev/unity-mcp
- Unity MCP – tổng quan các lựa chọn 2026: https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/unity-mcp
- tiktok-live-connector (npm): https://npmjs.com/package/tiktok-live-connector
- TikTokLiveSharp (C#/Unity, phương án thay thế): https://github.com/frankvHoof93/TikTokLiveSharp
- Hướng dẫn làm game TikTok LIVE (kiến trúc qua WebSocket): https://tik.tools/guides/tiktok-live-game
- Mixamo: https://www.mixamo.com
- TechCrunch – hướng dẫn mới cho creator LIVE: https://techcrunch.com/2025/08/15/tiktoks-new-guidelines-add-subtle-changes-for-live-creators-ai-content-and-more/
