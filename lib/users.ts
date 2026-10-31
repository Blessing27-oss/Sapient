import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type Role = "professor" | "student";
export type User = { id: string; name: string; username: string; role: Role; salt: string; hash: string };

const FILE = path.join(process.cwd(), ".data", "users.json");
type Table = Record<string, User>;

async function read(): Promise<Table> {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return {}; }
}
let chain: Promise<unknown> = Promise.resolve();
function mutate<T>(fn: (t: Table) => T): Promise<T> {
  const run = chain.then(async () => {
    const t = await read();
    const out = fn(t);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(t, null, 2));
    return out;
  });
  chain = run.catch(() => {});
  return run;
}
const hash = (pw: string, salt: string) => scryptSync(pw, salt, 64).toString("hex");
const norm = (u: string) => u.trim().toLowerCase();

// The name is also the login handle (compared case-insensitively), so names must be unique.
export async function createUser(i: { name: string; password: string; role: Role }): Promise<User | { error: string }> {
  const username = norm(i.name);
  if (!username) return { error: "Enter your name." };
  if (i.password.length < 6) return { error: "Password must be at least 6 characters." };
  return mutate((t) => {
    if (Object.values(t).some((u) => u.username === username)) return { error: "That name is taken. Try adding a last initial." };
    const salt = randomBytes(16).toString("hex");
    const user: User = { id: randomBytes(6).toString("hex"), name: i.name.trim().slice(0, 40), username, role: i.role, salt, hash: hash(i.password, salt) };
    t[user.id] = user;
    return user;
  });
}
export async function verifyUser(username: string, password: string): Promise<User | null> {
  const u = Object.values(await read()).find((x) => x.username === norm(username));
  if (!u) { hash(password, "0".repeat(32)); return null; } // keep timing similar for unknown users
  const a = Buffer.from(u.hash, "hex"), b = Buffer.from(hash(password, u.salt), "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? u : null;
}
