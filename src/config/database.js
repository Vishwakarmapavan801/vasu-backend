


require("dotenv").config();
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
 * Logs ✓/✗ for each variable (without printing secret values).
 * Returns true if all required vars are set, false otherwise.
 */
function validateEnvVars() {
  console.log("\n  Database Configuration");
  console.log("  ─────────────────────");

  let allPresent = true;

  for (const { key, label } of REQUIRED_ENV_VARS) {
    const value = process.env[key];
    const isPresent = !!value && value.trim().length > 0;

    if (isPresent) {
      // Show the host and db name for context (safe to print)
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

  return allPresent;
}

/**
 * Check if SSL should be enabled.
 * Render PostgreSQL requires SSL. We also enable it when
 * NODE_ENV is 'production' or when DB_SSL=true is set.
 */
function shouldUseSSL() {
  // Explicit opt-in via env var
  if (process.env.DB_SSL === "true" || process.env.DB_SSL === "1") {
    return true;
  }
  // Production mode (Render) — always use SSL
  if (process.env.NODE_ENV === "production") {
    return true;
  }
  // If host contains render.com, assume SSL is needed
  if (process.env.DB_HOST && process.env.DB_HOST.includes("render.com")) {
    return true;
  }
  return false;
}

/**
 * Create a new Pool instance from environment variables.
 * Returns a Pool instance.
 */
function createPool() {
  const host = process.env.DB_HOST;
  const port = parseInt(process.env.DB_PORT, 10) || 5432;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const useSSL = shouldUseSSL();

  const poolConfig = {
    host,
    port,
    database,
    user,
    password,
    // Connection pool settings
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  // Add SSL configuration when needed (Render PostgreSQL requirement)
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
    // Run a quick test query to verify the connection works
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

      // Provide descriptive error messages based on error type
      if (err.code === "ENOTFOUND") {
        console.error(`    DNS resolution failed for host: "${process.env.DB_HOST}"`);
        console.error(`    Verify that DB_HOST is a valid, reachable hostname.`);
        console.error(`    Expected format: dpg-xxxxx.virginia-postgres.render.com`);
      } else if (err.code === "ECONNREFUSED") {
        console.error(`    Connection refused on ${process.env.DB_HOST}:${process.env.DB_PORT}`);
        console.error(`    Verify that the database server is running and accepting connections.`);
      } else if (err.code === "ETIMEDOUT") {
        console.error(`    Connection timed out on ${process.env.DB_HOST}:${process.env.DB_PORT}`);
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

    // Log retry attempt
    console.warn(`  \u26a0 PostgreSQL connection attempt ${attempt}/${MAX_RETRIES} failed:`);
    console.warn(`    ${err.message}`);
    console.warn(`    Retrying in ${RETRY_DELAY_MS / 1000}s...`);

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

    // Retry
    return connectWithRetry(pool, retriesLeft - 1);
  }
}

// ================================================================
// Initialization
// ================================================================

// Validate environment variables first
const envVarsValid = validateEnvVars();

if (!envVarsValid) {
  const missing = REQUIRED_ENV_VARS.filter(
    (v) => !process.env[v.key] || process.env[v.key].trim().length === 0
  ).map((v) => v.label);

  console.error(`\n  \u2717 Cannot start: required environment variable(s) missing:`);
  missing.forEach((label) => console.error(`    - ${label}`));
  console.error(`\n  Please set the missing variables and restart the server.\n`);

  // Export a dummy pool that fails on any query with a clear message
  const dummyPool = {
    query: () => Promise.reject(new Error("Database not configured: missing required environment variables")),
    connect: () => Promise.reject(new Error("Database not configured: missing required environment variables")),
    end: () => Promise.resolve(),
  };
  module.exports = dummyPool;
  process.exit(1); // Exit with error code — Render will restart
} else {
  console.log(`  \u2713 Environment variables validated`);
}

// Create the pool
const pool = createPool();

// Attempt connection with retries
connectWithRetry(pool).catch((err) => {
  // Exit after all retries are exhausted
  console.error(`\n  \u2717 Server startup aborted due to database connection failure.`);
  process.exit(1);
});

module.exports = pool;