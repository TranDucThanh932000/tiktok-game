# Đám Cưới Online

Game đám cưới 3D cho TikTok LIVE, làm theo [GAME_PLAN.md](../GAME_PLAN.md). Người xem tặng quà để làm chú rể, cô dâu, cướp vai của người đang đứng, hủy hôn và mừng chỉ vàng.

Bản kế hoạch chọn Unity, nhưng game này làm bằng Node + Three.js trên trình duyệt như các game khác trong thư mục. Không cần cài Unity hay đăng nhập Mixamo.

- **Nhân vật người thật** lấy từ bộ [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) (giấy phép MIT, xem `public/avatars/LICENSE-Rocketbox.txt`): 3 chú rể mặc vest, 2 cô dâu (thêm váy cưới, khăn voan, vương miện, bó hoa bằng code), 2 MC (nam, nữ, cầm micro), 8 mẫu khách mời. Phù dâu phù rể đứng sau trên sân khấu, khách ngồi quanh 6 bàn tròn dưới sân khấu. Động tác đứng, đi, vỗ tay, reo hò, vẫy tay, uống là động tác quay từ người thật của bộ này. Động tác đá, bị đá văng, vái lạy, trao nhẫn, rót rượu, cắt bánh là động tác tự viết, áp lên bộ xương người thật.
- **Sảnh cưới** dựng bằng code với vật liệu thật (PBR): sân khấu tròn mặt đá bóng viền đèn vàng, phông vải xếp ly có đèn hắt hồng, rèm nhung vén, cổng hoa hồng, chữ Hỷ mạ vàng, cột trụ, đèn chùm pha lê, bàn tiệc phủ khăn satin với ghế bọc nơ, trụ hoa nến dọc thảm đỏ, đèn sân khấu đổ bóng. Ánh sáng và phản chiếu lấy từ ảnh HDRI một sảnh tiệc thật. Ảnh HDRI và texture (đá, satin, nhung) lấy từ Poly Haven, giấy phép CC0, nằm trong `public/hall` (tải lại bằng `node scripts/build-hall.mjs`).
- Tiếng hiệu ứng do code tạo ra. Không có nhạc nền.
- Hai MC (nam và nữ) đọc bằng Vbee, xem mục **MC** bên dưới.

Nhân vật đã nén sẵn trong `public/avatars` và `public/anims`. Muốn đổi nhân vật thì sửa danh sách `AVATARS` trong `scripts/build-avatars.mjs` rồi chạy `node scripts/build-avatars.mjs` (cần ffmpeg; file gốc tải về `D:	iktok-cache
ocketbox`). Nếu tải nhân vật lỗi, game tự dùng nhân vật hoạt hình cũ.

## Chạy

Bấm đúp [start.bat](start.bat). Nó mở 3 cửa sổ:

- cửa sổ server (đóng cửa sổ này là tắt game);
- cửa sổ game 9:16 tại <http://127.0.0.1:3018/>, dùng làm nguồn quay trong TikTok LIVE Studio;
- [bảng điều khiển](http://127.0.0.1:3018/panel.html) để chạy thử và quản lý.

Chạy bằng dòng lệnh (trong thư mục này, dùng Node của Laragon):

| Lệnh | Việc |
| --- | --- |
| `npm start` | Nghe LIVE của kênh `tiktokUsername` trong `config.json` |
| `npm start -- ten_kenh` | Nghe LIVE của kênh khác |
| `npm run test-mode` | Không nối TikTok, cứ 2 giây sinh một quà giả (`--test` trong kế hoạch) |
| `npm test` | Kiểm thử luật chơi |

`tiktokUsername` đang để trống. Điền tên kênh (không có `@`) trước khi lên live.

## Cách chơi

| Quà | Việc xảy ra |
| --- | --- |
| Hoa hồng | Đăng ký làm chú rể. Vai trống thì lên ngay. Vai đã có người thì vào hàng chờ (hiện dưới khung avatar). |
| TikTok | Đăng ký làm cô dâu, cách tính giống chú rể. |
| Kem (Bing Chilling, 5 xu) | Đổi vai chú rể: người mới đi vào, đá văng chú rể cũ (camera cận cảnh, chữ "BỐP!", rung màn hình) rồi thế chỗ. |
| Bắn tim | Đổi vai cô dâu, cách tính giống quà Kem. |
| Bánh vòng | Hủy hôn: trái tim vỡ, "BÙM!", cả hai văng khỏi sân khấu. |
| Kem ốc quế (1 xu) | Mừng 1 chỉ vàng. |

- Quà nào cũng cộng chỉ vàng, 1 xu = 1 chỉ (`goldPerCoin`). Quà không có trong bảng thì chỉ cộng chỉ vàng. Đủ mốc thì bắn pháo hoa: 300 → 1.000 → 3.000 → 6.000 → 10.000, sau đó cứ 5.000 một mốc.
- Bảng "Cách chơi" có hơn 4 quà nên chạy liên tục từ phải sang trái như cuộn phim.
- Người đang giữ vai mà đăng ký lại vai đó thì không có màn đá: nhân vật vẫy tay, tim bay lên.
- Thả tim thì tim bay lên từ giữa sân khấu.

## Nghi lễ cưới

Khi có đủ cô dâu và chú rể, sau 5 giây chuẩn bị, đám cưới tự chạy lần lượt 8 nghi thức (khoảng 1 phút rưỡi):

1. **Lễ rước dâu**: đội bê tráp phủ khăn đỏ đi ngang sân khấu, chú rể sang trao hoa cho cô dâu.
2. **Lễ gia tiên**: bàn thờ có bát hương, đôi nến, mâm ngũ quả, bức hoành chữ Hỷ. Cô dâu chú rể quay vào vái ba lần.
3. **Lễ lên đèn**: thắp hai ngọn nến hai bên rồi đến ngọn nến hạnh phúc ở giữa.
4. **Trao nhẫn cưới**: camera cận cảnh, chú rể trao nhẫn cho cô dâu.
5. **Rót rượu tháp ly**: rượu chảy từ ly trên cùng xuống các tầng.
6. **Cắt bánh cưới**: bánh ba tầng, hoa giấy bung ra.
7. **Uống rượu giao bôi**.
8. **Cảm ơn hai họ**: cúi chào quan khách, mưa cánh hoa và pháo hoa.

- Dòng tiến độ dưới thanh chỉ vàng cho biết đang ở nghi thức nào (ví dụ "4/8 · Trao nhẫn cưới"). Lời MC chạy ở dòng thông báo.
- **Có người đổi vai (Kem hoặc Bắn tim) giữa lúc làm lễ:** sau màn đá văng, lễ cưới **tổ chức lại từ đầu** cho cặp mới.
- Hủy hôn thì dừng lễ.
- Làm xong lễ cuối: hiện băng "Trăm năm hạnh phúc", cặp đôi đi xuống lễ đường rồi rời sân khấu, dòng "Đã cưới N cặp" tăng lên. Người đứng đầu hàng chờ của mỗi vai lên thay, đủ đôi thì làm lễ cho cặp mới. Sau khi hủy hôn cũng vậy.
- Muốn đổi tên, lời MC hay thời lượng từng nghi thức thì sửa `ceremony.steps` trong `config.json`. Thứ tự và `id` phải giữ nguyên, vì mỗi `id` gắn với một cảnh diễn riêng.

## MC

Hai MC đám cưới, giọng nam và giọng nữ, đọc bằng Vbee. Cần 4 dòng trong `.env` của game: `VBEE_TOKEN`, `VBEE_APP_ID`, `VBEE_VOICE_MALE`, `VBEE_VOICE_FEMALE` (tùy chọn `VBEE_SPEED`).

- MC lên tiếng khi: có người lên vai, đăng ký vào hàng chờ, đổi vai, hủy hôn, mừng vàng từ 10 chỉ, đủ mốc pháo hoa, từng nghi thức cưới, tiễn cặp đôi. Lúc vắng, cứ khoảng 40 giây MC nói một câu mời gọi (`mc.idleSeconds` trong `config.json`).
- Lời nói nằm trong [mc.json](mc.json). Mỗi tình huống có 3 đến 8 cách nói, nhiều chỗ là đoạn hai MC đối đáp. MC chọn ngẫu nhiên và không lặp lại những cách vừa dùng. Thêm hoặc sửa câu thì giữ dạng `"nam: ..."` / `"nu: ..."` và các chỗ điền `{ten}`, `{cu}`, `{chure}`, `{codau}`, `{moc}`, `{so}`.
- Mỗi câu được cắt thành đoạn cố định và đoạn tên người chơi. Đoạn cố định được tạo một lần lúc bật server lần đầu (khoảng 270 đoạn, mất vài phút), lưu trong `data/tts` và dùng lại mãi. Tên người chơi được tạo khi cần, đọc chậm hơn khoảng một giây.
- Tên có chữ lạ, biểu tượng hay số được làm sạch trước khi đọc. Không đọc được thì MC gọi là "bạn".
- Màn hình hiện phụ đề lời MC. Bảng điều khiển có nút bật/tắt MC và nhật ký lời MC.

## Camera

Camera tự đổi góc mỗi 6–9 giây, lúc cắt cảnh, lúc lia mượt, và trôi chậm trong mỗi góc nên hình không đứng yên. Các góc: toàn cảnh, cận cô dâu chú rể, từ hàng ghế khách nhìn lên, hai góc chéo, góc cao, cận riêng chú rể, cận riêng cô dâu, cận khách ngồi bàn. MC nào đang nói thì camera hay quay sang MC đó. Màn đá văng, hủy hôn, trao nhẫn, uống giao bôi có góc máy riêng; xong màn thì camera tự đổi góc tiếp.

Hai MC đứng hai góc sân khấu, tay phải cầm micro (đầu micro luôn hướng vào miệng). Lúc nói, tay kia và cả người làm động tác quay từ người thật, đổi kiểu theo tình huống: nói bình thường, dẫn chương trình, giơ tay giới thiệu về phía cô dâu chú rể, nói hào hứng hoặc cười lớn khi có đổi vai, hủy hôn. MC còn lại đứng nghe, có khi cười theo.

## Hàng đợi kịch bản

Server giữ trạng thái và hàng đợi, mỗi lúc chỉ chạy một kịch bản (lên vai, đổi vai, hủy hôn, tiễn cặp đôi), nên quà dồn dập vẫn được diễn lần lượt, không chồng nhau. Từ 3 kịch bản chờ trở lên, các kịch bản chạy nhanh dần (tối đa gấp đôi). Hàng đợi giữ tối đa 50 kịch bản (`queueLimit`). Khi hàng đầy, quà vẫn được cộng chỉ vàng nhưng không có kịch bản.

Mở lại cửa sổ game giữa chừng thì trang vẽ ngay trạng thái hiện tại. Tắt server rồi bật lại thì chú rể, cô dâu, chỉ vàng, kỷ lục, hàng chờ đăng ký và số cặp đã cưới được khôi phục từ `data/state.json`. Nghi thức đang dở thì diễn lại từ đầu nghi thức đó.

## Lấy tên và mã quà thật

Tên quà có thể khác nhau tùy ngôn ngữ. Khi đang live, cửa sổ server in mọi quà nhận được:

```
[Quà gốc] Nam: "Rose" mã 5655 · giftType 1 · 1 xu · repeatCount 3 · repeatEnd 1
[Quà chưa gắn hành động → chỉ vàng] Nam: Heart Me #7934 (1 xu) x1
```

Chép tên vào `names` hoặc mã vào `ids` của quà tương ứng trong `config.json`, rồi khởi động lại server. Server khớp mã trước, sau đó mới khớp tên (không phân biệt hoa thường, có dấu hay không). Quà combo chỉ được tính phần tăng thêm, nên không bị cộng trùng.

Muốn đổi quà nào làm việc gì thì sửa `action` trong mục `gifts`: `become_groom` / `become_bride` (đăng ký), `steal_groom` / `steal_bride` (đổi vai), `cancel_wedding`, `gold`.

## Cấu hình khác (`config.json`)

| Khóa | Ý nghĩa |
| --- | --- |
| `goals`, `goalStepAfter` | Các mốc bắn pháo hoa |
| `ceremony.startDelayMs`, `ceremony.farewellMs`, `ceremony.steps` | Thời gian chuẩn bị, màn tiễn cặp đôi, danh sách nghi thức |
| `waitlistLimit` | Số người tối đa trong hàng chờ của mỗi vai (30) |
| `timing.claimMs` / `stealMs` / `cancelMs` | Độ dài từng kịch bản (mili giây) |
| `timing.speedupAt`, `timing.maxSpeed` | Từ bao nhiêu kịch bản chờ thì tăng tốc, và tốc độ tối đa |
| `chatCommands` | Lệnh chat để thử (`!chure`, `!codau`, `!doichure`, `!doicodau`, `!huyhon`, `!vang`) |
| `chatCommandsLive` | `false`: lệnh chat chỉ chạy từ bảng điều khiển. Bật `true` thì người xem gõ lệnh cũng được, tức là chơi không cần quà. |
| `renderScale` | Giảm xuống 0,6–0,8 nếu máy giật khi vừa chạy game vừa phát live |

Thêm `?mute` vào địa chỉ trang game để tắt tiếng (cả giọng MC), `?dev` để hiện trạng thái kết nối ở góc dưới.

## Bảng điều khiển

- Tặng thử từng quà theo tên người xem, thêm link ảnh đại diện nếu muốn.
- **Bắn liên tiếp 10 hành động** để thử hàng đợi. **Tự chạy quà giả** để để máy tự chơi.
- **Tạm dừng**, **Xóa hàng chờ**, **Đám cưới mới**. Trước buổi live nên bấm **Đám cưới mới** để xóa các lượt chạy thử.

## Chưa kiểm chứng

- Chưa thử với phiên LIVE thật. Tên quà "TikTok", "Finger Heart", "Doughnut", "Ice Cream Cone" là phỏng đoán. Quà Kem lấy mã 7412 từ game Sơn Tinh Thủy Tinh. Hãy xem log `[Quà gốc]` rồi sửa `config.json` theo.
- Icon quà lấy từ ảnh gốc của TikTok. Kem ốc quế (`kem-oc-que.webp`) và Kem 5 xu (`kem.webp`) đã đối chiếu với danh mục quà trên streamtoearn.io.
- Chưa đo FPS trong lúc LIVE Studio đang phát, và chưa chạy thử liên tục 2 giờ như giai đoạn 7 của kế hoạch.
