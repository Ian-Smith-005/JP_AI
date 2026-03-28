/* ============================================================
   services-booking.js
   Wires services.html multi-step form to:
   - /api/bookings  (create booking + receipt in DB)
   - /api/mpesa     (trigger STK push)
   - /api/receipt   (fetch and render receipt)
============================================================ */

// ── State ─────────────────────────────────────────────────────
let currentStep  = 0;
let bookingData  = {};  // accumulates form data across steps
let bookingResult = {}; // response from /api/bookings

// ── DOM refs ──────────────────────────────────────────────────
const steps       = document.querySelectorAll(".form-step");
const progressSteps = document.querySelectorAll(".progress-step");
const progressLine  = document.getElementById("progressLine");
const nextBtn     = document.getElementById("nextStep");
const prevBtn     = document.getElementById("prevStep");
const resetBtn    = document.getElementById("resetForm");
const bookingSection = document.getElementById("booking-form-section");
const successScreen  = document.getElementById("successScreen");
const receiptSection = document.getElementById("receiptSection");
const receiptContent = document.getElementById("receiptContent");

// ── Open booking form from service cards ──────────────────────
document.querySelectorAll(".start-booking").forEach((btn) => {
  btn.addEventListener("click", () => {
    // Pre-fill service from the card if possible
    const card = btn.closest(".service-card");
    if (card) {
      const serviceTitle = card.querySelector("h4")?.textContent?.trim();
      const serviceSelect = document.getElementById("serviceType");
      if (serviceSelect && serviceTitle) {
        // Map card titles to select values
        const map = {
          "Wedding Photography":    "Wedding Photography",
          "Portrait Sessions":      "Portrait Session",
          "Commercial Photography": "Commercial Photography",
          "Event Coverage":         "Event Coverage",
          "Engagement Shoots":      "Engagement Shoot",
          "Family Photography":     "Family Photography",
        };
        serviceSelect.value = map[serviceTitle] || "";
      }
    }
    showBookingForm();
  });
});

function showBookingForm() {
  bookingSection.style.display = "block";
  bookingSection.scrollIntoView({ behavior: "smooth" });
  goToStep(0);
}

// ── Close booking form ────────────────────────────────────────
document.getElementById("closeBooking")?.addEventListener("click", () => {
  bookingSection.style.display = "none";
});

// ── Step navigation ───────────────────────────────────────────
function goToStep(index) {
  steps.forEach((s, i) => s.classList.toggle("active", i === index));
  progressSteps.forEach((s, i) => {
    s.classList.toggle("active", i <= index);
    s.classList.toggle("completed", i < index);
  });

  // Progress line width
  if (progressLine) {
    const pct = (index / (steps.length - 1)) * 100;
    progressLine.style.width = pct + "%";
  }

  prevBtn.style.display = index === 0 ? "none" : "inline-block";
  nextBtn.textContent   = index === steps.length - 1 ? "Confirm" : "Next";
  currentStep = index;
}

nextBtn?.addEventListener("click", async () => {
  if (!validateStep(currentStep)) return;
  collectStep(currentStep);

  if (currentStep === steps.length - 2) {
    // About to show Step 4 (payment) — submit booking to DB first
    await submitBooking();
  }

  if (currentStep < steps.length - 1) {
    goToStep(currentStep + 1);
  }
});

prevBtn?.addEventListener("click", () => {
  if (currentStep > 0) goToStep(currentStep - 1);
});

// ── Validate each step ────────────────────────────────────────
function validateStep(step) {
  if (step === 0) {
    const name  = document.getElementById("clientName").value.trim();
    const email = document.getElementById("clientEmail").value.trim();
    const phone = document.getElementById("clientPhone").value.trim();
    if (!name || !email || !phone) {
      alert("Please fill in all personal details.");
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      alert("Please enter a valid email address.");
      return false;
    }
  }
  if (step === 1) {
    const service = document.getElementById("serviceType").value;
    if (!service) {
      alert("Please select a service.");
      return false;
    }
  }
  return true;
}

// ── Collect form data per step ────────────────────────────────
function collectStep(step) {
  if (step === 0) {
    bookingData.clientName  = document.getElementById("clientName").value.trim();
    bookingData.clientEmail = document.getElementById("clientEmail").value.trim();
    bookingData.clientPhone = document.getElementById("clientPhone").value.trim();
  }
  if (step === 1) {
    bookingData.serviceType     = document.getElementById("serviceType").value;
    bookingData.servicePackage  = document.getElementById("servicePackage").value;
    bookingData.extraServices   = document.getElementById("extraServices").value;
  }
  if (step === 2) {
    bookingData.eventDate        = document.getElementById("eventDate").value;
    bookingData.eventTime        = document.getElementById("eventTime").value;
    bookingData.eventLocation    = document.getElementById("eventLocation").value.trim();
    bookingData.guestCount       = document.getElementById("guestCount").value;
    bookingData.eventDescription = document.getElementById("eventDescription").value.trim();
    bookingData.mpesaPhone       = document.getElementById("mpesaPhone")?.value?.trim()
                                    || bookingData.clientPhone;
  }
}

// ── Submit booking to /api/bookings ───────────────────────────
async function submitBooking() {
  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingData),
    });
    bookingResult = await res.json();

    if (!bookingResult.success) {
      alert("Booking error: " + bookingResult.error);
      return;
    }

    // Pre-fill M-Pesa phone and show amount
    const mpesaInput = document.getElementById("mpesaPhone");
    if (mpesaInput && !mpesaInput.value) {
      mpesaInput.value = bookingData.clientPhone;
    }

    // Show deposit amount in payment step
    const payInfo = document.querySelector(".payment-info");
    if (payInfo && bookingResult.depositAmount) {
      payInfo.innerHTML = `
        <strong>Booking Ref:</strong> ${bookingResult.bookingRef}<br>
        <strong>Total:</strong> KSh ${bookingResult.totalPrice?.toLocaleString()}<br>
        <strong>Deposit (30%):</strong> KSh ${bookingResult.depositAmount?.toLocaleString()}<br>
        Pay via <strong>M-Pesa STK Push</strong> to secure your booking.
      `;
    }
  } catch (err) {
    console.error("submitBooking error:", err);
    alert("Could not connect to the booking system. Please try again.");
  }
}

// ── M-Pesa STK push ───────────────────────────────────────────
document.getElementById("mpesaPayBtn")?.addEventListener("click", async () => {
  const phone  = document.getElementById("mpesaPhone").value.trim() || bookingData.clientPhone;
  const amount = bookingResult.depositAmount || 1000;

  if (!phone) {
    alert("Please enter your M-Pesa phone number.");
    return;
  }

  const btn = document.getElementById("mpesaPayBtn");
  btn.disabled = true;
  btn.textContent = "Sending request...";

  try {
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

    const data = await res.json();

    if (data.success) {
      btn.textContent = "✅ Check your phone!";
      // Poll for payment confirmation every 5s for 60s
      pollPayment(bookingResult.bookingId);
    } else {
      btn.disabled = false;
      btn.textContent = "Retry M-Pesa";
      alert("M-Pesa error: " + (data.error || "Please try again."));
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Retry M-Pesa";
    alert("Connection error. Please try again.");
  }
});

// ── Poll for payment success (every 5s, max 12 attempts) ──────
async function pollPayment(bookingId, attempts = 0) {
  if (attempts > 12) return;

  await new Promise(r => setTimeout(r, 5000));

  try {
    const res  = await fetch(`/api/receipt?bookingId=${bookingId}`);
    const data = await res.json();

    if (data.receipt?.deposit_paid > 0) {
      showSuccess(data.receipt);
    } else {
      pollPayment(bookingId, attempts + 1);
    }
  } catch (_) {
    pollPayment(bookingId, attempts + 1);
  }
}

// ── Show success screen ───────────────────────────────────────
function showSuccess(receipt) {
  bookingSection.style.display = "none";
  successScreen.style.display  = "flex";

  document.getElementById("viewReceipt")?.addEventListener("click", () => {
    showReceipt(receipt);
  });
}

// ── Render receipt ────────────────────────────────────────────
function showReceipt(receipt) {
  successScreen.style.display  = "none";
  receiptSection.style.display = "flex";

  receiptContent.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td><strong>Receipt Ref</strong></td><td>${receipt.receipt_ref}</td></tr>
      <tr><td><strong>Client</strong></td><td>${receipt.client_name}</td></tr>
      <tr><td><strong>Email</strong></td><td>${receipt.client_email}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${receipt.client_phone}</td></tr>
      <tr><td colspan="2"><hr></td></tr>
      <tr><td><strong>Service</strong></td><td>${receipt.service_name}</td></tr>
      <tr><td><strong>Package</strong></td><td>${receipt.package_name}</td></tr>
      <tr><td><strong>Extra</strong></td><td>${receipt.extra_name}</td></tr>
      <tr><td><strong>Date</strong></td><td>${receipt.event_date || "TBD"}</td></tr>
      <tr><td><strong>Time</strong></td><td>${receipt.event_time || "TBD"}</td></tr>
      <tr><td><strong>Location</strong></td><td>${receipt.location || "TBD"}</td></tr>
      <tr><td colspan="2"><hr></td></tr>
      <tr><td><strong>Total</strong></td><td>KSh ${Number(receipt.total_price).toLocaleString()}</td></tr>
      <tr><td><strong>Deposit Paid</strong></td><td>KSh ${Number(receipt.deposit_paid).toLocaleString()}</td></tr>
      <tr><td><strong>Balance Due</strong></td><td>KSh ${Number(receipt.balance_due).toLocaleString()}</td></tr>
      <tr><td><strong>M-Pesa Ref</strong></td><td>${receipt.payment_ref || "Pending"}</td></tr>
      <tr><td colspan="2"><hr></td></tr>
      <tr><td colspan="2" style="text-align:center;color:#888;font-size:12px">
        Thank you for choosing Joyalty Photography 📷<br>
        info@joyalty.com | +254 XXX XXX | Nairobi, Kenya
      </td></tr>
    </table>
  `;
}

document.getElementById("closeReceipt")?.addEventListener("click", () => {
  receiptSection.style.display = "none";
});

// ── Reset form ────────────────────────────────────────────────
const resetModal   = document.getElementById("resetModal");
const confirmReset = document.getElementById("confirmReset");
const cancelReset  = document.getElementById("cancelReset");

resetBtn?.addEventListener("click", () => {
  resetModal.style.display = "flex";
});
cancelReset?.addEventListener("click", () => {
  resetModal.style.display = "none";
});
confirmReset?.addEventListener("click", () => {
  document.getElementById("bookingForm").reset();
  bookingData   = {};
  bookingResult = {};
  goToStep(0);
  resetModal.style.display = "none";
});