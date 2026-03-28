/* =====================================================
   JOYALTY BOOKING SYSTEM - CLEAN DB VERSION (2026)
   Features: DB Integration + Smooth Animations + UX Polish
===================================================== */

let currentStep = 0;
let bookingData = {};      // Form data accumulator
let bookingResult = {};    // Response from /api/bookings

// ── DOM Elements ─────────────────────────────────────
const form = document.getElementById("bookingForm");
const steps = document.querySelectorAll(".form-step");
const progressSteps = document.querySelectorAll(".progress-step");
const progressLine = document.getElementById("progressLine");

const nextBtn = document.getElementById("nextStep");
const prevBtn = document.getElementById("prevStep");
const resetBtn = document.getElementById("resetForm");

const bookingSection = document.getElementById("booking-form-section");
const servicesSection = document.getElementById("services-section");
const successScreen = document.getElementById("successScreen");
const receiptSection = document.getElementById("receiptSection");
const receiptContent = document.getElementById("receiptContent");

const resetModal = document.getElementById("resetModal");
const confirmResetBtn = document.getElementById("confirmReset");
const cancelResetBtn = document.getElementById("cancelReset");
const closeBookingBtn = document.getElementById("closeBooking");

const clientPhone = document.getElementById("clientPhone");
const mpesaPhone = document.getElementById("mpesaPhone");
const mpesaPayBtn = document.getElementById("mpesaPayBtn");

// ── Utility: Show Step ───────────────────────────────────
function goToStep(index) {
    steps.forEach((s, i) => s.classList.toggle("active", i === index));

    progressSteps.forEach((s, i) => {
        s.classList.toggle("active", i <= index);
        s.classList.toggle("completed", i < index);
    });

    const percent = (index / (steps.length - 1)) * 100;
    if (progressLine) progressLine.style.width = `${percent}%`;

    prevBtn.style.display = index === 0 ? "none" : "inline-block";
    nextBtn.textContent = index === steps.length - 1 ? "Confirm" : "Next";

    currentStep = index;
}

// ── Validation ───────────────────────────────────────────
function validateStep(step) {
    if (step === 0) {
        const name = document.getElementById("clientName").value.trim();
        const email = document.getElementById("clientEmail").value.trim();
        const phone = document.getElementById("clientPhone").value.trim();

        if (!name || !email || !phone) {
            alert("Please fill in all personal details (Name, Email, Phone).");
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

// ── Collect data from current step ───────────────────────
function collectStep(step) {
    if (step === 0) {
        bookingData.clientName = document.getElementById("clientName").value.trim();
        bookingData.clientEmail = document.getElementById("clientEmail").value.trim();
        bookingData.clientPhone = document.getElementById("clientPhone").value.trim();
    }
    if (step === 1) {
        bookingData.serviceType = document.getElementById("serviceType").value;
        bookingData.servicePackage = document.getElementById("servicePackage").value;
        bookingData.extraServices = document.getElementById("extraServices").value || "";
    }
    if (step === 2) {
        bookingData.eventDate = document.getElementById("eventDate").value;
        bookingData.eventTime = document.getElementById("eventTime").value;
        bookingData.eventLocation = document.getElementById("eventLocation").value.trim();
        bookingData.guestCount = document.getElementById("guestCount").value || null;
        bookingData.eventDescription = document.getElementById("eventDescription").value.trim();
        bookingData.mpesaPhone = mpesaPhone?.value.trim() || bookingData.clientPhone;
    }
}

// ── Submit booking to backend ────────────────────────────
async function submitBooking() {
    try {
        const res = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bookingData),
        });

        bookingResult = await res.json();

        if (!bookingResult.success) {
            alert("Booking error: " + (bookingResult.error || "Unknown error"));
            return false;
        }

        // Auto-fill M-Pesa phone
        if (mpesaPhone && !mpesaPhone.value) {
            mpesaPhone.value = bookingData.clientPhone;
        }

        // Show pricing info in payment step
        const payInfo = document.querySelector(".payment-info");
        if (payInfo && bookingResult.depositAmount) {
            payInfo.innerHTML = `
                <strong>Booking Ref:</strong> ${bookingResult.bookingRef}<br>
                <strong>Total:</strong> KSh ${bookingResult.totalPrice?.toLocaleString() || 0}<br>
                <strong>Deposit (30%):</strong> KSh ${bookingResult.depositAmount?.toLocaleString()}<br>
                <small>Pay via M-Pesa STK Push to secure your booking.</small>
            `;
        }
        return true;
    } catch (err) {
        console.error("submitBooking error:", err);
        alert("Could not connect to the server. Please try again.");
        return false;
    }
}

// ── M-Pesa Payment Handler ───────────────────────────────
if (mpesaPayBtn) {
    mpesaPayBtn.addEventListener("click", async () => {
        const phone = mpesaPhone.value.trim() || bookingData.clientPhone;
        const amount = bookingResult.depositAmount || 1000;

        if (!phone) {
            alert("Please enter your M-Pesa phone number.");
            return;
        }

        const btn = mpesaPayBtn;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Sending M-Pesa request...";

        try {
            const res = await fetch("/api/mpesa", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone,
                    amount,
                    bookingId: bookingResult.bookingId,
                    bookingRef: bookingResult.bookingRef,
                }),
            });

            const data = await res.json();

            if (data.success) {
                btn.textContent = "✅ Check your phone for STK Push!";
                pollPayment(bookingResult.bookingId);
            } else {
                btn.disabled = false;
                btn.textContent = originalText;
                alert("M-Pesa error: " + (data.error || "Please try again."));
            }
        } catch (err) {
            btn.disabled = false;
            btn.textContent = originalText;
            alert("Connection error. Please try again.");
        }
    });
}

// ── Poll for payment confirmation ────────────────────────
async function pollPayment(bookingId, attempts = 0) {
    if (attempts > 12) {
        alert("Payment confirmation timeout. Please check your M-Pesa and contact us.");
        return;
    }

    await new Promise(r => setTimeout(r, 5000));

    try {
        const res = await fetch(`/api/receipt?bookingId=${bookingId}`);
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

// ── Show Success Screen ──────────────────────────────────
function showSuccess(receipt) {
    bookingSection.style.display = "none";
    successScreen.style.display = "flex";

    document.getElementById("viewReceipt")?.addEventListener("click", () => {
        showReceipt(receipt);
    }, { once: true });
}

// ── Render Receipt ───────────────────────────────────────
function showReceipt(receipt) {
    successScreen.style.display = "none";
    receiptSection.style.display = "flex";

    receiptContent.innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:14px; line-height:1.6;">
            <tr><td><strong>Receipt Ref</strong></td><td>${receipt.receipt_ref}</td></tr>
            <tr><td><strong>Client</strong></td><td>${receipt.client_name}</td></tr>
            <tr><td><strong>Email</strong></td><td>${receipt.client_email}</td></tr>
            <tr><td><strong>Phone</strong></td><td>${receipt.client_phone}</td></tr>
            <tr><td colspan="2"><hr></td></tr>
            <tr><td><strong>Service</strong></td><td>${receipt.service_name}</td></tr>
            <tr><td><strong>Package</strong></td><td>${receipt.package_name}</td></tr>
            <tr><td><strong>Extra Services</strong></td><td>${receipt.extra_name || "None"}</td></tr>
            <tr><td><strong>Date</strong></td><td>${receipt.event_date || "TBD"}</td></tr>
            <tr><td><strong>Time</strong></td><td>${receipt.event_time || "TBD"}</td></tr>
            <tr><td><strong>Location</strong></td><td>${receipt.location || "TBD"}</td></tr>
            <tr><td colspan="2"><hr></td></tr>
            <tr><td><strong>Total</strong></td><td>KSh ${Number(receipt.total_price).toLocaleString()}</td></tr>
            <tr><td><strong>Deposit Paid</strong></td><td>KSh ${Number(receipt.deposit_paid).toLocaleString()}</td></tr>
            <tr><td><strong>Balance Due</strong></td><td>KSh ${Number(receipt.balance_due).toLocaleString()}</td></tr>
            <tr><td><strong>M-Pesa Ref</strong></td><td>${receipt.payment_ref || "Pending"}</td></tr>
            <tr><td colspan="2"><hr></td></tr>
            <tr><td colspan="2" style="text-align:center; color:#666; font-size:13px;">
                Thank you for choosing Joyalty Photography 📷<br>
                info@joyalty.com | +254 XXX XXX XXX | Nairobi, Kenya
            </td></tr>
        </table>
    `;
}

// ── Open Booking Form with Animation ─────────────────────
function showBookingForm() {
    servicesSection.classList.add("hidden");

    setTimeout(() => {
        servicesSection.style.display = "none";
        bookingSection.style.display = "block";

        setTimeout(() => {
            bookingSection.classList.add("active");
            goToStep(0);
            bookingSection.scrollIntoView({ behavior: "smooth" });
        }, 50);
    }, 300);
}

// ── Close Booking Form with Animation ────────────────────
function closeBookingForm() {
    bookingSection.classList.remove("active");

    setTimeout(() => {
        bookingSection.style.display = "none";
        servicesSection.style.display = "block";

        setTimeout(() => {
            servicesSection.classList.remove("hidden");
            servicesSection.scrollIntoView({ behavior: "smooth" });
        }, 50);
    }, 300);
}

// ── Service Card Click Handlers ──────────────────────────
document.querySelectorAll(".start-booking").forEach((btn) => {
    btn.addEventListener("click", () => {
        const card = btn.closest(".service-card");
        if (card) {
            const serviceTitle = card.querySelector("h4")?.textContent?.trim();
            const serviceSelect = document.getElementById("serviceType");

            if (serviceSelect && serviceTitle) {
                const map = {
                    "Wedding Photography": "Wedding Photography",
                    "Portrait Sessions": "Portrait Session",
                    "Commercial Photography": "Commercial Photography",
                    "Event Coverage": "Event Coverage",
                    "Engagement Shoots": "Engagement Shoot",
                    "Family Photography": "Family Photography",
                };
                serviceSelect.value = map[serviceTitle] || serviceTitle;
            }
        }
        showBookingForm();
    });
});

// ── Navigation Buttons ───────────────────────────────────
nextBtn?.addEventListener("click", async () => {
    if (!validateStep(currentStep)) return;
    collectStep(currentStep);

    // Submit to DB just before payment step
    if (currentStep === steps.length - 2) {
        const success = await submitBooking();
        if (!success) return;
    }

    if (currentStep < steps.length - 1) {
        goToStep(currentStep + 1);
    }
});

prevBtn?.addEventListener("click", () => {
    if (currentStep > 0) goToStep(currentStep - 1);
});

// ── Auto-fill M-Pesa ─────────────────────────────────────
clientPhone?.addEventListener("input", () => {
    if (mpesaPhone) mpesaPhone.value = clientPhone.value;
});

// ── Reset Form ───────────────────────────────────────────
resetBtn?.addEventListener("click", () => {
    resetModal.style.display = "flex";
});

cancelResetBtn?.addEventListener("click", () => {
    resetModal.style.display = "none";
});

confirmResetBtn?.addEventListener("click", () => {
    form.reset();
    bookingData = {};
    bookingResult = {};
    goToStep(0);
    resetModal.style.display = "none";
});

// Close modal when clicking outside
window.addEventListener("click", (e) => {
    if (e.target === resetModal) resetModal.style.display = "none";
});

// ── Close Booking Button ─────────────────────────────────
closeBookingBtn?.addEventListener("click", closeBookingForm);

// ── Receipt Close ────────────────────────────────────────
document.getElementById("closeReceipt")?.addEventListener("click", () => {
    receiptSection.style.display = "none";
});

// ── Initialize ───────────────────────────────────────────
goToStep(0);