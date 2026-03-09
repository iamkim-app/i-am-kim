-- ============================================================
-- I AM KIM — Partner Events table
-- Run this in your Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_events (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title       text        NOT NULL,
  subtitle    text,
  description text,
  images      text[]      DEFAULT '{}',
  coupon_code text,
  naver_map_url text,
  expires_at  timestamptz,
  is_active   boolean     DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE partner_events ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read active, non-expired events
CREATE POLICY "partner_events_public_read"
  ON partner_events
  FOR SELECT
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  );

-- Admin: full access (read/insert/update/delete)
CREATE POLICY "partner_events_admin_all"
  ON partner_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
