# Virtual Dance Club – AI Coding Brief

> Tài liệu đặc tả để AI coding agent triển khai MVP game tương tác TikTok LIVE bằng Unity 3D.
> Ưu tiên: xây dựng gameplay chạy độc lập trước, sau đó mới kết nối TikTok LIVE.

## 1. Mục tiêu sản phẩm

Xây dựng một thế giới **Virtual Dance Club 3D** tối giản: chỉ có một DJ, một sàn nhảy và đám đông dancer.

Người xem TikTok không cần học cách chơi:
- Comment `hey`: tham gia hàng chờ và xuất hiện trên sàn khi có chỗ.
- Khi chưa được chọn biểu diễn: avatar nhảy chill.
- Khi người xem tặng gift: hệ thống chọn người biểu diễn, focus camera và chạy choreography theo giá trị gift.
- Quà càng giá trị: màn biểu diễn càng đặc biệt, camera/ánh sáng/crowd reaction càng ấn tượng.
- Các dancer xung quanh quay lại nhìn, cổ vũ hoặc nhảy theo.
- Kết thúc màn biểu diễn: performer trở lại crowd, camera về góc toàn cảnh.

**Không xây dựng** hệ thống quầy bar, gọi đồ uống, bàn ghế, tiền ảo, nhiệm vụ hay bản đồ nhiều khu vực.

## 2. Công nghệ và nguyên tắc

- Game engine: Unity 6.
- Render: Universal Render Pipeline (URP).
- Ngôn ngữ: C#.
- 3D assets: Blender; animation mẫu có thể dùng Mixamo hoặc nguồn được cấp phép.
- Camera: Cinemachine.
- TikTok event backend: Node.js hoặc Python.
- Kết nối backend–Unity: WebSocket.
- Phát LIVE: OBS Studio, khung hình dọc 9:16.

Thiết kế theo hướng modular, dễ thay adapter nhận sự kiện TikTok. Không giả định có một API TikTok LIVE chính thức dùng được cho mọi tài khoản; cần xác minh nguồn event và quyền truy cập thực tế.

## 3. Quy mô MVP

| Thành phần | Mục tiêu |
|---|---:|
| DJ | 1 |
| Dancer/crowd tối đa | 30–50 |
| Performer chính đồng thời | 1 |
| Chill animations ban đầu | 3–6 |
| Choreography ban đầu | Ít nhất 3, mở rộng lên 15 |
| Gift tiers | 5 |
| Camera presets | 5 |
| Dance floor | 1 |

Tối ưu hiệu năng theo nhóm:
- Performer: animation và hiệu ứng đầy đủ.
- Crowd gần: animation đầy đủ hoặc đơn giản.
- Crowd xa: animation nhẹ, giảm tần suất cập nhật và shadow.
- Dùng object pooling, LOD khi phù hợp và giới hạn realtime lights/particles.

## 4. Character System

### Yêu cầu

Mỗi người xem được tạo một avatar 3D ngẫu nhiên, có username và ngoại hình/outfit khác nhau.

Avatar nên được tạo từ các thành phần modular:
- Body type.
- Face.
- Hairstyle và hair color.
- Top, bottom, shoes.
- Accessories.

Dùng skeleton/rig chuẩn chung để outfit có thể thay thế mà vẫn dùng lại animation. Tạo outfit preset theo phong cách để tránh phối đồ ngẫu nhiên thiếu thẩm mỹ. Xử lý clipping giữa cơ thể và quần áo.

### Dữ liệu avatar

```csharp
[System.Serializable]
public class AvatarData
{
    public string UserId;
    public string Username;
    public int Seed;

    public string BodyId;
    public string FaceId;
    public string HairId;
    public string HairColorId;
    public string OutfitPresetId;
    public string TopId;
    public string BottomId;
    public string ShoesId;
    public string AccessoryId;
}
```

Dùng seed ổn định dựa trên user ID để có thể tái tạo avatar. Nếu người dùng quay lại trong cùng phiên LIVE, ưu tiên khôi phục avatar cũ.

### Character lifecycle

`Waiting → Spawning → Chill → Selected → Performing → Cooldown → Chill`

Khi hết slot:
- Đưa người comment mới vào queue FIFO.
- Khi có slot trống, lấy người tiếp theo trong queue.
- Có timeout/cleanup cho người không hoạt động.
- Không spawn vô hạn; tái sử dụng object qua pool.

### Các module

- `CharacterManager`: quản lý roster và giới hạn số nhân vật.
- `AvatarGenerator`: tạo ngoại hình và outfit.
- `CharacterSpawner`: spawn/despawn và queue.
- `CharacterPool`: tái sử dụng prefab.
- `NameTag`: hiển thị username.

## 5. Dance Animation System

Tách animation thành hai nhóm.

### Ambient / Chill Dance

Tối thiểu 3 animation ban đầu, mục tiêu 6:
- Head Bob.
- Shoulder Groove.
- Side Step.
- Body Wave.
- Hand Groove.
- Freestyle Loop.

Các dancer không được đồng bộ cùng một động tác và cùng thời điểm. Random animation, offset thời gian bắt đầu và chuyển state bằng crossfade để crowd tự nhiên.

### Performance Choreography

Tạo 5 tier:
1. Casual – shuffle/hip-hop nhẹ.
2. Groove – popping/body wave/footwork.
3. Hype – breakdance hoặc động tác nổi bật.
4. Superstar – choreography phức tạp, crowd đồng diễn.
5. Legend – màn trình diễn đặc biệt và finale toàn sàn.

Tạo nhiều choreography cho mỗi tier để hạn chế lặp. Dùng animation có quyền sử dụng hoặc choreography tự sản xuất; không sao chép nguyên bản màn biểu diễn được bảo hộ.

### Animator

Dùng Animator Controller với các nhóm state:
- Chill.
- Performance.
- Reaction.

Các tham số có thể gồm `DanceLevel`, `DanceId`, `IsPerforming` và trigger bắt đầu/kết thúc. Ambient dance ưu tiên In-place; performance cũng ưu tiên In-place để giữ vị trí sân khấu ổn định. Choreography có di chuyển phải dùng điểm đánh dấu và kiểm soát vị trí.

### Choreography data

Dùng ScriptableObject, không hardcode từng điệu nhảy trong gameplay code.

```csharp
[CreateAssetMenu(menuName = "Dance Club/Choreography")]
public class ChoreographyData : ScriptableObject
{
    public string choreographyId;
    public int danceLevel;

    public AnimationClip introClip;
    public AnimationClip mainClip;
    public AnimationClip highlightClip;
    public AnimationClip finaleClip;

    public float duration;
    public string cameraPreset;
    public string crowdReactionPreset;
    public string lightingPreset;
}
```

Choreography phát ra các event:
- `PerformanceStarted`
- `IntroCompleted`
- `HighlightStarted`
- `FreezeStarted`
- `FinaleStarted`
- `PerformanceCompleted`

## 6. Camera Director

Dùng Cinemachine. Chỉ có một active performer tại một thời điểm.

Camera presets:
- `CAM_WIDE`: toàn cảnh, Chill Mode.
- `CAM_MEDIUM`: gift tier 1–2.
- `CAM_CLOSE`: highlight/pose.
- `CAM_TRACKING`: gift tier 3–4.
- `CAM_CINEMATIC`: gift tier 5, orbit/close-up.
- `CAM_FINALE`: toàn cảnh ở đoạn kết.

Camera phản ứng theo choreography event, không tự đoán animation:
- Intro: chuyển từ wide sang medium, bật spotlight.
- Main: focus performer.
- Highlight: tracking hoặc close-up.
- Freeze/final pose: giảm chuyển động camera, giữ khung hình.
- Finale: mở rộng để thấy crowd.
- Completed: chuyển mượt về wide.

Yêu cầu:
- Chuyển cảnh mượt, không giật.
- Không che performer.
- Hạn chế cắt cảnh liên tục khi có nhiều gift.
- Hiển thị username dễ đọc khi performer được focus.
- Bố cục an toàn cho video dọc 9:16.

## 7. Crowd Reaction

Khi có performer:
- `LookAt`: quay đầu/cơ thể về phía performer.
- `Cheer`: giơ tay hoặc cổ vũ.
- `DanceAlong`: nhảy theo.
- `MakeSpace`: lùi ra tạo khoảng trống.
- `Finale`: đồng diễn ở tier cao.

Không để toàn bộ crowd chạy cùng một animation. Chọn phản ứng theo nhóm/ngẫu nhiên có kiểm soát. Chỉ kích hoạt mức phản ứng tương ứng tier để gift lớn tạo khác biệt rõ ràng.

## 8. Gift Choreography Mapping

Luồng xử lý:
1. Backend nhận gift event.
2. Chuẩn hóa dữ liệu và chống duplicate.
3. `GiftResolver` xác định tổng coin hợp lệ.
4. `DanceTierResolver` xác định tier.
5. `ChoreographySelector` chọn choreography trong tier.
6. `GiftPriorityQueue` xếp lượt.
7. `DanceSessionManager` bắt đầu một performance.
8. Camera, lighting và crowd nhận cùng performance context.

Ngưỡng minh họa, phải cấu hình được và không hardcode:
| Tổng coin | Tier | Thời lượng tham khảo |
|---:|---|---:|
| 1–9 | Casual | 6 giây |
| 10–49 | Groove | 8 giây |
| 50–199 | Hype | 12 giây |
| 200–999 | Superstar | 16 giây |
| 1000+ | Legend | 22 giây |

Các ngưỡng là giá trị ví dụ, cần điều chỉnh theo dữ liệu gift thực tế. Không giả định payload TikTok có đúng schema ví dụ; backend adapter phải map từ nguồn event thực tế.

### Combo và queue

- Có thể cộng dồn gift từ cùng người trong một cửa sổ thời gian cấu hình.
- Phải xử lý semantics gift/combination/final event của nguồn event để tránh cộng trùng.
- Mỗi gift hợp lệ tạo một performance request.
- Khi đang biểu diễn, request mới vào queue; không cắt ngang choreography hiện tại.
- Có thể ưu tiên gift giá trị cao, nhưng cần quy tắc FIFO khi bằng điểm và cơ chế tránh starvation cho gift nhỏ.
- Giới hạn queue và thời lượng chờ; quy định rõ cách xử lý khi queue đầy.
- `DanceSessionManager` là nguồn sự thật duy nhất về performer hiện tại.

## 9. Game State

```csharp
public enum DanceClubState
{
    Chill,
    PreparingPerformance,
    Performing,
    Finale,
    ReturningToChill
}
```

`DanceSessionManager` quản lý chuyển trạng thái và điều phối các module. Các module khác không tự ý thay đổi trạng thái toàn game.

Luồng chuẩn:

`Chill → PreparingPerformance → Performing → Finale → ReturningToChill → Chill`

## 10. Backend và giao tiếp Unity

Unity không nên xử lý trực tiếp payload thô từ TikTok. Backend adapter chuẩn hóa thành message nội bộ.

Ví dụ comment:

```json
{
  "action": "SPAWN_DANCER",
  "userId": "platform-user-id",
  "username": "viewer_name",
  "eventId": "unique-event-id"
}
```

Ví dụ gift:

```json
{
  "action": "GIFT_RECEIVED",
  "userId": "platform-user-id",
  "username": "viewer_name",
  "giftId": "gift-id",
  "coinValue": 100,
  "quantity": 1,
  "eventId": "unique-event-id",
  "isFinalEvent": true
}
```

Đây là internal contract mẫu, không phải schema chính thức của TikTok.

Yêu cầu backend:
- Adapter riêng cho nguồn TikTok LIVE.
- Chuẩn hóa comment/gift.
- Validate và chống duplicate bằng event ID nếu có.
- Rate limit comment và spawn.
- Xử lý reconnect.
- Log sự kiện và lỗi.
- Gửi message qua WebSocket.
- Không thực thi lệnh tùy ý từ comment.

Yêu cầu Unity:
- WebSocket client reconnect có backoff.
- Parse message và đưa vào main-thread queue trước khi thao tác GameObject.
- Không để lỗi mạng làm crash game.
- Có chế độ giả lập event offline.

## 11. Cấu trúc Unity project

```text
Assets/
├── Art/
│   ├── Characters/
│   ├── Outfits/
│   ├── Environment/
│   └── Materials/
├── Animations/
│   ├── Chill/
│   ├── Casual/
│   ├── Groove/
│   ├── Hype/
│   ├── Superstar/
│   ├── Legend/
│   └── Reactions/
├── Prefabs/
│   ├── Characters/
│   ├── DJ/
│   ├── Stage/
│   └── Lighting/
├── ScriptableObjects/
│   ├── Avatars/
│   ├── Choreographies/
│   ├── GiftMappings/
│   └── CameraPresets/
├── Scripts/
│   ├── Characters/
│   ├── Animation/
│   ├── Camera/
│   ├── Crowd/
│   ├── Gifts/
│   ├── TikTok/
│   ├── Networking/
│   └── Game/
├── Audio/
├── UI/
└── Scenes/
    └── DanceClub.unity
```

Các class chính:
- `CharacterManager`
- `AvatarGenerator`
- `CharacterSpawner`
- `CharacterPool`
- `DanceController`
- `ChoreographyPlayer`
- `GiftResolver`
- `ChoreographySelector`
- `GiftPriorityQueue`
- `DanceSessionManager`
- `CameraDirector`
- `CrowdReactionController`
- `LightingController`
- `TikTokEventReceiver`
- `WebSocketClient`

## 12. Debug mode – bắt buộc có trước TikTok integration

Tạo Debug Panel hoặc phím tắt trong Unity:
- `1`: spawn 1 dancer.
- `2`: spawn 10 dancers.
- `3`: spawn tối đa 50 dancers.
- `Q/W/E/R/T`: kích hoạt gift tier 1–5.
- `C`: trở về Chill Mode.
- `F`: bật/tắt camera debug.

MVP phải có thể kiểm thử toàn bộ gameplay bằng debug event mà không cần TikTok LIVE.

## 13. MVP implementation plan

### Milestone 1 – Scene và visual prototype
- Tạo scene `DanceClub`.
- Dựng một DJ Booth và một dance floor.
- Camera wide, ánh sáng neon.
- Một DJ và 5 dancer mẫu.
- Một ambient animation loop.

**Done khi:** mở scene thấy DJ và crowd nhảy chill ổn định.

### Milestone 2 – Character system
- Chuẩn hóa rig.
- Tạo modular avatar và outfit preset.
- Random avatar bằng seed.
- Username/name tag.
- Spawn/despawn, pool và queue.
- Kiểm thử 30–50 avatar.

**Done khi:** spawn được crowd có ngoại hình đa dạng và quản lý được slot.

### Milestone 3 – Dance system
- 3 chill animations.
- Ít nhất 3 choreography khác nhau.
- Choreography ScriptableObject.
- Performance state.
- Crowd reactions cơ bản.

**Done khi:** kích hoạt được một màn biểu diễn hoàn chỉnh bằng debug command.

### Milestone 4 – Camera và stage direction
- Cinemachine presets.
- Chuyển cảnh wide/medium/close/tracking/finale.
- Đồng bộ camera theo choreography events.
- Spotlight và lighting presets.

**Done khi:** màn biểu diễn trông có chủ đích như một show sân khấu.

### Milestone 5 – Gift system
- Gift mapping cấu hình được.
- 5 tiers.
- Choreography selector.
- Combo window.
- Priority queue.
- Không cắt ngang performance hiện tại.

**Done khi:** debug gift tier 1–5 kích hoạt đúng choreography, camera và crowd reaction.

### Milestone 6 – TikTok integration
- Xác minh nguồn event TikTok LIVE.
- Viết backend adapter.
- WebSocket.
- Comment `hey` → spawn/queue.
- Gift → performance queue.
- Kiểm thử reconnect, duplicate và spam.

**Done khi:** event LIVE thực tế điều khiển được game ổn định.

### Milestone 7 – Stream optimization
- Tối ưu URP.
- Baked lighting cho môi trường.
- Hạn chế realtime shadows và transparent particles.
- LOD/giảm cập nhật crowd.
- Kiểm thử 9:16 qua OBS.
- Chạy soak test trong thời gian dài.

## 14. Acceptance criteria

- [ ] Một DJ và một dance floor hoạt động.
- [ ] Có thể hiển thị 30–50 nhân vật theo giới hạn hiệu năng.
- [ ] Avatar có ngoại hình/outfit đa dạng và tái tạo được bằng seed.
- [ ] Comment test tạo avatar hoặc đưa vào queue.
- [ ] Crowd luôn có hoạt động chill khi không có performance.
- [ ] Gift tier 1–5 gọi đúng choreography.
- [ ] Chỉ có một performer chính tại một thời điểm.
- [ ] Gift mới không cắt ngang màn đang chạy.
- [ ] Crowd reaction phù hợp với tier.
- [ ] Camera chuyển cảnh mượt và trở lại wide.
- [ ] Có debug mode không cần TikTok.
- [ ] Có xử lý duplicate event, reconnect và spam.
- [ ] Game chạy ổn định ở khung hình dọc 9:16.

## 15. Hướng dẫn cho AI coding agent

Hãy triển khai dự án theo từng milestone, không cố tạo toàn bộ game trong một lần.

Quy tắc làm việc:
1. Trước tiên kiểm tra repository, Unity version, packages và cấu trúc hiện có.
2. Nếu project chưa có, tạo cấu trúc và scene tối thiểu.
3. Đề xuất kế hoạch file/class trước khi tạo nhiều file.
4. Viết code có thể compile; không tạo pseudocode ở những phần được yêu cầu triển khai.
5. Tách dữ liệu cấu hình khỏi logic bằng ScriptableObject.
6. Không hardcode gift thresholds, choreography IDs hoặc số lượng crowd.
7. Tạo mock event/debug panel trước khi tích hợp TikTok.
8. Sau mỗi milestone, kiểm tra compile errors và hướng dẫn cách test trong Unity Editor.
9. Không tự giả định API/schema TikTok; yêu cầu cấu hình adapter theo nguồn event thực tế.
10. Ưu tiên một vertical slice hoàn chỉnh: 1 DJ, 10 dancer, chill mode, 3 gift choreography, camera director và crowd reaction. Sau khi chạy tốt mới mở rộng 30–50 nhân vật và 5 gift tiers.

**Nhiệm vụ đầu tiên:** kiểm tra project hiện tại và triển khai Milestone 1. Không chuyển sang milestone tiếp theo cho đến khi milestone hiện tại có thể chạy và được kiểm thử.
