-- ================================================================
-- JOYALTY PHOTOGRAPHY — Complete Supabase Schema (Final Fixed)
-- Safe to run on fresh project or existing one.
-- All columns defined in CREATE TABLE — no ALTER TABLE for
-- columns referenced in policies or foreign keys.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- SECTION 1: CORE TABLES
-- ================================================================

CREATE TABLE IF NOT EXISTS clients (
  id         BIGSERIAL    PRIMARY KEY,
  name       TEXT         NOT NULL,
  email      TEXT         NOT NULL UNIQUE,
  phone      TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);

CREATE TABLE IF NOT EXISTS services (
  id          BIGSERIAL     PRIMARY KEY,
  name        TEXT          NOT NULL UNIQUE,
  description TEXT,
  base_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  duration    TEXT,
  sort_order  INT           NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_name ON services(name);

CREATE TABLE IF NOT EXISTS packages (
  id             BIGSERIAL     PRIMARY KEY,
  name           TEXT          NOT NULL UNIQUE,
  description    TEXT,
  price_modifier NUMERIC(5,2)  NOT NULL DEFAULT 1.00,
  sort_order     INT           NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extra_services (
  id          BIGSERIAL     PRIMARY KEY,
  name        TEXT          NOT NULL UNIQUE,
  description TEXT,
  price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order  INT           NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id               BIGSERIAL     PRIMARY KEY,
  booking_ref      TEXT          NOT NULL UNIQUE,
  client_id        BIGINT        NOT NULL REFERENCES clients(id)        ON DELETE CASCADE,
  service_id       BIGINT        NOT NULL REFERENCES services(id)       ON DELETE RESTRICT,
  package_id       BIGINT                 REFERENCES packages(id)       ON DELETE SET NULL,
  extra_service_id BIGINT                 REFERENCES extra_services(id) ON DELETE SET NULL,
  event_date       DATE,
  event_time       TIME,
  event_location   TEXT,
  guest_count      INT,
  event_description TEXT,
  notes            TEXT,
  base_price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  package_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  extra_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           TEXT          NOT NULL DEFAULT 'pending_payment'
                   CHECK (status IN ('pending_payment','confirmed','cancelled','completed','refunded')),
  payment_method   TEXT          NOT NULL DEFAULT 'mpesa'
                   CHECK (payment_method IN ('mpesa','cash','bank_transfer','card')),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_client  ON bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service ON bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status  ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_ref     ON bookings(booking_ref);
CREATE INDEX IF NOT EXISTS idx_bookings_date    ON bookings(event_date);

CREATE TABLE IF NOT EXISTS payments (
  id                BIGSERIAL     PRIMARY KEY,
  booking_id        BIGINT        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_method    TEXT          NOT NULL DEFAULT 'mpesa',
  amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  status            TEXT          NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','completed','failed','refunded')),
  mpesa_checkout_id TEXT,
  mpesa_merchant_id TEXT,
  mpesa_receipt     TEXT,
  mpesa_phone       TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  CONSTRAINT uq_payments_checkout UNIQUE (mpesa_checkout_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_booking  ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_checkout ON payments(mpesa_checkout_id);

CREATE TABLE IF NOT EXISTS receipts (
  id           BIGSERIAL     PRIMARY KEY,
  booking_id   BIGINT        NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  receipt_ref  TEXT          NOT NULL UNIQUE,
  booking_ref  TEXT          NOT NULL,
  client_name  TEXT          NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  service_name TEXT          NOT NULL,
  package_name TEXT          NOT NULL DEFAULT 'Standard',
  extra_name   TEXT          NOT NULL DEFAULT 'None',
  event_date   DATE,
  event_time   TIME,
  location     TEXT,
  base_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  extra_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due  NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_ref  TEXT,
  issued_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_booking ON receipts(booking_id);
CREATE INDEX IF NOT EXISTS idx_receipts_ref     ON receipts(receipt_ref);

-- ================================================================
-- SECTION 2: CHAT TABLES
-- reply_to_id is a self-reference so we add it after the table
-- exists — this is intentional and the only correct approach for
-- self-referential FKs in PostgreSQL.
-- ================================================================

CREATE TABLE IF NOT EXISTS chat_users (
  id         BIGSERIAL   PRIMARY KEY,
  username   TEXT        NOT NULL UNIQUE,
  session_id TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_users_username ON chat_users(username);
CREATE INDEX IF NOT EXISTS idx_chat_users_session  ON chat_users(session_id);

CREATE TABLE IF NOT EXISTS live_chat_messages (
  id            BIGSERIAL   PRIMARY KEY,
  session_id    TEXT        NOT NULL,
  sender        TEXT        NOT NULL CHECK (sender IN ('user','admin')),
  name          TEXT,
  text          TEXT        NOT NULL DEFAULT '',
  file_url      TEXT,
  file_type     TEXT        CHECK (file_type IN ('image','pdf','audio','voice') OR file_type IS NULL),
  file_name     TEXT,
  file_size     INT,
  reply_preview TEXT,
  read          BOOLEAN     NOT NULL DEFAULT false,
  delivered_at  TIMESTAMPTZ,
  read_at       TIMESTAMPTZ,
  reactions     JSONB       NOT NULL DEFAULT '{}',
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Self-referential FK added after table exists (the only correct way in PG)
ALTER TABLE live_chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id BIGINT;

ALTER TABLE live_chat_messages
  DROP CONSTRAINT IF EXISTS lcm_reply_to_fk;
ALTER TABLE live_chat_messages
  ADD CONSTRAINT lcm_reply_to_fk
  FOREIGN KEY (reply_to_id) REFERENCES live_chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lcm_session   ON live_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_lcm_sender    ON live_chat_messages(sender);
CREATE INDEX IF NOT EXISTS idx_lcm_timestamp ON live_chat_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_lcm_reply_to  ON live_chat_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_lcm_read_at   ON live_chat_messages(read_at);

-- ================================================================
-- SECTION 3: SEED DATA
-- ================================================================

INSERT INTO services (name, description, base_price, duration, sort_order) VALUES
  ('Wedding Photography',    'Full wedding day coverage with edited gallery',     85000, 'Full day (8 hrs)', 1),
  ('Portrait Session',       'Studio or outdoor individual/couple portraits',      8500, '2 hours',          2),
  ('Commercial Photography', 'Product, brand, and corporate photography',         25000, '4 hours',          3),
  ('Event Coverage',         'Corporate events, parties, graduations',            15000, '4 hours',          4),
  ('Engagement Shoot',       'Pre-wedding romantic session',                      12000, '2–3 hours',        5),
  ('Family Photography',     'Outdoor or studio family portraits',                10000, '2 hours',          6)
ON CONFLICT (name) DO NOTHING;

INSERT INTO packages (name, description, price_modifier, sort_order) VALUES
  ('Standard', 'Digital gallery, 50 edited photos',               1.00, 1),
  ('Premium',  'Digital gallery, 100 edited photos + album',      1.40, 2),
  ('Luxury',   'Digital gallery, unlimited edits, album + video', 1.85, 3)
ON CONFLICT (name) DO NOTHING;

INSERT INTO extra_services (name, description, price, sort_order) VALUES
  ('None',            'No extra services',                   0,     1),
  ('Drone Coverage',  'Aerial shots with licensed drone',    8000,  2),
  ('Photo Album',     'Printed 30-page premium photo album', 6500,  3),
  ('Highlight Video', '3–5 minute cinematic edit',           12000, 4)
ON CONFLICT (name) DO NOTHING;

-- ================================================================
-- SECTION 4: UPDATED_AT TRIGGERS
-- ================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_clients  ON clients;
CREATE TRIGGER set_updated_at_clients
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_bookings ON bookings;
CREATE TRIGGER set_updated_at_bookings
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ================================================================
-- SECTION 5: CASCADE FIX
-- ================================================================

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_booking_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;

ALTER TABLE receipts
  DROP CONSTRAINT IF EXISTS receipts_booking_id_fkey;
ALTER TABLE receipts
  ADD CONSTRAINT receipts_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;

-- ================================================================
-- SECTION 6: ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE services           ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE extra_services     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read services"             ON services;
DROP POLICY IF EXISTS "service role all services"        ON services;
CREATE POLICY "public read services"       ON services       FOR SELECT USING (true);
CREATE POLICY "service role all services"  ON services       USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "public read packages"             ON packages;
DROP POLICY IF EXISTS "service role all packages"        ON packages;
CREATE POLICY "public read packages"       ON packages       FOR SELECT USING (true);
CREATE POLICY "service role all packages"  ON packages       USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "public read extra_services"       ON extra_services;
DROP POLICY IF EXISTS "service role all extra_services"  ON extra_services;
CREATE POLICY "public read extra_services" ON extra_services FOR SELECT USING (true);
CREATE POLICY "service role all extra_services" ON extra_services USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service role all clients"         ON clients;
CREATE POLICY "service role all clients"   ON clients        USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "public insert bookings"           ON bookings;
DROP POLICY IF EXISTS "service role all bookings"        ON bookings;
CREATE POLICY "public insert bookings"     ON bookings       FOR INSERT WITH CHECK (true);
CREATE POLICY "service role all bookings"  ON bookings       USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "public insert payments"           ON payments;
DROP POLICY IF EXISTS "service role all payments"        ON payments;
CREATE POLICY "public insert payments"     ON payments       FOR INSERT WITH CHECK (true);
CREATE POLICY "service role all payments"  ON payments       USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "public read receipts"             ON receipts;
DROP POLICY IF EXISTS "service role all receipts"        ON receipts;
CREATE POLICY "public read receipts"       ON receipts       FOR SELECT USING (true);
CREATE POLICY "service role all receipts"  ON receipts       USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "public insert chat_msgs"          ON live_chat_messages;
DROP POLICY IF EXISTS "public select chat_msgs"          ON live_chat_messages;
DROP POLICY IF EXISTS "public update chat_msgs"          ON live_chat_messages;
DROP POLICY IF EXISTS "service role all chat_msgs"       ON live_chat_messages;
CREATE POLICY "public insert chat_msgs"    ON live_chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "public select chat_msgs"    ON live_chat_messages FOR SELECT USING (true);
CREATE POLICY "public update chat_msgs"    ON live_chat_messages FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "service role all chat_msgs" ON live_chat_messages USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "public insert chat_users"         ON chat_users;
DROP POLICY IF EXISTS "public select chat_users"         ON chat_users;
DROP POLICY IF EXISTS "service role all chat_users"      ON chat_users;
CREATE POLICY "public insert chat_users"   ON chat_users     FOR INSERT WITH CHECK (true);
CREATE POLICY "public select chat_users"   ON chat_users     FOR SELECT USING (true);
CREATE POLICY "service role all chat_users" ON chat_users    USING (auth.role() = 'service_role');

-- ================================================================
-- SECTION 7: REALTIME
-- ================================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ================================================================
-- SECTION 8: STORAGE
-- ================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-files', 'chat-files', true, 10485760,
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'application/pdf',
    'audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "public upload chat files" ON storage.objects;
DROP POLICY IF EXISTS "public read chat files"   ON storage.objects;
DROP POLICY IF EXISTS "public delete chat files" ON storage.objects;
CREATE POLICY "public upload chat files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-files');
CREATE POLICY "public read chat files"   ON storage.objects FOR SELECT USING (bucket_id = 'chat-files');
CREATE POLICY "public delete chat files" ON storage.objects FOR DELETE USING (bucket_id = 'chat-files');

-- ================================================================
-- SECTION 9: FUNCTIONS
-- ================================================================

CREATE OR REPLACE FUNCTION mark_messages_read(p_session_id TEXT, p_reader TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE live_chat_messages
  SET    read_at = NOW(), read = true
  WHERE  session_id = p_session_id
    AND  sender    != p_reader
    AND  read_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION get_booking_stats()
RETURNS TABLE (
  total_bookings     BIGINT,
  confirmed_bookings BIGINT,
  pending_bookings   BIGINT,
  total_revenue      NUMERIC
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COUNT(*)                                             AS total_bookings,
    COUNT(*) FILTER (WHERE b.status = 'confirmed')       AS confirmed_bookings,
    COUNT(*) FILTER (WHERE b.status = 'pending_payment') AS pending_bookings,
    COALESCE(SUM(r.deposit_paid), 0)                     AS total_revenue
  FROM bookings b
  LEFT JOIN receipts r ON r.booking_id = b.id;
$$;

-- ================================================================
-- SECTION 10: VIEWS
-- ================================================================

CREATE OR REPLACE VIEW v_bookings_full AS
SELECT
  b.id, b.booking_ref, b.status, b.event_date, b.event_time,
  b.event_location, b.event_description, b.guest_count,
  b.total_price, b.deposit_amount, b.payment_method,
  b.notes, b.created_at, b.updated_at,
  c.name  AS client_name,
  c.email AS client_email,
  c.phone AS client_phone,
  s.name  AS service_name,
  p.name  AS package_name,
  e.name  AS extra_name,
  r.receipt_ref, r.deposit_paid, r.balance_due,
  r.payment_ref, r.issued_at
FROM bookings b
LEFT JOIN clients        c ON c.id = b.client_id
LEFT JOIN services       s ON s.id = b.service_id
LEFT JOIN packages       p ON p.id = b.package_id
LEFT JOIN extra_services e ON e.id = b.extra_service_id
LEFT JOIN receipts       r ON r.booking_id = b.id;

CREATE OR REPLACE VIEW v_chat_sessions AS
SELECT
  m.session_id,
  cu.username AS display_name,
  MAX(m.timestamp) AS last_at,
  (SELECT text FROM live_chat_messages
   WHERE session_id = m.session_id ORDER BY timestamp DESC LIMIT 1) AS last_text,
  COUNT(*) FILTER (WHERE m.sender = 'user' AND m.read_at IS NULL) AS unread_count
FROM live_chat_messages m
LEFT JOIN chat_users cu ON cu.session_id = m.session_id
GROUP BY m.session_id, cu.username;

-- ================================================================
-- SECTION 11: VERIFICATION
-- ================================================================

SELECT
  t.table_name,
  (SELECT COUNT(*) FROM information_schema.columns c
   WHERE c.table_name = t.table_name
     AND c.table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type   = 'BASE TABLE'
ORDER BY t.table_name;