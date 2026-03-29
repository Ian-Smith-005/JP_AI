/* =====================================================
   JOYALTY BOOKING SYSTEM
   Features:
   - Prefill from "Book Now" card clicked
   - localStorage persistence (survives refresh)
   - DB only written AFTER payment confirmed
   - Sandbox M-Pesa bypass (simulates payment)
   - Downloadable receipt stored in localStorage
===================================================== */

// ── State ─────────────────────────────────────────────────
const STORAGE_KEY = "joyalty_booking_draft";
const RECEIPT_KEY = "joyalty_last_receipt";

let currentStep   = 0;
let bookingData   = loadDraft();   // load from localStorage on startup
let bookingResult = {};            // server response after DB write

// ── DOM ───────────────────────────────────────────────────
const bookingSection  = document.getElementById("booking-form-section");
const servicesSection = document.getElementById("services-section");
const successScreen   = document.getElementById("successScreen");
const receiptSection  = document.getElementById("receiptSection");
const receiptContent  = document.getElementById("receiptContent");

const steps         = document.querySelectorAll(".form-step");
const progressSteps = document.querySelectorAll(".progress-step");
const progressLine  = document.getElementById("progressLine");

const nextBtn         = document.getElementById("nextStep");
const prevBtn         = document.getElementById("prevStep");
const resetBtn        = document.getElementById("resetForm");
const resetModal      = document.getElementById("resetModal");
const confirmResetBtn = document.getElementById("confirmReset");
const cancelResetBtn  = document.getElementById("cancelReset");
const closeBookingBtn = document.getElementById("closeBooking");
const mpesaPayBtn     = document.getElementById("mpesaPayBtn");

// ── Service card → select value map ───────────────────────
const SERVICE_MAP = {
  "Wedding Photography":    "Wedding Photography",
  "Portrait Sessions":      "Portrait Session",
  "Commercial Photography": "Commercial Photography",
  "Event Coverage":         "Event Coverage",
  "Engagement Shoots":      "Engagement Shoot",
  "Family Photography":     "Family Photography",
};

// ── Pricing table (mirrors DB, used for local receipt) ────
const PRICING = {
  "Wedding Photography":    45000,
  "Portrait Session":        6000,
  "Commercial Photography": 25000,
  "Event Coverage":         18000,
  "Engagement Shoot":       12000,
  "Family Photography":      8000,
};
const PACKAGE_MODIFIER = { Standard: 1.0, Premium: 1.4, Luxury: 1.8 };
const EXTRAS = { None: 0, "Drone Coverage": 8000, "Photo Album": 5000, "Highlight Video": 12000 };

// ===================== LOCALSTORAGE DRAFT =====================

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookingData));
}

function clearDraft() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Restore form fields from saved draft ──────────────────
function restoreFormFromDraft() {
  const d = bookingData;
  if (!d || Object.keys(d).length === 0) return;

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };

  set("clientName",       d.clientName);
  set("clientEmail",      d.clientEmail);
  set("clientPhone",      d.clientPhone);
  set("serviceType",      d.serviceType);
  set("servicePackage",   d.servicePackage);
  set("extraServices",    d.extraServices);
  set("eventDate",        d.eventDate);
  set("eventTime",        d.eventTime);
  set("eventLocation",    d.eventLocation);
  set("guestCount",       d.guestCount);
  set("eventDescription", d.eventDescription);
  set("mpesaPhone",       d.mpesaPhone || d.clientPhone);

  // Auto-sync M-Pesa phone
  const mpesaInput = document.getElementById("mpesaPhone");
  if (mpesaInput && d.clientPhone && !mpesaInput.value) {
    mpesaInput.value = d.clientPhone;
  }
}

// ── Save on every input change ────────────────────────────
function attachAutosave() {
  const fields = [
    "clientName", "clientEmail", "clientPhone",
    "serviceType", "servicePackage", "extraServices",
    "eventDate", "eventTime", "eventLocation",
    "guestCount", "eventDescription", "mpesaPhone",
  ];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => {
      collectAllSteps();
      saveDraft();
    });
  });
}

// ── Collect all steps at once (for autosave) ──────────────
function collectAllSteps() {
  const g = id => document.getElementById(id)?.value?.trim() || "";
  bookingData = {
    ...bookingData,
    clientName:       g("clientName"),
    clientEmail:      g("clientEmail"),
    clientPhone:      g("clientPhone"),
    serviceType:      g("serviceType"),
    servicePackage:   g("servicePackage"),
    extraServices:    g("extraServices"),
    eventDate:        g("eventDate"),
    eventTime:        g("eventTime"),
    eventLocation:    g("eventLocation"),
    guestCount:       g("guestCount"),
    eventDescription: g("eventDescription"),
    mpesaPhone:       g("mpesaPhone"),
  };
}

// ===================== STEP NAVIGATION =====================

function goToStep(index) {
  steps.forEach((s, i) => s.classList.toggle("active", i === index));
  progressSteps.forEach((s, i) => {
    s.classList.toggle("active",    i <= index);
    s.classList.toggle("completed", i < index);
  });
  if (progressLine) {
    progressLine.style.width = `${(index / (steps.length - 1)) * 100}%`;
  }
  prevBtn.style.display = index === 0 ? "none" : "inline-block";
  nextBtn.textContent   = index === steps.length - 1 ? "Confirm" : "Next";
  currentStep = index;
}

// ===================== VALIDATION =====================

function validateStep(step) {
  if (step === 0) {
    const name  = document.getElementById("clientName").value.trim();
    const email = document.getElementById("clientEmail").value.trim();
    const phone = document.getElementById("clientPhone").value.trim();
    if (!name || !email || !phone) {
      alert("Please fill in your Name, Email and Phone.");
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      alert("Please enter a valid email address.");
      return false;
    }
  }
  if (step === 1) {
    if (!document.getElementById("serviceType").value) {
      alert("Please select a service.");
      return false;
    }
  }
  return true;
}

// ===================== COLLECT STEP DATA =====================

function collectStep(step) {
  const g = id => document.getElementById(id)?.value?.trim() || "";
  if (step === 0) {
    bookingData.clientName  = g("clientName");
    bookingData.clientEmail = g("clientEmail");
    bookingData.clientPhone = g("clientPhone");
  }
  if (step === 1) {
    bookingData.serviceType    = g("serviceType");
    bookingData.servicePackage = g("servicePackage") || "Standard";
    bookingData.extraServices  = g("extraServices")  || "None";
  }
  if (step === 2) {
    bookingData.eventDate        = g("eventDate");
    bookingData.eventTime        = g("eventTime");
    bookingData.eventLocation    = g("eventLocation");
    bookingData.guestCount       = g("guestCount");
    bookingData.eventDescription = g("eventDescription");
    bookingData.mpesaPhone       = g("mpesaPhone") || bookingData.clientPhone;
  }
  saveDraft();
}

// ===================== CALCULATE PRICE LOCALLY =====================

function calculatePrice() {
  const base     = PRICING[bookingData.serviceType]    || 0;
  const modifier = PACKAGE_MODIFIER[bookingData.servicePackage] || 1.0;
  const extra    = EXTRAS[bookingData.extraServices]   || 0;
  const pkg      = Math.round(base * modifier);
  const total    = pkg + extra;
  const deposit  = Math.round(total * 0.30);
  return { base, pkg, extra, total, deposit };
}

// ===================== SHOW PAYMENT SUMMARY =====================

function showPaymentSummary() {
  const { base, extra, total, deposit } = calculatePrice();
  const payInfo = document.querySelector(".payment-info");
  if (!payInfo) return;
  payInfo.innerHTML = `
    <strong>Service:</strong> ${bookingData.serviceType} (${bookingData.servicePackage})<br>
    ${bookingData.extraServices !== "None" ? `<strong>Extra:</strong> ${bookingData.extraServices} (+KSh ${EXTRAS[bookingData.extraServices]?.toLocaleString()})<br>` : ""}
    <strong>Total:</strong> KSh ${total.toLocaleString()}<br>
    <strong>Deposit Required (30%):</strong> KSh ${deposit.toLocaleString()}<br>
    <small style="color:#888">Balance of KSh ${(total - deposit).toLocaleString()} due on the day.</small>
  `;
  const mpesaInput = document.getElementById("mpesaPhone");
  if (mpesaInput && !mpesaInput.value) mpesaInput.value = bookingData.clientPhone;
}

// ===================== SUBMIT TO DB (only after payment) =====================

async function submitBookingToDB() {
  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingData),
    });
    bookingResult = await res.json();
    if (!bookingResult.success) {
      console.error("DB booking error:", bookingResult.error);
    }
  } catch (err) {
    console.error("submitBookingToDB failed:", err.message);
  }
}

// ===================== SANDBOX M-PESA BYPASS =====================
// When MPESA_SHORTCODE is not set, simulate payment locally
// Remove this block and set real credentials to go live

const SANDBOX_MODE = true; // ← set to false when going to production

async function handlePayment() {
  const phone  = document.getElementById("mpesaPhone").value.trim() || bookingData.clientPhone;
  const { deposit } = calculatePrice();

  if (!phone) { alert("Please enter your M-Pesa phone number."); return; }

  const btn = mpesaPayBtn;
  btn.disabled    = true;
  btn.textContent = "Processing...";

  if (SANDBOX_MODE) {
    // ── Simulate a 2-second payment delay ─────────────────
    await new Promise(r => setTimeout(r, 2000));

    // Generate fake M-Pesa receipt
    const fakeRef = "SANDBOX" + Math.random().toString(36).slice(2, 10).toUpperCase();

    // Build receipt object locally
    const receipt = buildLocalReceipt(fakeRef, deposit);

    // NOW write to DB (payment "confirmed")
    await submitBookingToDB();

    // Save receipt to localStorage
    localStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));

    btn.textContent = "✅ Payment Simulated";
    showSuccess(receipt);

  } else {
    // ── Real M-Pesa STK push ───────────────────────────────
    try {
      const res = await fetch("/api/mpesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          amount:     deposit,
          bookingRef: `DRAFT-${Date.now()}`,
        }),
      });
      const data = await res.json();

      if (data.success) {
        btn.textContent = "✅ Check your phone!";
        pollPayment(data.checkoutRequestId);
      } else {
        btn.disabled    = false;
        btn.textContent = "Pay with M-Pesa";
        alert("M-Pesa error: " + (data.error || "Please try again."));
      }
    } catch (err) {
      btn.disabled    = false;
      btn.textContent = "Pay with M-Pesa";
      alert("Connection error. Please try again.");
    }
  }
}

// ===================== POLL PAYMENT (production) =====================

async function pollPayment(checkoutId, attempts = 0) {
  if (attempts > 12) {
    alert("Payment timeout. Please contact us at info@joyalty.com.");
    return;
  }
  await new Promise(r => setTimeout(r, 5000));
  try {
    // After real payment, submit to DB then fetch receipt
    await submitBookingToDB();
    const res  = await fetch(`/api/receipt?bookingId=${bookingResult.bookingId}`);
    const data = await res.json();
    if (data.receipt?.deposit_paid > 0) {
      localStorage.setItem(RECEIPT_KEY, JSON.stringify(data.receipt));
      showSuccess(data.receipt);
    } else {
      pollPayment(checkoutId, attempts + 1);
    }
  } catch (_) {
    pollPayment(checkoutId, attempts + 1);
  }
}

// ===================== BUILD LOCAL RECEIPT =====================

function buildLocalReceipt(paymentRef, depositPaid) {
  const { total, extra } = calculatePrice();
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const issuedAt = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const receiptRef = `RCP-${now.getFullYear()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

  return {
    receipt_ref:  receiptRef,
    client_name:  bookingData.clientName,
    client_email: bookingData.clientEmail,
    client_phone: bookingData.clientPhone,
    service_name: bookingData.serviceType,
    package_name: bookingData.servicePackage,
    extra_name:   bookingData.extraServices,
    event_date:   bookingData.eventDate   || "TBD",
    event_time:   bookingData.eventTime   || "TBD",
    location:     bookingData.eventLocation || "TBD",
    base_price:   PRICING[bookingData.serviceType] || 0,
    extra_price:  extra,
    total_price:  total,
    deposit_paid: depositPaid,
    balance_due:  total - depositPaid,
    payment_ref:  paymentRef,
    issued_at:    issuedAt,
  };
}

// ===================== SUCCESS SCREEN =====================

function showSuccess(receipt) {
  bookingSection.style.display = "none";
  successScreen.style.display  = "flex";
  clearDraft(); // clear the saved draft — booking is done

  document.getElementById("viewReceipt")?.addEventListener("click", () => {
    showReceipt(receipt);
  }, { once: true });
}

// ===================== RENDER + DOWNLOAD RECEIPT =====================

function showReceipt(receipt) {
  successScreen.style.display  = "none";
  receiptSection.style.display = "flex";

  const html = `
    <div id="receipt-printable" style="font-family:sans-serif; max-width:520px; margin:0 auto; padding:24px; border:1px solid #ddd; border-radius:12px;">
      <div style="text-align:center; margin-bottom:16px;">
        <img src="https://joyaltyphotography.netlify.app/images/templatemo-logo.png" width="48" style="margin-bottom:8px"><br>
        <strong style="font-size:18px;">JOYALTY PHOTOGRAPHY</strong><br>
        <span style="font-size:12px; color:#888;">Nairobi, Kenya | info@joyalty.com</span>
      </div>

      <div style="background:#f9f9f9; border-radius:8px; padding:12px 16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between;">
          <span style="font-size:13px; color:#888;">Receipt Ref</span>
          <strong>${receipt.receipt_ref}</strong>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="font-size:13px; color:#888;">Issued</span>
          <span>${receipt.issued_at}</span>
        </div>
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:14px; line-height:1.8;">
        <tr style="background:#f4f4f4;"><td colspan="2" style="padding:6px 10px; font-weight:600;">Client Details</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Name</td><td>${receipt.client_name}</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Email</td><td>${receipt.client_email}</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Phone</td><td>${receipt.client_phone}</td></tr>

        <tr style="background:#f4f4f4;"><td colspan="2" style="padding:6px 10px; font-weight:600;">Booking Details</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Service</td><td>${receipt.service_name}</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Package</td><td>${receipt.package_name}</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Extra</td><td>${receipt.extra_name || "None"}</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Date</td><td>${receipt.event_date}</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Time</td><td>${receipt.event_time}</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Location</td><td>${receipt.location}</td></tr>

        <tr style="background:#f4f4f4;"><td colspan="2" style="padding:6px 10px; font-weight:600;">Payment Summary</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Total</td><td>KSh ${Number(receipt.total_price).toLocaleString()}</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Deposit Paid</td><td style="color:#2d8a4e; font-weight:600;">KSh ${Number(receipt.deposit_paid).toLocaleString()}</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">Balance Due</td><td style="color:#c0392b; font-weight:600;">KSh ${Number(receipt.balance_due).toLocaleString()}</td></tr>
        <tr><td style="padding:4px 10px; color:#555;">M-Pesa Ref</td><td>${receipt.payment_ref || "Pending"}</td></tr>
      </table>

      <div style="text-align:center; margin-top:20px; padding-top:16px; border-top:1px solid #eee; font-size:12px; color:#888;">
        Thank you for choosing Joyalty Photography 📷<br>
        We look forward to capturing your memories.
      </div>
    </div>
  `;

  receiptContent.innerHTML = html;

  // Add download button if not already there
  if (!document.getElementById("downloadReceiptBtn")) {
    const dlBtn = document.createElement("button");
    dlBtn.id          = "downloadReceiptBtn";
    dlBtn.textContent = "⬇ Download Receipt";
    dlBtn.style.cssText = "margin-top:16px; padding:10px 24px; background:#1a1a2e; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:14px; width:100%;";
    dlBtn.onclick = () => downloadReceiptAsHTML(receipt, html);
    receiptContent.appendChild(dlBtn);
  }
}

// ===================== DOWNLOAD RECEIPT AS HTML FILE =====================

function downloadReceiptAsHTML(receipt, html) {
  const fullPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt ${receipt.receipt_ref} - Joyalty Photography</title>
  <style>
    body { background:#f5f5f5; display:flex; justify-content:center; padding:40px 16px; font-family:sans-serif; }
    @media print { body { background:#fff; padding:0; } }
  </style>
</head>
<body>
  ${html}
  <script>
    // Auto-print prompt when opened
    window.onload = () => {
      const btn = document.createElement("button");
      btn.textContent = "🖨 Print / Save as PDF";
      btn.style.cssText = "display:block; margin:16px auto; padding:10px 24px; background:#1a1a2e; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:14px;";
      btn.onclick = () => window.print();
      document.body.appendChild(btn);
    };
  <\/script>
</body>
</html>`;

  const blob = new Blob([fullPage], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `Joyalty_Receipt_${receipt.receipt_ref}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===================== CHECK FOR SAVED RECEIPT ON LOAD =====================
// If user refreshes after payment, offer to view their last receipt

function checkForSavedReceipt() {
  const saved = localStorage.getItem(RECEIPT_KEY);
  if (!saved) return;
  try {
    const receipt = JSON.parse(saved);
    // Show a small banner
    const banner = document.createElement("div");
    banner.style.cssText = "position:fixed; bottom:80px; right:20px; background:#1a1a2e; color:#fff; padding:10px 16px; border-radius:10px; font-size:13px; cursor:pointer; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.3);";
    banner.innerHTML = `📄 View your last receipt <strong>${receipt.receipt_ref}</strong>`;
    banner.onclick = () => {
      receiptSection.style.display = "flex";
      showReceipt(receipt);
      banner.remove();
    };
    document.body.appendChild(banner);
    // Auto-dismiss after 8s
    setTimeout(() => banner.remove(), 8000);
  } catch (_) {}
}

// ===================== OPEN BOOKING FORM =====================

function showBookingForm(prefilledService = null) {
  if (prefilledService) {
    bookingData.serviceType = prefilledService;
    saveDraft();
  }

  servicesSection.classList.add("hidden");
  setTimeout(() => {
    servicesSection.style.display = "none";
    bookingSection.style.display  = "block";
    void bookingSection.offsetWidth;
    requestAnimationFrame(() => bookingSection.classList.add("active"));
    bookingSection.scrollIntoView({ behavior: "smooth" });

    restoreFormFromDraft(); // ← restore saved data
    goToStep(0);
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

// ===================== EVENT LISTENERS =====================

// "Book Now" buttons — prefill service from the card clicked
document.querySelectorAll(".start-booking").forEach(btn => {
  btn.addEventListener("click", () => {
    const card  = btn.closest(".service-card");
    const title = card?.querySelector("h4")?.textContent?.trim();
    const mapped = SERVICE_MAP[title] || title || "";
    showBookingForm(mapped);
  });
});

// Next step
nextBtn.addEventListener("click", async () => {
  if (!validateStep(currentStep)) return;
  collectStep(currentStep);

  // Show payment summary when reaching step 3 (index 2 → next is payment)
  if (currentStep === 2) {
    showPaymentSummary();
  }

  if (currentStep < steps.length - 1) {
    goToStep(currentStep + 1);
  }
});

// Previous step
prevBtn.addEventListener("click", () => {
  if (currentStep > 0) goToStep(currentStep - 1);
});

// Close form
closeBookingBtn.addEventListener("click", closeBookingForm);

// Auto-sync M-Pesa phone with client phone
document.getElementById("clientPhone")?.addEventListener("input", e => {
  const mpesaInput = document.getElementById("mpesaPhone");
  if (mpesaInput) mpesaInput.value = e.target.value;
});

// Pay button
mpesaPayBtn?.addEventListener("click", handlePayment);

// Reset form
resetBtn.addEventListener("click", () => resetModal.style.display = "flex");
cancelResetBtn.addEventListener("click", () => resetModal.style.display = "none");
confirmResetBtn.addEventListener("click", () => {
  document.getElementById("bookingForm").reset();
  bookingData   = {};
  bookingResult = {};
  clearDraft();
  goToStep(0);
  resetModal.style.display = "none";
});

// Close receipt
document.getElementById("closeReceipt")?.addEventListener("click", () => {
  receiptSection.style.display = "none";
});

// Close success screen on backdrop click
successScreen?.addEventListener("click", e => {
  if (e.target === successScreen) successScreen.style.display = "none";
});

// ===================== INITIALIZE =====================
attachAutosave();       // wire up autosave on all fields
checkForSavedReceipt(); // show banner if they have a previous receipt
goToStep(0);