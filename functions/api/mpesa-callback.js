// functions/api/mpesa-callback.js
import { neon } from "@neondatabase/serverless";
import { sendReceiptEmails } from "./send-receipt.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch (_) { return new Response("OK", { status: 200 }); }

  const callback = body?.Body?.stkCallback;
  if (!callback) return new Response("OK", { status: 200 });

  const checkoutId = callback.CheckoutRequestID;
  const resultCode = callback.ResultCode;
  const SANDBOX    = !env.MPESA_SHORTCODE || env.MPESA_SHORTCODE.startsWith("#");
  const isSuccess  = resultCode === 0 || (SANDBOX && resultCode === 1032);

  const sql = neon(env.DATABASE_URL);

  if (isSuccess) {
    const items        = callback.CallbackMetadata?.Item || [];
    const get          = (n) => items.find(i => i.Name === n)?.Value;
    const mpesaReceipt = get("MpesaReceiptNumber") || `SANDBOX-${Date.now()}`;
    const paidAmount   = get("Amount") || 0;

    await sql`UPDATE payments SET status='completed', mpesa_receipt=${mpesaReceipt}, completed_at=NOW() WHERE mpesa_checkout_id=${checkoutId}`;

    const [pay] = await sql`SELECT booking_id FROM payments WHERE mpesa_checkout_id=${checkoutId}`;
    if (pay?.booking_id) {
      const bid = pay.booking_id;
      const [bk] = await sql`SELECT deposit_amount, total_price FROM bookings WHERE id=${bid}`;
      const dep  = bk?.deposit_amount || paidAmount || 0;

      await sql`UPDATE bookings SET status='confirmed', updated_at=NOW() WHERE id=${bid}`;
      await sql`UPDATE receipts SET deposit_paid=${dep}, balance_due=total_price-${dep}, payment_ref=${mpesaReceipt}, issued_at=NOW() WHERE booking_id=${bid}`;

      const [receipt] = await sql`SELECT * FROM receipts WHERE booking_id=${bid}`;
      if (receipt) sendReceiptEmails(env, receipt).catch(e => console.error("[callback] email err:", e.message));
    }
  } else {
    await sql`UPDATE payments SET status='failed' WHERE mpesa_checkout_id=${checkoutId}`;
  }

  return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Success" }), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
}