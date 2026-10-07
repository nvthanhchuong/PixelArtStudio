# Pixel Studio V2

Nâng cấp editor hiện có bằng **Next.js App Router, React, TypeScript, Tailwind CSS, Canvas 2D, Zustand và IndexedDB**. Giữ giao diện, bảng màu, canvas creation, responsive và cách deploy GitHub + Vercel. Không thêm dependency, backend, tài khoản hoặc biến môi trường.

## Chạy trên máy

Yêu cầu Node.js 20.9 trở lên. Trong thư mục dự án:

```sh
npm install
npm run dev
```

Mở **http://localhost:3000**. Dev server nghe trên mạng local: iPhone cùng Wi-Fi có thể mở `http://<IP-của-máy>:3000` khi Windows Firewall cho phép. Web Share/clipboard cần trình duyệt hỗ trợ và thường cần HTTPS; dùng URL Vercel để kiểm tra trên iPhone. Download/Open image vẫn là phương án thay thế.

Kiểm tra và chạy production:

```sh
npm run typecheck
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build
npm start
```

`npm start` dùng build production, chạy riêng sau khi dừng dev server.

## V2 và các tính năng được giữ

- Autosave IndexedDB debounce 800 ms, tự khôi phục khi mở lại, không cần nhấn Restore. Trạng thái nhỏ ở footer: đang lưu, đã lưu hoặc lỗi kèm Retry. Chỉ báo Saved sau khi transaction/bản dự phòng hoàn tất; vẽ vẫn hoạt động trong lúc lưu.
- Bản dự phòng localStorage ghi ngay khi hoàn tất nét, undo/redo hoặc thay document, và khi trang ẩn/pagehide. Khi IndexedDB không dùng được, app dùng bản dự phòng và báo `backup storage`. Khi cả hai bị chặn, app vẫn vẽ và Save Project được.
- **Save / Open** trên desktop; **Menu → Save Project / Open Project** trên mobile. File JSON `.pixelart` chứa dimensions, mọi pixel RGBA, màu hiện tại, tối đa 20 recent colors, family, grid, trục tâm, theme và zoom. Import kiểm tra format/version, dimensions, pixel count, giá trị và settings trước khi thay artwork; yêu cầu xác nhận nếu đang có tranh.
- Pencil / Eraser / Eyedropper / Pan; nét nhanh được nối bằng Bresenham và grid brush clip đúng ô biên. Eyedropper chọn màu pixel rồi chuyển về Pencil. Eraser khôi phục transparency và có undo.
- Mỗi ô giữ đúng một giá trị RGBA: màu mới thay màu cũ hoàn toàn, không chồng lớp. Tô lại cùng màu không repaint, tạo undo hay autosave mới. Dữ liệu mỗi frame cố định 4 byte/pixel; lịch sử undo có giới hạn và không đưa vào PNG/file project.
- Giao diện bỏ thanh tiêu đề canvas, nhãn và thông tin trùng, khẩu hiệu, hình trang trí và nền chấm; giữ dải frame, công cụ, bảng màu, grid/trục và trạng thái lưu. Hướng dẫn cử chỉ nằm trong Help.
- Undo/redo theo toàn bộ nét; tối đa 80 action và thêm giới hạn 262.144 pixel delta cho nét lớn. Nét mới sau undo xóa redo; pan/zoom/grid/theme không vào history và không sửa pixels.
- Zoom 25–6400%, nút +/−, Fit và nhấn phần trăm zoom để về **100%**. Ctrl/⌘ + cuộn và pinch để zoom; pixels giữ sắc cạnh.
- Pan bằng **kéo/cuộn hai ngón touchpad không cần click**, chuột giữa, Space + drag, Pan tool hoặc hai ngón trên màn hình. Cuộn thường luôn pan; Shift + cuộn pan ngang. Pinch hoặc Ctrl/⌘ + cuộn để zoom. Các draft/file V2 cũ lưu chế độ cuộn `Zoom` tự chuyển về `Pan` khi mở lại, giữ nguyên artwork.
- Grid dùng nét mảnh, trung tính, nhấn nhẹ mỗi 4 ô và dịu dần khi zoom nhỏ; tự ẩn dưới 4 CSS px/ô. **Grid → Center axes** bật hai trục tím nhạt và dấu cộng nhỏ ở tâm. Trục hoạt động độc lập với grid, bám theo pan/zoom và không vào PNG.
- 10 Color Families × 100 shades; recent colors không trùng, mới nhất trước và được lưu cùng project. HEX/copy vẫn hoạt động ngoài workspace.
- PNG mặc định đúng dimensions gốc, transparent, không grid/UI. Có 1×/2×/4×/8× với nearest-neighbor. Download PNG/Open image luôn có khi export thành công; Share / Save hiện khi trình duyệt hỗ trợ.
- Light/Dark đầy đủ, custom canvas 1–256 px mỗi chiều và xác nhận thay tranh được giữ.

## Animation

Dải frame nằm ngay phía trên canvas, gồm thumbnail, nút **+**, **Play/Pause**, thời gian và nút nhân đôi/xóa frame.

1. Vẽ frame đầu tiên. Nhấn **+** để thêm frame trống sau frame đang chọn.
2. Nhấn thumbnail để chọn frame rồi dùng Pencil/Eraser/Eyedropper như bình thường. Undo/redo thuộc từng frame; chuyển frame giữ nguyên vị trí pan/zoom.
3. Ô **Time / frame** đặt thời gian hiển thị của frame đang chọn bằng milliseconds (20–10.000 ms; mặc định 100 ms). Mỗi frame có thể có thời gian khác nhau.
4. **Play** chạy các frame liên tiếp, lặp vòng theo đúng thời gian. **Pause** trở về frame đã chọn; nhấn bất kỳ thumbnail nào cũng dừng phát và cho chỉnh frame đó ngay. Trong khi phát, thao tác vẽ/undo bị chặn để không sửa nhầm tranh; playback không tạo autosave hay history.
5. **Save Project** lưu toàn bộ animation. **Open Project** mở file `.pixelart` để tiếp tục chỉnh từng frame; reload cũng khôi phục đủ frames và timing. File V2 và draft V1 cũ vẫn được đọc như một frame.

Có thể nhân đôi frame hiện tại để vẽ tiếp và xóa frame khi có ít nhất hai frame; xóa frame có tranh cần xác nhận. Tối đa 120 frame và tổng 2.097.152 pixels; canvas 256×256 cho tối đa 32 frame. Thêm/xóa frame và thay timing không thuộc undo nét vẽ. PNG xuất **frame đang chọn**; lưu `.pixelart` để giữ toàn bộ hoạt ảnh. Chưa hỗ trợ import/export GIF hoặc APNG.

## Mobile và phím tắt

Portrait có topbar và bottom toolbar; landscape thấp chuyển dock sang cạnh trái. Canvas dùng `100dvh`, safe-area và `touch-action: none`; sheet vẫn cuộn, có focus trap và Escape/Close. Khi ngón thứ hai chạm, nét một ngón đang vẽ được rollback trước khi pinch/pan; autosave không lấy nét chưa hoàn tất.

Workspace chặn chọn chữ, drag, menu chuột phải và callout Copy. Khi canvas có focus, Ctrl/⌘ + A/C/X bị chặn; các ô nhập và copy HEX ngoài workspace vẫn hoạt động. Safari có xử lý native gesture cho touchpad pinch.

| Thao tác | Phím |
| --- | --- |
| Pencil / Eraser / Eyedropper / Pan | B / E / I / H |
| Undo | Ctrl+Z / ⌘Z |
| Redo | Ctrl+Y / Ctrl+Shift+Z / ⌘Shift+Z |
| Lấy màu tạm thời | Alt + click |
| Xóa nhanh | Right click |
| Pan | Space + drag / middle mouse drag |
| Zoom | Pinch / Ctrl hoặc ⌘ + cuộn |

## Kiến trúc và file chính

```text
src/components/
  Editor.tsx                Điều phối document và panel, áp dụng project
  PixelCanvas.tsx           Pointer Events, pan/pinch/wheel, rAF renderer
  AnimationTimeline.tsx     Thumbnail, chọn/thêm/nhân đôi/xóa frame và playback
  Toolbars.tsx              Tools và nút Save/Open phù hợp desktop/mobile
  CanvasSettings.tsx        Grid, trục tâm, hướng dẫn touchpad, dimensions
  ProjectPanel.tsx          Save/Open file, validation và replace confirmation
  ExportPanel.tsx           PNG scale, download/share và lỗi export
src/hooks/
  useProjectPersistence.ts  Restore tự động, debounce, status và page lifecycle
src/lib/
  engine.ts                 Nguồn dữ liệu pixel duy nhất, stroke transaction
  history.ts                Sparse deltas có giới hạn bộ nhớ
  coordinates.ts            Pixel coordinates và anchor zoom
  animation.ts              Frame data, giới hạn animation và timing
  canvasGuides.ts           Grid nét mảnh và trục tâm
  project.ts                Snapshot, codec JSON và validation
  storage.ts                IndexedDB, backup/recovery và fallback
  export.ts                 PNG ở kích thước thật hoặc nearest-neighbor scale
  store.ts                  Zustand UI/preferences; không chứa pixel buffer
src/app/globals.css         Theme, layout và responsive, bổ sung controls V2
tests/                      Unit và browser integration
```

Pixel buffer ở `PixelEngine`, nằm ngoài React; move chỉ cập nhật buffer và gom render bằng `requestAnimationFrame`. React nhận thay đổi khi kết thúc stroke hoặc đổi UI. Zoom/pan/overlays chỉ thay camera/render. Snapshot lấy bản sao của pixels đã commit, không tạo document thứ hai. Autosave và project files dùng chung codec; IndexedDB vẫn dùng database/schema V1 để đọc dữ liệu hiện có. Backup mới hơn được chọn theo timestamp. Draft hỏng được giữ nguyên; artwork mới dùng recovery key để tránh ghi đè dữ liệu gốc hỏng.

## Kiểm tra

Playwright kiểm tra Chromium desktop 1440×1000, WebKit desktop (touchpad/V2), Chromium và WebKit mobile 390×844, WebKit landscape 844×390. Các flow gồm tự restore, nhiều nét undo/redo, redo invalidation, zoom/pan rồi vẽ đúng tọa độ, lấy màu rồi vẽ, Save/clear/Open đúng pixels/settings, PNG 1× và 4×, grid/trục tâm, responsive, storage bị chặn, draft hỏng và lỗi export. Unit kiểm tra codec, dữ liệu nhập sai, stroke/history và coordinate conversion.

Touch tap dùng browser automation; Chromium có CDP multi-touch, WebKit dùng Pointer Events tổng hợp để kiểm tra đường xử lý hai ngón. Screenshot/trace nằm trong `test-results/`, không đưa lên Git. WebKit trên Windows không thay thế kiểm tra **iPhone 13/iOS Safari thật**: cần thử pinch tay, safe-area/notch, rotation, bàn phím, Share/Save to Photos và tốc độ vẽ trên thiết bị.

## Deployment và giới hạn

Không thay cấu hình deployment trong V2. Repository GitHub/Vercel hiện có tiếp tục dùng Next.js, install `npm ci`, build `npm run build` và Output Directory mặc định; không cần environment variables hay database ngoài. Thay đổi code ở workspace chưa tự publish lên production.

Một draft mỗi origin/browser; không đồng bộ thiết bị hoặc xử lý chỉnh sửa đồng thời nhiều tab. History nằm trong RAM, không lưu qua reload hoặc project file; giới hạn 80 action/262.144 pixel deltas áp dụng trên toàn bộ animation. File project format V3 giới hạn 32 MB, vẫn đọc file V2; canvas tối đa 256×256. Chỉ hỗ trợ file Pixel Studio hợp lệ.

Browser/OS có thể xóa local data (private mode, Clear Site Data, quota/storage eviction). Animation lớn có thể vượt quota của localStorage: IndexedDB vẫn lưu nếu khả dụng, nhưng backup tức thì sẽ không có. Backup bảo vệ các nét đã hoàn tất kể cả trước debounce khi ghi được; pagehide vẫn là best effort và không đảm bảo trước việc OS đóng tiến trình giữa nét hoặc lỗi ghi storage. Dùng Save Project cho bản sao độc lập. Khi cả bản gốc và recovery đều hỏng, app giữ chúng và yêu cầu Save Project nếu không còn nơi lưu an toàn.

Chưa có layers, fill, selection, mirror hay sprite sheet export; các tính năng V1 đang có được giữ.
