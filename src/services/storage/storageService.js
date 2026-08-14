/**
 * Blog asset storage service.
 *
 * Uploads generated cover images to an S3-compatible object store
 * (AWS S3, Cloudflare R2, MinIO, …). When no bucket is configured it
 * transparently falls back to local disk under backend/uploads/blog,
 * which is already served statically at /uploads. This keeps the whole
 * workflow functional in development without any mock data.
 *
 * Env:
 *   BLOG_S3_BUCKET            (falls back to S3_BUCKET)
 *   BLOG_S3_REGION            (falls back to S3_REGION / AWS_REGION)
 *   BLOG_S3_ACCESS_KEY_ID     (falls back to AWS_ACCESS_KEY_ID)
 *   BLOG_S3_SECRET_ACCESS_KEY (falls back to AWS_SECRET_ACCESS_KEY)
 *   BLOG_S3_ENDPOINT          — custom endpoint for S3-compatible storage
 *   BLOG_S3_PUBLIC_BASE_URL   — public/CDN base URL for uploaded objects
 *   BLOG_S3_FORCE_PATH_STYLE  — path-style addressing (MinIO/R2)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  S3Client,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const {
  BLOG_S3_BUCKET,
  BLOG_S3_REGION,
  BLOG_S3_ACCESS_KEY_ID,
  BLOG_S3_SECRET_ACCESS_KEY,
  BLOG_S3_ENDPOINT,
  BLOG_S3_PUBLIC_BASE_URL,
  BLOG_S3_FORCE_PATH_STYLE,
} = require('../../config');
const logger = require('../monitoring/logger');

const LOCAL_UPLOAD_DIR = path.join(__dirname, '../../../uploads/blog');
let s3Client = null;

function initS3Client() {
  if (s3Client) return s3Client;

  const s3Config = {
    region: BLOG_S3_REGION,
    forcePathStyle: BLOG_S3_FORCE_PATH_STYLE,
  };
  if (BLOG_S3_ACCESS_KEY_ID && BLOG_S3_SECRET_ACCESS_KEY) {
    s3Config.credentials = {
      accessKeyId: BLOG_S3_ACCESS_KEY_ID,
      secretAccessKey: BLOG_S3_SECRET_ACCESS_KEY,
    };
  }
  if (BLOG_S3_ENDPOINT) {
    s3Config.endpoint = BLOG_S3_ENDPOINT;
  }

  s3Client = new S3Client(s3Config);
  return s3Client;
}

function isS3Configured() {
  return Boolean(BLOG_S3_BUCKET && BLOG_S3_ACCESS_KEY_ID && BLOG_S3_SECRET_ACCESS_KEY);
}

function getStorageMode() {
  return isS3Configured() ? 's3' : 'local';
}

function makeKey(kind, ext) {
  const date = new Date().toISOString().slice(0, 10);
  const id = crypto.randomBytes(12).toString('hex');
  return `blog/${date}/${kind}-${id}.${ext}`;
}

/**
 * Upload a buffer to storage and return { url, key, bucket }.
 * The URL is absolute when a public base URL or S3 is configured, and a
 * relative /uploads path for the local fallback (resolved by the frontend).
 */
async function uploadBuffer({ buffer, key = makeKey('asset', 'bin'), contentType = 'application/octet-stream', kind = 'asset' }) {
  if (isS3Configured()) {
    const client = initS3Client();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: BLOG_S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );

      const url = BLOG_S3_PUBLIC_BASE_URL
        ? `${BLOG_S3_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${key}`
        : `https://${BLOG_S3_BUCKET}.s3.${BLOG_S3_REGION}.amazonaws.com/${key}`;

      logger.info('blog storage: uploaded to s3', { bucket: BLOG_S3_BUCKET, key, bytes: buffer.length });
      return { url, key, bucket: BLOG_S3_BUCKET, storage: 's3' };
    } catch (err) {
      logger.error('blog storage: s3 upload failed', { key, error: err.message });
      throw err;
    }
  }

  // Local disk fallback (development / no bucket configured).
  const filePath = path.join(LOCAL_UPLOAD_DIR, key.replace(/^blog\//, ''));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);

  logger.info('blog storage: saved locally', { key, bytes: buffer.length });
  return { url: `/uploads/blog/${key.replace(/^blog\//, '')}`, key, bucket: null, storage: 'local' };
}

/**
 * Upload a cover image buffer (already sized to 1200×630 by the caller).
 */
async function uploadCoverImage(buffer, { mimeType = 'image/jpeg', kind = 'cover' } = {}) {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  return uploadBuffer({
    buffer,
    key: makeKey(kind, ext),
    contentType: mimeType,
    kind,
  });
}

function getStorageStatus() {
  return {
    mode: getStorageMode(),
    s3Configured: isS3Configured(),
    bucket: BLOG_S3_BUCKET || null,
    publicBaseUrl: BLOG_S3_PUBLIC_BASE_URL || null,
    localDir: LOCAL_UPLOAD_DIR,
  };
}

module.exports = {
  uploadBuffer,
  uploadCoverImage,
  isS3Configured,
  getStorageMode,
  getStorageStatus,
  makeKey,
};
