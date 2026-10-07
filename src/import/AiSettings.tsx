import type { LocalConnectionStatus } from "./localAiConnection";
export function AiSettings({
  status,
  refresh,
  close,
}: {
  status: LocalConnectionStatus;
  refresh: () => void;
  close: () => void;
}) {
  return (
    <div className="modal-overlay">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
      >
        <h2 id="ai-settings-title">Cài đặt · AI hỗ trợ</h2>
        <p>Nhà cung cấp AI: OpenAI</p>
        <p>Mô hình: {status.model || "Chưa cấu hình"}</p>
        <p role="status">
          Trạng thái kết nối:{" "}
          {status.configured
            ? "Đã cấu hình · kết nối được xác nhận khi phân tích thành công"
            : status.status === "INVALID"
              ? "Cấu hình chưa hợp lệ"
              : "AI chưa được kết nối"}
        </p>
        <p>
          Cấu hình nhà cung cấp, mô hình và khóa bí mật trong tệp .env.local
          trên máy này, rồi khởi động lại ứng dụng. Xem AI_SETUP.md để biết các
          bước thực hiện.
        </p>
        <p>
          Khóa chỉ được đọc bởi máy chủ cục bộ, không lưu trong bài giảng. Khi
          chọn Phân tích bằng AI, nội dung kế hoạch hiện tại được gửi tới
          OpenAI. Phân tích cơ bản chạy trên thiết bị.
        </p>
        <div className="modal-actions">
          <button onClick={refresh}>Kiểm tra cấu hình</button>
          <button autoFocus onClick={close}>
            Đóng
          </button>
        </div>
      </section>
    </div>
  );
}
