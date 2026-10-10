// PayOS (VietQR bank transfer): payment links and webhook checks, signed the
// same way as the official @payos/node library (HMAC-SHA256 with the checksum key).
import { createHmac, timingSafeEqual } from "node:crypto";

export interface PayosConfig {
  clientId: string;
  apiKey: string;
  checksumKey: string;
  baseUrl?: string;
}
export interface Plan {
  id: string;
  name: string;
  amount: number;
  credits: number;
}
/** What teachers can buy; credits never expire. */
export const plans: Plan[] = [
  { id: "TEACHER_MONTH", name: "Gói tháng", amount: 49_000, credits: 50 },
  { id: "TEACHER_YEAR", name: "Gói năm", amount: 399_000, credits: 600 },
];

const hmac = (key: string, text: string) =>
  createHmac("sha256", key).update(text).digest("hex");

/** Signature of a payment request: five fixed fields in alphabetical order. */
export function signPaymentRequest(
  r: {
    amount: number;
    cancelUrl: string;
    description: string;
    orderCode: number;
    returnUrl: string;
  },
  key: string,
) {
  return hmac(
    key,
    `amount=${r.amount}&cancelUrl=${r.cancelUrl}&description=${r.description}&orderCode=${r.orderCode}&returnUrl=${r.returnUrl}`,
  );
}

/** Signature of a data object: keys sorted, null as "", arrays as JSON. */
export function signObject(data: Record<string, unknown>, key: string) {
  const sortKeys = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  const text = Object.keys(data)
    .sort()
    .filter((k) => data[k] !== undefined)
    .map((k) => {
      let v = data[k];
      if (Array.isArray(v))
        v = JSON.stringify(
          v.map((x) =>
            x && typeof x === "object"
              ? sortKeys(x as Record<string, unknown>)
              : x,
          ),
        );
      if (v === null || v === undefined || v === "undefined" || v === "null")
        v = "";
      return `${k}=${v}`;
    })
    .join("&");
  return hmac(key, text);
}

const sameHex = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface WebhookData {
  orderCode: number;
  amount: number;
  code: string;
  description?: string;
  reference?: string;
  [key: string]: unknown;
}
/** The webhook's data when its signature is right, otherwise null. */
export function verifyWebhook(
  body: unknown,
  checksumKey: string,
): WebhookData | null {
  if (!body || typeof body !== "object") return null;
  const { data, signature } = body as { data?: unknown; signature?: unknown };
  if (!data || typeof data !== "object" || typeof signature !== "string")
    return null;
  const expected = signObject(data as Record<string, unknown>, checksumKey);
  if (!sameHex(expected, signature)) return null;
  const d = data as WebhookData;
  return typeof d.orderCode === "number" && typeof d.amount === "number"
    ? d
    : null;
}

/** A new PayOS payment link; throws PAY_* codes. */
export async function createPaymentLink(
  config: PayosConfig,
  r: {
    orderCode: number;
    amount: number;
    description: string;
    returnUrl: string;
    cancelUrl: string;
  },
  transport: typeof fetch = fetch,
): Promise<{ checkoutUrl: string; qrCode: string }> {
  let res: Response;
  try {
    res = await transport(
      `${config.baseUrl ?? "https://api-merchant.payos.vn"}/v2/payment-requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": config.clientId,
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify({
          ...r,
          signature: signPaymentRequest(r, config.checksumKey),
        }),
      },
    );
  } catch {
    throw new Error("PAY_NETWORK");
  }
  const body = (await res.json().catch(() => ({}))) as {
    code?: string;
    data?: { checkoutUrl?: string; qrCode?: string } | null;
  };
  if (!res.ok || body.code !== "00" || !body.data?.checkoutUrl)
    throw new Error("PAY_PROVIDER");
  return { checkoutUrl: body.data.checkoutUrl, qrCode: body.data.qrCode ?? "" };
}
