/* ============================================================
   JOYALTY BOOKING SYSTEM — services-booking.js
   Fixes:
   - Pre-fill now matches exact <option> text in serviceType select
   - localStorage persists all steps, survives refresh
   - DB only written when Pay button is tapped
   - Downloadable receipt from localStorage
============================================================ */

// ── State ─────────────────────────────────────────────────────
let currentStep   = 0;
let bookingData   = loadFromStorage("joyalty_booking_draft") || {};
let bookingResult = loadFromStorage("joyalty_booking_result") || {};

// ── EXACT match to <option> text inside #serviceType select ──
// Card h4 text  →  select option inner text (must match exactly)
const CARD_TO_OPTION = {
  "Wedding Photography":    "Wedding Photography",
  "Portrait Sessions":      "Portrait Session",      // card has "s", select doesn't
  "Commercial Photography": "Commercial Photography",
  "Event Coverage":         "Event Coverage",
  "Engagement Shoots":      "Event Coverage",        // not in select, closest match
  "Family Photography":     "Portrait Session",      // not in select, closest match
};

// ── Pricing (mirrors DB) ──────────────────────────────────────
const SERVICE_PRICES    = {
  "Wedding Photography": 45000, "Portrait Session": 6000,
  "Commercial Photography": 25000, "Event Coverage": 18000,
};
const PACKAGE_MODIFIERS = { Standard: 1.0, Premium: 1.4, Luxury: 1.8 };
const EXTRA_PRICES      = {
  "None": 0, "Drone Coverage": 8000,
  "Photo Album": 5000, "Highlight Video": 12000,
};

// ── DOM refs ──────────────────────────────────────────────────
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
const originalText = mpesaPayBtn.textContent;

// ── localStorage ─────────────────────────────────────────────
function saveToStorage(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
}
function loadFromStorage(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
  catch (_) { return null; }
}
function clearDraft() {
  localStorage.removeItem("joyalty_booking_draft");
  localStorage.removeItem("joyalty_booking_result");
}

// ── Pricing ───────────────────────────────────────────────────
function calcPricing(serviceType, pkg, extra) {
  const base     = SERVICE_PRICES[serviceType] || 0;
  const modifier = PACKAGE_MODIFIERS[pkg]      || 1.0;
  const pkgPrice = Math.round(base * modifier);
  const extPrice = EXTRA_PRICES[extra]         || 0;
  const total    = pkgPrice + extPrice;
  const deposit  = Math.round(total * 0.30);
  return { base, pkgPrice, extPrice, total, deposit };
}

// ── Live price preview (Step 2) ───────────────────────────────
function updatePricePreview() {
  const service = document.getElementById("serviceType")?.value;
  const pkg     = document.getElementById("servicePackage")?.value || "Standard";
  const extra   = document.getElementById("extraServices")?.value  || "None";
  if (!service) return;

  const { base, pkgPrice, extPrice, total, deposit } = calcPricing(service, pkg, extra);
  let el = document.getElementById("pricePreview");
  if (!el) {
    el = document.createElement("div");
    el.id = "pricePreview";
    el.style.cssText = "margin-top:14px;padding:12px 16px;background:#f8f9fa;border-radius:8px;border:1px solid #dee2e6;font-size:14px;line-height:1.9";
    steps[1]?.appendChild(el);
  }
  el.innerHTML = `
    <strong>Price Breakdown</strong><br>
    Base: <strong>KSh ${base.toLocaleString()}</strong><br>
    ${pkg !== "Standard" ? `${pkg} package: <strong>KSh ${pkgPrice.toLocaleString()}</strong><br>` : ""}
    ${extra !== "None"   ? `${extra}: <strong>+ KSh ${extPrice.toLocaleString()}</strong><br>`    : ""}
    <hr style="margin:6px 0">
    Total: <strong>KSh ${total.toLocaleString()}</strong> &nbsp;|&nbsp;
    Deposit (30%): <strong style="color:#198754">KSh ${deposit.toLocaleString()}</strong>
  `;
}

["serviceType","servicePackage","extraServices"].forEach(id =>
  document.getElementById(id)?.addEventListener("change", updatePricePreview)
);

// ── Step navigation ───────────────────────────────────────────
function goToStep(index) {
  steps.forEach((s, i) => s.classList.toggle("active", i === index));
  progressSteps.forEach((s, i) => {
    s.classList.toggle("active", i <= index);
    s.classList.toggle("completed", i < index);
  });
  if (progressLine) {
    progressLine.style.width = `${(index / (steps.length - 1)) * 100}%`;
  }
  prevBtn.style.display = index === 0 ? "none" : "inline-block";
  nextBtn.textContent   = index === steps.length - 1 ? "Confirm Booking" : "Next";
  currentStep = index;
  restoreFieldsForStep(index);
  if (index === 1) setTimeout(updatePricePreview, 50);
  if (index === 3) renderPaymentSummary();
}

// ── KEY FIX: restore fields uses requestAnimationFrame ────────
// Without this, the select hasn't rendered yet when we set .value
function restoreFieldsForStep(step) {
  requestAnimationFrame(() => {
    const d   = bookingData;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val != null && val !== "") el.value = val;
    };
    if (step === 0) {
      set("clientName",  d.clientName);
      set("clientEmail", d.clientEmail);
      set("clientPhone", d.clientPhone);
      if (mpesaPhoneEl && d.clientPhone) mpesaPhoneEl.value = d.clientPhone;
    }
    if (step === 1) {
      set("serviceType",    d.serviceType);
      set("servicePackage", d.servicePackage || "Standard");
      set("extraServices",  d.extraServices  || "None");
      setTimeout(updatePricePreview, 100);
    }
    if (step === 2) {
      set("eventDate",        d.eventDate);
      set("eventTime",        d.eventTime);
      set("eventLocation",    d.eventLocation);
      set("guestCount",       d.guestCount);
      set("eventDescription", d.eventDescription);
    }
    if (step === 3) {
      set("mpesaPhone", d.mpesaPhone || d.clientPhone);
    }
  });
}

// ── Payment summary (Step 4) ──────────────────────────────────
function renderPaymentSummary() {
  const payInfo = document.querySelector(".payment-info");
  if (!payInfo || !bookingData.serviceType) return;
  const { total, deposit } = calcPricing(
    bookingData.serviceType,
    bookingData.servicePackage || "Standard",
    bookingData.extraServices  || "None"
  );
  payInfo.innerHTML = `
    <table style="width:100%;font-size:14px;line-height:1.9">
      <tr><td>Booking Ref</td><td><strong>${bookingResult.bookingRef || "Assigned after payment"}</strong></td></tr>
      <tr><td>Service</td>    <td>${bookingData.serviceType}</td></tr>
      <tr><td>Package</td>    <td>${bookingData.servicePackage || "Standard"}</td></tr>
      <tr><td>Extras</td>     <td>${bookingData.extraServices || "None"}</td></tr>
      <tr><td>Total</td>      <td><strong>KSh ${total.toLocaleString()}</strong></td></tr>
      <tr><td style="color:#198754">Deposit (30%)</td>
          <td><strong style="color:#198754">KSh ${deposit.toLocaleString()}</strong></td></tr>
      <tr><td>Balance after deposit</td>
          <td>KSh ${(total - deposit).toLocaleString()}</td></tr>
    </table>
    <p style="margin-top:10px;font-size:13px;color:#666">
      Enter your M-Pesa number and tap Pay — you'll get an STK push on your phone.
    </p>
  `;
}

// ── Validation ────────────────────────────────────────────────
function validateStep(step) {
  if (step === 0) {
    const name  = document.getElementById("clientName").value.trim();
    const email = document.getElementById("clientEmail").value.trim();
    const phone = document.getElementById("clientPhone").value.trim();
    if (!name || !email || !phone) {
      alert("Please fill in your name, email and phone number."); return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      alert("Please enter a valid email address."); return false;
    }
  }
  if (step === 1) {
    if (!document.getElementById("serviceType").value) {
      alert("Please select a service."); return false;
    }
  }
  return true;
}

// ── Collect + save to localStorage ────────────────────────────
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
  saveToStorage("joyalty_booking_draft", bookingData);
}

// ── Submit to DB (only on Pay click) ─────────────────────────
async function submitBookingToDB() {
  try {
    const res  = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingData),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Unknown error");
    bookingResult = data;
    saveToStorage("joyalty_booking_result", bookingResult);
    return true;
  } catch (err) {
    console.error("submitBookingToDB:", err.message);
    return false;
  }
}

// ── M-Pesa pay button ─────────────────────────────────────────
mpesaPayBtn?.addEventListener("click", async () => {
  const phone = mpesaPhoneEl?.value.trim() || bookingData.clientPhone;
  if (!phone) { alert("Please enter your M-Pesa phone number."); return; }

const { deposit } = calcPricing(
  bookingData.serviceType,
  bookingData.servicePackage || "Standard",
  bookingData.extraServices  || "None"
);

const amount = deposit; // ✅ FIX

const res = await fetch("/api/mpesa", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    phone,
    amount,
    bookingId:  bookingResult.bookingId,
    bookingRef: bookingResult.bookingRef,
  }),
});

  mpesaPayBtn.disabled    = true;
  mpesaPayBtn.textContent = "Saving booking...";

  // Save to DB first to get bookingId
  if (!bookingResult.bookingId) {
    const saved = await submitBookingToDB();
    if (!saved) {
      mpesaPayBtn.disabled    = false;
      mpesaPayBtn.textContent = "Pay with M-Pesa";
      alert("Could not save booking. Please try again.");
      return;
    }
    renderPaymentSummary();
  }

  mpesaPayBtn.textContent = "Sending STK push...";

// REPLACE with this — safe JSON parse, shows actual server error
try {
    const res  = await fetch("/api/mpesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            phone,
            amount,
            bookingId:  bookingResult.bookingId,
            bookingRef: bookingResult.bookingRef,
        }),
    });

    // Safe parse — never throws on empty/HTML response
    const raw  = await res.text();
    let data = {};
    try { data = JSON.parse(raw); } catch (_) {
        console.error("Non-JSON from /api/mpesa:", raw.slice(0, 300));
        throw new Error("Server returned an invalid response. Check Cloudflare Function logs.");
    }

    if (data.success) {
        mpesaPayBtn.textContent = "✅ Check your phone!";
        pollPayment(bookingResult.bookingId);
    } else {
        mpesaPayBtn.disabled    = false;
        mpesaPayBtn.textContent = originalText;
        // Show the actual server error — much easier to debug
        alert("M-Pesa error: " + (data.error || data.detail || "Please try again."));
    }
} catch (err) {
    mpesaPayBtn.disabled    = false;
    mpesaPayBtn.textContent = originalText;
    alert("Error: " + err.message);
}
});

// ── Poll for payment (sandbox: any response = success) ────────
async function pollPayment(bookingId, attempts = 0) {
  if (attempts > 12) {
    alert("Payment timeout. Contact info@joyalty.com.");
    return;
  }
  await new Promise(r => setTimeout(r, 5000));
  try {
    const res  = await fetch(`/api/receipt?bookingId=${bookingId}`);
    const data = await res.json();
    if (data.receipt?.deposit_paid > 0) {
      onPaymentConfirmed(data.receipt);
    } else {
      pollPayment(bookingId, attempts + 1);
    }
  } catch (_) { pollPayment(bookingId, attempts + 1); }
}

// ── Payment confirmed ─────────────────────────────────────────
function onPaymentConfirmed(receipt) {
  const full = { ...bookingData, ...receipt };
  saveToStorage("joyalty_last_receipt", full);
  clearDraft();
  bookingSection.style.display = "none";
  successScreen.style.display  = "flex";
  document.getElementById("viewReceipt")?.addEventListener("click", () => {
    renderReceipt(full);
  }, { once: true });
}

// ── Render + download receipt ─────────────────────────────────
function renderReceipt(r) {
  successScreen.style.display  = "none";
  receiptSection.style.display = "flex";

  const rid     = r.receipt_ref   || bookingResult.receiptRef    || "RCP-DRAFT";
  const bref    = r.booking_ref   || bookingResult.bookingRef    || "JOY-DRAFT";
  const total   = r.total_price   || bookingResult.totalPrice    || 0;
  const deposit = r.deposit_paid  || bookingResult.depositAmount || 0;
  const balance = r.balance_due   || (total - deposit)           || 0;
  const payRef  = r.payment_ref   || "Pending";
  const issued  = r.issued_at
    ? new Date(r.issued_at).toLocaleDateString("en-KE", { dateStyle: "medium" })
    : new Date().toLocaleDateString("en-KE", { dateStyle: "medium" });

  const html = `
<div id="receiptPrint" style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #ddd;border-radius:8px">
  <div style="text-align:center;margin-bottom:16px">
    <img src="https://joyaltyphotography.netlify.app/images/templatemo-logo.png" height="40" alt="Logo">
    <h3 style="margin:6px 0 2px">Joyalty Photography</h3>
    <p style="font-size:12px;color:#666;margin:0">info@joyalty.com | +254 XXX XXX | Nairobi, Kenya</p>
  </div>
  <div style="background:#f8f9fa;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:13px">
    <strong>Receipt:</strong> ${rid} &nbsp;|&nbsp;
    <strong>Booking:</strong> ${bref} &nbsp;|&nbsp;
    <strong>Date:</strong> ${issued}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.9">
    <tr style="background:#f0f0f0"><td colspan="2" style="padding:6px 10px"><strong>Client Details</strong></td></tr>
    <tr><td style="padding:4px 10px;color:#555;width:140px">Name</td>  <td>${r.client_name  || bookingData.clientName  || ""}</td></tr>
    <tr><td style="padding:4px 10px;color:#555">Email</td>  <td>${r.client_email || bookingData.clientEmail || ""}</td></tr>
    <tr><td style="padding:4px 10px;color:#555">Phone</td>  <td>${r.client_phone || bookingData.clientPhone || ""}</td></tr>
    <tr style="background:#f0f0f0"><td colspan="2" style="padding:6px 10px"><strong>Booking Details</strong></td></tr>
    <tr><td style="padding:4px 10px;color:#555">Service</td>  <td>${r.service_name || bookingData.serviceType     || ""}</td></tr>
    <tr><td style="padding:4px 10px;color:#555">Package</td>  <td>${r.package_name || bookingData.servicePackage  || "Standard"}</td></tr>
    <tr><td style="padding:4px 10px;color:#555">Extras</td>   <td>${r.extra_name   || bookingData.extraServices   || "None"}</td></tr>
    <tr><td style="padding:4px 10px;color:#555">Date</td>     <td>${r.event_date   || bookingData.eventDate       || "TBD"}</td></tr>
    <tr><td style="padding:4px 10px;color:#555">Time</td>     <td>${r.event_time   || bookingData.eventTime       || "TBD"}</td></tr>
    <tr><td style="padding:4px 10px;color:#555">Location</td> <td>${r.location     || bookingData.eventLocation   || "TBD"}</td></tr>
    <tr style="background:#f0f0f0"><td colspan="2" style="padding:6px 10px"><strong>Payment Summary</strong></td></tr>
    <tr><td style="padding:4px 10px;color:#555">Total</td>         <td><strong>KSh ${Number(total).toLocaleString()}</strong></td></tr>
    <tr><td style="padding:4px 10px;color:#198754">Deposit Paid</td><td style="color:#198754"><strong>KSh ${Number(deposit).toLocaleString()}</strong></td></tr>
    <tr><td style="padding:4px 10px;color:#555">Balance Due</td>   <td><strong>KSh ${Number(balance).toLocaleString()}</strong></td></tr>
    <tr><td style="padding:4px 10px;color:#555">M-Pesa Ref</td>    <td>${payRef}</td></tr>
  </table>
  <div style="text-align:center;margin-top:20px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px">
    Thank you for choosing Joyalty Photography 📷<br>
    Please keep this receipt for your records.
  </div>
</div>`;

  receiptContent.innerHTML = html;

  let dlBtn = document.getElementById("downloadReceiptBtn");
  if (!dlBtn) {
    dlBtn = document.createElement("button");
    dlBtn.id        = "downloadReceiptBtn";
    dlBtn.className = "btn btn-success mt-3 w-100";
    dlBtn.innerHTML = '<i class="fa-solid fa-download"></i> Download Receipt';
    receiptContent.after(dlBtn);
  }
  dlBtn.onclick = () => {
    const full = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Joyalty Receipt ${rid}</title>
<style>body{font-family:Arial,sans-serif;padding:30px;background:#fff}@media print{body{padding:0}}</style>
</head><body>${html}<script>window.onload=()=>window.print()<\/script></body></html>`;
    const a = Object.assign(document.createElement("a"), {
      href:     URL.createObjectURL(new Blob([full], { type: "text/html" })),
      download: `Joyalty-Receipt-${rid}.html`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

// ── Smooth open / close ───────────────────────────────────────
function showBookingForm(prefilledService) {
  // Save pre-filled service BEFORE opening so restoreFields picks it up
  if (prefilledService) {
    bookingData.serviceType = prefilledService;
    // Reset to step 1 when clicking a new card (not a resume)
    bookingData._lastStep   = 0;
    saveToStorage("joyalty_booking_draft", bookingData);
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

// ── Book Now buttons — pre-fill fix ──────────────────────────
document.querySelectorAll(".start-booking").forEach(btn => {
  btn.addEventListener("click", () => {
    const h4    = btn.closest(".service-card")?.querySelector("h4");
    const title = h4?.textContent?.trim();
    // Map card title → exact <option> text in #serviceType
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

resetBtn?.addEventListener("click", () => { resetModal.style.display = "flex"; });
cancelResetBtn?.addEventListener("click", () => { resetModal.style.display = "none"; });
confirmResetBtn?.addEventListener("click", () => {
  document.getElementById("bookingForm")?.reset();
  bookingData = {}; bookingResult = {};
  clearDraft();
  resetModal.style.display = "none";
  goToStep(0);
});

document.getElementById("closeReceipt")?.addEventListener("click", () => {
  receiptSection.style.display = "none";
});
successScreen?.addEventListener("click", e => {
  if (e.target === successScreen) successScreen.style.display = "none";
});

// ── Resume banner if last receipt exists ─────────────────────
const lastReceipt = loadFromStorage("joyalty_last_receipt");
if (lastReceipt) {
  const banner = Object.assign(document.createElement("div"), {
    style:     "position:fixed;bottom:80px;right:20px;z-index:9999;background:#198754;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2)",
    innerHTML: "📄 View your last receipt",
  });
  banner.onclick = () => {
    receiptSection.style.display = "flex";
    renderReceipt(lastReceipt);
    banner.remove();
  };
  document.body.appendChild(banner);
}

// ── Init ──────────────────────────────────────────────────────
goToStep(0);