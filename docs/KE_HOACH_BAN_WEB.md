# Kế hoạch: bản web cho giáo viên khác dùng (có trả phí)

Trạng thái: **bản nháp, chờ thầy Mẫn quyết các mục ở phần 7**. Chưa triển khai gì.

## 1. Mục tiêu

Một giáo viên chỉ có file PowerPoint:

1. mở trang web và đăng nhập bằng Google;
2. kéo file PowerPoint vào, xem và sửa bài;
3. bấm "AI thiết kế bài giảng" (tính lượt);
4. xuất gói SCORM 1.2 hoặc 2004 rồi tải lên LMS360.

Giáo viên không phải cài gì, không cần biết khoá API là gì, không có `.env.local`.

## 2. Nguyên tắc: máy chủ càng nhỏ càng tốt

Hiện app đã làm hầu hết mọi việc **ngay trong trình duyệt**:

- nhập PowerPoint;
- soạn bài và lưu bài vào IndexedDB;
- xuất gói SCORM;
- trình phát bài.

Vì vậy bản web **giữ nguyên cách đó**. Bài giảng vẫn nằm trên máy giáo viên. Máy chủ chỉ làm 4 việc:

| Việc | Vì sao phải ở máy chủ |
|---|---|
| Đăng nhập | Biết ai đang dùng, để tính lượt |
| Gọi AI thay giáo viên | Khoá Claude/Gemini chỉ nằm trên máy chủ |
| Đếm lượt dùng AI | Lượt miễn phí, gói tháng, gói trường |
| Nhận thanh toán | Cổng thanh toán gọi lại (webhook) để cộng lượt |

Lợi ích:

- **Chi phí thấp:** không lưu video hay ảnh của ai trên máy chủ.
- **Dữ liệu học sinh không đi qua máy chủ:** điểm nằm trong LMS của trường.
- **Phần miễn phí rất mạnh, dễ thu hút giáo viên:** nhập PowerPoint, sửa bài, giao diện Vui nhộn, giọng đọc và xuất SCORM đều miễn phí, không giới hạn, vì chúng chạy trên máy giáo viên. Chỉ AI là tốn tiền.

Điểm yếu: đổi máy hoặc xoá dữ liệu trình duyệt thì mất bài. App đã có sẵn "Sao lưu", nên ban đầu chỉ cần nhắc giáo viên sao lưu. Đồng bộ lên mây để sau.

## 3. Kiến trúc đề xuất

```
Trình duyệt giáo viên ──(tệp tĩnh)──> Hosting tĩnh (bản build Vite hiện có)
        │
        └──(HTTPS, phiên đăng nhập)──> Dịch vụ API nhỏ (Node)
                                          ├─ /api/me              thông tin, số lượt còn
                                          ├─ /api/ai/design       kiểm tra lượt → gọi Claude → trừ lượt
                                          ├─ /api/pay/create      tạo link/QR thanh toán
                                          └─ /api/pay/webhook     cổng thanh toán báo đã trả
                                          │
                                          └── CSDL Postgres: users, credit_ledger, payments, ai_calls
```

- **Mã AI dùng lại nguyên vẹn:** `server/studio.ts`, `server/anthropic.ts` và `server/gemini.ts` đã tách khỏi Vite. Chỉ cần đặt chúng sau một máy chủ HTTP thật thay cho `localAiPlugin.ts`.
- **Sổ lượt (`credit_ledger`) chỉ ghi thêm, không sửa dòng cũ:** mỗi lần cộng (mua, tặng) hoặc trừ (gọi AI) là một dòng mới. Số dư là tổng các dòng. Cách này dễ đối soát khi có khiếu nại.
- **Trừ lượt khi AI trả kết quả dùng được.** Lỗi do máy chủ AI (quá tải, trả về hỏng) thì không trừ. Token vẫn bị tính tiền nên vẫn ghi vào `ai_calls` để theo dõi.
- **Giới hạn để tránh bị lạm dụng:** mỗi tài khoản chỉ chạy một yêu cầu AI cùng lúc, có trần số yêu cầu mỗi ngày, mỗi yêu cầu tối đa 40 MB.

## 4. Gói và giá (gợi ý, chờ số liệu thật)

| Gói | Gồm | Ghi chú |
|---|---|---|
| Miễn phí | Mọi thứ trừ AI, cộng 3 lượt AI để thử | Đủ để giáo viên thấy giá trị |
| Giáo viên | X lượt AI mỗi tháng | Gợi ý 49.000–99.000đ/tháng |
| Trường | Nhiều tài khoản, một hoá đơn | Ban giám hiệu mua; cần hoá đơn điện tử |

**Phải đo trước khi chốt giá.** Từ bản này, mỗi lần chạy "AI thiết kế bài giảng" trên máy thầy, cửa sổ chạy app sẽ in một dòng, ví dụ:

```
[AI thiết kế bài giảng] claude-sonnet-5-5: 42.000 token vào, 9.050 token ra, 76 giây
```

Chạy thử 5–10 bài khác nhau, nhân số token với bảng giá hiện hành của Anthropic, sẽ ra chi phí thật cho mỗi bài. Giá gói nên lớn hơn khoảng 3 lần chi phí đó, để trừ hao phí cổng thanh toán, máy chủ và những lần giáo viên chạy lại.

## 5. Thanh toán

- **Chuyển khoản bằng QR (VietQR)** qua một cổng có API và webhook, ví dụ PayOS. Giáo viên quen nhất cách này. MoMo có thể thêm sau.
- **Cần kiểm tra trước:** cổng nào cho cá nhân hay hộ kinh doanh đăng ký, phí mỗi giao dịch, thời gian tiền về.
- **Gói trường:** trường thường cần hoá đơn điện tử, nên phải có pháp nhân (hộ kinh doanh hoặc công ty).
- **Webhook phải kiểm tra chữ ký** và xử lý trùng lặp: cùng một giao dịch báo hai lần thì chỉ cộng lượt một lần.

## 6. Lộ trình, mỗi bước nhỏ, có test, dừng được giữa chừng

1. **Đo chi phí thật:** đã xong ở bản này. Việc của thầy là chạy 5–10 bài và ghi lại số token.
2. **Tách máy chủ AI thành dịch vụ riêng:** dùng cùng mã, chạy bằng `node` mà không cần Vite, có test.
3. **Đăng nhập Google:** bảng `users`, tặng 3 lượt miễn phí, trang "Tài khoản" hiện số lượt còn.
4. **Trừ lượt khi gọi AI:** khi hết lượt, nút AI hiện "Mua thêm lượt" thay vì báo lỗi.
5. **Thanh toán:** tạo QR, nhận webhook, cộng lượt, có test chữ ký và test webhook trùng.
6. **Chạy thử kín** với 3–5 giáo viên quen: theo dõi lỗi, chi phí và phản hồi.
7. **Giấy tờ:** điều khoản sử dụng và chính sách quyền riêng tư theo quy định bảo vệ dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP), rồi mới mở công khai.

## 7. Cần thầy quyết

1. **Ngân sách hằng tháng cho máy chủ.** Lúc đầu có thể gần 0đ nếu dùng gói miễn phí của các dịch vụ hosting, CSDL nhỏ đủ dùng. Có muốn đặt máy chủ ở Việt Nam (VPS trong nước) không?
2. **Tên sản phẩm và tên miền.**
3. **Pháp nhân để ký cổng thanh toán:** cá nhân, hộ kinh doanh hay công ty?
4. **Giá các gói:** chốt sau khi đo xong bước 1.
5. **Cách đăng nhập:** chỉ Google là đủ, hay cần thêm Zalo?
6. **Có cần đồng bộ bài lên mây ngay từ đầu không?** Đề xuất: chưa cần.
