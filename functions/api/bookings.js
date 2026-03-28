// functions/api/bookings.js
// Handles booking submission from services.html form
// Saves client + booking + receipt to Neon PostgreSQL

import { neon } from "@neondatabase/serverless";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DATABASE_URL) {
    return respond({ error: "DATABASE_URL not configured" }, 500);
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const body = await request.json();

    const {
      clientName,
      clientEmail,
      clientPhone,
      serviceType,
      servicePackage,
      extraServices,
      eventDate,
      eventTime,
      eventLocation,
      guestCount,
      eventDescription,
      mpesaPhone,
    } = body;

    // ── Validate required fields ───────────────────────────
    if (!clientName || !clientEmail || !clientPhone || !serviceType) {
      return respond({ error: "Missing required fields" }, 400);
    }

    // ── Look up service ────────────────────────────────────
    const [service] = await sql`
      SELECT * FROM services WHERE name = ${serviceType} LIMIT 1
    `;
    if (!service) return respond({ error: "Invalid service type" }, 400);

    // ── Look up package ────────────────────────────────────
    const packageName = servicePackage || "Standard";
    const [pkg] = await sql`
      SELECT * FROM packages WHERE name = ${packageName} LIMIT 1
    `;
    const modifier = parseFloat(pkg?.price_modifier || 1.0);

    // ── Look up extra service ──────────────────────────────
    const extraName = extraServices || "None";
    const [extra] = await sql`
      SELECT * FROM extra_services WHERE name = ${extraName} LIMIT 1
    `;

    // ── Calculate pricing ──────────────────────────────────
    const basePrice    = service.base_price;
    const packagePrice = Math.round(basePrice * modifier);
    const extraPrice   = extra?.price || 0;
    const totalPrice   = packagePrice + extraPrice;
    const depositAmount = Math.round(totalPrice * 0.30); // 30% deposit

    // ── Upsert client (match by email) ─────────────────────
    const [client] = await sql`
      INSERT INTO clients (name, email, phone)
      VALUES (${clientName}, ${clientEmail}, ${clientPhone})
      ON CONFLICT (email) 
      DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone
      RETURNING id
    `;

    // ── Generate booking reference ─────────────────────────
    const year = new Date().getFullYear();
    const [countRow] = await sql`SELECT COUNT(*) FROM bookings`;
    const count = parseInt(countRow.count) + 1;
    const bookingRef = `JOY-${year}-${String(count).padStart(4, "0")}`;

    // ── Create booking ─────────────────────────────────────
    const [booking] = await sql`
      INSERT INTO bookings (
        booking_ref, client_id, service_id, package_id, extra_service_id,
        event_date, event_time, event_location, guest_count, event_description,
        base_price, package_price, extra_price, total_price, deposit_amount,
        status, payment_method
      ) VALUES (
        ${bookingRef},
        ${client.id},
        ${service.id},
        ${pkg?.id || null},
        ${extra?.id || null},
        ${eventDate || null},
        ${eventTime || null},
        ${eventLocation || null},
        ${guestCount || null},
        ${eventDescription || null},
        ${basePrice},
        ${packagePrice},
        ${extraPrice},
        ${totalPrice},
        ${depositAmount},
        'pending',
        ${mpesaPhone ? 'mpesa' : 'pending'}
      )
      RETURNING id
    `;

    // ── Generate receipt reference ─────────────────────────
    const [rcpCount] = await sql`SELECT COUNT(*) FROM receipts`;
    const rcpNum = parseInt(rcpCount.count) + 1;
    const receiptRef = `RCP-${year}-${String(rcpNum).padStart(4, "0")}`;

    // ── Store receipt ──────────────────────────────────────
    await sql`
      INSERT INTO receipts (
        booking_id, receipt_ref,
        client_name, client_email, client_phone,
        service_name, package_name, extra_name,
        event_date, event_time, location,
        base_price, extra_price, total_price,
        deposit_paid, balance_due,
        payment_ref
      ) VALUES (
        ${booking.id}, ${receiptRef},
        ${clientName}, ${clientEmail}, ${clientPhone},
        ${service.name}, ${packageName}, ${extraName},
        ${eventDate || null}, ${eventTime || null}, ${eventLocation || null},
        ${basePrice}, ${extraPrice}, ${totalPrice},
        0,
        ${totalPrice},
        null
      )
    `;

    // ── Respond with booking + payment info ────────────────
    return respond({
      success: true,
      bookingRef,
      receiptRef,
      clientName,
      service: service.name,
      package: packageName,
      extra: extraName,
      totalPrice,
      depositAmount,
      balanceDue: totalPrice,
      paymentRequired: true,
      mpesaPhone: mpesaPhone || clientPhone,
      bookingId: booking.id,
    });

  } catch (err) {
    console.error("Booking error:", err.message);
    return respond({ error: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}