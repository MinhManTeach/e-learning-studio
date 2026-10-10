import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  amount: number;
  credits: number;
}
const money = (n: number) => n.toLocaleString("vi-VN") + "đ";
const errors: Record<string, string> = {
  PAY_UNAVAILABLE: "Thanh toán đang bảo trì. Thầy cô vui lòng thử lại sau.",
  AUTH_REQUIRED: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
};

/** Plans and "Thanh toán bằng QR": goes on to the PayOS payment page. */
export function BuyCredits({
  onClose,
  fetcher = fetch,
  go = (url: string) => location.assign(url),
}: {
  onClose: () => void;
  fetcher?: typeof fetch;
  go?: (url: string) => void;
}) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void fetcher("/api/plans", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { plans?: Plan[] }) => setPlans(b.plans ?? []))
      .catch(() => setPlans([]));
  }, [fetcher]);
  async function buy(plan: Plan) {
    setBusy(plan.id);
    setError("");
    try {
      const r = await fetcher("/api/pay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.id }),
      });
      const body = (await r.json()) as { checkoutUrl?: string; error?: string };
      if (!r.ok || !body.checkoutUrl) throw new Error(body.error ?? "");
      go(body.checkoutUrl);
    } catch (e) {
      setError(
        errors[e instanceof Error ? e.message : ""] ??
          "Chưa tạo được mã thanh toán. Hãy thử lại sau ít phút.",
      );
      setBusy("");
    }
  }
  return (
    <div className="modal-overlay">
      <div className="modal buy-credits" role="dialog" aria-modal="true" aria-label="Mua thêm lượt AI">
        <div className="ai-head">
          <h2>Mua thêm lượt AI</h2>
          <button aria-label="Đóng" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="hint">
          Mỗi lượt là một lần “AI thiết kế bài giảng” cho cả bài. Lượt không hết
          hạn. Thanh toán bằng chuyển khoản quét mã QR (PayOS).
        </p>
        {!plans ? (
          <p role="status">Đang tải các gói…</p>
        ) : !plans.length ? (
          <p role="alert">{errors.PAY_UNAVAILABLE}</p>
        ) : (
          <ul className="plans">
            {plans.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong>
                <span>
                  {p.credits} lượt · {money(p.amount)}
                </span>
                <button className="primary" disabled={!!busy} onClick={() => void buy(p)}>
                  {busy === p.id ? "Đang tạo mã…" : "Thanh toán bằng QR"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
