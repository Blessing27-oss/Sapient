import { test } from "node:test";
import assert from "node:assert/strict";
import { MIGRATIONS, migrate, openDatabase } from "./db.ts";

test("migrations apply once, are idempotent, and create the expected tables", async () => {
  const db = await openDatabase();
  try {
    await migrate(db); // second run must be a no-op
    const versions = await db.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version");
    assert.deepEqual(versions.map((v) => v.version), MIGRATIONS.map((m) => m.version));
    const tables = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    assert.deepEqual(tables.map((t) => t.table_name), ["room_members", "rooms", "schema_migrations", "sources", "users"]);
  } finally { await db.close(); }
});

test("transactions roll back on error", async () => {
  const db = await openDatabase();
  try {
    await assert.rejects(db.transaction(async (tx) => {
      await tx.query("INSERT INTO users (id, name, username, role, salt, hash) VALUES ('u1', 'A', 'a', 'student', 's', 'h')");
      throw new Error("boom");
    }), /boom/);
    assert.equal((await db.query("SELECT 1 FROM users")).length, 0);
  } finally { await db.close(); }
});
