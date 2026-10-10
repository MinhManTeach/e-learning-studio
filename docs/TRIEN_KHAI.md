# Đưa ứng dụng soạn bài lên mạng (bản có đăng nhập và thanh toán)

## Ứng dụng gồm những gì

- **Trình soạn bài:** chạy trong trình duyệt của giáo viên. Bài giảng lưu ngay trên máy giáo viên.
- **Máy chủ** (`server/web/`), làm 4 việc:
  - đăng nhập Google;
  - giữ số lượt AI của từng người (tệp `data/app.db`);
  - gọi AI bằng khoá của thầy;
  - nhận thanh toán PayOS.

Mọi thứ chạy trong **một chương trình Node**, không cần cơ sở dữ liệu riêng.

## 1. Chạy thử trên máy thầy trước

Runner trên máy thầy đã có sẵn hai việc:
- `build-server`: dựng lại trình soạn bài và máy chủ;
- `web-server`: chạy máy chủ ở http://localhost:8080, đọc khoá từ `.env.local`.

Để thử đăng nhập Google và thanh toán, thêm các dòng sau vào `.env.local` (cách lấy ở mục 2 và 3):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
```

Ghi chú:
- Các khoá chỉ nằm trong `.env.local`, tệp này không bị đưa lên GitHub.
- Khi thử trên máy, PayOS không gửi được webhook về `localhost`. Vì vậy lượt AI chỉ được cộng khi đã chạy trên tên miền thật.

## 2. Lấy khoá đăng nhập Google (miễn phí)

1. Vào https://console.cloud.google.com, tạo một dự án (Project), ví dụ "Giang Vui".
2. Vào mục **Google Auth Platform**, ở bản cũ là **APIs & Services → OAuth consent screen**:
   - Branding: điền tên ứng dụng, email hỗ trợ, logo nếu có.
   - Audience: chọn **External**.
3. Vào **Clients**, ở bản cũ là **Credentials → Create credentials → OAuth client ID**:
   - Loại: **Web application**.
   - **Authorized redirect URIs** thêm hai địa chỉ:
     - `http://localhost:8080/auth/google/callback` (để thử trên máy);
     - `https://TEN-MIEN-CUA-THAY/auth/google/callback` (khi chạy thật).
4. Chép **Client ID** và **Client secret** vào `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET`.
5. Trước khi mở cho mọi người dùng: bấm **Publish app** ở mục Audience. Nếu không, chỉ những email "Test users" mới đăng nhập được.

Ứng dụng chỉ xin tên, email và ảnh đại diện (`openid email profile`).

## 3. Lấy khoá thanh toán PayOS (VietQR)

1. Đăng ký tại https://my.payos.vn bằng thông tin hộ kinh doanh, rồi liên kết tài khoản ngân hàng nhận tiền.
2. Tạo **kênh thanh toán**, lấy ba khoá: **Client ID**, **API Key**, **Checksum Key**.
3. Ở phần **Webhook** của kênh, điền: `https://TEN-MIEN-CUA-THAY/api/pay/webhook`.
   - PayOS sẽ gửi thử một lần, máy chủ trả lời "thành công".
4. Điền ba khoá vào `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`.

Phí và điều kiện của PayOS thầy xem trên trang của họ, vì có thể thay đổi.

Ứng dụng xử lý thanh toán như sau:
- Mỗi đơn có mã riêng. Nội dung chuyển khoản là `GV <mã đơn>`.
- Lượt chỉ được cộng khi PayOS gửi xác nhận có chữ ký đúng và **đúng số tiền**.
- Mỗi đơn chỉ được cộng một lần, kể cả khi PayOS gửi lại.

## 4. Thuê máy chủ và chạy thật

Cần một VPS nhỏ chạy Ubuntu (1 CPU, 1–2 GB RAM là đủ lúc đầu) và tên miền trỏ về VPS (bản ghi A).

```bash
# Node 22 và Caddy (tự lấy chứng chỉ HTTPS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs caddy git

git clone https://github.com/MinhManTeach/e-learning-studio.git
cd e-learning-studio
npm ci
npm run build && npm run build:server
```

Tạo tệp `/etc/giangvui.env`, chỉ người quản trị đọc được:

```
PUBLIC_URL=https://TEN-MIEN-CUA-THAY
PORT=8080
DATA_DIR=/var/lib/giangvui
LESSON_AI_API_KEY=sk-ant-...
LESSON_AI_MODEL=claude-haiku-5-5
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
FREE_CREDITS=10
```

Tạo dịch vụ `/etc/systemd/system/giangvui.service` để máy chủ tự chạy lại khi khởi động hoặc gặp lỗi:

```
[Service]
EnvironmentFile=/etc/giangvui.env
WorkingDirectory=/home/ubuntu/e-learning-studio
ExecStart=/usr/bin/node dist-server/main.js
Restart=always
[Install]
WantedBy=multi-user.target
```

Thêm vào `/etc/caddy/Caddyfile`:

```
TEN-MIEN-CUA-THAY {
  reverse_proxy localhost:8080
}
```

Cuối cùng bật dịch vụ: `sudo systemctl enable --now giangvui && sudo systemctl reload caddy`.

**Sao lưu:** chép tệp `/var/lib/giangvui/app.db` mỗi ngày. Đây là sổ tài khoản và lượt đã mua.

**Cập nhật phiên bản:**
```
git pull && npm ci && npm run build && npm run build:server && sudo systemctl restart giangvui
```

## 5. Những gì bản web chưa có

- **Giọng đọc thu sẵn:** đang dùng giọng Windows nên chỉ chạy được khi soạn trên máy Windows. Bản web cần một dịch vụ đọc tiếng Việt trên mạng (có phí nhỏ), làm sau.
- **Đăng nhập Zalo:** cần tạo ứng dụng tại developers.zalo.me trước.
- **Vẽ tranh bằng AI:** đang tắt trên bản web để tránh tốn phí.
- **Hoá đơn điện tử cho gói trường:** xử lý thủ công trong thời gian đầu.
