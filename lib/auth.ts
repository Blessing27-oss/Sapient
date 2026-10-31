import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Explicit professor allowlist, shared by sign-in and session validation.
const PROFESSOR_EMAILS = new Set([
  "mitchelle.k.ngare.27@dartmouth.edu",
  "kangorgodwin@gmail.com",
]);
export const isAuthorizedProfessor = (email: string) => PROFESSOR_EMAILS.has(email.trim().toLowerCase());
const COOKIE = "kg_session";
const SECRET = process.env.SESSION_SECRET || ((globalThis as { __kgSecret?: string }).__kgSecret ??= randomBytes(32).toString("hex"));

const mac = (v: string) => createHmac("sha256", SECRET).update(v).digest("base64url");

export async function startSession(email: string) {
  const body = Buffer.from(JSON.stringify({ email, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
  (await cookies()).set(COOKIE, `${body}.${mac(body)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
}
export async function endSession() {
  (await cookies()).delete(COOKIE);
}
export async function isProfessor(): Promise<boolean> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return false;
  const a = Buffer.from(sig), b = Buffer.from(mac(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof p.email === "string" && isAuthorizedProfessor(p.email) && p.exp > Date.now();
  } catch { return false; }
}
// Use at the top of professor-only routes: `const deny = await requireProfessor(); if (deny) return deny;`
export async function requireProfessor(): Promise<Response | null> {
  return (await isProfessor()) ? null : Response.json({ error: "Professor sign-in required" }, { status: 401 });
}
export const googleClientId = () => process.env.GOOGLE_CLIENT_ID || "";
// Without a Google client ID, email-only dev login is allowed outside production. It is NOT secure.
export const devLoginAllowed = () => !googleClientId() && process.env.NODE_ENV !== "production";
