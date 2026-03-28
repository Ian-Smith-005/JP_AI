-- ============================================================
-- JOYALTY PHOTOGRAPHY — Neon PostgreSQL Schema
-- Run this in your Neon SQL Editor once to set up all tables
-- ============================================================

-- ── 1. SERVICES (your 6 service types) ──────────────────────
CREATE TABLE IF NOT EXISTS services (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  base_price  INTEGER NOT NULL,  -- in KSh
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with your real services from services.html
INSERT INTO services (name, base_price, description) VALUES
  ('Wedding Photography',    45000, 'Full-day wedding storytelling including ceremony, reception, couple portraits, candid moments and cinematic editing.'),
  ('Portrait Session',        6000, 'Professional studio or outdoor portraits for individuals, models, professionals and personal branding.'),
  ('Commercial Photography', 25000, 'High-end brand visuals for companies, products, advertising campaigns and social media marketing.'),
  ('Event Coverage',         18000, 'Capture corporate events, graduations, birthdays, launches and celebrations.'),
  ('Engagement Shoot',       12000, 'Romantic engagement sessions designed to tell your love story before the big day.'),
  ('Family Photography',      8000, 'Natural family portraits capturing genuine moments and relationships.')
ON CONFLICT (name) DO NOTHING;

-- ── 2. PACKAGES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packages (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,  -- Standard, Premium, Luxury
  price_modifier NUMERIC(4,2) DEFAULT 1.00  -- multiplier on base price
);

INSERT INTO packages (name, price_modifier) VALUES
  ('Standard', 1.00),
  ('Premium',  1.40),
  ('Luxury',   1.80)
ON CONFLICT (name) DO NOTHING;

-- ── 3. EXTRA SERVICES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS extra_services (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  price INTEGER NOT NULL  -- flat add-on in KSh
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
  email      TEXT NOT NULL,
  phone      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. BOOKINGS (core table) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                SERIAL PRIMARY KEY,
  booking_ref       TEXT NOT NULL UNIQUE,  -- e.g. JOY-2026-0001
  client_id         INTEGER REFERENCES clients(id),
  service_id        INTEGER REFERENCES services(id),
  package_id        INTEGER REFERENCES packages(id),
  extra_service_id  INTEGER REFERENCES extra_services(id),
  event_date        DATE,
  event_time        TIME,
  event_location    TEXT,
  guest_count       INTEGER,
  event_description TEXT,
  base_price        INTEGER,   -- KSh at time of booking
  package_price     INTEGER,   -- after package modifier
  extra_price       INTEGER,   -- flat add-on
  total_price       INTEGER,   -- final total in KSh
  deposit_amount    INTEGER,   -- 30% of total
  status            TEXT DEFAULT 'pending',
  -- pending | confirmed | cancelled | completed
  payment_method    TEXT,      -- mpesa | stripe | cash
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. PAYMENTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  SERIAL PRIMARY KEY,
  booking_id          INTEGER REFERENCES bookings(id),
  payment_method      TEXT NOT NULL,     -- mpesa | stripe
  amount              INTEGER NOT NULL,  -- KSh
  status              TEXT DEFAULT 'pending',
  -- pending | completed | failed | refunded
  -- M-Pesa fields
  mpesa_checkout_id   TEXT,   -- CheckoutRequestID from Daraja
  mpesa_receipt       TEXT,   -- M-Pesa receipt number after success
  mpesa_phone         TEXT,
  -- Stripe fields
  stripe_payment_id   TEXT,
  stripe_session_id   TEXT,
  -- Timestamps
  initiated_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

-- ── 7. RECEIPTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id           SERIAL PRIMARY KEY,
  booking_id   INTEGER REFERENCES bookings(id) UNIQUE,
  receipt_ref  TEXT NOT NULL UNIQUE,  -- e.g. RCP-2026-0001
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
  deposit_paid INTEGER,
  balance_due  INTEGER,
  payment_ref  TEXT,   -- M-Pesa receipt or Stripe ID
  issued_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. Auto-update updated_at on bookings ────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 9. Useful indexes ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_status     ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_event_date ON bookings(event_date);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_clients_email       ON clients(email);