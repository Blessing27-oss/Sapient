import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Professors sign in by typing this word (no email, no accounts).
export const PROFESSOR_WORD = "Prof";
const COOKIE = "kg_session";
const SECRET = process.env.SESSION_SECRET || ((globalThis as { __kgSecret?: string }).__kgSecret ??= randomBytes(32).toString("hex"));

const mac = (v: string) => createHmac("sha256", SECRET).update(v).digest("base64url");

export async function startSession() {
  const body = Buffer.from(JSON.stringify({ role: "professor", exp: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
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
    return p.role === "professor" && p.exp > Date.now();
  } catch { return false; }
}
// Use at the top of professor-only routes: `const deny = await requireProfessor(); if (deny) return deny;`
export async function requireProfessor(): Promise<Response | null> {
  return (await isProfessor()) ? null : Response.json({ error: "Professor sign-in required" }, { status: 401 });
}
