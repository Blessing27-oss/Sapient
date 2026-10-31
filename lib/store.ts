import { promises as fs } from "node:fs";
import path from "node:path";
import type { Room } from "./types.ts";

const FILE = path.join(process.cwd(), ".data", "db.json");
type DB = Record<string, Room>;

async function read(): Promise<DB> {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return {}; }
}
async function write(db: DB) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(db, null, 2));
}
// Serialise mutations so concurrent student answers don't clobber each other.
let chain: Promise<unknown> = Promise.resolve();
export function withDB<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const db = await read();
    const out = await fn(db);
    await write(db);
    return out;
  });
  chain = run.catch(() => {});
  return run;
}
export async function getRoom(code: string): Promise<Room | undefined> {
  return (await read())[code.toUpperCase()];
}
export async function getAllRooms(): Promise<Room[]> {
  return Object.values(await read());
}
export function newCode(db: DB): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (;;) {
    const c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join("");
    if (!db[c]) return c;
  }
}
export const uid = () => Math.random().toString(36).slice(2, 10);
