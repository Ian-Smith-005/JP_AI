// functions/api/mpesa.js
// M-Pesa STK Push via Safaricom Daraja API
// Sandbox-safe: returns a mock success if MPESA_SHORTCODE is not yet set

import { neon } from "@neondatabase/serverless";

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { phone, amount, bookingId, bookingRef } = await request.json();

    if (!phone || !amount) {
      return respond({ error: "phone and amount are required" }, 400);
    }

    // ── Format phone: 0712345678 → 254712345678 ───────────
    const formattedPhone = phone.replace(/^\+/, "").replace(/^0/, "254");

    // ── Sandbox fallback when shortcode not yet configured ─
    // Remove this block once you have real Daraja credentials
    if (!env.MPESA_SHORTCODE || env.MPESA_SHORTCODE.startsWith("#")) {
      console.log("[M-Pesa SANDBOX MOCK] STK push skipped — shortcode not configured.");

      // Save a mock pending payment to DB so polling can detect it
      if (bookingId && env.DATABASE_URL) {
        const sql = neon(env.DATABASE_URL);
        const mockCheckoutId = `MOCK-${Date.now()}`;
        await sql`
          INSERT INTO payments (booking_id, payment_method, amount, status, mpesa_checkout_id, mpesa_phone)
          VALUES (${bookingId}, 'mpesa', ${amount}, 'pending', ${mockCheckoutId}, ${formattedPhone})
          ON CONFLICT DO NOTHING
        `;
      }

      return respond({
        success: true,
        sandbox: true,
        checkoutRequestId: `MOCK-${Date.now()}`,
        message: "Sandbox mode — no real STK push sent. Add MPESA_SHORTCODE to enable real payments.",
      });
    }

    // ── Real Daraja flow ───────────────────────────────────
    const baseUrl     = "https://sandbox.safaricom.co.ke";
    // When going live swap to: "https://api.safaricom.co.ke"

    const credentials = btoa(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`);
    const tokenRes    = await fetch(
      `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${credentials}` } }
    );
    const tokenData   = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return respond({ error: "M-Pesa auth failed", detail: tokenData }, 502);
    }

    const timestamp = new Date()
      .toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);

    const password = btoa(`${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${timestamp}`);

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

    const stkRes  = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(stkPayload),
    });
    const stkData = await stkRes.json();

    if (stkData.ResponseCode !== "0") {
      return respond({ error: "STK push failed", detail: stkData }, 502);
    }

    // Save pending payment record
    if (bookingId && env.DATABASE_URL) {
      const sql = neon(env.DATABASE_URL);
      await sql`
        INSERT INTO payments (booking_id, payment_method, amount, status, mpesa_checkout_id, mpesa_phone)
        VALUES (${bookingId}, 'mpesa', ${amount}, 'pending', ${stkData.CheckoutRequestID}, ${formattedPhone})
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