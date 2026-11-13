import path from "node:path";

// One small interface over two drivers:
// - node-postgres when DATABASE_URL is set (production, e.g. Railway Postgres);
// - PGlite, an embedded WASM build of Postgres, otherwise (local dev and tests, no server needed).
// Both run the same SQL, so the stores above this file never branch on the driver.
export type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  // Multi-statement SQL without parameters (migrations).
  exec(text: string): Promise<void>;
};
export type Database = Sql & {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

// Append-only: never edit a migration that has shipped; add a new version instead.
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE users (
        id         text PRIMARY KEY,
        name       text NOT NULL,
        username   text NOT NULL UNIQUE,
        role       text NOT NULL CHECK (role IN ('professor', 'student')),
        salt       text NOT NULL,
        hash       text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      -- id is a hash of (owner, pages), so re-uploading the same lecture deduplicates per owner.
      CREATE TABLE sources (
        id         text PRIMARY KEY,
        owner_id   text NOT NULL,
        filename   text NOT NULL,
        pages      jsonb NOT NULL,
        chunks     jsonb NOT NULL,
        created_at bigint NOT NULL
      );
      CREATE INDEX sources_owner_idx ON sources (owner_id, created_at DESC);

      -- A room is edited as one document (concepts, questions, students, responses...).
      -- owner_id and title are copied out of it for lookups; writes keep them in sync.
      CREATE TABLE rooms (
        code       text PRIMARY KEY,
        owner_id   text,
        title      text NOT NULL,
        data       jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX rooms_owner_idx ON rooms (owner_id);

      -- Which accounts have joined which rooms, so "my rooms" is an index lookup, not a scan.
      CREATE TABLE room_members (
        room_code text NOT NULL REFERENCES rooms (code) ON DELETE CASCADE,
        user_id   text NOT NULL,
        PRIMARY KEY (room_code, user_id)
      );
      CREATE INDEX room_members_user_idx ON room_members (user_id);
    `,
  },
  {
    version: 2,
    sql: `
      -- Demo accounts (the shared demo professor and disposable guest students) have no password.
      ALTER TABLE users ADD COLUMN demo boolean NOT NULL DEFAULT false;
    `,
  },
];

// Arbitrary constant so concurrently starting instances apply migrations one at a time.
const MIGRATION_LOCK = 7_426_001;

export async function migrate(db: Database) {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
    await tx.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await tx.query<{ version: number }>("SELECT version FROM schema_migrations")).map((r) => r.version));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      await tx.exec(m.sql);
      await tx.query("INSERT INTO schema_migrations (version) VALUES ($1)", [m.version]);
    }
  });
}

async function openPostgres(url: string): Promise<Database> {
  const { Pool } = (await import("pg")).default;
  const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE) || 10 });
  const wrap = (c: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Sql => ({
    async query<T>(text: string, params?: unknown[]) { return (await c.query(text, params)).rows as T[]; },
    async exec(text: string) { await c.query(text); },
  });
  return {
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(wrap(client));
        await client.query("COMMIT");
        return out;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function openEmbedded(dataDir: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = await PGlite.create(dataDir);
  type Q = { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (t: string) => Promise<unknown> };
  const wrap = (c: Q): Sql => ({
    async query<T>(text: string, params?: unknown[]) { return (await c.query(text, params)).rows as T[]; },
    async exec(text: string) { await c.exec(text); },
  });
  return {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}

// dataDir "memory://" gives a throwaway in-memory database (used by tests).
export async function openDatabase(opts: { url?: string; dataDir?: string } = {}): Promise<Database> {
  const db = opts.url ? await openPostgres(opts.url) : await openEmbedded(opts.dataDir ?? "memory://");
  await migrate(db);
  return db;
}

// Process-wide connection, kept on globalThis so Next.js dev reloads don't open a new pool each time.
const shared = globalThis as { __sapientDb?: Promise<Database> };
export function getDatabase(): Promise<Database> {
  shared.__sapientDb ??= openDatabase({
    url: process.env.DATABASE_URL,
    dataDir: path.join(process.cwd(), ".data", "pglite"),
  }).catch((error) => {
    shared.__sapientDb = undefined; // allow a retry on the next request
    throw error;
  });
  return shared.__sapientDb;
}
