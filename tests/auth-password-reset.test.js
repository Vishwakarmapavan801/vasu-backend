const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const pool = require('../src/config/database');
const { forgotPassword, resetPassword } = require('../src/controllers/authController');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('forgot password stores a reset token and reset password updates the password', async () => {
  const email = `reset-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const passwordHash = await bcrypt.hash('OldPassword123!', 12);

  await pool.query(
    `INSERT INTO users (email, password_hash, name, phone)
     VALUES ($1, $2, $3, $4)`,
    [email, passwordHash, 'Reset Test', null]
  );

  try {
    const forgotRes = createMockRes();
    await forgotPassword({ body: { email } }, forgotRes, () => {
      throw new Error('next should not be called');
    });

    assert.equal(forgotRes.statusCode, 200);
    const tokenRow = await pool.query(
      'SELECT reset_token, reset_token_expires_at FROM users WHERE email = $1',
      [email]
    );
    assert.ok(tokenRow.rows[0].reset_token, 'expected a reset token to be created');
    assert.ok(tokenRow.rows[0].reset_token_expires_at, 'expected a reset token expiry to be set');

    const resetRes = createMockRes();
    await resetPassword(
      { params: { token: tokenRow.rows[0].reset_token }, body: { password: 'NewPassword456!' } },
      resetRes,
      () => {
        throw new Error('next should not be called');
      }
    );

    assert.equal(resetRes.statusCode, 200);
    const updatedRow = await pool.query(
      'SELECT password_hash, reset_token, reset_token_expires_at FROM users WHERE email = $1',
      [email]
    );
    const isValid = await bcrypt.compare('NewPassword456!', updatedRow.rows[0].password_hash);
    assert.equal(isValid, true);
    assert.equal(updatedRow.rows[0].reset_token, null);
    assert.equal(updatedRow.rows[0].reset_token_expires_at, null);
  } finally {
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
    await pool.end();
  }
});
