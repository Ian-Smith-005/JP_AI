// functions/api/admin/bookings.js
// GET    /api/admin/bookings        — list all bookings with client info
// PUT    /api/admin/bookings/:id    — update booking status/details
// DELETE /api/admin/bookings/:id    — hard delete booking + receipt + payment

import { neon } from "@neondatabase/serverless";

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DATABASE_URL) return json({ error: "DATABASE_URL not set" }, 500);

  try {
    const sql = neon(env.DATABASE_URL);
    const bookings = await sql`
      SELECT
        b.id, b.booking_ref, b.status, b.event_date, b.event_time,
        b.event_location, b.event_description, b.total_price,
        b.deposit_amount, b.base_price, b.package_price, b.extra_price,
        b.payment_method, b.created_at,
        c.name  AS client_name,
        c.email AS client_email,
        c.phone AS client_phone,
        s.name  AS service_name,
        p.name  AS package_name,
        e.name  AS extra_name,
        r.receipt_ref, r.deposit_paid, r.balance_due, r.payment_ref
      FROM bookings b
      LEFT JOIN clients      c ON c.id = b.client_id
      LEFT JOIN services     s ON s.id = b.service_id
      LEFT JOIN packages     p ON p.id = b.package_id
      LEFT JOIN extra_services e ON e.id = b.extra_service_id
      LEFT JOIN receipts     r ON r.booking_id = b.id
      ORDER BY b.created_at DESC
    `;
    return json({ bookings });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const id = params?.id || new URL(request.url).pathname.split('/').pop();
  if (!id) return json({ error: "Booking ID required" }, 400);
  if (!env.DATABASE_URL) return json({ error: "DATABASE_URL not set" }, 500);

  let body;
  try { body = await request.json(); }
  catch (_) { return json({ error: "Invalid JSON" }, 400); }

  try {
    const sql = neon(env.DATABASE_URL);
    await sql`
      UPDATE bookings
      SET
        status            = COALESCE(${body.status || null}, status),
        event_date        = COALESCE(${body.eventDate || null}, event_date),
        event_location    = COALESCE(${body.eventLocation || null}, event_location),
        event_description = COALESCE(${body.eventDescription || null}, event_description),
        updated_at        = NOW()
      WHERE id = ${id}
    `;
    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const id = params?.id || new URL(request.url).pathname.split('/').pop();
  if (!id) return json({ error: "Booking ID required" }, 400);
  if (!env.DATABASE_URL) return json({ error: "DATABASE_URL not set" }, 500);

  try {
    const sql = neon(env.DATABASE_URL);
    // Delete in dependency order
    await sql`DELETE FROM receipts WHERE booking_id = ${id}`;
    await sql`DELETE FROM payments WHERE booking_id = ${id}`;
    await sql`DELETE FROM bookings WHERE id = ${id}`;
    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors() });
}
function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}