import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Role } from "./users.ts";

export type SessionUser = { id: string; name: string; role: Role };

const COOKIE = "kg_session";
const SECRET = process.env.SESSION_SECRET || ((globalThis as { __kgSecret?: string }).__kgSecret ??= randomBytes(32).toString("hex"));
const mac = (v: string) => createHmac("sha256", SECRET).update(v).digest("base64url");

export async function startSession(u: SessionUser) {
  const body = Buffer.from(JSON.stringify({ ...u, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
  (await cookies()).set(COOKIE, `${body}.${mac(body)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
}
export async function endSession() {
  (await cookies()).delete(COOKIE);
}
export async function currentUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  const [body, sig] = raw?.split(".") ?? [];
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() && p.id && (p.role === "professor" || p.role === "student") ? { id: p.id, name: p.name, role: p.role } : null;
  } catch { return null; }
}
const unauthorized = (role: Role) => Response.json({ error: `Sign in as a ${role} to continue.` }, { status: 401 });

// Professor-only routes: `const deny = await requireProfessor(); if (deny) return deny;`
export async function requireProfessor(): Promise<Response | null> {
  return (await currentUser())?.role === "professor" ? null : unauthorized("professor");
}
export async function requireStudent(): Promise<{ user: SessionUser } | { deny: Response }> {
  const user = await currentUser();
  return user?.role === "student" ? { user } : { deny: unauthorized("student") };
}
// Rooms created before accounts existed have no owner and stay open to any professor.
export const ownsRoom = (room: { ownerId?: string }, user: SessionUser | null) => !room.ownerId || room.ownerId === user?.id;
