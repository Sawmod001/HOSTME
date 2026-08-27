-- Migration: Batch 21 — Messaging
-- Host-guest messaging system with read receipts and templates

BEGIN;

-- === 1. CREATE conversations TABLE ===
-- A conversation is between a guest and a host for a specific booking or listing
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  guest_id UUID NOT NULL REFERENCES users(id),
  host_id UUID NOT NULL REFERENCES users(id),
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  guest_unread_count INTEGER NOT NULL DEFAULT 0,
  host_unread_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One conversation per guest-host-listing combination
  CONSTRAINT conversations_unique UNIQUE (listing_id, guest_id, host_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_guest ON conversations (guest_id);
CREATE INDEX IF NOT EXISTS idx_conversations_host ON conversations (host_id);
CREATE INDEX IF NOT EXISTS idx_conversations_listing ON conversations (listing_id);
CREATE INDEX IF NOT EXISTS idx_conversations_booking ON conversations (booking_id)
  WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations (last_message_at DESC);

-- === 2. CREATE messages TABLE ===
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 5000),
  message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'system', 'template')),
  template_id TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages (conversation_id, read_at)
  WHERE read_at IS NULL;

-- === 3. CREATE message_templates TABLE ===
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  content TEXT NOT NULL CHECK (length(content) >= 1 AND length(content) <= 5000),
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'booking', 'pricing', 'availability', 'custom')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT templates_unique UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_templates_user ON message_templates (user_id);

-- === 4. RLS POLICIES ===
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Conversations: guest or host can read their own
CREATE POLICY conversations_read ON conversations
  FOR SELECT
  USING (guest_id = auth.uid() OR host_id = auth.uid());

-- Conversations: system can insert
CREATE POLICY conversations_insert ON conversations
  FOR INSERT
  WITH CHECK (true);

-- Conversations: participant can update
CREATE POLICY conversations_update ON conversations
  FOR UPDATE
  USING (guest_id = auth.uid() OR host_id = auth.uid());

-- Messages: participant can read
CREATE POLICY messages_read ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.guest_id = auth.uid() OR c.host_id = auth.uid())
    )
  );

-- Messages: participant can insert
CREATE POLICY messages_insert ON messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.guest_id = auth.uid() OR c.host_id = auth.uid())
        AND c.status = 'active'
    )
  );

-- Templates: owner can manage
CREATE POLICY templates_own ON message_templates
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- === 5. CONVERSATION FUNCTIONS ===

-- Get or create a conversation
CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_listing_id UUID,
  p_guest_id UUID,
  p_booking_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_conversation_id UUID;
  v_host_id UUID;
BEGIN
  -- Get host from listing
  SELECT pp.user_id INTO v_host_id
  FROM listings l
  JOIN provider_profiles pp ON pp.id = l.provider_profile_id
  WHERE l.id = p_listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Cannot message yourself
  IF v_host_id = p_guest_id THEN
    RAISE EXCEPTION 'Cannot create conversation with yourself';
  END IF;

  -- Try to get existing conversation
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE listing_id = p_listing_id
    AND guest_id = p_guest_id
    AND host_id = v_host_id;

  -- Create if not exists
  IF v_conversation_id IS NULL THEN
    INSERT INTO conversations (listing_id, booking_id, guest_id, host_id)
    VALUES (p_listing_id, p_booking_id, p_guest_id, v_host_id)
    RETURNING id INTO v_conversation_id;
  ELSIF p_booking_id IS NOT NULL THEN
    -- Update booking_id if provided and not set
    UPDATE conversations
    SET booking_id = p_booking_id
    WHERE id = v_conversation_id
      AND booking_id IS NULL;
  END IF;

  RETURN v_conversation_id;
END;
$$;

-- Send a message
CREATE OR REPLACE FUNCTION send_message(
  p_conversation_id UUID,
  p_sender_id UUID,
  p_content TEXT,
  p_message_type TEXT DEFAULT 'text',
  p_template_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_message_id UUID;
  v_preview TEXT;
  v_sender_role TEXT;
BEGIN
  -- Validate sender is participant
  IF NOT EXISTS(
    SELECT 1 FROM conversations
    WHERE id = p_conversation_id
      AND (guest_id = p_sender_id OR host_id = p_sender_id)
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not a participant or conversation is archived';
  END IF;

  -- Determine sender role
  SELECT CASE
    WHEN guest_id = p_sender_id THEN 'guest'
    WHEN host_id = p_sender_id THEN 'host'
  END INTO v_sender_role
  FROM conversations WHERE id = p_conversation_id;

  -- Create message
  INSERT INTO messages (conversation_id, sender_id, content, message_type, template_id)
  VALUES (p_conversation_id, p_sender_id, p_content, p_message_type, p_template_id)
  RETURNING id INTO v_message_id;

  -- Truncate preview
  v_preview := LEFT(p_content, 100);

  -- Update conversation
  UPDATE conversations
  SET last_message_at = now(),
      last_message_preview = v_preview,
      guest_unread_count = CASE
        WHEN v_sender_role = 'host' THEN guest_unread_count + 1
        ELSE guest_unread_count
      END,
      host_unread_count = CASE
        WHEN v_sender_role = 'guest' THEN host_unread_count + 1
        ELSE host_unread_count
      END,
      updated_at = now()
  WHERE id = p_conversation_id;

  -- Update template use count if template used
  IF p_template_id IS NOT NULL THEN
    UPDATE message_templates
    SET use_count = use_count + 1
    WHERE id = p_template_id;
  END IF;

  RETURN v_message_id;
END;
$$;

-- Mark conversation as read for a user
CREATE OR REPLACE FUNCTION mark_conversation_read(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_guest BOOLEAN;
BEGIN
  -- Check if user is participant
  SELECT guest_id = p_user_id INTO v_is_guest
  FROM conversations
  WHERE id = p_conversation_id;

  IF v_is_guest IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Mark messages as read
  UPDATE messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id != p_user_id
    AND read_at IS NULL;

  -- Reset unread count
  IF v_is_guest THEN
    UPDATE conversations
    SET guest_unread_count = 0
    WHERE id = p_conversation_id;
  ELSE
    UPDATE conversations
    SET host_unread_count = 0
    WHERE id = p_conversation_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- === 6. TRIGGERS ===
CREATE OR REPLACE FUNCTION update_conversations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_updated_at ON conversations;
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_conversations_updated_at();

CREATE OR REPLACE FUNCTION update_message_templates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_templates_updated_at ON message_templates;
CREATE TRIGGER message_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW EXECUTE FUNCTION update_message_templates_updated_at();

-- === 7. MESSAGE NOTIFICATION TRIGGER ===
CREATE OR REPLACE FUNCTION notify_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_conversation RECORD;
  v_sender_name TEXT;
  v_notify_user UUID;
BEGIN
  SELECT c.*, l.title as listing_title
  INTO v_conversation
  FROM conversations c
  JOIN listings l ON l.id = c.listing_id
  WHERE c.id = NEW.conversation_id;

  SELECT full_name INTO v_sender_name
  FROM users WHERE id = NEW.sender_id;

  -- Determine who to notify (the other participant)
  IF v_conversation.guest_id = NEW.sender_id THEN
    v_notify_user := v_conversation.host_id;
  ELSE
    v_notify_user := v_conversation.guest_id;
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (
    v_notify_user,
    'new_message',
    'New Message',
    v_sender_name || ': ' || LEFT(NEW.content, 100),
    '/messages/' || v_conversation.id,
    jsonb_build_object(
      'conversation_id', v_conversation.id,
      'message_id', NEW.id,
      'sender_id', NEW.sender_id,
      'listing_title', v_conversation.listing_title
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS new_message_notify_trigger ON messages;
CREATE TRIGGER new_message_notify_trigger
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_on_new_message();

COMMIT;
