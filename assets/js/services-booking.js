/* ============================================================
   JOYALTY BOOKING SYSTEM — services-booking.js
   SANDBOX MODE: STK cancel (1032) is treated as successful
   payment so the full flow runs end-to-end for testing.

   Flow:
   1. Form steps 1–3 collect data (saved to localStorage)
   2. Step 4: "Pay" button → saves to DB → triggers STK push
   3. Poll receipt endpoint every 3s (faster than before)
   4. On receipt confirmed:
      - Form hidden + cleared
      - Services section restored
      - Receipt rendered + auto-downloaded as HTML file
      - localStorage draft cleared
============================================================ */

// ── Pricing mirrors DB and services.html ─────────────────────
const SERVICE_PRICES = {
  "Wedding Photography":    45000,
  "Portrait Session":        6000,
  "Portrait Sessions":       6000,
  "Commercial Photography": 25000,
  "Event Coverage":         18000,
  "Engagement Shoot":       12000,
  "Engagement Shoots":      12000,
  "Family Photography":      8000,
};
const PACKAGE_MOD  = { Standard: 1.0, Premium: 1.4, Luxury: 1.8 };
const EXTRA_PRICES = { "None": 0, "Drone Coverage": 8000, "Photo Album": 5000, "Highlight Video": 12000 };

// ── Card title → exact <option> text in serviceType <select> ─
const CARD_TO_OPTION = {
  "Wedding Photography":    "Wedding Photography",
  "Portrait Sessions":      "Portrait Session",
  "Commercial Photography": "Commercial Photography",
  "Event Coverage":         "Event Coverage",
  "Engagement Shoots":      "Engagement Shoot",
  "Family Photography":     "Family Photography",
};

// ── State ─────────────────────────────────────────────────────
let currentStep   = 0;
let bookingData   = _load("joyalty_booking_draft")  || {};
let bookingResult = _load("joyalty_booking_result") || {};

// ── DOM ───────────────────────────────────────────────────────
const bookingSection  = document.getElementById("booking-form-section");
const servicesSection = document.getElementById("services-section");
const successScreen   = document.getElementById("successScreen");
const receiptSection  = document.getElementById("receiptSection");
const receiptContent  = document.getElementById("receiptContent");

const steps           = document.querySelectorAll(".form-step");
const progressSteps   = document.querySelectorAll(".progress-step");
const progressLine    = document.getElementById("progressLine");

const nextBtn         = document.getElementById("nextStep");
const prevBtn         = document.getElementById("prevStep");
const resetBtn        = document.getElementById("resetForm");
const resetModal      = document.getElementById("resetModal");
const confirmResetBtn = document.getElementById("confirmReset");
const cancelResetBtn  = document.getElementById("cancelReset");
const closeBookingBtn = document.getElementById("closeBooking");
const clientPhoneEl   = document.getElementById("clientPhone");
const mpesaPhoneEl    = document.getElementById("mpesaPhone");
const mpesaPayBtn     = document.getElementById("mpesaPayBtn");

// ── localStorage helpers ──────────────────────────────────────
function _save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(_){} }
function _load(k)    { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch(_){ return null; } }
function _clearDraft() {
  ["joyalty_booking_draft","joyalty_booking_result"].forEach(k => localStorage.removeItem(k));
}

// ── Price calculator ──────────────────────────────────────────
function calcPrice(service, pkg, extra) {
  const base  = SERVICE_PRICES[service] || 0;
  const pkg2  = Math.round(base * (PACKAGE_MOD[pkg] || 1));
  const ext   = EXTRA_PRICES[extra] || 0;
  const total = pkg2 + ext;
  return { base, packagePrice: pkg2, extraPrice: ext, total, deposit: Math.round(total * 0.30) };
}

// ── Live price preview on Step 2 ─────────────────────────────
function updatePricePreview() {
  const svc  = document.getElementById("serviceType")?.value;
  const pkg  = document.getElementById("servicePackage")?.value || "Standard";
  const ext  = document.getElementById("extraServices")?.value  || "None";
  if (!svc) return;

  const { base, packagePrice, extraPrice, total, deposit } = calcPrice(svc, pkg, ext);
  let el = document.getElementById("pricePreview");
  if (!el) {
    el = document.createElement("div");
    el.id = "pricePreview";
    el.style.cssText = "margin-top:14px;padding:12px 16px;background:rgba(128,128,128,.08);border-radius:8px;border:1px solid rgba(128,128,128,.15);font-size:14px;line-height:1.9;font-family:Quicksand,sans-serif";
    steps[1]?.appendChild(el);
  }
  el.innerHTML = `
    <strong>Price Breakdown</strong><br>
    Base: <strong>KSh ${base.toLocaleString()}</strong><br>
    ${pkg !== "Standard" ? `${pkg} package: <strong>KSh ${packagePrice.toLocaleString()}</strong><br>` : ""}
    ${ext !== "None"     ? `${ext}: <strong>+ KSh ${extraPrice.toLocaleString()}</strong><br>`         : ""}
    <hr style="margin:6px 0;border-color:rgba(128,128,128,.2)">
    Total: <strong>KSh ${total.toLocaleString()}</strong> &nbsp;|&nbsp;
    Deposit (30%): <strong style="color:#22c55e">KSh ${deposit.toLocaleString()}</strong>
  `;
}

["serviceType","servicePackage","extraServices"].forEach(id =>
  document.getElementById(id)?.addEventListener("change", updatePricePreview)
);

// ── Step navigation ───────────────────────────────────────────
function goToStep(n) {
  steps.forEach((s, i) => s.classList.toggle("active", i === n));
  progressSteps.forEach((s, i) => {
    s.classList.toggle("active", i <= n);
    s.classList.toggle("completed", i < n);
  });
  if (progressLine) progressLine.style.width = `${(n / (steps.length - 1)) * 100}%`;
  prevBtn.style.display = n === 0 ? "none" : "inline-block";
  nextBtn.textContent   = n === steps.length - 1 ? "Confirm Booking" : "Next";
  currentStep = n;

  // Restore saved values into fields
  requestAnimationFrame(() => restoreFields(n));
  if (n === 1) setTimeout(updatePricePreview, 80);
  if (n === 3) renderPaymentSummary();
}

function restoreFields(step) {
  const d   = bookingData;
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  if (step === 0) { set("clientName", d.clientName); set("clientEmail", d.clientEmail); set("clientPhone", d.clientPhone); if (mpesaPhoneEl && d.clientPhone) mpesaPhoneEl.value = d.clientPhone; }
  if (step === 1) { set("serviceType", d.serviceType); set("servicePackage", d.servicePackage || "Standard"); set("extraServices", d.extraServices || "None"); setTimeout(updatePricePreview, 80); }
  if (step === 2) { set("eventDate", d.eventDate); set("eventTime", d.eventTime); set("eventLocation", d.eventLocation); set("guestCount", d.guestCount); set("eventDescription", d.eventDescription); }
  if (step === 3) { set("mpesaPhone", d.mpesaPhone || d.clientPhone); }
}

// ── Payment summary on step 4 ─────────────────────────────────
function renderPaymentSummary() {
  const p = document.querySelector(".payment-info");
  if (!p || !bookingData.serviceType) return;
  const { total, deposit } = calcPrice(bookingData.serviceType, bookingData.servicePackage || "Standard", bookingData.extraServices || "None");
  const ref = bookingResult.bookingRef || "—";
  p.innerHTML = `
    <table style="width:100%;font-size:14px;line-height:1.9;font-family:Quicksand,sans-serif">
      <tr><td>Booking Ref</td><td><strong>${ref}</strong></td></tr>
      <tr><td>Service</td>    <td>${bookingData.serviceType}</td></tr>
      <tr><td>Package</td>    <td>${bookingData.servicePackage || "Standard"}</td></tr>
      <tr><td>Total</td>      <td><strong>KSh ${total.toLocaleString()}</strong></td></tr>
      <tr><td style="color:#22c55e">Deposit (30%)</td>
          <td><strong style="color:#22c55e">KSh ${deposit.toLocaleString()}</strong></td></tr>
      <tr><td>Balance after deposit</td><td>KSh ${(total-deposit).toLocaleString()}</td></tr>
    </table>
    <p style="margin-top:10px;font-size:12px;opacity:.6">
      Enter your M-Pesa number below and tap Pay — you'll get a prompt on your phone.<br>
      <em>In sandbox mode, cancel the prompt and the booking will still confirm automatically.</em>
    </p>`;
}

// ── Validation ────────────────────────────────────────────────
function validateStep(step) {
  if (step === 0) {
    const name  = document.getElementById("clientName").value.trim();
    const email = document.getElementById("clientEmail").value.trim();
    const phone = document.getElementById("clientPhone").value.trim();
    if (!name || !email || !phone) { alert("Please fill in your name, email and phone number."); return false; }
    if (!/\S+@\S+\.\S+/.test(email)) { alert("Please enter a valid email address."); return false; }
  }
  if (step === 1) {
    if (!document.getElementById("serviceType").value) { alert("Please select a service."); return false; }
  }
  return true;
}

// ── Collect step data ─────────────────────────────────────────
function collectStep(step) {
  if (step === 0) {
    bookingData.clientName  = document.getElementById("clientName").value.trim();
    bookingData.clientEmail = document.getElementById("clientEmail").value.trim();
    bookingData.clientPhone = document.getElementById("clientPhone").value.trim();
  }
  if (step === 1) {
    bookingData.serviceType    = document.getElementById("serviceType").value;
    bookingData.servicePackage = document.getElementById("servicePackage").value;
    bookingData.extraServices  = document.getElementById("extraServices").value || "None";
  }
  if (step === 2) {
    bookingData.eventDate        = document.getElementById("eventDate").value;
    bookingData.eventTime        = document.getElementById("eventTime").value;
    bookingData.eventLocation    = document.getElementById("eventLocation").value.trim();
    bookingData.guestCount       = document.getElementById("guestCount").value || null;
    bookingData.eventDescription = document.getElementById("eventDescription").value.trim();
    bookingData.mpesaPhone       = mpesaPhoneEl?.value.trim() || bookingData.clientPhone;
  }
  bookingData._lastStep = step + 1;
  _save("joyalty_booking_draft", bookingData);
}

// ── Submit booking to DB ──────────────────────────────────────
async function submitBookingToDB() {
  try {
    const res  = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingData),
    });
    const raw  = await res.text();
    const data = safeJSON(raw);
    if (!data?.success) throw new Error(data?.error || "Booking failed");
    bookingResult = data;
    _save("joyalty_booking_result", bookingResult);
    return true;
  } catch (err) {
    console.error("[booking] submitBookingToDB:", err.message);
    return false;
  }
}

// ── M-Pesa pay button ─────────────────────────────────────────
mpesaPayBtn?.addEventListener("click", async () => {
  const phone = mpesaPhoneEl?.value.trim() || bookingData.clientPhone;
  if (!phone) { alert("Please enter your M-Pesa phone number."); return; }

  const { deposit } = calcPrice(
    bookingData.serviceType,
    bookingData.servicePackage || "Standard",
    bookingData.extraServices  || "None"
  );

  mpesaPayBtn.disabled    = true;
  mpesaPayBtn.textContent = "Saving booking…";

  // Save to DB first to get bookingId + ref
  if (!bookingResult.bookingId) {
    const saved = await submitBookingToDB();
    if (!saved) {
      mpesaPayBtn.disabled    = false;
      mpesaPayBtn.textContent = "Pay with M-Pesa";
      alert("Could not save your booking. Please try again.");
      return;
    }
    renderPaymentSummary();
  }

  mpesaPayBtn.textContent = "Sending STK push…";

  try {
    const res  = await fetch("/api/mpesa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        amount:     deposit,
        bookingId:  bookingResult.bookingId,
        bookingRef: bookingResult.bookingRef,
      }),
    });

    const raw  = await res.text();
    const data = safeJSON(raw);

    if (!data) {
      mpesaPayBtn.disabled    = false;
      mpesaPayBtn.textContent = "Retry M-Pesa";
      alert("Server error. Check Cloudflare function logs.");
      return;
    }

    if (data.success) {
      mpesaPayBtn.textContent = "✅ Check your phone — or wait for sandbox auto-confirm";
      bookingData.mpesaPhone  = phone;
      _save("joyalty_booking_draft", bookingData);
      // Start polling — 3s interval, faster feedback in sandbox
      pollPayment(bookingResult.bookingId, 0);
    } else {
      mpesaPayBtn.disabled    = false;
      mpesaPayBtn.textContent = "Retry M-Pesa";
      alert("M-Pesa error: " + (data.error || "Please try again."));
    }
  } catch (err) {
    mpesaPayBtn.disabled    = false;
    mpesaPayBtn.textContent = "Retry M-Pesa";
    alert("Connection error: " + err.message);
  }
});

// ── Poll for payment confirmation ─────────────────────────────
// Polls every 3 seconds (faster than before).
// Sandbox: Safaricom callback fires within ~10s of STK send.
// Once deposit_paid > 0 in DB, the full success flow runs.
let pollTimer = null;

async function pollPayment(bookingId, attempts) {
  if (attempts > 20) { // 20 × 3s = 60s timeout
    alert("Payment confirmation is taking longer than expected. If you received the M-Pesa prompt, please wait a moment and refresh. Contact us at joyaltyphotography254@gmail.com if the issue persists.");
    mpesaPayBtn.disabled    = false;
    mpesaPayBtn.textContent = "Retry M-Pesa";
    return;
  }

  pollTimer = setTimeout(async () => {
    try {
      const res  = await fetch(`/api/receipt?bookingId=${bookingId}`);
      const data = safeJSON(await res.text());

      if (data?.receipt?.deposit_paid > 0) {
        // ✅ Payment confirmed — run full success flow
        onPaymentConfirmed(data.receipt);
      } else {
        pollPayment(bookingId, attempts + 1);
      }
    } catch (_) {
      pollPayment(bookingId, attempts + 1);
    }
  }, 3000);
}

// ── Payment confirmed — clear form, show receipt, auto-download ─
function onPaymentConfirmed(receipt) {
  // Stop polling
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }

  // Merge DB receipt with local draft for complete data
  const full = { ...bookingData, ...receipt };
  _save("joyalty_last_receipt", full);

  // Clear draft — booking is done
  _clearDraft();

  // Reset form state
  bookingData   = {};
  bookingResult = {};

  // Hide booking form, restore services
  closeBookingFormSilently();

  // Small delay so the form hide animation completes
  setTimeout(() => {
    // Render receipt in the receipt section
    renderReceipt(full);

    // Auto-download receipt HTML file
    setTimeout(() => downloadReceiptFile(full), 800);

    // Show success notification
    showSuccessBanner(full);
  }, 600);
}

// ── Close booking form and restore services (silent, no animation delay) ─
function closeBookingFormSilently() {
  bookingSection.classList.remove("active");
  bookingSection.style.display  = "none";
  servicesSection.style.display = "block";
  servicesSection.classList.remove("hidden");
  document.getElementById("bookingForm")?.reset();
  goToStep(0);
}

// ── Show success banner ───────────────────────────────────────
function showSuccessBanner(full) {
  let banner = document.getElementById("bookingSuccessBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "bookingSuccessBanner";
    banner.style.cssText = `
      position:fixed;top:80px;left:50%;transform:translateX(-50%);
      background:#22c55e;color:#fff;padding:14px 28px;
      border-radius:50px;font-family:Quicksand,sans-serif;
      font-size:14px;font-weight:600;z-index:9999;
      box-shadow:0 8px 24px rgba(0,0,0,.25);
      display:flex;align-items:center;gap:10px;
      animation:slideDownBanner .4s ease;
    `;
    const style = document.createElement("style");
    style.textContent = `@keyframes slideDownBanner{from{opacity:0;top:60px}to{opacity:1;top:80px}}`;
    document.head.appendChild(style);
    document.body.appendChild(banner);
  }
  banner.innerHTML = `✅ Booking confirmed! <strong>${full.receipt_ref || "Receipt"}</strong> — receipt downloading…`;
  banner.style.display = "flex";
  setTimeout(() => { banner.style.display = "none"; }, 6000);
}

// ── Render receipt HTML ───────────────────────────────────────
function renderReceipt(r) {
  successScreen && (successScreen.style.display = "none");
  receiptSection && (receiptSection.style.display = "flex");

  const rid    = r.receipt_ref  || bookingResult.receiptRef  || "RCP-DRAFT";
  const bref   = r.booking_ref  || bookingResult.bookingRef  || "JOY-DRAFT";
  const total  = r.total_price  || bookingResult.totalPrice  || 0;
  const dep    = r.deposit_paid || bookingResult.depositAmount || 0;
  const bal    = r.balance_due  || (total - dep)             || 0;
  const payRef = r.payment_ref  || "Sandbox confirmed";
  const issued = r.issued_at
    ? new Date(r.issued_at).toLocaleDateString("en-KE", { dateStyle: "long" })
    : new Date().toLocaleDateString("en-KE", { dateStyle: "long" });

  const html = buildReceiptHTML(r, rid, bref, total, dep, bal, payRef, issued);
  receiptContent.innerHTML = html;

  // Download button
  let dlBtn = document.getElementById("downloadReceiptBtn");
  if (!dlBtn) {
    dlBtn = document.createElement("button");
    dlBtn.id        = "downloadReceiptBtn";
    dlBtn.className = "btn primary-btn mt-3 w-100";
    dlBtn.innerHTML = '<i class="fa-solid fa-download me-2"></i>Download Receipt';
    receiptContent.after(dlBtn);
  }
  dlBtn.onclick = () => downloadReceiptFile(r);
}

// ── Build receipt HTML string ─────────────────────────────────
function buildReceiptHTML(r, rid, bref, total, dep, bal, payRef, issued) {
  const row = (label, val) =>
    `<tr><td style="padding:5px 12px;color:#6b7280;width:130px">${label}</td><td style="padding:5px 12px">${val || "—"}</td></tr>`;
  const section = (title) =>
    `<tr style="background:#f3f4f6"><td colspan="2" style="padding:7px 12px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">${title}</td></tr>`;

  return `
<div id="receiptPrint" style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
  <div style="text-align:center;margin-bottom:20px">
    <img src="https://joyaltyphotography.netlify.app/images/templatemo-logo.png" height="40" alt="Joyalty">
    <h2 style="margin:10px 0 4px;font-size:1.2rem">Joyalty Photography</h2>
    <p style="font-size:12px;color:#9ca3af;margin:0">joyaltyphotography254@gmail.com · Shanzu, Mombasa, Kenya</p>
  </div>
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:12px">
    <strong style="color:#15803d">Receipt:</strong> ${rid} &nbsp;·&nbsp;
    <strong style="color:#15803d">Booking:</strong> ${bref} &nbsp;·&nbsp;
    <span style="color:#6b7280">${issued}</span>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;line-height:1.8">
    ${section("Client Details")}
    ${row("Name",  r.client_name  || bookingData.clientName  || "")}
    ${row("Email", r.client_email || bookingData.clientEmail || "")}
    ${row("Phone", r.client_phone || bookingData.clientPhone || "")}
    ${section("Booking Details")}
    ${row("Service",  r.service_name || bookingData.serviceType     || "")}
    ${row("Package",  r.package_name || bookingData.servicePackage  || "Standard")}
    ${row("Extras",   r.extra_name   || bookingData.extraServices   || "None")}
    ${row("Date",     r.event_date   || bookingData.eventDate       || "TBD")}
    ${row("Time",     r.event_time   || bookingData.eventTime       || "TBD")}
    ${row("Location", r.location     || bookingData.eventLocation   || "TBD")}
    ${section("Payment Summary")}
    ${row("Total",        `<strong>KSh ${Number(total).toLocaleString()}</strong>`)}
    ${row("Deposit Paid", `<strong style="color:#16a34a">KSh ${Number(dep).toLocaleString()}</strong>`)}
    ${row("Balance Due",  `<strong>KSh ${Number(bal).toLocaleString()}</strong>`)}
    ${row("M-Pesa Ref",   `<span style="font-family:monospace">${payRef}</span>`)}
  </table>
  <div style="text-align:center;margin-top:20px;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:14px">
    Thank you for choosing Joyalty Photography 📷<br>
    Please keep this receipt for your records.
  </div>
</div>`;
}

// ── Download receipt as printable HTML file ───────────────────
function downloadReceiptFile(r) {
  const rid   = r.receipt_ref || bookingResult.receiptRef || "RCP";
  const bref  = r.booking_ref || bookingResult.bookingRef || "JOY";
  const total = r.total_price  || 0;
  const dep   = r.deposit_paid || 0;
  const bal   = r.balance_due  || (total - dep) || 0;
  const pay   = r.payment_ref  || "Sandbox confirmed";
  const iss   = r.issued_at ? new Date(r.issued_at).toLocaleDateString("en-KE", { dateStyle: "long" }) : new Date().toLocaleDateString("en-KE", { dateStyle: "long" });

  const body  = buildReceiptHTML(r, rid, bref, total, dep, bal, pay, iss);
  const full  = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Joyalty Receipt ${rid}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #fff; margin: 0; padding: 30px; }
    @media print { body { padding: 0; } @page { margin: 1cm; } }
  </style>
</head>
<body>
  ${body}
  <script>
    // Auto-trigger print dialog when opened in browser
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 400);
    });
  <\/script>
</body>
</html>`;

  const blob = new Blob([full], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href:     url,
    download: `Joyalty-Receipt-${rid}.html`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Smooth form open/close ────────────────────────────────────
function showBookingForm(prefilledService) {
  if (prefilledService) {
    // Reset draft when a new card is clicked
    bookingData           = { serviceType: prefilledService, _lastStep: 0 };
    bookingResult         = {};
    _save("joyalty_booking_draft", bookingData);
    localStorage.removeItem("joyalty_booking_result");
  }

  servicesSection.classList.add("hidden");
  setTimeout(() => {
    servicesSection.style.display = "none";
    bookingSection.style.display  = "block";
    void bookingSection.offsetWidth;
    requestAnimationFrame(() => bookingSection.classList.add("active"));
    bookingSection.scrollIntoView({ behavior: "smooth" });
    goToStep(bookingData._lastStep || 0);
  }, 450);
}

function closeBookingForm() {
  bookingSection.classList.remove("active");
  setTimeout(() => {
    bookingSection.style.display  = "none";
    servicesSection.style.display = "block";
    void servicesSection.offsetWidth;
    requestAnimationFrame(() => servicesSection.classList.remove("hidden"));
    servicesSection.scrollIntoView({ behavior: "smooth" });
  }, 550);
}

// ── Book Now buttons — pre-fill from card ─────────────────────
document.querySelectorAll(".start-booking").forEach(btn => {
  btn.addEventListener("click", () => {
    const title  = btn.closest(".service-card")?.querySelector("h4")?.textContent?.trim();
    const mapped = CARD_TO_OPTION[title] || title;
    showBookingForm(mapped);
  });
});

// ── Navigation ────────────────────────────────────────────────
nextBtn?.addEventListener("click", async () => {
  if (!validateStep(currentStep)) return;
  collectStep(currentStep);
  if (currentStep < steps.length - 1) goToStep(currentStep + 1);
});

prevBtn?.addEventListener("click", () => {
  if (currentStep > 0) goToStep(currentStep - 1);
});

closeBookingBtn?.addEventListener("click", closeBookingForm);

clientPhoneEl?.addEventListener("input", () => {
  if (mpesaPhoneEl) mpesaPhoneEl.value = clientPhoneEl.value;
});

// ── Reset ─────────────────────────────────────────────────────
resetBtn?.addEventListener("click", () => { resetModal.style.display = "flex"; });
cancelResetBtn?.addEventListener("click", () => { resetModal.style.display = "none"; });
confirmResetBtn?.addEventListener("click", () => {
  document.getElementById("bookingForm")?.reset();
  bookingData = {}; bookingResult = {};
  _clearDraft();
  resetModal.style.display = "none";
  goToStep(0);
});

// ── Receipt close ─────────────────────────────────────────────
document.getElementById("closeReceipt")?.addEventListener("click", () => {
  receiptSection.style.display = "none";
});

successScreen?.addEventListener("click", e => {
  if (e.target === successScreen) successScreen.style.display = "none";
});

// ── Resume banner if last receipt exists ─────────────────────
const lastReceipt = _load("joyalty_last_receipt");
if (lastReceipt) {
  const rb = Object.assign(document.createElement("div"), {
    style: "position:fixed;bottom:80px;right:20px;z-index:9999;background:#22c55e;color:#fff;padding:10px 18px;border-radius:50px;font-size:13px;font-family:Quicksand,sans-serif;cursor:pointer;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.2)",
    innerHTML: "📄 View your last receipt",
  });
  rb.onclick = () => { receiptSection.style.display = "flex"; renderReceipt(lastReceipt); rb.remove(); };
  document.body.appendChild(rb);
}

// ── Helpers ───────────────────────────────────────────────────
function safeJSON(text) { try { return JSON.parse(text); } catch(_){ return null; } }

// ── Init ──────────────────────────────────────────────────────
goToStep(0);