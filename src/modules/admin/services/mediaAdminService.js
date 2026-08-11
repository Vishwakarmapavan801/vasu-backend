/**
 * Admin Media Service
 *
 * A read-only view into the live image pipeline (imageProcessor) plus a
 * single destructive-but-rebuildable action: purge cached variants for one
 * media key and re-warm. No media files are duplicated or stored anywhere
 * by the admin module — it inspects the same on-disk cache / metrics that
 * the /api/image proxy already uses.
 */

const pool = require('../../../config/database');
const imageProcessor = require('../../../services/imageProcessor');
const imageMetrics = require('../../../utils/imageMetrics');
const mlsService = require('../../../services/mlsService');

async function getOverview() {
  const warm = imageProcessor.warmStats();

  const metrics = imageMetrics.snapshot();

  // Live registry of media keys in use (reverse MediaKey -> ListingKey map
  // maintained by mlsService during property normalization).
  const mediaEntries = [...mlsService.mediaUrlStore.entries()].slice(-100);

  // Where original files are stored on disk for a media key.
  const original = async (mediaKey) => {
    try {
      const entry = await imageProcessor.getOriginalEntry(mediaKey);
      return entry ? { file: entry.file, ext: entry.ext } : null;
    } catch {
      return null;
    }
  };

  const recentMedia = [];
  for (const [mediaKey, info] of mediaEntries) {
    recentMedia.push({
      mediaKey,
      listingKey: info.listingKey || null,
      hasOriginal: !!(await original(mediaKey)),
    });
  }

  return {
    success: true,
    pipeline: {
      enabled: true,
      widths: imageProcessor.VARIANT_WIDTHS,
      formats: imageProcessor.VARIANT_FORMATS,
      qualityByFormat: imageProcessor.QUALITY_BY_FORMAT,
      warm,
    },
    metrics,
    registry: {
      trackedKeys: mlsService.mediaUrlStore.size,
      recentMedia,
    },
  };
}

async function getMedia(mediaKey) {
  if (!mediaKey) throw Object.assign(new Error('mediaKey required'), { statusCode: 400 });

  const entry = await imageProcessor.getOriginalEntry(mediaKey);
  const original = entry ? await imageProcessor.getPersistedOriginal(mediaKey) : null;

  let signedUrl = null;
  let listingKey = null;
  const storeInfo = mlsService.mediaUrlStore.get(mediaKey);
  if (storeInfo) {
    signedUrl = storeInfo.signedUrl || null;
    listingKey = storeInfo.listingKey || null;
  }
  if (!signedUrl) {
    try {
      signedUrl = await mlsService.getSignedMediaUrl(mediaKey);
    } catch {
      signedUrl = null;
    }
  }

  // Resolve the listing this media belongs to (live MLS detail).
  let listing = null;
  if (listingKey) {
    const { rows } = await pool.query(
      `SELECT listing_key, is_featured, is_archived FROM listing_admin_meta WHERE listing_key = $1`,
      [listingKey]
    );
    listing = {
      listingKey,
      adminMeta: rows[0] || null,
    };
  }

  return {
    success: true,
    mediaKey,
    hasOriginal: !!entry,
    original: original
      ? { contentType: original.contentType, bytes: original.buffer.length }
      : null,
    signedUrl,
    proxyPath: `/api/image/${mediaKey}`,
    listing,
    variantWidths: imageProcessor.VARIANT_WIDTHS,
    variantFormats: imageProcessor.VARIANT_FORMATS,
  };
}

/**
 * Purge all cached variants for a media key and re-warm the full variant set.
 * The original is re-fetched from MLS Grid if missing. Read-after-purge is
 * guaranteed to regenerate fresh variants from the current MLS bytes.
 */
async function refreshMedia(mediaKey) {
  if (!mediaKey) throw Object.assign(new Error('mediaKey required'), { statusCode: 400 });

  const hadOriginal = !!(await imageProcessor.getOriginalEntry(mediaKey));
  await imageProcessor.invalidateVariants(mediaKey);

  if (hadOriginal) {
    imageProcessor.enqueueWarm(mediaKey);
  } else {
    await imageProcessor.ensureOriginal(mediaKey, async () => {
      const fetched = await mlsService.fetchMediaBuffer(mediaKey);
      if (fetched.status !== 'ok' || !fetched.buffer) {
        return { status: fetched.status || 'not-found' };
      }
      return { status: 'ok', buffer: fetched.buffer, contentType: fetched.contentType || 'image/jpeg', etag: fetched.etag };
    });
  }

  return {
    success: true,
    mediaKey,
    purgedVariants: true,
    requeuedWarm: true,
    hadOriginal,
  };
}

module.exports = { getOverview, getMedia, refreshMedia };
