// functions/api/bookings.js
// Creates client, booking, and receipt skeleton in DB
// DB is only written when the Pay button is tapped (not on form navigation)

import { neon } from "@neondatabase/serverless";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DATABASE_URL) return respond({ error: "DATABASE_URL not configured" }, 500);

  let body;
  try { body = await request.json(); }
  catch (_) { return respond({ error: "Invalid JSON body" }, 400); }

  const {
    clientName, clientEmail, clientPhone,
    serviceType, servicePackage, extraServices,
    eventDate, eventTime, eventLocation,
    guestCount, eventDescription, mpesaPhone,
  } = body;

  if (!clientName || !clientEmail || !clientPhone || !serviceType) {
    return respond({ error: "Missing required fields: clientName, clientEmail, clientPhone, serviceType" }, 400);
  }

  const sql = neon(env.DATABASE_URL);

  // ── Look up service ────────────────────────────────────────
  const [service] = await sql`SELECT * FROM services WHERE name = ${serviceType} LIMIT 1`;
  if (!service) return respond({ error: `Unknown service: ${serviceType}` }, 400);

  const pkgName = servicePackage || "Standard";
  const [pkg]   = await sql`SELECT * FROM packages WHERE name = ${pkgName} LIMIT 1`;
  const modifier = parseFloat(pkg?.price_modifier || 1.0);

  const extraName = extraServices || "None";
  const [extra]   = await sql`SELECT * FROM extra_services WHERE name = ${extraName} LIMIT 1`;

  // ── Calculate pricing ──────────────────────────────────────
  const basePrice    = service.base_price;
  const packagePrice = Math.round(basePrice * modifier);
  const extraPrice   = extra?.price || 0;
  const totalPrice   = packagePrice + extraPrice;
  const depositAmount = Math.round(totalPrice * 0.30);

  // ── Upsert client ──────────────────────────────────────────
  const [client] = await sql`
    INSERT INTO clients (name, email, phone)
    VALUES (${clientName}, ${clientEmail}, ${clientPhone})
    ON CONFLICT (email)
    DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone
    RETURNING id
  `;

  // ── Generate booking reference ─────────────────────────────
  // FIX: use MAX(id) not COUNT(*) — COUNT gives wrong number if rows were deleted
  const [maxRow] = await sql`SELECT COALESCE(MAX(id), 0) AS max_id FROM bookings`;
  const nextNum  = Number(maxRow.max_id) + 1;
  const year     = new Date().getFullYear();
  const bookingRef = `JOY-${year}-${String(nextNum).padStart(4, "0")}`;
  // e.g. JOY-2026-0002 for the second booking

  // ── Create booking ─────────────────────────────────────────
  const [booking] = await sql`
    INSERT INTO bookings (
      booking_ref, client_id, service_id, package_id, extra_service_id,
      event_date, event_time, event_location, guest_count, event_description,
      base_price, package_price, extra_price, total_price, deposit_amount,
      status, payment_method
    ) VALUES (
      ${bookingRef}, ${client.id}, ${service.id},
      ${pkg?.id || null}, ${extra?.id || null},
      ${eventDate || null}, ${eventTime || null},
      ${eventLocation || null}, ${guestCount ? Number(guestCount) : null},
      ${eventDescription || null},
      ${basePrice}, ${packagePrice}, ${extraPrice}, ${totalPrice}, ${depositAmount},
      'pending', ${mpesaPhone ? 'mpesa' : 'pending'}
    )
    RETURNING id
  `;

  // ── Generate receipt reference ─────────────────────────────
  const [maxRcp] = await sql`SELECT COALESCE(MAX(id), 0) AS max_id FROM receipts`;
  const rcpNum   = Number(maxRcp.max_id) + 1;
  const receiptRef = `RCP-${year}-${String(rcpNum).padStart(4, "0")}`;

  // ── Create receipt skeleton (deposit_paid = 0 until payment) ─
  await sql`
    INSERT INTO receipts (
      booking_id, receipt_ref,
      client_name, client_email, client_phone,
      service_name, package_name, extra_name,
      event_date, event_time, location,
      base_price, extra_price, total_price,
      deposit_paid, balance_due, payment_ref
    ) VALUES (
      ${booking.id}, ${receiptRef},
      ${clientName}, ${clientEmail}, ${clientPhone},
      ${service.name}, ${pkgName}, ${extraName},
      ${eventDate || null}, ${eventTime || null}, ${eventLocation || null},
      ${basePrice}, ${extraPrice}, ${totalPrice},
      0, ${totalPrice}, null
    )
  `;

  return respond({
    success:        true,
    bookingRef,
    receiptRef,
    bookingId:      booking.id,
    clientName,
    service:        service.name,
    package:        pkgName,
    extra:          extraName,
    totalPrice,
    depositAmount,
    balanceDue:     totalPrice,
    paymentRequired: true,
    mpesaPhone:     mpesaPhone || clientPhone,
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}