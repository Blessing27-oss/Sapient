import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDatabase, type Database } from "./db.ts";

export type Role = "professor" | "student";
export type User = { id: string; name: string; username: string; role: Role; salt: string; hash: string };

const hash = (pw: string, salt: string) => scryptSync(pw, salt, 64).toString("hex");
const norm = (u: string) => u.trim().toLowerCase();
const COLUMNS = "id, name, username, role, salt, hash";

export function createUserStore(db: () => Promise<Database>) {
  return {
    // The name is also the login handle (compared case-insensitively), so names must be unique.
    // The UNIQUE constraint on username decides races between simultaneous signups.
    async createUser(i: { name: string; password: string; role: Role }): Promise<User | { error: string }> {
      const username = norm(i.name);
      if (!username) return { error: "Enter your name." };
      if (username.startsWith("demo:")) return { error: "That name is reserved. Try another." };
      if (i.password.length < 6) return { error: "Password must be at least 6 characters." };
      const salt = randomBytes(16).toString("hex");
      const user: User = { id: randomBytes(6).toString("hex"), name: i.name.trim().slice(0, 40), username, role: i.role, salt, hash: hash(i.password, salt) };
      const rows = await (await db()).query(
        `INSERT INTO users (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (username) DO NOTHING RETURNING id`,
        [user.id, user.name, user.username, user.role, user.salt, user.hash],
      );
      return rows.length ? user : { error: "That name is taken. Try adding a last initial." };
    },
    async verifyUser(username: string, password: string): Promise<User | null> {
      const [u] = await (await db()).query<User>(`SELECT ${COLUMNS} FROM users WHERE username = $1`, [norm(username)]);
      if (!u) { hash(password, "0".repeat(32)); return null; } // keep timing similar for unknown users
      const a = Buffer.from(u.hash, "hex"), b = Buffer.from(hash(password, u.salt), "hex");
      return a.length === b.length && timingSafeEqual(a, b) ? u : null;
    },
  };
}

const users = createUserStore(getDatabase);
export const createUser = users.createUser;
export const verifyUser = users.verifyUser;
