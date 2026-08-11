-- ================================================================
-- VASU REALTY - Instagram-style Social Platform Migration (v8)
-- ================================================================
-- Creates social features: enhanced posts, likes, comments, saves,
-- follows, notifications, stories, reels, hashtags, mentions
-- ================================================================

-- ================================================================
-- 1. Enhance agent_posts for Instagram-style posts
-- ================================================================
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}';
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS location VARCHAR(500);
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10,7);
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS location_lng DECIMAL(10,7);
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS is_reel BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS is_story BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS allows_comments BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS allows_saves BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS mentions UUID[] DEFAULT '{}';
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS tagged_agents UUID[] DEFAULT '{}';
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS listing_key VARCHAR(255);
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS listing_id VARCHAR(255);
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS save_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_agent_posts_hashtags ON agent_posts USING GIN (hashtags);
CREATE INDEX IF NOT EXISTS idx_agent_posts_is_reel ON agent_posts(is_reel);
CREATE INDEX IF NOT EXISTS idx_agent_posts_is_story ON agent_posts(is_story);
CREATE INDEX IF NOT EXISTS idx_agent_posts_listing_key ON agent_posts(listing_key);
CREATE INDEX IF NOT EXISTS idx_agent_posts_caption_search ON agent_posts USING gin(to_tsvector('english', COALESCE(caption, '')));

-- ================================================================
-- 2. social_post_media - Separate media entries per post
-- ================================================================
CREATE TABLE IF NOT EXISTS social_post_media (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    media_url         TEXT NOT NULL,
    media_type        VARCHAR(50) NOT NULL DEFAULT 'image',
    thumbnail_url     TEXT,
    width             INTEGER,
    height            INTEGER,
    duration          INTEGER,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_post_media_post_id ON social_post_media(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_media_sort ON social_post_media(post_id, sort_order);

-- ================================================================
-- 3. social_hashtags - Hashtag registry
-- ================================================================
CREATE TABLE IF NOT EXISTS social_hashtags (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag               VARCHAR(100) NOT NULL UNIQUE,
    post_count        INTEGER NOT NULL DEFAULT 0,
    last_used_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_hashtags_tag ON social_hashtags(tag);
CREATE INDEX IF NOT EXISTS idx_social_hashtags_post_count ON social_hashtags(post_count DESC);

-- ================================================================
-- 4. social_likes - Post likes
-- ================================================================
CREATE TABLE IF NOT EXISTS social_likes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_likes_post_id ON social_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_social_likes_user_id ON social_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_social_likes_created_at ON social_likes(created_at DESC);

-- ================================================================
-- 5. social_comments - Threaded comments
-- ================================================================
CREATE TABLE IF NOT EXISTS social_comments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id         UUID REFERENCES social_comments(id) ON DELETE CASCADE,
    content           TEXT NOT NULL,
    mentions          UUID[] DEFAULT '{}',
    like_count        INTEGER NOT NULL DEFAULT 0,
    reply_count       INTEGER NOT NULL DEFAULT 0,
    is_edited         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_comments_post_id ON social_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_user_id ON social_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_parent_id ON social_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_created_at ON social_comments(created_at DESC);

-- ================================================================
-- 6. social_comment_likes - Likes on comments
-- ================================================================
CREATE TABLE IF NOT EXISTS social_comment_likes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id        UUID NOT NULL REFERENCES social_comments(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_comment_likes_comment ON social_comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_social_comment_likes_user ON social_comment_likes(user_id);

-- ================================================================
-- 7. social_saves - Saved posts
-- ================================================================
CREATE TABLE IF NOT EXISTS social_saves (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_saves_post_id ON social_saves(post_id);
CREATE INDEX IF NOT EXISTS idx_social_saves_user_id ON social_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_social_saves_created_at ON social_saves(created_at DESC);

-- ================================================================
-- 8. social_follows - Follow system
-- ================================================================
CREATE TABLE IF NOT EXISTS social_follows (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_type    VARCHAR(20) NOT NULL DEFAULT 'agent',
    following_id      UUID NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(follower_id, following_type, following_id)
);

CREATE INDEX IF NOT EXISTS idx_social_follows_follower ON social_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_social_follows_following ON social_follows(following_type, following_id);
CREATE INDEX IF NOT EXISTS idx_social_follows_created_at ON social_follows(created_at DESC);

-- ================================================================
-- 9. social_notifications - Instagram-style notifications
-- ================================================================
CREATE TABLE IF NOT EXISTS social_notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    type              VARCHAR(50) NOT NULL,
    post_id           UUID REFERENCES agent_posts(id) ON DELETE CASCADE,
    comment_id        UUID REFERENCES social_comments(id) ON DELETE CASCADE,
    message           TEXT,
    is_read           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_notifications_user ON social_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_social_notifications_user_recent ON social_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_notifications_type ON social_notifications(type);
CREATE INDEX IF NOT EXISTS idx_social_notifications_unread ON social_notifications(user_id, is_read, created_at DESC) WHERE is_read = FALSE;

-- ================================================================
-- 10. social_stories - 24-hour stories
-- ================================================================
CREATE TABLE IF NOT EXISTS social_stories (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    media_url         TEXT NOT NULL,
    media_type        VARCHAR(50) NOT NULL DEFAULT 'image',
    thumbnail_url     TEXT,
    caption           TEXT,
    view_count        INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_social_stories_agent ON social_stories(agent_id);
CREATE INDEX IF NOT EXISTS idx_social_stories_expires ON social_stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_social_stories_active ON social_stories(agent_id, expires_at) WHERE expires_at > NOW();

-- ================================================================
-- 11. social_story_views - Story views
-- ================================================================
CREATE TABLE IF NOT EXISTS social_story_views (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id          UUID NOT NULL REFERENCES social_stories(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(story_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_story_views_story ON social_story_views(story_id);
CREATE INDEX IF NOT EXISTS idx_social_story_views_user ON social_story_views(user_id);

-- ================================================================
-- 12. social_post_listings - MLS listings attached to posts
-- ================================================================
CREATE TABLE IF NOT EXISTS social_post_listings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    listing_key       VARCHAR(255),
    listing_id        VARCHAR(255),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_post_listings_post ON social_post_listings(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_listings_key ON social_post_listings(listing_key);

-- ================================================================
-- 13. social_post_mentions - User/agent mentions in posts
-- ================================================================
CREATE TABLE IF NOT EXISTS social_post_mentions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    mentioned_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    mentioned_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_post_mentions_post ON social_post_mentions(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_mentions_user ON social_post_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_social_post_mentions_agent ON social_post_mentions(mentioned_agent_id);

-- ================================================================
-- 14. social_trending_cache - Trending posts cache
-- ================================================================
CREATE TABLE IF NOT EXISTS social_trending_cache (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    score             DECIMAL(12,4) NOT NULL DEFAULT 0,
    reason            VARCHAR(255),
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_trending_score ON social_trending_cache(score DESC);
CREATE INDEX IF NOT EXISTS idx_social_trending_computed ON social_trending_cache(computed_at);

-- ================================================================
-- Triggers for updated_at
-- ================================================================
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'social_comments'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        BEGIN
            EXECUTE format(
                'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
                t, t
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END LOOP;
END;
$$;

-- Fix typo in the migration above
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
