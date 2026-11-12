import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "./db.ts";
import { createUserStore } from "./users.ts";

test("accounts: unique case-insensitive names, password checks, and safe failures", async () => {
  const db = await openDatabase();
  try {
    const users = createUserStore(async () => db);
    const ada = await users.createUser({ name: "  Ada Lovelace ", password: "secret1", role: "professor" });
    assert.ok(!("error" in ada));
    assert.equal(ada.username, "ada lovelace");
    assert.deepEqual(await users.createUser({ name: "ADA LOVELACE", password: "secret2", role: "student" }), { error: "That name is taken. Try adding a last initial." });
    assert.ok("error" in await users.createUser({ name: "Bob", password: "short", role: "student" }));
    assert.equal((await users.verifyUser("ada lovelace", "secret1"))?.id, ada.id);
    assert.equal(await users.verifyUser("ada lovelace", "wrong-pw"), null);
    assert.equal(await users.verifyUser("nobody", "secret1"), null);
  } finally { await db.close(); }
});

test("simultaneous signups for one name create exactly one account", async () => {
  const db = await openDatabase();
  try {
    const users = createUserStore(async () => db);
    const results = await Promise.all(Array.from({ length: 5 }, () => users.createUser({ name: "Grace", password: "secret1", role: "student" })));
    assert.equal(results.filter((r) => !("error" in r)).length, 1);
    assert.equal((await db.query("SELECT 1 FROM users")).length, 1);
  } finally { await db.close(); }
});
