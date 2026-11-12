// Copy the legacy JSON data store into Postgres.
// Usage: npm run db:import [-- <data dir>]   (default data dir: ./.data)
// Targets DATABASE_URL when set, otherwise the local embedded database in .data/pglite.
import path from "node:path";
import { getDatabase } from "../lib/db.ts";
import { importJsonData } from "../lib/importJson.ts";

const dataDir = path.resolve(process.argv[2] ?? ".data");
const db = await getDatabase();
try {
  const result = await importJsonData(db, dataDir);
  console.log(`Read from ${dataDir}:`, result.found);
  console.log("Inserted (existing rows skipped):", result.imported);
} finally {
  await db.close();
}
