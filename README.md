# Pixel Studio

Pixel Art Editor MVP dùng **Next.js App Router, React, TypeScript, Tailwind CSS, Canvas 2D, Zustand và IndexedDB**. Không cần backend, tài khoản hay biến môi trường. Dữ liệu tranh nằm trên thiết bị của người dùng.

## Chạy trên máy

Yêu cầu Node.js 20.9 trở lên; dự án đã được kiểm tra với Node.js 24.

```sh
npm install
npm run dev
```

Mở **http://localhost:3000**. Dev server lắng nghe trên mạng local; iPhone cùng Wi-Fi có thể truy cập `http://<IP-của-máy>:3000` nếu Windows Firewall cho phép. Chia sẻ/lưu file bằng Web Share và clipboard thường yêu cầu HTTPS; bản Vercel cung cấp HTTPS. Trên HTTP vẫn có Download PNG và Open image.

```sh
npm run typecheck
npm test
npm run build
npm start
```

## Deploy Vercel

1. Đưa mã nguồn và `package-lock.json` lên repository GitHub. `.gitignore` đã loại trừ dependencies, build, kết quả test và secrets.
2. Trong Vercel, chọn **Add New → Project** và import repository.
3. Chọn preset **Next.js**. Install command: `npm ci`; build command: `npm run build`. Giữ Output Directory mặc định.
4. Deploy; không cần thêm environment variables hay database.

Hoặc từ checkout đã kết nối tài khoản Vercel:

```sh
npx vercel
npx vercel --prod
```

Đây là mã nguồn sẵn sàng deploy; không có URL Vercel được tạo tự động trong workspace này.

## Các chức năng

- Tạo canvas 16, 32, 64, 128, 256 px hoặc custom 1–256 px mỗi chiều. Yêu cầu xác nhận khi thay thế tranh đang có.
- Pencil, Eraser, Eyedropper và Pan. Vẽ nối các ô bằng Bresenham, snap theo grid 1–256 px, xử lý cả ô biên không đủ kích thước.
- Mỗi nét kéo là một history action; tối đa 80 action. History lưu các pixel thay đổi thay vì chụp toàn bộ canvas. Undo/redo luôn có nút thao tác.
- 10 Color Families, mỗi họ 100 màu riêng biệt. Desktop 10 cột; mobile 5 cột và ô ≥44px. HEX hiện ngay, có nút copy, tối đa 20 recent colors.
- Zoom liên tục, mouse wheel hoặc pinch, nút zoom và Fit. Scale 0.5–64 CSS px/pixel. Pan bằng Space + drag, hai ngón hoặc Pan tool.
- IndexedDB autosave debounce 800ms, thêm lần lưu khi trang ẩn hoặc pagehide. Lưu pixels, dimensions, theme, colors, grid và zoom; mở lại sẽ hỏi Restore. Pan được căn lại khi restore/orientation thay đổi.
- Full Light / Full Dark; canvas checkerboard cũng theo theme.
- Grid tương phản rõ; bật **Grid → Center axes** để hiện hai trục nét đứt qua tâm và vòng tròn đánh dấu tâm. Trục hoạt động độc lập với pixel grid, bám theo canvas khi pan/zoom và được autosave. Draft cũ vẫn restore được.
- PNG RGBA đúng kích thước tranh, nền transparent, không chứa grid hay UI. Download và Open image là fallback dùng trên Safari; Share / Save xuất hiện khi thiết bị hỗ trợ chia sẻ file.

## Mobile

- Portrait: top bar Undo/Redo/Theme/Export/Menu; canvas giữa; toolbar Pencil/Eraser/Pick/Pan/Color/Grid bên dưới.
- Landscape thấp: toolbar chuyển sang cạnh trái để giữ chiều cao canvas.
- Một ngón vẽ; khi ngón thứ hai chạm, nét đang vẽ được rollback rồi chuyển sang pinch/pan. Chỉ vẽ tiếp khi toàn bộ ngón đã rời và bắt đầu một thao tác mới.
- `touch-action: none` chỉ áp dụng lên canvas; sheet vẫn cuộn được. Hỗ trợ safe area, `100dvh`, form cuộn được khi bàn phím mở, focus trap và Escape/Close trong dialog.

## Phím tắt

| Thao tác | Phím |
| --- | --- |
| Pencil / Eraser / Eyedropper / Pan | B / E / I / H |
| Undo | Ctrl+Z hoặc ⌘Z |
| Redo | Ctrl+Shift+Z, Ctrl+Y hoặc ⌘Shift+Z |
| Lấy màu tạm thời | Alt + click |
| Xóa nhanh | Right click |
| Pan | Space + drag |
| Zoom | Mouse wheel |

## Kiến trúc

```text
src/app/                   Next.js route, metadata, theme tokens và responsive CSS
src/components/
  Editor.tsx               Điều phối project, autosave, restore, new/export/help
  PixelCanvas.tsx          Canvas viewport, Pointer Events, pinch/pan, rAF renderer
  Toolbars.tsx             TopBar, DesktopToolbar, MobileToolbar, ThemeToggle
  ColorPalette.tsx         ColorPalette, ColorFamilyPicker, RecentColors
  CanvasSettings.tsx       Grid và dimensions
  MobileBottomSheet.tsx    Modal/bottom sheet có focus management
src/lib/
  engine.ts                PixelEngine: pixel document không phụ thuộc React
  coordinates.ts           Coordinate conversion, anchor zoom và line interpolation
  history.ts               Sparse delta history
  colors.ts                HSL shade generation và RGBA conversion
  store.ts                 Zustand UI/preferences; không giữ pixel buffer
  storage.ts               IndexedDB, validation và transactions
  export.ts                Xuất canvas PNG ở kích thước pixel thật
tests/                     Unit và browser integration tests
```

Render Canvas được gom bằng `requestAnimationFrame`. Pointer move thay đổi buffer ngoài React; React chỉ cập nhật khi hoàn thành stroke hoặc thay đổi UI. Canvas viewport dùng device pixel ratio và `imageSmoothingEnabled = false`. Có thể mở rộng engine/history để thêm layers, fill, selection, mirror và animation mà không thay pixel bằng DOM.

## Kiểm tra

```sh
npx playwright install chromium webkit
npm run test:e2e
```

Playwright chạy Chromium desktop 1440×1000, Chromium mobile 390×844, WebKit 390×844 và WebKit 844×390. Kiểm tra drawing, erase, eyedropper, undo/redo, màu, grid, custom canvas, xác nhận thay thế, theme, autosave/reload/restore, PNG dimensions/alpha, pan/zoom và overflow. Có touch tap thực qua browser automation; Chromium dùng CDP cho multi-touch, WebKit kiểm tra multi-pointer qua Pointer Events tổng hợp.

WebKit automation trên Windows **không thay thế iPhone 13 / iOS Safari thật**. Trước khi phát hành rộng, mở URL HTTPS trên iPhone và kiểm tra thêm pinch bằng tay, tốc độ nét kéo trên thiết bị, bàn phím che form, notch/Home Indicator, rotation và Save to Photos. Kết quả screenshot/trace nằm trong `test-results/` (không đưa lên Git).

## Giới hạn MVP

Một draft mỗi origin/browser; không đồng bộ thiết bị và không lưu history qua reload. IndexedDB có thể bị xóa nếu người dùng xóa website data, dùng private mode hoặc hệ điều hành thu hồi storage. Trạng thái Saved chỉ hiển thị sau khi transaction hoàn tất; export PNG để lưu thêm bản độc lập. Nếu draft không đọc được, app giữ nguyên draft đó và cho vẽ/export mà không ghi đè. Save khi pagehide là best effort; việc hệ điều hành đóng tiến trình trước khi debounce hoàn tất không có bảo đảm tuyệt đối.

Chưa có layers, animation, bucket, selection, mirror hoặc sprite sheet export; đây là các hướng mở rộng sau MVP.

Tài liệu cấu hình: [Next.js](https://nextjs.org/docs/app/getting-started/installation), [Tailwind CSS](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [Zustand](https://zustand.docs.pmnd.rs/reference/apis/create).
