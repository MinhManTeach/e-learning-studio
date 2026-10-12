import { useEffect, useState } from "react";

// On the hosted app the server knows who is signed in; on a teacher's own
// computer (npm run dev) there are no accounts and everything is local.
export type Account =
  | { mode: "loading" }
  | { mode: "local" }
  | { mode: "signedOut"; providers: string[] }
  | {
      mode: "signedIn";
      user: { name: string; email: string; picture: string };
      credits: number;
    };

export async function readAccount(fetcher: typeof fetch): Promise<Account> {
  try {
    const r = await fetcher("/api/me", { cache: "no-store" });
    // The local dev server answers unknown paths with the app's HTML.
    if (!r.headers.get("content-type")?.includes("application/json"))
      return { mode: "local" };
    const body = (await r.json()) as {
      user?: { name: string; email: string; picture: string };
      credits?: number;
      providers?: string[];
    };
    if (r.status === 401)
      return { mode: "signedOut", providers: body.providers ?? [] };
    if (r.ok && body.user)
      return { mode: "signedIn", user: body.user, credits: body.credits ?? 0 };
    return { mode: "local" };
  } catch {
    return { mode: "local" };
  }
}

export function useAccount(fetcher: typeof fetch = fetch) {
  const [account, setAccount] = useState<Account>({ mode: "loading" });
  useEffect(() => {
    let live = true;
    void readAccount(fetcher).then((a) => live && setAccount(a));
    return () => {
      live = false;
    };
  }, [fetcher]);
  return account;
}

export async function signOut(fetcher: typeof fetch = fetch) {
  await fetcher("/auth/logout", { method: "POST" }).catch(() => undefined);
  location.assign("/");
}
