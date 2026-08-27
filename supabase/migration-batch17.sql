-- Migration: Batch 17 — Reviews
-- Host responses, review moderation, response notifications

BEGIN;

-- === 1. ADD HOST RESPONSE COLUMNS TO reviews ===
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS host_response TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS host_responded_at TIMESTAMPTZ;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS flag_reason TEXT;

-- === 2. INDEX for listing reviews ===
CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews (listing_id);
CREATE INDEX IF NOT EXISTS idx_reviews_booking ON reviews (booking_id);
CREATE INDEX IF NOT EXISTS idx_reviews_guest ON reviews (guest_id);

-- === 3. REVIEW RESPONSE NOTIFICATION FUNCTION ===
-- (Already handled in the API route, but we add a trigger for auto-notify)
CREATE OR REPLACE FUNCTION notify_on_review_response()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When host_response is added for the first time
  IF NEW.host_response IS NOT NULL
     AND (OLD.host_response IS NULL) THEN
    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    SELECT
      NEW.guest_id,
      'review_response',
      'Host Responded to Your Review',
      'The host has responded to your review.',
      '/listings/' || NEW.listing_id::text,
      jsonb_build_object('review_id', NEW.id, 'listing_id', NEW.listing_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS review_response_notify_trigger ON reviews;
CREATE TRIGGER review_response_notify_trigger
  AFTER UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION notify_on_review_response();

COMMIT;
