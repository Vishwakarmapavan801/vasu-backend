/**
 * Google OAuth Service
 *
 * Verifies Google ID tokens (Google Identity Services) on the backend.
 * The frontend never sends anything we trust on its own — every token is
 * cryptographically verified against Google's public keys, with the audience
 * (client ID) and issuer validated here on the server.
 */

const { OAuth2Client } = require('google-auth-library');
const config = require('../../config');

const GOOGLE_CLIENT_ID = config.GOOGLE_CLIENT_ID;

const GOOGLE_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
]);

class GoogleAuthError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code || 'GOOGLE_AUTH_ERROR';
  }
}

let oauthClient = null;

function getOAuth2Client() {
  if (!oauthClient) {
    oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  }
  return oauthClient;
}

/**
 * Verify a Google ID token and return the normalized profile.
 *
 * @param {string} idToken - The JWT credential from Google Identity Services
 * @returns {Promise<{googleId: string, email: string, name: string, picture: string|null, emailVerified: boolean}>}
 * @throws {GoogleAuthError} when the token is invalid or the account is unusable
 */
async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_CLIENT_ID) {
    throw new GoogleAuthError('Google sign-in is not configured on the server.', 'GOOGLE_NOT_CONFIGURED');
  }

  if (!idToken || typeof idToken !== 'string') {
    throw new GoogleAuthError('Google token is required.', 'GOOGLE_TOKEN_MISSING');
  }

  let ticket;
  try {
    ticket = await getOAuth2Client().verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
  } catch (err) {
    throw new GoogleAuthError('Google sign-in failed. Please try again.', 'GOOGLE_TOKEN_INVALID');
  }

  const payload = ticket.getPayload();

  if (!payload || !GOOGLE_ISSUERS.has(payload.iss)) {
    throw new GoogleAuthError('Google sign-in failed. Please try again.', 'GOOGLE_TOKEN_INVALID');
  }

  if (!payload.aud || payload.aud !== GOOGLE_CLIENT_ID) {
    throw new GoogleAuthError('Google sign-in failed. Please try again.', 'GOOGLE_TOKEN_INVALID');
  }

  if (!payload.sub) {
    throw new GoogleAuthError('Google sign-in failed. Please try again.', 'GOOGLE_TOKEN_INVALID');
  }

  if (!payload.email) {
    throw new GoogleAuthError('Google sign-in failed. No email was returned. Please try again.', 'GOOGLE_EMAIL_MISSING');
  }

  if (payload.email_verified !== true) {
    throw new GoogleAuthError('Please use a Google account with a verified email.', 'GOOGLE_EMAIL_UNVERIFIED');
  }

  return {
    googleId: payload.sub,
    email: String(payload.email).toLowerCase(),
    name: String(payload.name || '').trim().slice(0, 255) || String(payload.email),
    picture: payload.picture || null,
    emailVerified: payload.email_verified === true,
  };
}

module.exports = {
  verifyGoogleIdToken,
  GoogleAuthError,
};
