// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readAccount } from "../src/account/account";
import { AccountBar } from "../src/account/AccountBar";
import { AiStudio } from "../src/ai/AiStudio";
import { aiLesson } from "./support/aiLesson";

afterEach(cleanup);
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
const answering = (me: Response) =>
  (async () => me.clone()) as unknown as typeof fetch;

it("works out whether the app is hosted and who is signed in", async () => {
  const html = new Response("<!doctype html>", {
    headers: { "content-type": "text/html" },
  });
  expect(await readAccount(answering(html))).toEqual({ mode: "local" });
  expect(
    await readAccount(answering(json({ providers: ["google"] }, 401))),
  ).toEqual({ mode: "signedOut", providers: ["google"] });
  const me = {
    user: { name: "Cô Lan", email: "a@b.c", picture: "" },
    credits: 7,
  };
  expect(await readAccount(answering(json(me)))).toEqual({
    mode: "signedIn",
    ...me,
  });
  const offline = (async () => {
    throw new TypeError("offline");
  }) as unknown as typeof fetch;
  expect(await readAccount(offline)).toEqual({ mode: "local" });
});

it("offers Google sign-in on the hosted app and shows the credits once signed in", async () => {
  render(
    <AccountBar fetcher={answering(json({ providers: ["google"] }, 401))} />,
  );
  const link = await screen.findByRole("link", {
    name: /Đăng nhập bằng Google/,
  });
  expect(link.getAttribute("href")).toBe("/auth/google");
  cleanup();
  render(
    <AccountBar
      fetcher={answering(
        json({
          user: { name: "Cô Lan", email: "a@b.c", picture: "" },
          credits: 7,
        }),
      )}
    />,
  );
  expect(await screen.findByText(/7 lượt AI/)).toBeTruthy();
  expect(screen.getByText("Cô Lan")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Đăng xuất/ })).toBeTruthy();
});

it("keeps the personal-space badge when running on the teacher's own computer", async () => {
  const html = new Response("<!doctype html>", {
    headers: { "content-type": "text/html" },
  });
  render(<AccountBar fetcher={answering(html)} />);
  expect(await screen.findByText(/Không gian cá nhân/)).toBeTruthy();
});

function studio(status: object, design?: Response) {
  const fetcher = (async (url: string) =>
    url.endsWith("/status")
      ? json({
          provider: "anthropic",
          configured: true,
          model: "claude-haiku-5-5",
          imageModel: "",
          images: false,
          hosted: true,
          ...status,
        })
      : (design ?? json({}))) as unknown as typeof fetch;
  render(
    <AiStudio
      project={aiLesson()}
      media={{ get: async () => undefined }}
      apply={() => {}}
      onClose={() => {}}
      fetcher={fetcher}
    />,
  );
}

it("asks a teacher who is not signed in to sign in before using AI", async () => {
  studio({ signedIn: false, credits: 0 });
  const link = await screen.findByRole("link", {
    name: "Đăng nhập bằng Google",
  });
  expect(link.getAttribute("href")).toBe("/auth/google");
  expect(screen.queryByRole("button", { name: "Bắt đầu" })).toBeNull();
});

it("shows the credits left, and explains when they run out", async () => {
  studio({ signedIn: true, credits: 3 }, json({ error: "AI_NO_CREDITS" }, 402));
  expect(await screen.findByText(/bạn còn 3 lượt/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /dùng hết lượt AI/,
  );
});

it("does not start a design with no credits left", async () => {
  studio({ signedIn: true, credits: 0 });
  expect(
    (await screen.findByRole("button", { name: "Bắt đầu" })).hasAttribute(
      "disabled",
    ),
  ).toBe(true);
});

it("lets a signed-in teacher pick a plan and go on to the PayOS QR page", async () => {
  const went: string[] = [];
  const calls: string[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push(url + (init?.body ? " " + String(init.body) : ""));
    if (url === "/api/me")
      return json({
        user: { name: "Cô Lan", email: "a@b.c", picture: "" },
        credits: 0,
      });
    if (url === "/api/plans")
      return json({
        plans: [
          {
            id: "TEACHER_MONTH",
            name: "Gói tháng",
            amount: 49000,
            credits: 50,
          },
        ],
      });
    return json({ orderCode: 1, checkoutUrl: "https://pay.payos.vn/web/abc" });
  }) as unknown as typeof fetch;
  const { BuyCredits } = await import("../src/account/BuyCredits");
  render(<AccountBar fetcher={fetcher} />);
  fireEvent.click(await screen.findByRole("button", { name: "Mua thêm lượt" }));
  expect(await screen.findByText(/50 lượt · 49\.000đ/)).toBeTruthy();
  cleanup();
  render(
    <BuyCredits
      fetcher={fetcher}
      onClose={() => {}}
      go={(u) => went.push(u)}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Thanh toán bằng QR" }),
  );
  await screen.findByRole("button", { name: /Đang tạo mã|Thanh toán bằng QR/ });
  await new Promise((r) => setTimeout(r, 0));
  expect(calls).toContain('/api/pay/create {"plan":"TEACHER_MONTH"}');
  expect(went).toEqual(["https://pay.payos.vn/web/abc"]);
});

it("says what happened when the teacher comes back from Google or PayOS", async () => {
  const { returnNotice } = await import("../src/account/AccountBar");
  expect(returnNotice("?paid=123456789012")).toMatch(/Cảm ơn/);
  expect(returnNotice("?paid=cancelled")).toMatch(/huỷ thanh toán/);
  expect(returnNotice("?login=failed")).toMatch(/chưa thành công/);
  expect(returnNotice("")).toBe("");
});
