-- ================================================================
-- v16 Overpass Result Cache Migration
--
-- Persistent server-side cache for the Nearby Places Overpass proxy
-- (POST /api/nearby/overpass). Real OpenStreetMap results returned by
-- the public Overpass mirrors are stored keyed by the SHA-1 hash of the
-- query string — which embeds latitude/longitude + radius + categories.
--
-- This makes repeat property visits instant (no upstream call at all)
-- even after a server restart, and lets the proxy serve the most recent
-- cached results when the mirrors are down/rate-limited instead of an
-- empty section.
--
--   query_hash   — SHA-1 of the Overpass QL query (embeds lat/lng/radius)
--   query        — the exact Overpass QL query text (for inspection)
--   elements     — the real `elements` array returned by the mirror
--   unavailable  — true when cached from a graceful-empty outage state
--   fetched_at   — when the row was last written
--   accessed_at  — last read time (for future LRU pruning)
--
-- All statements are idempotent and safe to re-run.
-- ================================================================

CREATE TABLE IF NOT EXISTS overpass_cache (
  query_hash   TEXT PRIMARY KEY,
  query        TEXT NOT NULL,
  elements     JSONB NOT NULL DEFAULT '[]'::jsonb,
  unavailable  BOOLEAN NOT NULL DEFAULT FALSE,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accessed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overpass_cache_fetched_at ON overpass_cache (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_overpass_cache_accessed_at ON overpass_cache (accessed_at DESC);
