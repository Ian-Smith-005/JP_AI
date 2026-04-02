// functions/api/mpesa-callback.js
// ============================================================
// Safaricom posts here after client acts on STK prompt.
// SANDBOX: both ResultCode 0 (paid) and 1032 (cancelled) are
//          treated as confirmed — so we can test the full flow.
// PRODUCTION: only ResultCode 0 is a real payment.
//
// NOTE: No cross-file imports — everything is self-contained
// because Cloudflare Pages Functions don't support relative
// ES module imports between function files at runtime.
// ============================================================

import { neon } from "@neondatabase/serverless";

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Parse Safaricom callback ──────────────────────────────
  let body;
  try { body = await request.json(); }
  catch (_) {
    console.error("[callback] Failed to parse body");
    return ok(); // always return 200 to Safaricom
  }

  console.log("[callback] Received:", JSON.stringify(body).slice(0, 500));

  const cb = body?.Body?.stkCallback;
  if (!cb) return ok();

  const checkoutId = cb.CheckoutRequestID;
  const resultCode = cb.ResultCode; // 0 = success, 1032 = cancelled

  // Sandbox: treat cancel as success too so we can test receipt flow
  const isSandbox = !env.MPESA_SHORTCODE ||
    env.MPESA_SHORTCODE.startsWith("#") ||
    env.MPESA_SHORTCODE === "174379";
  const isSuccess = resultCode === 0 || (isSandbox && resultCode === 1032);

  console.log(`[callback] checkoutId=${checkoutId} resultCode=${resultCode} isSuccess=${isSuccess} sandbox=${isSandbox}`);

  if (!env.DATABASE_URL) {
    console.error("[callback] DATABASE_URL not set");
    return ok();
  }

  const sql = neon(env.DATABASE_URL);

  if (isSuccess) {
    // ── Extract M-Pesa metadata ───────────────────────────
    const items   = cb.CallbackMetadata?.Item || [];
    const get     = (n) => items.find(i => i.Name === n)?.Value;
    // In sandbox with cancel (1032), metadata may be empty — use fallback
    const mpesaRef    = get("MpesaReceiptNumber") || `SANDBOX-${checkoutId.slice(-8)}`;
    const paidAmount  = get("Amount") || null;

    try {
      // Update payment → completed
      await sql`
        UPDATE payments
        SET status        = 'completed',
            mpesa_receipt = ${mpesaRef},
            completed_at  = NOW()
        WHERE mpesa_checkout_id = ${checkoutId}
      `;
      console.log("[callback] Payment updated:", mpesaRef);

      // Get booking_id from payment
      const [pay] = await sql`
        SELECT booking_id FROM payments WHERE mpesa_checkout_id = ${checkoutId}
      `;

      if (!pay?.booking_id) {
        console.error("[callback] No payment found for checkoutId:", checkoutId);
        return ok();
      }

      const bid = pay.booking_id;

      // Get booking details for deposit amount
      const [booking] = await sql`
        SELECT deposit_amount, total_price FROM bookings WHERE id = ${bid}
      `;
      const depositPaid = Number(paidAmount || booking?.deposit_amount || 0);

      // Confirm booking
      await sql`
        UPDATE bookings
        SET status = 'confirmed', updated_at = NOW()
        WHERE id = ${bid}
      `;

      // Update receipt — this is what the frontend polls for
      await sql`
        UPDATE receipts
        SET deposit_paid = ${depositPaid},
            balance_due  = total_price - ${depositPaid},
            payment_ref  = ${mpesaRef},
            issued_at    = NOW()
        WHERE booking_id = ${bid}
      `;
      console.log("[callback] Receipt updated for booking:", bid);

      // Fetch complete receipt for emails
      const [receipt] = await sql`SELECT * FROM receipts WHERE booking_id = ${bid}`;
      if (receipt) {
        // Send emails non-blocking — don't let email failure break the callback
        sendReceiptEmails(env, receipt).catch(e =>
          console.error("[callback] Email send failed (non-fatal):", e.message)
        );
      }

    } catch (dbErr) {
      console.error("[callback] DB error:", dbErr.message);
      // Still return 200 so Safaricom doesn't retry endlessly
    }

  } else {
    // ── Payment genuinely failed (not sandbox cancel) ─────
    try {
      await sql`
        UPDATE payments SET status = 'failed' WHERE mpesa_checkout_id = ${checkoutId}
      `;
      console.log("[callback] Payment marked failed, resultCode:", resultCode);
    } catch (e) {
      console.error("[callback] Failed to mark payment failed:", e.message);
    }
  }

  return ok(); // Safaricom requires 200 OK
}

// ── Always return 200 to Safaricom ────────────────────────────
function ok() {
  return new Response(
    JSON.stringify({ ResultCode: 0, ResultDesc: "Success" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// ── Self-contained receipt email sender ──────────────────────
// (Inlined here because Cloudflare Pages Functions don't support
//  relative imports between function files at runtime)
async function sendReceiptEmails(env, r) {
  if (!env.RESEND_API_KEY) return;

  const adminEmail  = env.ADMIN_EMAIL  || "joyaltyphotography254@gmail.com";
  const fromAddress = env.FROM_EMAIL   || "onboarding@resend.dev";
  const fmt = (n) => `KSh ${Number(n || 0).toLocaleString()}`;
  const esc = (s) => String(s || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const issued = r.issued_at
    ? new Date(r.issued_at).toLocaleDateString("en-KE", { dateStyle: "long" })
    : new Date().toLocaleDateString("en-KE", { dateStyle: "long" });

  const tableRows = `
    <table style="width:100%;border-collapse:collapse;font-size:.88rem;line-height:1.8">
      <tr style="background:#f3f4f6"><td colspan="2" style="padding:8px 14px;font-weight:700;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Client</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280;width:140px">Name</td><td>${esc(r.client_name)}</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280">Email</td><td>${esc(r.client_email)}</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280">Phone</td><td>${esc(r.client_phone)}</td></tr>
      <tr style="background:#f3f4f6"><td colspan="2" style="padding:8px 14px;font-weight:700;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Booking</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280">Service</td><td>${esc(r.service_name)}</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280">Package</td><td>${esc(r.package_name || "Standard")}</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280">Extras</td><td>${esc(r.extra_name || "None")}</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280">Date</td><td>${esc(r.event_date || "TBD")}</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280">Location</td><td>${esc(r.location || "TBD")}</td></tr>
      <tr style="background:#f3f4f6"><td colspan="2" style="padding:8px 14px;font-weight:700;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Payment</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280">Total</td><td style="font-weight:700">${fmt(r.total_price)}</td></tr>
      <tr><td style="padding:5px 14px;color:#16a34a">Deposit Paid</td><td style="font-weight:700;color:#16a34a">${fmt(r.deposit_paid)}</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280">Balance Due</td><td style="font-weight:700">${fmt(r.balance_due)}</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280">M-Pesa Ref</td><td style="font-family:monospace">${esc(r.payment_ref || "—")}</td></tr>
    </table>`;

  // Client email
  const clientHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0;text-align:center">
        <img src="https://joyaltyphotography.netlify.app/images/templatemo-logo.png" height="44" alt="Joyalty">
        <h2 style="color:#fff;margin:10px 0 4px">Booking Confirmed ✅</h2>
        <p style="color:rgba(255,255,255,.6);margin:0;font-size:.88rem">${esc(r.receipt_ref)} · ${issued}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:28px 32px;border-radius:0 0 8px 8px">
        <p style="font-size:.95rem;line-height:1.75;color:#374151;margin-bottom:20px">
          Hi ${esc((r.client_name || "").split(" ")[0])}, your booking with <strong>Joyalty Photography</strong>
          is confirmed. Here is your receipt — keep it for your records.
        </p>
        ${tableRows}
        <div style="margin-top:20px;padding:14px 18px;background:#fffbeb;border-radius:6px;border-left:3px solid #f59e0b;font-size:.88rem;color:#92400e">
          Balance of <strong>${fmt(r.balance_due)}</strong> is due on or before the event date.
        </div>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
        <p style="font-size:.8rem;color:#9ca3af;text-align:center">
          Joyalty Photography · Shanzu, Mombasa · joyaltyphotography254@gmail.com
        </p>
      </div>
    </div>`;

  // Admin email
  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">💰 New Payment: ${esc(r.receipt_ref)}</h2>
        <p style="color:rgba(255,255,255,.6);margin:6px 0 0;font-size:.85rem">${issued}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:28px 32px;border-radius:0 0 8px 8px">
        ${tableRows}
        <div style="margin-top:20px">
          <a href="mailto:${esc(r.client_email)}?subject=Re: Your Joyalty Booking ${esc(r.booking_ref || "")}"
             style="background:#1a1a2e;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:.88rem;font-weight:600">
            Email Client
          </a>
        </div>
      </div>
    </div>`;

  const sends = [];
  if (r.client_email) {
    sends.push(resend(env.RESEND_API_KEY, {
      from: `Joyalty Photography <${fromAddress}>`,
      to: [r.client_email],
      subject: `Your booking is confirmed — ${r.receipt_ref}`,
      html: clientHtml,
    }));
  }
  sends.push(resend(env.RESEND_API_KEY, {
    from: fromAddress,
    to: [adminEmail],
    subject: `💰 New payment received: ${r.receipt_ref} — ${r.client_name}`,
    html: adminHtml,
  }));

  await Promise.allSettled(sends);
  console.log("[callback] Emails dispatched");
}

async function resend(apiKey, { from, to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const d = await res.text();
    throw new Error(`Resend error: ${d.slice(0, 200)}`);
  }
}