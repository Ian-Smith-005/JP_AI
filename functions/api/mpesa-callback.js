// functions/api/mpesa-callback.js
// Safaricom posts payment result here after client pays on phone
// Updates payment status, booking status, and receipt in DB

import { neon } from "@neondatabase/serverless";

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const sql = neon(env.DATABASE_URL);
    const body = await request.json();

    const callback = body?.Body?.stkCallback;
    if (!callback) return new Response("OK", { status: 200 });

    const checkoutId  = callback.CheckoutRequestID;
    const resultCode  = callback.ResultCode;   // 0 = success
    const resultDesc  = callback.ResultDesc;

    if (resultCode === 0) {
      // ── Payment successful ─────────────────────────────
      const items = callback.CallbackMetadata?.Item || [];
      const get = (name) => items.find(i => i.Name === name)?.Value;

      const mpesaReceipt = get("MpesaReceiptNumber");
      const amount       = get("Amount");
      const phone        = get("PhoneNumber");

      // Update payment record
      await sql`
        UPDATE payments
        SET
          status       = 'completed',
          mpesa_receipt = ${mpesaReceipt},
          completed_at  = NOW()
        WHERE mpesa_checkout_id = ${checkoutId}
      `;

      // Get booking_id from the payment
      const [payment] = await sql`
        SELECT booking_id FROM payments WHERE mpesa_checkout_id = ${checkoutId}
      `;

      if (payment?.booking_id) {
        const bookingId = payment.booking_id;

        // Update booking status to confirmed
        await sql`
          UPDATE bookings
          SET status = 'confirmed', updated_at = NOW()
          WHERE id = ${bookingId}
        `;

        // Update receipt with deposit paid and payment ref
        await sql`
          UPDATE receipts
          SET
            deposit_paid = ${amount},
            balance_due  = total_price - ${amount},
            payment_ref  = ${mpesaReceipt},
            issued_at    = NOW()
          WHERE booking_id = ${bookingId}
        `;
      }

    } else {
      // ── Payment failed or cancelled ────────────────────
      await sql`
        UPDATE payments
        SET status = 'failed'
        WHERE mpesa_checkout_id = ${checkoutId}
      `;
    }

    // Safaricom expects a 200 OK response
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Success" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Callback error:", err.message);
    return new Response("Error", { status: 500 });
  }
}