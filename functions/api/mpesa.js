// functions/api/mpesa.js
// Sends a REAL M-Pesa STK push via Safaricom Daraja SANDBOX
// Sandbox behaviour: any user action (pin OR cancel) triggers the callback
// Both are treated as success here so we can verify the API is wired correctly

import { neon } from "@neondatabase/serverless";

export async function onRequestPost(context) {
  const { request, env } = context;

  // Guard: need at minimum consumer key + secret + DATABASE_URL
  const required = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "DATABASE_URL"];
  for (const key of required) {
    if (!env[key]) return respond({ error: `${key} not configured in environment` }, 500);
  }

  try {
    const { phone, amount, bookingId, bookingRef } = await request.json();
    if (!phone || !amount) return respond({ error: "phone and amount are required" }, 400);

    // Format phone → 254XXXXXXXXX
    const formattedPhone = phone.replace(/^\+/, "").replace(/^0/, "254");

    // ── Step 1: Get OAuth token ────────────────────────────
    const credentials = btoa(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`);

    const tokenRes = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${credentials}` } }
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return respond({
        error: "M-Pesa OAuth failed — check MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET",
        detail: tokenData,
      }, 502);
    }

    // ── Step 2: Use sandbox test shortcode if not configured ─
    // Safaricom sandbox shortcode: 174379  passkey: bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
    const shortcode = (env.MPESA_SHORTCODE && !env.MPESA_SHORTCODE.startsWith("#"))
      ? env.MPESA_SHORTCODE
      : "174379";   // ← Safaricom's official sandbox shortcode

    const passkey = (env.MPESA_PASSKEY && !env.MPESA_PASSKEY.startsWith("#"))
      ? env.MPESA_PASSKEY
      : "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
      // ↑ Safaricom's official sandbox passkey

    // ── Step 3: Build STK push ─────────────────────────────
    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, "")
      .slice(0, 14); // YYYYMMDDHHmmss

    const password = btoa(`${shortcode}${passkey}${timestamp}`);

    const stkPayload = {
      BusinessShortCode: shortcode,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   "CustomerPayBillOnline",
      Amount:            amount,
      PartyA:            formattedPhone,
      PartyB:            shortcode,
      PhoneNumber:       formattedPhone,
      CallBackURL:       "https://joyaltyphotography.pages.dev/api/mpesa-callback",
      AccountReference:  bookingRef || "JOYALTY",
      TransactionDesc:   `Joyalty deposit - ${bookingRef || "booking"}`,
    };

    // ── Step 4: Send STK push ──────────────────────────────
    const stkRes = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(stkPayload),
      }
    );
    const stkData = await stkRes.json();

    if (stkData.ResponseCode !== "0") {
      return respond({ error: "STK push rejected by Daraja", detail: stkData }, 502);
    }

    // ── Step 5: Save pending payment in DB ────────────────
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
      success:           true,
      checkoutRequestId: stkData.CheckoutRequestID,
      message:           "STK push sent — check your phone",
      sandbox:           true,
    });

  } catch (err) {
    console.error("mpesa.js error:", err.message);
    return respond({ error: err.message }, 500);
  }
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