// functions/api/mpesa-callback.js
// ============================================================
// Safaricom posts here after the user acts on the STK prompt.
//
// SANDBOX RULE: ANY callback = booking confirmed.
//   ResultCode 0    = paid  ✓
//   ResultCode 1032 = user cancelled — treated as SUCCESS in sandbox
//
// PRODUCTION: change line marked [PROD] to only confirm code 0.
//
// Self-contained — NO relative imports (Cloudflare limitation).
// Sends receipt email to client + admin via Resend.
// ============================================================

import { neon } from "@neondatabase/serverless";

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch (_) { console.error("[cb] body parse failed"); return _ok(); }

  console.log("[cb]", JSON.stringify(body).slice(0, 500));

  const cb = body?.Body?.stkCallback;
  if (!cb) return _ok();

  const checkoutId = cb.CheckoutRequestID;
  const resultCode = cb.ResultCode;

  // ── SANDBOX: confirm on ANY code ──────────────────────────
  // [PROD] change to: const confirmed = (resultCode === 0);
  const isSandbox = !env.MPESA_SHORTCODE ||
    env.MPESA_SHORTCODE.startsWith("#") ||
    env.MPESA_SHORTCODE === "174379";
  const confirmed = isSandbox ? true : (resultCode === 0);
  // ── end sandbox logic ─────────────────────────────────────

  console.log(`[cb] checkout=${checkoutId} code=${resultCode} sandbox=${isSandbox} confirmed=${confirmed}`);

  if (!env.DATABASE_URL) { console.error("[cb] DATABASE_URL missing"); return _ok(); }

  const sql = neon(env.DATABASE_URL);

  if (confirmed) {
    const items    = cb.CallbackMetadata?.Item || [];
    const get      = n => items.find(i => i.Name === n)?.Value;
    // In sandbox cancel, metadata is empty — use synthetic ref
    const mpesaRef  = get("MpesaReceiptNumber") || `SBX-${checkoutId.slice(-8).toUpperCase()}`;
    const paidAmt   = get("Amount") || null;

    try {
      // 1. Update payment
      await sql`
        UPDATE payments
        SET status = 'completed', mpesa_receipt = ${mpesaRef}, completed_at = NOW()
        WHERE mpesa_checkout_id = ${checkoutId}
      `;

      // 2. Get booking_id
      const [pay] = await sql`
        SELECT booking_id FROM payments WHERE mpesa_checkout_id = ${checkoutId}
      `;
      if (!pay?.booking_id) {
        console.error("[cb] no payment row for", checkoutId); return _ok();
      }
      const bid = pay.booking_id;

      // 3. Get deposit amount from booking
      const [bk] = await sql`SELECT deposit_amount, total_price FROM bookings WHERE id = ${bid}`;
      const depositPaid = Number(paidAmt || bk?.deposit_amount || 0);

      // 4. Confirm booking
      await sql`UPDATE bookings SET status = 'confirmed', updated_at = NOW() WHERE id = ${bid}`;

      // 5. Update receipt — frontend polls for deposit_paid > 0
      await sql`
        UPDATE receipts
        SET deposit_paid = ${depositPaid},
            balance_due  = total_price - ${depositPaid},
            payment_ref  = ${mpesaRef},
            issued_at    = NOW()
        WHERE booking_id = ${bid}
      `;
      console.log(`[cb] booking ${bid} confirmed — ref ${mpesaRef} deposit ${depositPaid}`);

      // 6. Email receipts (non-blocking)
      const [receipt] = await sql`SELECT * FROM receipts WHERE booking_id = ${bid}`;
      if (receipt && env.RESEND_API_KEY) {
        _emails(env, receipt).catch(e => console.error("[cb] email fail:", e.message));
      }

    } catch (dbErr) {
      console.error("[cb] DB error:", dbErr.message);
      // Return 200 regardless — Safaricom must not retry
    }

  } else {
    // Production genuine failure (not reached in sandbox)
    try {
      await sql`UPDATE payments SET status = 'failed' WHERE mpesa_checkout_id = ${checkoutId}`;
    } catch (e) { console.error("[cb] failed update:", e.message); }
  }

  return _ok();
}

function _ok() {
  return new Response(
    JSON.stringify({ ResultCode: 0, ResultDesc: "Success" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// ── Self-contained email sender ────────────────────────────────
async function _emails(env, r) {
  const admin = env.ADMIN_EMAIL || "joyaltyphotography254@gmail.com";
  const from  = env.FROM_EMAIL  || "onboarding@resend.dev";
  const fmt   = n  => `KSh ${Number(n || 0).toLocaleString()}`;
  const esc   = s  => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const iss   = r.issued_at
    ? new Date(r.issued_at).toLocaleDateString("en-KE", { dateStyle: "long" })
    : new Date().toLocaleDateString("en-KE", { dateStyle: "long" });

  const tbl = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;line-height:1.85">
      <tr style="background:#f3f4f6"><td colspan="2" style="padding:7px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.08em">Client</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280;width:130px">Name</td>  <td>${esc(r.client_name)}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280">Email</td> <td>${esc(r.client_email)}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280">Phone</td> <td>${esc(r.client_phone)}</td></tr>
      <tr style="background:#f3f4f6"><td colspan="2" style="padding:7px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.08em">Booking</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280">Service</td>  <td>${esc(r.service_name)}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280">Package</td>  <td>${esc(r.package_name || "Standard")}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280">Extras</td>   <td>${esc(r.extra_name   || "None")}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280">Date</td>     <td>${esc(r.event_date   || "TBD")}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280">Location</td> <td>${esc(r.location     || "TBD")}</td></tr>
      <tr style="background:#f3f4f6"><td colspan="2" style="padding:7px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.08em">Payment</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280">Total</td>        <td><strong>${fmt(r.total_price)}</strong></td></tr>
      <tr><td style="padding:5px 12px;color:#16a34a">Deposit Paid</td> <td><strong style="color:#16a34a">${fmt(r.deposit_paid)}</strong></td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280">Balance Due</td>  <td><strong>${fmt(r.balance_due)}</strong></td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280">M-Pesa Ref</td>   <td style="font-family:monospace">${esc(r.payment_ref || "—")}</td></tr>
    </table>`;

  const clientHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1a1a2e;padding:22px 30px;border-radius:8px 8px 0 0;text-align:center">
        <img src="https://joyaltyphotography.netlify.app/images/templatemo-logo.png" height="42" alt="Joyalty">
        <h2 style="color:#fff;margin:10px 0 4px">Booking Confirmed ✅</h2>
        <p style="color:rgba(255,255,255,.6);margin:0;font-size:.85rem">${esc(r.receipt_ref)} · ${iss}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px 30px;border-radius:0 0 8px 8px">
        <p style="font-size:.92rem;line-height:1.7;color:#374151;margin-bottom:16px">
          Hi ${esc((r.client_name || "").split(" ")[0])}, your booking with <strong>Joyalty Photography</strong> is confirmed.
        </p>
        ${tbl}
        <div style="margin:16px 0;padding:12px 16px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px;font-size:.85rem;color:#92400e">
          Balance of <strong>${fmt(r.balance_due)}</strong> is due on or before the event date.
        </div>
        <p style="font-size:.75rem;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;padding-top:12px;margin:0">
          Joyalty Photography · Shanzu, Mombasa · joyaltyphotography254@gmail.com
        </p>
      </div>
    </div>`;

  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1a1a2e;padding:22px 30px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">💰 New Payment — ${esc(r.receipt_ref)}</h2>
        <p style="color:rgba(255,255,255,.6);margin:5px 0 0;font-size:.82rem">${iss}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px 30px;border-radius:0 0 8px 8px">
        ${tbl}
        <div style="margin-top:16px">
          <a href="mailto:${esc(r.client_email || "")}?subject=Re: Your Joyalty Booking ${esc(r.receipt_ref || "")}"
             style="background:#1a1a2e;color:#fff;padding:10px 20px;border-radius:50px;text-decoration:none;font-size:.85rem;font-weight:700">
            Email Client
          </a>
        </div>
      </div>
    </div>`;

  const sends = [];
  if (r.client_email) {
    sends.push(_resend(env.RESEND_API_KEY, {
      from: `Joyalty Photography <${from}>`,
      to:   [r.client_email],
      subject: `Your booking is confirmed — ${r.receipt_ref}`,
      html: clientHtml,
    }));
  }
  sends.push(_resend(env.RESEND_API_KEY, {
    from,
    to:      [admin],
    subject: `💰 New payment: ${r.receipt_ref} — ${r.client_name}`,
    html: adminHtml,
  }));

  await Promise.allSettled(sends);
  console.log("[cb] emails dispatched");
}

async function _resend(key, { from, to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(await res.text());
}