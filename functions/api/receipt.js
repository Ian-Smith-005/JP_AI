// functions/api/receipt.js
// Fetches receipt data by bookingId or receiptRef
// Called from services.html after successful booking/payment

import { neon } from "@neondatabase/serverless";

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url    = new URL(request.url);
    const bookingId  = url.searchParams.get("bookingId");
    const receiptRef = url.searchParams.get("ref");

    if (!bookingId && !receiptRef) {
      return respond({ error: "Provide bookingId or ref" }, 400);
    }

    const sql = neon(env.DATABASE_URL);

    const [receipt] = bookingId
      ? await sql`SELECT * FROM receipts WHERE booking_id = ${bookingId}`
      : await sql`SELECT * FROM receipts WHERE receipt_ref = ${receiptRef}`;

    if (!receipt) return respond({ error: "Receipt not found" }, 404);

    return respond({ success: true, receipt });

  } catch (err) {
    console.error("Receipt error:", err.message);
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}