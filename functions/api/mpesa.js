// functions/api/mpesa.js
// ============================================================
// JOYALTY PHOTOGRAPHY — M-Pesa STK Push
// SANDBOX:    fully working — uses Safaricom public test creds
// PRODUCTION: it will be uncommented the PRODUCTION SECTION below when ready
// ============================================================

import { neon } from "@neondatabase/serverless";

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── 1. Parse body safely ───────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch (_) { return json({ error: "Invalid JSON body" }, 400); }

  const { phone, amount, bookingId, bookingRef } = body;
  if (!phone || !amount) return json({ error: "phone and amount are required" }, 400);

  // ── 2. Format phone → 254XXXXXXXXX ────────────────────────
  const fmt = String(phone).trim().replace(/^\+/, "").replace(/^0/, "254");
  if (!/^2547\d{8}$|^2541\d{8}$/.test(fmt)) {
    return json({ error: `Invalid phone: ${fmt}. Use 07XXXXXXXX or +2547XXXXXXXX` }, 400);
  }

  // ── 3. Choose credentials ──────────────────────────────────
  const isSandbox = !validEnv(env.MPESA_SHORTCODE);

  // SANDBOX — Safaricom official public test credentials
  const SANDBOX = {
    baseUrl:        "https://sandbox.safaricom.co.ke",
    shortcode:      "174379",
    passkey:        "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
    consumerKey:    env.MPESA_CONSUMER_KEY,
    consumerSecret: env.MPESA_CONSUMER_SECRET,
  };

  // PRODUCTION — uncomment and swap creds = SANDBOX → creds = PRODUCTION when going live
  /*
  const PRODUCTION = {
    baseUrl:        "https://api.safaricom.co.ke",
    shortcode:      env.MPESA_SHORTCODE,
    passkey:        env.MPESA_PASSKEY,
    consumerKey:    env.MPESA_CONSUMER_KEY,
    consumerSecret: env.MPESA_CONSUMER_SECRET,
  };
  */

  const creds = SANDBOX; // → swap to PRODUCTION when live

  if (!creds.consumerKey || !creds.consumerSecret) {
    return json({ error: "MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set in Cloudflare env vars" }, 500);
  }

  // ── 4. Get OAuth token ─────────────────────────────────────
  let accessToken;
  try {
    const b64  = btoa(`${creds.consumerKey}:${creds.consumerSecret}`);
    const tres = await fetch(
      `${creds.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${b64}` } }
    );
    const raw = await tres.text();
    const td  = safeJSON(raw);
    if (!td?.access_token) {
      return json({ error: "M-Pesa OAuth failed — check consumer key/secret", detail: td || raw.slice(0, 300) }, 502);
    }
    accessToken = td.access_token;
    console.log("[mpesa] OAuth OK");
  } catch (err) {
    return json({ error: `OAuth threw: ${err.message}` }, 502);
  }

  // ── 5. Build STK payload ───────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
  const password  = btoa(`${creds.shortcode}${creds.passkey}${timestamp}`);
  const callbackUrl = "https://joyaltyphotography.pages.dev/api/mpesa-callback";

  const stkPayload = {
    BusinessShortCode: creds.shortcode,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   "CustomerPayBillOnline",
    Amount:            Math.round(Number(amount)),
    PartyA:            fmt,
    PartyB:            creds.shortcode,
    PhoneNumber:       fmt,
    CallBackURL:       callbackUrl,
    AccountReference:  (bookingRef || "JOYALTY").slice(0, 12),
    TransactionDesc:   `Joyalty ${bookingRef || "deposit"}`.slice(0, 13),
  };

  // ── 6. Send STK push ───────────────────────────────────────
  let stkData;
  try {
    const sres = await fetch(`${creds.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify(stkPayload),
    });
    const raw = await sres.text();
    stkData   = safeJSON(raw);
    console.log("[mpesa] Daraja response:", raw.slice(0, 500));

    if (!stkData) return json({ error: "Daraja returned non-JSON", detail: raw.slice(0, 400) }, 502);
    if (stkData.ResponseCode !== "0") {
      return json({
        error:     `STK rejected: ${stkData.ResponseDescription || stkData.errorMessage || "Unknown"}`,
        errorCode: stkData.errorCode,
        detail:    stkData,
      }, 502);
    }
  } catch (err) {
    return json({ error: `STK request threw: ${err.message}` }, 502);
  }

  // ── 7. Save pending payment in DB ─────────────────────────
  if (bookingId && env.DATABASE_URL) {
    try {
      const sql = neon(env.DATABASE_URL);
      await sql`
        INSERT INTO payments (booking_id, payment_method, amount, status, mpesa_checkout_id, mpesa_phone)
        VALUES (${bookingId}, 'mpesa', ${Math.round(Number(amount))}, 'pending',
                ${stkData.CheckoutRequestID}, ${fmt})
      `;
    } catch (dbErr) {
      console.error("[mpesa] DB insert failed (non-fatal):", dbErr.message);
    }
  }

  return json({
    success:           true,
    sandbox:           isSandbox,
    checkoutRequestId: stkData.CheckoutRequestID,
    merchantRequestId: stkData.MerchantRequestID,
    message:           "STK push sent — check your phone",
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

function safeJSON(t) { try { return JSON.parse(t); } catch (_) { return null; } }
function validEnv(v) { return v && !v.startsWith("#") && v.trim() !== ""; }
function json(data, status = 200) {
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