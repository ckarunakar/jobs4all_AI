/**
 * SQL Server connection — SERVER-SIDE ONLY, READ-ONLY.
 * --------------------------------------------------------------------------
 * A single pooled `mssql` connection reused across requests (cached on
 * globalThis so it survives Next.js HMR in dev). Config comes from env only;
 * credentials are never logged and never bundled to the client (`server-only`).
 *
 * The app never writes: no insert/update/delete/truncate/merge/exec. Only
 * SELECT queries run through this pool.
 */

import "server-only";
import sql from "mssql";

export type SqlPool = sql.ConnectionPool;

interface GlobalWithPool {
  __itjcSqlPool?: Promise<SqlPool>;
}
const globalForPool = globalThis as unknown as GlobalWithPool;

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Missing required env var ${name}. Set the DB_* vars in .env.local (server-side only).`,
    );
  }
  return v.trim();
}

function buildConfig(): sql.config {
  const server = required("DB_SERVER");
  const database = required("DB_DATABASE");
  const user = required("DB_USER");
  const password = required("DB_PASSWORD");
  const portStr = process.env.DB_PORT?.trim();
  const port = portStr ? Number(portStr) : undefined;
  const instanceName = process.env.DB_INSTANCE?.trim();

  return {
    server,
    // Prefer a static port when given. A named instance without a static port
    // resolves via SQL Browser (UDP 1434); port and instanceName conflict, so
    // only use instanceName when no port is configured.
    port,
    user,
    password,
    database,
    options: {
      instanceName: !port && instanceName ? instanceName : undefined,
      encrypt: process.env.DB_ENCRYPT === "true",
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== "false",
      enableArithAbort: true,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 15_000,
    requestTimeout: 20_000,
  };
}

async function createPool(): Promise<SqlPool> {
  const config = buildConfig();
  const pool = new sql.ConnectionPool(config);
  // Reset the cache if the pool errors out so the next call reconnects.
  pool.on("error", () => {
    globalForPool.__itjcSqlPool = undefined;
  });
  try {
    await pool.connect();
    // Safe, credential-free breadcrumb.
    console.log(
      `[sqlServer] connected to ${config.server}:${config.port ?? "(instance)"}/${config.database}`,
    );
    return pool;
  } catch (err) {
    globalForPool.__itjcSqlPool = undefined;
    const message = err instanceof Error ? err.message : String(err);
    // Never include user/password in the log.
    throw new Error(`SQL Server connection failed: ${message}`);
  }
}

/** Lazily connect (once) and return the shared pool. */
export function getPool(): Promise<SqlPool> {
  if (!globalForPool.__itjcSqlPool) {
    globalForPool.__itjcSqlPool = createPool();
  }
  return globalForPool.__itjcSqlPool;
}

/** Re-export the mssql type helpers for parameter binding in repositories. */
export { sql };
