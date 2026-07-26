const { Pool } = require("pg");

// ================================================================
// Environment detection
// ================================================================

const IS_RENDER = process.env.RENDER === "true";
const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * Detect if a DATABASE_URL points to an internal Render PostgreSQL host.
 * Render Internal URLs have hostnames like "dpg-xxxxx" (no domain).
 * Render External URLs have hostnames like "dpg-xxxxx.region.postgres.render.com".
 */
function isRenderInternalUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    // Internal: single-label name like "dpg-xxxxx"
    // External: multi-label name like "dpg-xxxxx.oregon-postgres.render.com"
    return hostname && !hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Resolve the database configuration based on the running environment.
 *
 * Priority:
 *   1. Render Internal DATABASE_URL (only on Render)
 *   2. Local PostgreSQL via DB_* variables
 *   3. Render External DATABASE_URL (explicitly configured for local use)
 */
function resolveDatabaseConfig() {
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const hasDbVars = !!(process.env.DB_HOST && process.env.DB_NAME);

  // ── Production on Render ──────────────────────────────────
  if (IS_RENDER) {
    if (hasDatabaseUrl) {
      const host = new URL(process.env.DATABASE_URL).hostname;
      return {
        type: "Render Internal",
        host,
        useDatabaseUrl: true,
        connectionString: process.env.DATABASE_URL,
      };
    }
    // On Render but no DATABASE_URL? Fall through to DB_* or error.
  }

  // ── Local / external ───────────────────────────────────────
  if (hasDatabaseUrl) {
    if (isRenderInternalUrl(process.env.DATABASE_URL)) {
      const host = new URL(process.env.DATABASE_URL).hostname;
      console.error("");
      console.error(`  \u2717 ERROR: Render Internal DATABASE_URL detected outside Render.`);
      console.error(`    Host: "${host}"`);
      console.error(`    This hostname only resolves inside Render's network.`);
      console.error(``);
      console.error(`    To connect to your Render database from localhost, use the`);
      console.error(`    EXTERNAL Database URL from your Render PostgreSQL dashboard:`);
      console.error(`      Dashboard -> PostgreSQL -> Connect -> External Database URL`);
      console.error(``);
      console.error(`    Or use local PostgreSQL with DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.`);
      console.error(`    Falling back to local DB_* variables.\n`);
    } else {
      const host = new URL(process.env.DATABASE_URL).hostname;
      return {
        type: "Render External",
        host,
        useDatabaseUrl: true,
        connectionString: process.env.DATABASE_URL,
      };
    }
  }

  // ── Local PostgreSQL via DB_* variables ────────────────────
  if (hasDbVars) {
    return {
      type: "Local PostgreSQL",
      host: process.env.DB_HOST,
      useDatabaseUrl: false,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };
  }

  // ── No valid config found ──────────────────────────────────
  return null;
}

// ================================================================
// Validation helpers
// ================================================================

function validateEnvVars(config) {
  console.log("\n  Database Configuration");
  console.log("  ─────────────────────");

  if (!config) {
    console.log("  \u2717 No database configuration available.");
    if (IS_RENDER) {
      console.log(`  \u2717 DATABASE_URL not set. Render PostgreSQL must be linked.`);
    } else {
      console.log(`  \u2717 Set DATABASE_URL (External) or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.`);
    }
    return false;
  }

  console.log(`  \u2713 Environment : ${IS_RENDER ? "Render (" + NODE_ENV + ")" : "Local (" + NODE_ENV + ")"}`);
  console.log(`  \u2713 Connection  : ${config.type}`);

  if (config.useDatabaseUrl) {
    const masked = process.env.DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, "//****:****@");
    console.log(`  \u2713 DATABASE_URL = ${masked}`);
  } else {
    console.log(`  \u2713 DB_HOST      = ${config.host}`);
    console.log(`  \u2713 DB_PORT      = ${config.port}`);
    console.log(`  \u2713 DB_NAME      = ${config.database}`);
    console.log(`  \u2713 DB_USER      = ${config.user}`);
    console.log(`  \u2713 DB_PASSWORD  = ****`);
  }

  // Warn if DB_HOST is localhost in production on Render
  if (IS_RENDER && NODE_ENV === "production" && config.host === "localhost") {
    console.warn(`  \u26a0 DB_HOST is "localhost" in production. Ignoring — using DATABASE_URL.`);
  }

  // Remind to set NODE_ENV=production on Render
  if (IS_RENDER && NODE_ENV !== "production") {
    console.warn(`  \u26a0 NODE_ENV is "${NODE_ENV}" on Render.`);
    console.warn(`    Set NODE_ENV=production in your Render dashboard.`);
  }

  return true;
}

// ================================================================
// SSL detection
// ================================================================

function shouldUseSSL(config) {
  if (process.env.DB_SSL === "true" || process.env.DB_SSL === "1") return true;
  if (IS_RENDER) return true;
  if (NODE_ENV === "production") return true;
  if (config.type === "Render Internal" || config.type === "Render External") return true;
  return false;
}

// ================================================================
// Pool creation
// ================================================================

function createPool(config) {
  const useSSL = shouldUseSSL(config);

  const poolConfig = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  if (config.useDatabaseUrl) {
    poolConfig.connectionString = config.connectionString;
  } else {
    poolConfig.host = config.host;
    poolConfig.port = config.port;
    poolConfig.database = config.database;
    poolConfig.user = config.user;
    poolConfig.password = config.password;
  }

  if (useSSL) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  return new Pool(poolConfig);
}

// ================================================================
// Connection retry logic
// ================================================================

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

async function connectWithRetry(pool, config, retriesLeft = MAX_RETRIES) {
  const attempt = MAX_RETRIES - retriesLeft + 1;

  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW() AS current_time");
    const dbTime = result.rows[0].current_time;
    client.release();

    console.log(`  \u2713 PostgreSQL Connected Successfully`);
    console.log(`    Server time: ${dbTime}`);
    console.log(`    Database    : ${config.useDatabaseUrl ? new URL(config.connectionString).pathname.replace("/", "") : config.database}`);
    console.log(`    Host        : ${config.host}\n`);
    return;
  } catch (err) {
    const isLastAttempt = retriesLeft <= 1;

    if (isLastAttempt) {
      console.error(`  \u2717 PostgreSQL Connection Failed`);
      console.error(`    Attempt ${attempt}/${MAX_RETRIES} — all retries exhausted.`);

      const host = config.useDatabaseUrl
        ? new URL(config.connectionString).hostname
        : config.host;
      const port = config.useDatabaseUrl
        ? new URL(config.connectionString).port || "5432"
        : String(config.port || 5432);

      if (err.code === "ENOTFOUND") {
        console.error(`    DNS resolution failed for host: "${host}"`);
        console.error(`    Verify that the host is a valid, reachable hostname.`);
        if (config.type === "Render Internal") {
          console.error(`    Render Internal hosts only resolve inside Render's network.`);
          console.error(`    Use the External Database URL for local connections.`);
        }
      } else if (err.code === "ECONNREFUSED") {
        console.error(`    Connection refused on ${host}:${port}`);
        console.error(`    Verify that the database server is running and accepting connections.`);
      } else if (err.code === "ETIMEDOUT") {
        console.error(`    Connection timed out on ${host}:${port}`);
        console.error(`    Verify network connectivity and firewall rules.`);
      } else if (err.code === "28P01") {
        console.error(`    Authentication failed for user "${config.user || "unknown"}"`);
        console.error(`    Verify username and password are correct.`);
      } else if (err.code === "3D000") {
        console.error(`    Database "${config.database || "unknown"}" does not exist.`);
        console.error(`    Verify database name is correct.`);
      } else if (err.message && err.message.includes("SSL")) {
        console.error(`    SSL connection failed.`);
        console.error(`    Render PostgreSQL requires SSL.`);
      } else {
        console.error(`    Error: ${err.message}`);
        if (err.code) console.error(`    Code: ${err.code}`);
      }

      throw err;
    }

    console.warn(`  \u26a0 PostgreSQL connection attempt ${attempt}/${MAX_RETRIES} failed:`);
    console.warn(`    ${err.message}`);
    console.warn(`    Retrying in ${RETRY_DELAY_MS / 1000}s...`);

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

    return connectWithRetry(pool, config, retriesLeft - 1);
  }
}

// ================================================================
// Initialization
// ================================================================

const dbConfig = resolveDatabaseConfig();
const envVarsValid = validateEnvVars(dbConfig);

if (!envVarsValid || !dbConfig) {
  console.error(`\n  \u2717 Cannot start: no valid database configuration.`);
  if (IS_RENDER) {
    console.error(`    Link a PostgreSQL database or set DATABASE_URL in Render dashboard.`);
  } else {
    console.error(`    Configure DATABASE_URL (External) or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.`);
  }
  console.error(`\n  Please set the required variables and restart the server.\n`);

  const dummyPool = {
    query: () => Promise.reject(new Error("Database not configured")),
    connect: () => Promise.reject(new Error("Database not configured")),
    end: () => Promise.resolve(),
  };
  module.exports = dummyPool;
  process.exit(1);
} else {
  console.log(`  \u2713 Database configuration resolved`);
}

const pool = createPool(dbConfig);

connectWithRetry(pool, dbConfig).catch(() => {
  console.error(`\n  \u2717 Server startup aborted due to database connection failure.`);
  process.exit(1);
});

pool._dbConfig = dbConfig;
module.exports = pool;
