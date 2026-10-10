import { LogIn, LogOut, Sparkles } from "lucide-react";
import { signOut, useAccount } from "./account";
import "./account.css";

/** Top-right of the start page: sign-in on the hosted app, "personal space" locally. */
export function AccountBar({ fetcher = fetch }: { fetcher?: typeof fetch }) {
  const account = useAccount(fetcher);
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
      <span className="account-name">{account.user.name || account.user.email}</span>
      <button className="account-signout" onClick={() => void signOut(fetcher)}>
        <LogOut size={15} /> Đăng xuất
      </button>
    </span>
  );
}
