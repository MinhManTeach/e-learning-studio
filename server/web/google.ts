// "Đăng nhập bằng Google" (OpenID Connect, authorization code + PKCE).
// The ID token is checked fully: RS256 signature against Google's published
// keys, issuer, audience, expiry and the nonce we sent.
import {
  createHash,
  createPublicKey,
  createVerify,
  randomBytes,
} from "node:crypto";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}
export interface GoogleProfile {
  subject: string;
  email: string;
  name: string;
  picture: string;
}

const authEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
export const googleKeysUrl = "https://www.googleapis.com/oauth2/v3/certs";
const issuers = ["accounts.google.com", "https://accounts.google.com"];

const b64url = (b: Buffer) => b.toString("base64url");
export const randomToken = () => b64url(randomBytes(24));
export const pkceChallenge = (verifier: string) =>
  b64url(createHash("sha256").update(verifier).digest());

/** The Google sign-in page, with state (CSRF), nonce (replay) and PKCE. */
export function googleAuthUrl(
  config: GoogleConfig,
  redirectUri: string,
  login: { state: string; nonce: string; verifier: string },
) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state: login.state,
    nonce: login.nonce,
    code_challenge: pkceChallenge(login.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${authEndpoint}?${q}`;
}

let keyCache: { at: number; keys: (JsonWebKey & { kid?: string })[] } | null =
  null;
async function googleKeys(transport: typeof fetch, now: number, fresh = false) {
  if (!fresh && keyCache && now - keyCache.at < 60 * 60 * 1000)
    return keyCache.keys;
  const r = await transport(googleKeysUrl);
  if (!r.ok) throw new Error("AUTH_PROVIDER");
  const body = (await r.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
  keyCache = { at: now, keys: body.keys ?? [] };
  return keyCache.keys;
}
export const resetGoogleKeyCache = () => {
  keyCache = null;
};

/** Checks a Google ID token and returns who signed in. Throws AUTH_* codes. */
export async function verifyGoogleIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string },
  transport: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<GoogleProfile> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("AUTH_TOKEN");
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("AUTH_TOKEN");
  }
  if (header.alg !== "RS256" || !header.kid) throw new Error("AUTH_TOKEN");
  // Google rotates keys: look again once if the key id is new to us.
  let jwk = (await googleKeys(transport, now)).find(
    (k) => k.kid === header.kid,
  );
  if (!jwk)
    jwk = (await googleKeys(transport, now, true)).find(
      (k) => k.kid === header.kid,
    );
  if (!jwk) throw new Error("AUTH_TOKEN");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  const key = createPublicKey({ key: jwk, format: "jwk" });
  if (!verifier.verify(key, Buffer.from(parts[2], "base64url")))
    throw new Error("AUTH_TOKEN");
  const seconds = Math.floor(now / 1000);
  if (
    !issuers.includes(String(claims.iss)) ||
    claims.aud !== expected.clientId ||
    typeof claims.exp !== "number" ||
    claims.exp < seconds - 60 ||
    claims.nonce !== expected.nonce ||
    typeof claims.sub !== "string"
  )
    throw new Error("AUTH_TOKEN");
  if (claims.email && claims.email_verified === false)
    throw new Error("AUTH_EMAIL");
  return {
    subject: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    name: typeof claims.name === "string" ? claims.name.slice(0, 120) : "",
    picture:
      typeof claims.picture === "string" &&
      claims.picture.startsWith("https://")
        ? claims.picture
        : "",
  };
}

/** Swaps the one-time code for tokens and checks the ID token. */
export async function googleSignIn(
  config: GoogleConfig,
  redirectUri: string,
  code: string,
  login: { nonce: string; verifier: string },
  transport: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<GoogleProfile> {
  let r: Response;
  try {
    r = await transport(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        code_verifier: login.verifier,
      }),
    });
  } catch {
    throw new Error("AUTH_PROVIDER");
  }
  if (!r.ok) throw new Error("AUTH_CODE");
  const body = (await r.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("AUTH_CODE");
  return verifyGoogleIdToken(
    body.id_token,
    { clientId: config.clientId, nonce: login.nonce },
    transport,
    now,
  );
}
