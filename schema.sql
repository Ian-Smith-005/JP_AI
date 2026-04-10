-- ============================================================
-- JOYALTY PHOTOGRAPHY — Neon PostgreSQL Schema (FINAL)
-- Includes:
-- ✅ Admin can delete bookings safely
-- ✅ Auto-expiry for pending bookings (1 hour)
-- ============================================================

-- ── 1. SERVICES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  base_price  INTEGER NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO services (name, base_price, description) VALUES
  ('Wedding Photography',    45000, 'Full-day wedding storytelling including ceremony, reception, couple portraits and cinematic editing.'),
  ('Portrait Session',        6000, 'Professional studio or outdoor portraits for individuals, models and personal branding.'),
  ('Commercial Photography', 25000, 'High-end brand visuals for companies, products and advertising campaigns.'),
  ('Event Coverage',         18000, 'Capture corporate events, graduations, birthdays, launches and celebrations.'),
  ('Engagement Shoot',       12000, 'Romantic engagement sessions designed to tell your love story before the big day.'),
  ('Family Photography',      8000, 'Natural family portraits capturing genuine moments and relationships.')
ON CONFLICT (name) DO NOTHING;

-- ── 2. PACKAGES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packages (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  price_modifier NUMERIC(4,2) DEFAULT 1.00
);

INSERT INTO packages (name, price_modifier) VALUES
  ('Standard', 1.00),
  ('Premium',  1.40),
  ('Luxury',   1.80)
ON CONFLICT (name) DO NOTHING;

-- ── 3. EXTRA SERVICES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extra_services (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  price INTEGER NOT NULL
);

INSERT INTO extra_services (name, price) VALUES
  ('None',             0),
  ('Drone Coverage',   8000),
  ('Photo Album',      5000),
  ('Highlight Video', 12000)
ON CONFLICT (name) DO NOTHING;

-- ── 4. CLIENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  phone      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. BOOKINGS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                SERIAL PRIMARY KEY,
  booking_ref       TEXT NOT NULL UNIQUE,
  client_id         INTEGER,
  service_id        INTEGER,
  package_id        INTEGER,
  extra_service_id  INTEGER,
  event_date        DATE,
  event_time        TIME,
  event_location    TEXT,
  guest_count       INTEGER,
  event_description TEXT,
  base_price        INTEGER,
  package_price     INTEGER,
  extra_price       INTEGER,
  total_price       INTEGER,
  deposit_amount    INTEGER,
  status            TEXT DEFAULT 'pending',
  payment_method    TEXT,
  expires_at        TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour'), -- ✅ NEW
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  -- ✅ UPDATED FK RULES (allow delete safely)
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL,
  FOREIGN KEY (extra_service_id) REFERENCES extra_services(id) ON DELETE SET NULL
);

-- ── 6. PAYMENTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  SERIAL PRIMARY KEY,
  booking_id          INTEGER,
  payment_method      TEXT NOT NULL,
  amount              INTEGER NOT NULL,
  status              TEXT DEFAULT 'pending',
  mpesa_checkout_id   TEXT,
  mpesa_receipt       TEXT,
  mpesa_phone         TEXT,
  stripe_payment_id   TEXT,
  stripe_session_id   TEXT,
  initiated_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,

  -- ✅ CASCADE delete when booking is removed
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- ── 7. RECEIPTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id           SERIAL PRIMARY KEY,
  booking_id   INTEGER UNIQUE,
  receipt_ref  TEXT NOT NULL UNIQUE,
  client_name  TEXT,
  client_email TEXT,
  client_phone TEXT,
  service_name TEXT,
  package_name TEXT,
  extra_name   TEXT,
  event_date   DATE,
  event_time   TIME,
  location     TEXT,
  base_price   INTEGER,
  extra_price  INTEGER,
  total_price  INTEGER,
  deposit_paid INTEGER DEFAULT 0,
  balance_due  INTEGER,
  payment_ref  TEXT,
  issued_at    TIMESTAMPTZ DEFAULT NOW(),

  -- ✅ CASCADE delete when booking is removed
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- ── 8. Auto-update updated_at on bookings ────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 9. CLEANUP FUNCTION (delete expired pending bookings) ────
CREATE OR REPLACE FUNCTION cleanup_pending_bookings()
RETURNS void AS $$
BEGIN
  DELETE FROM bookings
  WHERE status IN ('pending', 'pending_payment')
  AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ── 10. Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_status     ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_event_date ON bookings(event_date);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_clients_email       ON clients(email);