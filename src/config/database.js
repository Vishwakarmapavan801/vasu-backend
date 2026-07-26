const { Pool } = require("pg");

// ================================================================
// Validation helpers
// ================================================================

const REQUIRED_ENV_VARS = [
  { key: "DB_HOST", label: "DB_HOST" },
  { key: "DB_PORT", label: "DB_PORT" },
  { key: "DB_NAME", label: "DB_NAME" },
  { key: "DB_USER", label: "DB_USER" },
  { key: "DB_PASSWORD", label: "DB_PASSWORD" },
];

/**
 * Validate that all required environment variables are present.
 * If DATABASE_URL is set, individual DB_* variables are not required
 * (Render PostgreSQL auto-provides DATABASE_URL).
 * Logs ✓/✗ for each variable (without printing secret values).
 * Returns true if all required vars are set, false otherwise.
 */
function validateEnvVars() {
  console.log("\n  Database Configuration");
  console.log("  ─────────────────────");

  // DATABASE_URL takes priority — Render PostgreSQL auto-provides it
  if (process.env.DATABASE_URL) {
    const masked = process.env.DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, "//****:****@");
    console.log(`  \u2713 DATABASE_URL = ${masked}`);
    console.log(`  \u2713 (individual DB_* variables not required when DATABASE_URL is set)`);

    // Warn if DB_HOST is localhost in production (misconfiguration)
    if (process.env.NODE_ENV === "production" && process.env.DB_HOST === "localhost") {
      console.warn(`  \u26a0 DB_HOST is set to "localhost" in production mode.`);
      console.warn(`    Ignoring DB_HOST — using DATABASE_URL instead.`);
    }

    // Remind to set NODE_ENV=production on Render
    if (process.env.NODE_ENV !== "production" && process.env.RENDER === "true") {
      console.warn(`  \u26a0 NODE_ENV is "${process.env.NODE_ENV || "not set"}" on Render.`);
      console.warn(`    Set NODE_ENV=production in your Render dashboard for production behavior.`);
    }

    return true;
  }

  let allPresent = true;

  for (const { key, label } of REQUIRED_ENV_VARS) {
    const value = process.env[key];
    const isPresent = !!value && value.trim().length > 0;

    if (isPresent) {
      if (key === "DB_HOST") {
        console.log(`  \u2713 ${label} = ${value}`);
      } else if (key === "DB_NAME") {
        console.log(`  \u2713 ${label} = ${value}`);
      } else {
        console.log(`  \u2713 ${label} loaded`);
      }
    } else {
      console.log(`  \u2717 ${label} missing`);
      allPresent = false;
    }
  }

  // Warn if DB_HOST is localhost in production
  if (process.env.NODE_ENV === "production" && process.env.DB_HOST === "localhost") {
    console.warn(`  \u26a0 DB_HOST is set to "localhost" in production mode.`);
    console.warn(`    Render PostgreSQL requires a host like "dpg-xxxxx.oregon-postgres.render.com"`);
    console.warn(`    Set DATABASE_URL or individual DB_* variables in your Render dashboard.`);
  }

  // Remind to set NODE_ENV=production on Render
  if (process.env.NODE_ENV !== "production" && process.env.RENDER === "true") {
    console.warn(`  \u26a0 NODE_ENV is "${process.env.NODE_ENV || "not set"}" on Render.`);
    console.warn(`    Set NODE_ENV=production in your Render dashboard for production behavior.`);
  }

  return allPresent;
}

/**
 * Check if SSL should be enabled.
 * Render PostgreSQL requires SSL.
 */
function shouldUseSSL() {
  if (process.env.DB_SSL === "true" || process.env.DB_SSL === "1") return true;
  if (process.env.NODE_ENV === "production" && process.env.RENDER === "true") return true;
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.DB_HOST && process.env.DB_HOST.includes("render.com")) return true;
  return false;
}

/**
 * Create a new Pool instance from environment variables.
 * Uses DATABASE_URL (Render-provided) as the primary connection method,
 * falling back to individual DB_* variables for local development.
 */
function createPool() {
  const useSSL = shouldUseSSL();

  const poolConfig = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  // DATABASE_URL (Render PostgreSQL auto-provides this)
  if (process.env.DATABASE_URL) {
    poolConfig.connectionString = process.env.DATABASE_URL;
  } else {
    poolConfig.host = process.env.DB_HOST;
    poolConfig.port = parseInt(process.env.DB_PORT, 10) || 5432;
    poolConfig.database = process.env.DB_NAME;
    poolConfig.user = process.env.DB_USER;
    poolConfig.password = process.env.DB_PASSWORD;
  }

  if (useSSL) {
    poolConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  return new Pool(poolConfig);
}

// ================================================================
// Connection retry logic
// ================================================================

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

/**
 * Attempt to connect to PostgreSQL with retries.
 * @param {Pool} pool - The pg Pool instance
 * @param {number} retriesLeft - Number of retry attempts remaining
 * @returns {Promise<void>}
 */
async function connectWithRetry(pool, retriesLeft = MAX_RETRIES) {
  const attempt = MAX_RETRIES - retriesLeft + 1;

  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW() AS current_time");
    const dbTime = result.rows[0].current_time;
    client.release();

    console.log(`  \u2713 PostgreSQL Connected Successfully`);
    console.log(`    Server time: ${dbTime}\n`);
    return;
  } catch (err) {
    const isLastAttempt = retriesLeft <= 1;

    if (isLastAttempt) {
      console.error(`  \u2717 PostgreSQL Connection Failed`);
      console.error(`    Attempt ${attempt}/${MAX_RETRIES} — all retries exhausted.`);

      const host = process.env.DATABASE_URL
        ? new URL(process.env.DATABASE_URL).hostname
        : process.env.DB_HOST;
      const port = process.env.DATABASE_URL
        ? new URL(process.env.DATABASE_URL).port || "5432"
        : process.env.DB_PORT || "5432";

      if (err.code === "ENOTFOUND") {
        console.error(`    DNS resolution failed for host: "${host}"`);
        console.error(`    Verify that the host is a valid, reachable hostname.`);
        console.error(`    Expected format: dpg-xxxxx.virginia-postgres.render.com`);
      } else if (err.code === "ECONNREFUSED") {
        console.error(`    Connection refused on ${host}:${port}`);
        console.error(`    Verify that the database server is running and accepting connections.`);
      } else if (err.code === "ETIMEDOUT") {
        console.error(`    Connection timed out on ${host}:${port}`);
        console.error(`    Verify network connectivity and firewall rules.`);
      } else if (err.code === "28P01") {
        console.error(`    Authentication failed for user "${process.env.DB_USER}"`);
        console.error(`    Verify DB_USER and DB_PASSWORD are correct.`);
      } else if (err.code === "3D000") {
        console.error(`    Database "${process.env.DB_NAME}" does not exist.`);
        console.error(`    Verify DB_NAME is correct.`);
      } else if (err.message && err.message.includes("SSL")) {
        console.error(`    SSL connection failed.`);
        console.error(`    Render PostgreSQL requires SSL. If DB_SSL is not set,`);
        console.error(`    set DB_SSL=true in your environment variables.`);
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

    return connectWithRetry(pool, retriesLeft - 1);
  }
}

// ================================================================
// Initialization
// ================================================================

const envVarsValid = validateEnvVars();

if (!envVarsValid) {
  const missing = REQUIRED_ENV_VARS.filter(
    (v) => !process.env[v.key] || process.env[v.key].trim().length === 0
  ).map((v) => v.label);

  console.error(`\n  \u2717 Cannot start: required environment variable(s) missing:`);
  missing.forEach((label) => console.error(`    - ${label}`));
  console.error(`\n  Please set the missing variables and restart the server.\n`);

  const dummyPool = {
    query: () => Promise.reject(new Error("Database not configured: missing required environment variables")),
    connect: () => Promise.reject(new Error("Database not configured: missing required environment variables")),
    end: () => Promise.resolve(),
  };
  module.exports = dummyPool;
  process.exit(1);
} else {
  console.log(`  \u2713 Environment variables validated`);
}

const pool = createPool();

connectWithRetry(pool).catch((err) => {
  console.error(`\n  \u2717 Server startup aborted due to database connection failure.`);
  process.exit(1);
});

module.exports = pool;
