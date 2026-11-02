/**
 * Minimal HS256 JWT using Web Crypto — runs in both the Node.js runtime and the
 * Edge runtime (middleware). Payload shape mirrors Supabase access tokens.
 */
export interface SessionClaims {
  sub: string;
  email: string;
  role: "authenticated";
  /** authenticator assurance level: 1 = password, 2 = password + TOTP */
  aal: 1 | 2;
  /** session version — bumping profiles.session_version revokes all sessions */
  sv: number;
  iat: number;
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signJwt(claims: Omit<SessionClaims, "iat" | "exp">, secret: string, ttlSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(enc.encode(JSON.stringify({ ...claims, iat: now, exp: now + ttlSeconds })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(sig)}`;
}

export async function verifyJwt(token: string | undefined | null, secret: string): Promise<SessionClaims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    if (header.alg !== "HS256") return null;
    const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(parts[2]) as BufferSource, enc.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))) as SessionClaims;
    if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof claims.sub !== "string" || claims.role !== "authenticated") return null;
    return claims;
  } catch {
    return null;
  }
}
