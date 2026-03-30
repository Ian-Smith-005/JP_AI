// functions/api/send-receipt.js
// Called by mpesa-callback.js after payment is confirmed
// Emails a formatted receipt to the client AND admin
// Uses Resend API (same as contact.js)

export async function sendReceiptEmails(env, receipt) {
  if (!env.RESEND_API_KEY) {
    console.warn("[send-receipt] RESEND_API_KEY not set — skipping email");
    return;
  }

  const adminEmail  = env.ADMIN_EMAIL;
  const fromAddress = env.FROM_EMAIL; // swap once domain verified

  const {
    receipt_ref, booking_ref,
    client_name, client_email, client_phone,
    service_name, package_name, extra_name,
    event_date, event_time, location,
    total_price, deposit_paid, balance_due,
    payment_ref,
    issued_at,
  } = receipt;

  const issuedFormatted = issued_at
    ? new Date(issued_at).toLocaleDateString("en-KE", { dateStyle: "long" })
    : new Date().toLocaleDateString("en-KE", { dateStyle: "long" });

  const fmt = (n) => `KSh ${Number(n || 0).toLocaleString()}`;

  // ── Shared receipt table HTML ──────────────────────────────
  const receiptTable = `
    <table style="width:100%;border-collapse:collapse;font-size:.88rem;line-height:1.7">
      <tr style="background:#f3f4f6">
        <td colspan="2" style="padding:8px 14px;font-weight:700;font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Client</td>
      </tr>
      <tr><td style="padding:6px 14px;color:#6b7280;width:150px">Name</td>    <td style="padding:6px 14px">${escHtml(client_name || "")}</td></tr>
      <tr><td style="padding:6px 14px;color:#6b7280">Email</td>   <td style="padding:6px 14px">${escHtml(client_email || "")}</td></tr>
      <tr><td style="padding:6px 14px;color:#6b7280">Phone</td>   <td style="padding:6px 14px">${escHtml(client_phone || "")}</td></tr>

      <tr style="background:#f3f4f6">
        <td colspan="2" style="padding:8px 14px;font-weight:700;font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Booking</td>
      </tr>
      <tr><td style="padding:6px 14px;color:#6b7280">Service</td>  <td style="padding:6px 14px">${escHtml(service_name || "")}</td></tr>
      <tr><td style="padding:6px 14px;color:#6b7280">Package</td>  <td style="padding:6px 14px">${escHtml(package_name || "Standard")}</td></tr>
      <tr><td style="padding:6px 14px;color:#6b7280">Extras</td>   <td style="padding:6px 14px">${escHtml(extra_name || "None")}</td></tr>
      <tr><td style="padding:6px 14px;color:#6b7280">Date</td>     <td style="padding:6px 14px">${escHtml(event_date || "TBD")}</td></tr>
      <tr><td style="padding:6px 14px;color:#6b7280">Time</td>     <td style="padding:6px 14px">${escHtml(event_time || "TBD")}</td></tr>
      <tr><td style="padding:6px 14px;color:#6b7280">Location</td> <td style="padding:6px 14px">${escHtml(location || "TBD")}</td></tr>

      <tr style="background:#f3f4f6">
        <td colspan="2" style="padding:8px 14px;font-weight:700;font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Payment</td>
      </tr>
      <tr><td style="padding:6px 14px;color:#6b7280">Total</td>
          <td style="padding:6px 14px;font-weight:700">${fmt(total_price)}</td></tr>
      <tr><td style="padding:6px 14px;color:#16a34a">Deposit Paid</td>
          <td style="padding:6px 14px;font-weight:700;color:#16a34a">${fmt(deposit_paid)}</td></tr>
      <tr><td style="padding:6px 14px;color:#6b7280">Balance Due</td>
          <td style="padding:6px 14px;font-weight:700">${fmt(balance_due)}</td></tr>
      <tr><td style="padding:6px 14px;color:#6b7280">M-Pesa Ref</td>
          <td style="padding:6px 14px;font-family:monospace">${escHtml(payment_ref || "—")}</td></tr>
    </table>
  `;

  // ── Client receipt email ───────────────────────────────────
  const clientHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0;text-align:center">
        <img src="https://joyaltyphotography.netlify.app/images/templatemo-logo.png" height="44" alt="Joyalty Logo" style="margin-bottom:12px">
        <h2 style="color:#fff;margin:0">Booking Confirmed! ✅</h2>
        <p style="color:rgba(255,255,255,.65);margin:6px 0 0;font-size:.9rem">Your deposit has been received</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:28px 32px;border-radius:0 0 8px 8px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:14px 18px;margin-bottom:24px;font-size:.9rem">
          <strong style="color:#15803d">Receipt:</strong> ${escHtml(receipt_ref || "")} &nbsp;·&nbsp;
          <strong style="color:#15803d">Booking:</strong> ${escHtml(booking_ref || "")} &nbsp;·&nbsp;
          <span style="color:#6b7280">${issuedFormatted}</span>
        </div>
        <p style="font-size:.95rem;line-height:1.75;color:#374151;margin-bottom:20px">
          Hi ${escHtml((client_name || "").split(" ")[0])}, your booking with <strong>Joyalty Photography</strong>
          is now confirmed. Here is your receipt — please keep it for your records.
        </p>
        ${receiptTable}
        <div style="margin-top:24px;padding:16px 20px;background:#fffbeb;border-radius:6px;border-left:3px solid #f59e0b">
          <p style="margin:0;font-size:.88rem;color:#92400e">
            <strong>Balance of ${fmt(balance_due)}</strong> is due on or before the event date.
            Payment via M-Pesa to our paybill or contact us to arrange.
          </p>
        </div>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
        <p style="font-size:.82rem;color:#9ca3af;text-align:center">
          Joyalty Photography · Shanzu, Mombasa, Kenya<br>
          joyaltyphotography254@gmail.com · +254 XXX XXX
        </p>
      </div>
    </div>
  `;

  // ── Admin notification email ───────────────────────────────
  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">💰 New Booking Payment Received</h2>
        <p style="color:rgba(255,255,255,.6);margin:6px 0 0;font-size:.85rem">
          ${escHtml(receipt_ref || "")} · ${issuedFormatted}
        </p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:28px 32px;border-radius:0 0 8px 8px">
        ${receiptTable}
        <div style="margin-top:20px">
          <a href="mailto:${escHtml(client_email || "")}?subject=Your Joyalty Booking ${escHtml(booking_ref || "")}"
             style="background:#1a1a2e;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:.88rem;font-weight:600">
            Email Client
          </a>
        </div>
      </div>
    </div>
  `;

  // ── Send both ──────────────────────────────────────────────
  const sends = [];

  // To client (only if they have an email)
  if (client_email) {
    sends.push(sendEmail(env.RESEND_API_KEY, {
      from:    `Joyalty Photography <${fromAddress}>`,
      to:      [client_email],
      subject: `Your booking is confirmed — ${receipt_ref}`,
      html:    clientHtml,
    }).catch(e => console.error("[send-receipt] client email failed:", e.message)));
  }

  // To admin
  sends.push(sendEmail(env.RESEND_API_KEY, {
    from:    fromAddress,
    to:      [adminEmail],
    subject: `💰 New booking payment: ${receipt_ref} — ${client_name}`,
    html:    adminHtml,
  }).catch(e => console.error("[send-receipt] admin email failed:", e.message)));

  await Promise.all(sends);
}

// ── Shared helpers ─────────────────────────────────────────────
async function sendEmail(apiKey, { from, to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ from, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return data;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}