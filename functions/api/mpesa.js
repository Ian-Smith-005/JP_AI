// functions/api/mpesa.js
// Triggers M-Pesa STK Push via Safaricom Daraja API

import { neon } from "@neondatabase/serverless";

export async function onRequestPost(context) {
  const { request, env } = context;

  const required = [
    "MPESA_CONSUMER_KEY",
    "MPESA_CONSUMER_SECRET",
    "MPESA_SHORTCODE",
    "MPESA_PASSKEY",
    "DATABASE_URL",
  ];
  for (const key of required) {
    if (!env[key]) return respond({ error: `${key} not configured` }, 500);
  }

  try {
    const { phone, amount, bookingId, bookingRef } = await request.json();

    if (!phone || !amount) {
      return respond({ error: "phone and amount are required" }, 400);
    }

    // ── Format phone: 0712345678 → 254712345678 ───────────
    const formattedPhone = phone
      .replace(/^\+/, "")   // remove leading +
      .replace(/^0/, "254"); // replace leading 0 with 254

    // ── Get Daraja OAuth token ─────────────────────────────
    const credentials = btoa(
      `${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`
    );

    // Use sandbox for testing, swap to api.safaricom.co.ke for production
    const baseUrl = "https://sandbox.safaricom.co.ke";

    const tokenRes = await fetch(
      `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${credentials}` } }
    );
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return respond({ error: "M-Pesa auth failed", detail: tokenData }, 502);
    }

    // ── Build STK push ─────────────────────────────────────
    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, "")
      .slice(0, 14); // YYYYMMDDHHmmss

    const password = btoa(
      `${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${timestamp}`
    );

    const stkPayload = {
      BusinessShortCode: env.MPESA_SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   "CustomerPayBillOnline",
      Amount:            amount,
      PartyA:            formattedPhone,
      PartyB:            env.MPESA_SHORTCODE,
      PhoneNumber:       formattedPhone,
      CallBackURL:       "https://joyaltyphotography.pages.dev/api/mpesa-callback",
      AccountReference:  bookingRef || "JOYALTY",
      TransactionDesc:   `Joyalty deposit - ${bookingRef || "booking"}`,
    };

    const stkRes = await fetch(
      `${baseUrl}/mpesa/stkpush/v1/processrequest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(stkPayload),
      }
    );

    const stkData = await stkRes.json();

    if (stkData.ResponseCode !== "0") {
      return respond({ error: "STK push failed", detail: stkData }, 502);
    }

    // ── Save pending payment record to DB ──────────────────
    if (bookingId) {
      const sql = neon(env.DATABASE_URL);
      await sql`
        INSERT INTO payments (
          booking_id, payment_method, amount, status,
          mpesa_checkout_id, mpesa_phone
        ) VALUES (
          ${bookingId}, 'mpesa', ${amount}, 'pending',
          ${stkData.CheckoutRequestID}, ${formattedPhone}
        )
      `;
    }

    return respond({
      success: true,
      checkoutRequestId: stkData.CheckoutRequestID,
      message: "STK push sent — please check your phone",
    });

  } catch (err) {
    console.error("M-Pesa error:", err.message);
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