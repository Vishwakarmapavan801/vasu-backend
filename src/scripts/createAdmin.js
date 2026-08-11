/**
 * Create / promote a user to Super Admin.
 *
 * Usage:  npm run create-admin
 *
 * Prompts for email + password (or reads them from stdin when not a TTY,
 * one per line), then either promotes an existing user to role
 * 'super_admin' or creates a new account (email verified, active).
 * The password is bcrypt-hashed (12 rounds) — never stored in plaintext
 * and never read from environment variables or command-line arguments.
 */

const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const SALT_ROUNDS = 12;

function promptPair() {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((resolve) => rl.question(q, resolve));
    return (async () => {
      const email = (await ask('Admin email: ')).trim();
      const password = await ask('Password (min 8 chars): ');
      rl.close();
      return { email, password };
    })();
  }

  // Non-TTY (piped/automated) — read two lines from stdin.
  return new Promise((resolve, reject) => {
    let buf = '';
    let done = false;
    const finish = (lines) => {
      if (done) return;
      done = true;
      const clean = lines.map((l) => l.trim()).filter(Boolean);
      resolve({ email: clean[0] || '', password: clean[1] || '' });
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      if (lines.length >= 2) finish(lines);
    });
    process.stdin.on('end', () => {
      if (!done) finish(buf.split(/\r?\n/));
    });
    process.stdin.on('error', reject);
  });
}

async function main() {
  const { email: rawEmail, password } = await promptPair();

  const email = (rawEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Invalid email address.');
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const existing = await pool.query('SELECT id, email, role FROM users WHERE LOWER(email) = $1', [email]);
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE users
       SET role = 'super_admin', status = 'active', password_hash = $2, updated_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, passwordHash]
    );
    console.log(`Promoted ${email} to super_admin (existing user) and reset its password.`);
  } else {
    await pool.query(
      `INSERT INTO users (email, password_hash, name, role, status, email_verified, email_verified_at)
       VALUES ($1, $2, $3, 'super_admin', 'active', TRUE, NOW())`,
      [email, passwordHash, email.split('@')[0]]
    );
    console.log(`Created super_admin account for ${email}.`);
  }

  console.log('Done. You can now log in at /admin/login.');
}

main()
  .catch((err) => {
    console.error('Failed to create admin:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
