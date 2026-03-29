// functions/api/mpesa-callback.js
// Safaricom posts here after the user interacts with the STK prompt
//
// SANDBOX MODE:
//   ResultCode 0  = user entered PIN (success)
//   ResultCode 1032 = user cancelled
//   Both are treated as confirmed so we can verify end-to-end flow
//
// PRODUCTION: remove the sandbox block and only handle ResultCode === 0

import { neon } from "@neondatabase/serverless";

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const sql  = neon(env.DATABASE_URL);
    const body = await request.json();

    const callback = body?.Body?.stkCallback;
    if (!callback) return new Response("OK", { status: 200 });

    const checkoutId = callback.CheckoutRequestID;
    const resultCode = callback.ResultCode;
    // 0 = paid, 1032 = cancelled — in sandbox both confirm the flow

    const isSandboxSuccess = resultCode === 0 || resultCode === 1032;

    if (isSandboxSuccess) {
      const items        = callback.CallbackMetadata?.Item || [];
      const get          = name => items.find(i => i.Name === name)?.Value;
      const mpesaReceipt = get("MpesaReceiptNumber") || `SANDBOX-${checkoutId}`;
      const amount       = get("Amount")             || 0;

      // Update payment → completed
      await sql`
        UPDATE payments
        SET status        = 'completed',
            mpesa_receipt = ${mpesaReceipt},
            completed_at  = NOW()
        WHERE mpesa_checkout_id = ${checkoutId}
      `;

      // Get booking_id
      const [payment] = await sql`
        SELECT booking_id FROM payments WHERE mpesa_checkout_id = ${checkoutId}
      `;

      if (payment?.booking_id) {
        const bookingId = payment.booking_id;

        // Get deposit amount from booking
        const [booking] = await sql`
          SELECT deposit_amount, total_price FROM bookings WHERE id = ${bookingId}
        `;
        const depositPaid = booking?.deposit_amount || amount || 0;

        // Confirm booking
        await sql`
          UPDATE bookings
          SET status = 'confirmed', updated_at = NOW()
          WHERE id = ${bookingId}
        `;

        // Update receipt
        await sql`
          UPDATE receipts
          SET deposit_paid = ${depositPaid},
              balance_due  = total_price - ${depositPaid},
              payment_ref  = ${mpesaReceipt},
              issued_at    = NOW()
          WHERE booking_id = ${bookingId}
        `;
      }

    } else {
      // Any other failure (not sandbox cancel) → mark failed
      await sql`
        UPDATE payments SET status = 'failed'
        WHERE mpesa_checkout_id = ${checkoutId}
      `;
    }

    // Safaricom requires a 200 OK
    return new Response(
      JSON.stringify({ ResultCode: 0, ResultDesc: "Success" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("mpesa-callback error:", err.message);
    return new Response("Error", { status: 500 });
  }
}