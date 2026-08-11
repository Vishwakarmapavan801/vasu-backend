const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('../monitoring/logger');
const { captureException } = require('../monitoring/sentry');

const execPromise = util.promisify(exec);

const BACKUP_DIR = path.join(__dirname, '../../../backups');
const DB_NAME = process.env.DB_NAME || 'vasu';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '5432';
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;

let s3Client = null;

function initBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BACKUP_BUCKET) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    logger.info('S3 backup client initialized');
  } else {
    logger.warn('S3 backup not configured — backups will be local only');
  }

  logger.info('Backup service initialized');
  return true;
}

async function createBackup(type = 'full') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${DB_NAME}_${type}_${timestamp}.sql.gz`;
  const filepath = path.join(BACKUP_DIR, filename);

  const pgDumpArgs = [
    `--host=${DB_HOST}`,
    `--port=${DB_PORT}`,
    `--username=${DB_USER}`,
    `--dbname=${DB_NAME}`,
    `--format=custom`,
    `--compress=9`,
    `--verbose`,
  ];

  if (type === 'data-only') {
    pgDumpArgs.push('--data-only');
    pgDumpArgs.push('--exclude-table=analytics_events');
    pgDumpArgs.push('--exclude-table=feed_events');
  }

  if (type === 'schema-only') {
    pgDumpArgs.push('--schema-only');
  }

  // Set PGPASSWORD via env
  const env = {
    ...process.env,
    PGPASSWORD: process.env.DB_PASSWORD || 'admin',
  };

  const command = `pg_dump ${pgDumpArgs.join(' ')} > "${filepath}"`;

  logger.info(`Starting ${type} backup`, { filename });

  try {
    const startTime = Date.now();
    await execPromise(command, { env, shell: true });
    const duration = Date.now() - startTime;

    const stats = fs.statSync(filepath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    logger.info(`Backup completed`, { filename, sizeMB, durationMs: duration });

    // Upload to S3 if configured
    if (s3Client) {
      await uploadToS3(filename, filepath);
    }

    // Cleanup old backups
    await cleanupOldBackups();

    return { filename, filepath, sizeMB, duration };
  } catch (err) {
    logger.error(`Backup failed`, { error: err.message });
    captureException(err, { extra: { backupType: type } });
    throw err;
  }
}

async function uploadToS3(filename, filepath) {
  if (!s3Client) return;

  const bucket = process.env.S3_BACKUP_BUCKET;
  const key = `postgres-backups/${filename}`;

  try {
    const fileContent = fs.readFileSync(filepath);
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileContent,
      StorageClass: 'STANDARD_IA',
      Metadata: {
        created_at: new Date().toISOString(),
        database: DB_NAME,
      },
    }));

    logger.info(`Backup uploaded to S3`, { bucket, key });
  } catch (err) {
    logger.error(`S3 upload failed`, { error: err.message });
    captureException(err, { extra: { bucket, key } });
  }
}

async function restoreFromBackup(filename) {
  const filepath = path.isAbsolute(filename) ? filename : path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Backup file not found: ${filepath}`);
  }

  const env = {
    ...process.env,
    PGPASSWORD: process.env.DB_PASSWORD || 'admin',
  };

  const command = `pg_restore --host=${DB_HOST} --port=${DB_PORT} --username=${DB_USER} --dbname=${DB_NAME} --clean --if-exists --verbose "${filepath}"`;

  logger.warn(`Starting database restore`, { filename: path.basename(filepath) });

  try {
    const startTime = Date.now();
    await execPromise(command, { env, shell: true, timeout: 300000 });
    const duration = Date.now() - startTime;

    logger.info(`Restore completed`, { filename: path.basename(filepath), durationMs: duration });
    return { success: true, duration };
  } catch (err) {
    logger.error(`Restore failed`, { error: err.message });
    captureException(err, { extra: { filename } });
    throw err;
  }
}

async function listBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql.gz'))
    .map(f => {
      const stats = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        filename: f,
        size: stats.size,
        sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
        createdAt: stats.birthtime || stats.mtime,
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // List S3 backups if configured
  let s3Backups = [];
  if (s3Client) {
    try {
      const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
      const response = await s3Client.send(new ListObjectsV2Command({
        Bucket: process.env.S3_BACKUP_BUCKET,
        Prefix: 'postgres-backups/',
      }));
      s3Backups = (response.Contents || []).map(obj => ({
        filename: obj.Key.replace('postgres-backups/', ''),
        size: obj.Size,
        sizeMB: (obj.Size / (1024 * 1024)).toFixed(2),
        createdAt: obj.LastModified,
        storage: 's3',
      }));
    } catch (err) {
      logger.error('Failed to list S3 backups', { error: err.message });
    }
  }

  return { local: files, s3: s3Backups };
}

async function cleanupOldBackups() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql.gz'));

  let cleaned = 0;
  for (const file of files) {
    const filepath = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(filepath);
    if (stats.birthtime && new Date(stats.birthtime) < cutoff) {
      fs.unlinkSync(filepath);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} old backup(s)`);
  }

  return cleaned;
}

async function getBackupStatus() {
  const backups = await listBackups();
  const totalSizeMB = backups.local.reduce((sum, b) => sum + parseFloat(b.sizeMB), 0);
  return {
    localCount: backups.local.length,
    s3Count: backups.s3.length,
    totalSizeMB: totalSizeMB.toFixed(2),
    retentionDays: RETENTION_DAYS,
    lastBackup: backups.local[0] || null,
    config: {
      s3Enabled: !!s3Client,
      localPath: BACKUP_DIR,
      retentionDays: RETENTION_DAYS,
    },
  };
}

module.exports = {
  initBackup, createBackup, restoreFromBackup,
  listBackups, cleanupOldBackups, getBackupStatus,
};
