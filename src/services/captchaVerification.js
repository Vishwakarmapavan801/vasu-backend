/**
 * CAPTCHA Verification Service
 *
 * Production-ready Google reCAPTCHA token verification.
 * Handles all error states: missing token, invalid token,
 * expired token, network failures, and provider unavailability.
 *
 * No bypass mechanism exists — if the secret key is not configured,
 * all requests are rejected with a clear error.
 *
 * Environment Variables:
 *   RECAPTCHA_SECRET_KEY (required) — from Google reCAPTCHA admin
 *
 * Google Docs:
 *   https://developers.google.com/recaptcha/docs/verify
 */

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

/**
 * Verify a Google reCAPTCHA token with Google's official API.
 *
 * @param {string} token - The reCAPTCHA token from the frontend widget
 * @param {string} [ip] - Optional client IP address for extra validation
 * @returns {Promise<{success: boolean, error?: string, messages?: string[]}>}
 *
 * Success result:  { success: true }
 * Failure result: { success: false, error: '<human readable>' }
 */
async function verifyCaptchaToken(token, ip) {
  // ── Guard: Missing Token ─────────────────────────────────
  if (!token || typeof token !== 'string' || !token.trim()) {
    console.warn('[CAPTCHA] Verification failed: token is missing or invalid.');
    return {
      success: false,
      error: 'CAPTCHA token is missing. Please complete the CAPTCHA challenge.',
    };
  }

  // ── Guard: Secret Key Not Configured ─────────────────────
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey || !secretKey.trim()) {
    console.error('[CAPTCHA] RECAPTCHA_SECRET_KEY is not configured in environment variables.');
    return {
      success: false,
      error: 'CAPTCHA service is not configured. Please contact support.',
    };
  }

  // ── Build Request to Google ──────────────────────────────
  const formData = new URLSearchParams();
  formData.append('secret', secretKey);
  formData.append('response', token.trim());
  if (ip) {
    formData.append('remoteip', ip);
  }

  console.log('[CAPTCHA] Verification request started.');

  let response;
  try {
    response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(10000), // 10-second timeout
    });
  } catch (err) {
    // ── Handle: Network Failure / Provider Unavailable ──────
    if (err.name === 'TimeoutError' || err.code === 'ETIMEDOUT') {
      console.error('[CAPTCHA] Verification request timed out after 10s.');
      return {
        success: false,
        error: 'CAPTCHA verification timed out. Please try again.',
      };
    }
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      console.error('[CAPTCHA] Could not reach Google reCAPTCHA API:', err.message);
      return {
        success: false,
        error: 'CAPTCHA service is temporarily unavailable. Please try again later.',
      };
    }
    console.error('[CAPTCHA] Unexpected network error during verification:', err.message);
    return {
      success: false,
      error: 'CAPTCHA verification failed due to a network error. Please try again.',
    };
  }

  // ── Handle: Non-200 Response ─────────────────────────────
  if (!response.ok) {
    console.error(`[CAPTCHA] Google returned HTTP ${response.status}: ${response.statusText}`);
    return {
      success: false,
      error: 'CAPTCHA verification service returned an error. Please try again.',
    };
  }

  // ── Parse Response Body ──────────────────────────────────
  let result;
  try {
    result = await response.json();
  } catch (err) {
    console.error('[CAPTCHA] Failed to parse Google response JSON:', err.message);
    return {
      success: false,
      error: 'CAPTCHA verification received an invalid response. Please try again.',
    };
  }

  // ── Handle: Verification Failed ──────────────────────────
  if (!result.success) {
    const errorCodes = result['error-codes'] || [];

    // Map Google error codes to user-friendly messages
    // See: https://developers.google.com/recaptcha/docs/verify#error-code-reference
    const knownErrors = {
      'missing-input-secret': 'CAPTCHA service configuration error.',
      'invalid-input-secret': 'CAPTCHA service configuration error.',
      'missing-input-response': 'CAPTCHA token is missing. Please complete the challenge.',
      'invalid-input-response': 'CAPTCHA verification failed. Please try again.',
      'bad-request': 'CAPTCHA verification request was malformed.',
      'timeout-or-duplicate': 'CAPTCHA token has expired or already been used. Please complete the challenge again.',
    };

    const firstErrorCode = errorCodes[0];
    const userMessage = knownErrors[firstErrorCode]
      || 'CAPTCHA verification failed. Please try again.';

    // Log the raw error codes for debugging (without exposing secrets)
    console.warn('[CAPTCHA] Verification failed. Error codes:', errorCodes.join(', '));

    return {
      success: false,
      error: userMessage,
      messages: errorCodes,
    };
  }

  // ── Success ──────────────────────────────────────────────
  console.log('[CAPTCHA] Verification succeeded.');
  return { success: true };
}

module.exports = { verifyCaptchaToken };
