import { useState } from "react";
import { LogIn, LogOut, Sparkles } from "lucide-react";
import { signOut, useAccount } from "./account";
import { BuyCredits } from "./BuyCredits";
import "./account.css";

/** Top-right of the start page: sign-in on the hosted app, "personal space" locally. */
/** What the address says after Google sign-in or PayOS sends the teacher back. */
export function returnNotice(search: string) {
  const q = new URLSearchParams(search);
  if (q.get("login") === "failed")
    return "Đăng nhập chưa thành công. Hãy thử lại.";
  const paid = q.get("paid");
  if (paid === "cancelled")
    return "Đã huỷ thanh toán. Chưa có khoản nào bị trừ.";
  if (paid && /^\d+$/.test(paid))
    return "Cảm ơn thầy cô! Lượt AI được cộng ngay khi ngân hàng báo đã nhận tiền (thường vài giây). Tải lại trang nếu chưa thấy.";
  return "";
}

export function AccountBar({
  fetcher = fetch,
  search = typeof location === "undefined" ? "" : location.search,
}: {
  fetcher?: typeof fetch;
  search?: string;
}) {
  const account = useAccount(fetcher);
  const [buying, setBuying] = useState(false);
  const notice = returnNotice(search);
  if (account.mode === "loading") return <span className="account-bar" />;
  if (account.mode === "local")
    return (
      <span className="local-badge">
        <span className="status-dot" /> Không gian cá nhân
      </span>
    );
  if (account.mode === "signedOut")
    return (
      <span className="account-bar">
        {notice && (
          <span className="account-notice" role="status">
            {notice}
          </span>
        )}
        {account.providers.includes("google") ? (
          <a className="account-signin" href="/auth/google">
            <LogIn size={16} /> Đăng nhập bằng Google
          </a>
        ) : (
          <span className="hint">Đăng nhập đang được bảo trì.</span>
        )}
      </span>
    );
  return (
    <span className="account-bar">
      {notice && (
        <span className="account-notice" role="status">
          {notice}
        </span>
      )}
      {buying && (
        <BuyCredits fetcher={fetcher} onClose={() => setBuying(false)} />
      )}
      <span className="account-credits" title="Lượt dùng AI thiết kế bài giảng">
        <Sparkles size={15} /> {account.credits} lượt AI
      </span>
      {account.user.picture && (
        <img
          className="account-avatar"
          src={account.user.picture}
          alt=""
          referrerPolicy="no-referrer"
        />
      )}
      <button className="account-buy" onClick={() => setBuying(true)}>
        Mua thêm lượt
      </button>
      <span className="account-name">
        {account.user.name || account.user.email}
      </span>
      <button className="account-signout" onClick={() => void signOut(fetcher)}>
        <LogOut size={15} /> Đăng xuất
      </button>
    </span>
  );
}
