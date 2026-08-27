-- Migration: Batch 12 — Notification Engine
-- Read/unread tracking, preferences, email notifications

BEGIN;

-- === 1. ADD read_at COLUMN TO notifications ===
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'in_app'
  CHECK (channel IN ('in_app', 'email', 'push', 'sms'));

-- === 2. CREATE notification_preferences TABLE ===
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  booking_notifications BOOLEAN NOT NULL DEFAULT true,
  payment_notifications BOOLEAN NOT NULL DEFAULT true,
  viewing_notifications BOOLEAN NOT NULL DEFAULT true,
  marketing_notifications BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences (user_id);

-- === 3. RLS FOR notification_preferences ===
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_prefs_own ON notification_preferences
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- === 4. NOTIFICATION VIEWS ===
CREATE OR REPLACE VIEW user_notifications AS
SELECT
  n.id,
  n.user_id,
  n.type,
  n.title,
  n.body,
  n.link,
  n.metadata,
  n.channel,
  n.created_at,
  n.read_at,
  CASE WHEN n.read_at IS NULL THEN false ELSE true END as is_read
FROM notifications n
ORDER BY n.created_at DESC;

-- === 5. HELPER FUNCTION: mark_notification_read ===
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE notifications
  SET read_at = now()
  WHERE id = p_notification_id
    AND user_id = p_user_id
    AND read_at IS NULL;

  RETURN FOUND;
END;
$$;

-- === 6. HELPER FUNCTION: mark_all_notifications_read ===
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE notifications
  SET read_at = now()
  WHERE user_id = p_user_id
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- === 7. HELPER FUNCTION: get_unread_count ===
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM notifications
  WHERE user_id = p_user_id
    AND read_at IS NULL;

  RETURN v_count;
END;
$$;

-- === 8. EMAIL NOTIFICATION FUNCTION ===
-- Sends email via Resend/SendGrid webhook (placeholder for real integration)
CREATE OR REPLACE FUNCTION send_email_notification(
  p_to TEXT,
  p_subject TEXT,
  p_html TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  -- Log the email (in production, this would call an email API)
  INSERT INTO notifications (user_id, type, title, body, channel, metadata)
  SELECT
    u.id,
    'email_sent',
    p_subject,
    p_subject,
    'email',
    p_metadata || jsonb_build_object('to', p_to, 'html_length', length(p_html))
  FROM users u
  WHERE u.email = p_to;

  RETURN jsonb_build_object('ok', true, 'queued', true);
END;
$$;

-- === 9. TRIGGER: Auto-notify on booking status change ===
CREATE OR REPLACE FUNCTION notify_on_booking_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_guest_name TEXT;
  v_host_name TEXT;
  v_listing_title TEXT;
  v_notify_user UUID;
  v_notif_type TEXT;
  v_notif_title TEXT;
  v_notif_body TEXT;
BEGIN
  -- Only on status change
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get names
  SELECT full_name INTO v_guest_name FROM users WHERE id = NEW.guest_id;
  SELECT l.title INTO v_listing_title FROM listings l WHERE l.id = NEW.listing_id;
  SELECT u.full_name INTO v_host_name
  FROM users u
  JOIN provider_profiles pp ON pp.user_id = u.id
  JOIN listings l ON l.provider_profile_id = pp.id
  WHERE l.id = NEW.listing_id;

  -- Determine notification based on new status
  CASE NEW.status
    WHEN 'confirmed' THEN
      v_notify_user := NEW.guest_id;
      v_notif_type := 'booking_confirmed';
      v_notif_title := 'Booking Confirmed';
      v_notif_body := 'Your booking for "' || v_listing_title || '" has been confirmed!';
    WHEN 'completed' THEN
      v_notify_user := NEW.guest_id;
      v_notif_type := 'booking_completed';
      v_notif_title := 'Booking Completed';
      v_notif_body := 'Your booking for "' || v_listing_title || '" has been completed. We hope you enjoyed it!';
    WHEN 'cancelled' THEN
      -- Notify both parties
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      VALUES
        (NEW.guest_id, 'booking_cancelled', 'Booking Cancelled',
         'Your booking for "' || v_listing_title || '" has been cancelled.',
         '/dashboard', jsonb_build_object('booking_id', NEW.id)),
        ((SELECT pp.user_id FROM listings l JOIN provider_profiles pp ON pp.id = l.provider_profile_id WHERE l.id = NEW.listing_id),
         'booking_cancelled', 'Booking Cancelled',
         'A booking for "' || v_listing_title || '" has been cancelled.',
         '/host/bookings', jsonb_build_object('booking_id', NEW.id));
      RETURN NEW;
    WHEN 'rejected' THEN
      v_notify_user := NEW.guest_id;
      v_notif_type := 'booking_rejected';
      v_notif_title := 'Booking Not Approved';
      v_notif_body := 'Your booking for "' || v_listing_title || '" was not approved by the host.';
    ELSE
      RETURN NEW;
  END CASE;

  IF v_notify_user IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    VALUES (v_notify_user, v_notif_type, v_notif_title, v_notif_body,
            '/dashboard', jsonb_build_object('booking_id', NEW.id));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_booking_change_trigger ON bookings;
CREATE TRIGGER notify_booking_change_trigger
  AFTER UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION notify_on_booking_change();

-- === 10. TRIGGER for notification_preferences updated_at ===
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_notification_preferences_updated_at();

COMMIT;
