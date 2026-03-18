/* =====================================================
   JOYALTY BOOKING SYSTEM (CLEAN VERSION)
===================================================== */


/* =====================================================
   1. GLOBAL VARIABLES & ELEMENTS
===================================================== */

const STORAGE_KEY = "bookingData";

let bookingData = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

const form = document.getElementById("bookingForm");
const steps = document.querySelectorAll(".form-step");
const progressSteps = document.querySelectorAll(".progress-step");
const progressLine = document.getElementById("progressLine");

const nextBtn = document.getElementById("nextStep");
const prevBtn = document.getElementById("prevStep");

const bookingSection = document.getElementById("booking-form-section");
const servicesSection = document.getElementById("services-section");
const bookingButtons = document.querySelectorAll(".start-booking");

const resetBtn = document.getElementById("resetForm");
const resetModal = document.getElementById("resetModal");
const confirmResetBtn = document.getElementById("confirmReset");
const cancelResetBtn = document.getElementById("cancelReset");

const closeBooking = document.getElementById("closeBooking");

const clientPhone = document.getElementById("clientPhone");
const mpesaPhone = document.getElementById("mpesaPhone");

let currentStep = 0;


/* =====================================================
   2. LOCAL STORAGE (SAVE & RESTORE)
===================================================== */

// Save all inputs
function saveToStorage() {
    const inputs = form.querySelectorAll("input, select, textarea");

    inputs.forEach(input => {
        bookingData[input.id] = input.value;
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookingData));
}

// Restore saved data
function restoreFromStorage() {
    Object.keys(bookingData).forEach(key => {
        const field = document.getElementById(key);
        if (field) field.value = bookingData[key];
    });
}

// Auto-save on input
form.querySelectorAll("input, select, textarea").forEach(input => {
    input.addEventListener("input", saveToStorage);
});


/* =====================================================
   3. FORM STEP CONTROL
===================================================== */

function showStep(step) {
    steps.forEach(s => s.classList.remove("active"));
    steps[step].classList.add("active");

    progressSteps.forEach(p => p.classList.remove("active"));
    for (let i = 0; i <= step; i++) {
        progressSteps[i].classList.add("active");
    }

    const percent = (step / (steps.length - 1)) * 100;
    progressLine.style.width = percent + "%";

    prevBtn.style.display = step === 0 ? "none" : "inline-block";
    nextBtn.innerText = step === steps.length - 1 ? "Finish" : "Next";
}


/* =====================================================
   4. VALIDATION SYSTEM
===================================================== */

function showError(input, message) {
    input.classList.add("input-error");

    let error = input.parentElement.querySelector(".error-text");

    if (!error) {
        error = document.createElement("small");
        error.className = "error-text";
        input.parentElement.appendChild(error);
    }

    error.innerText = message;
}

function clearError(input) {
    input.classList.remove("input-error");

    let error = input.parentElement.querySelector(".error-text");
    if (error) error.remove();
}

function validateStep() {
    const inputs = steps[currentStep].querySelectorAll("input, select, textarea");

    let valid = true;

    inputs.forEach(input => {
        clearError(input);

        if (input.hasAttribute("required") && input.value.trim() === "") {
            showError(input, "This field is required");
            valid = false;
        }

        if (input.type === "email") {
            const pattern = /^\S+@\S+\.\S+$/;
            if (input.value && !pattern.test(input.value)) {
                showError(input, "Enter a valid email");
                valid = false;
            }
        }

        if (input.type === "tel") {
            const pattern = /^[0-9+\s]{10,15}$/;
            if (input.value && !pattern.test(input.value)) {
                showError(input, "Enter a valid phone number");
                valid = false;
            }
        }
    });

    return valid;
}


/* =====================================================
   5. STEP NAVIGATION BUTTONS
===================================================== */

nextBtn.addEventListener("click", () => {
    if (!validateStep()) return;

    saveToStorage();

    if (currentStep < steps.length - 1) {
        currentStep++;
        showStep(currentStep);
    }
});

prevBtn.addEventListener("click", () => {
    if (currentStep > 0) {
        currentStep--;
        showStep(currentStep);
    }
});

// Allow clicking progress steps
progressSteps.forEach((step, index) => {
    step.addEventListener("click", () => {
        if (index > currentStep && !validateStep()) return;

        currentStep = index;
        showStep(currentStep);
    });
});


/* =====================================================
   6. AUTO-FILL MPESA PHONE
===================================================== */

clientPhone.addEventListener("input", () => {
    mpesaPhone.value = clientPhone.value;
    saveToStorage();
});


/* =====================================================
   7. SERVICE SELECTION + SHOW FORM
===================================================== */

bookingButtons.forEach(button => {
    button.addEventListener("click", () => {

        // Get selected service
        const card = button.closest(".service-card");
        const serviceName = card.querySelector("h4").textContent.trim();

        document.getElementById("serviceType").value = serviceName;

        // Show form
        servicesSection.classList.add("hidden");

        setTimeout(() => {
            servicesSection.style.display = "none";
            bookingSection.style.display = "block";

            setTimeout(() => {
                bookingSection.classList.add("active");
            }, 50);

            bookingSection.scrollIntoView({ behavior: "smooth" });

        }, 300);
    });
});


/* =====================================================
   8. CLOSE BOOKING FORM
===================================================== */

closeBooking.addEventListener("click", () => {

    bookingSection.classList.remove("active");

    setTimeout(() => {
        bookingSection.style.display = "none";

        servicesSection.style.display = "block";

        setTimeout(() => {
            servicesSection.classList.remove("hidden");
        }, 50);

        servicesSection.scrollIntoView({ behavior: "smooth" });

    }, 300);
});


/* =====================================================
   9. RESET FORM MODAL LOGIC
===================================================== */

// Open modal
resetBtn.addEventListener("click", () => {
    resetModal.style.display = "flex";
});

// Close modal
function closeResetModal() {
    resetModal.style.display = "none";
}

cancelResetBtn.addEventListener("click", closeResetModal);

// Confirm reset
confirmResetBtn.addEventListener("click", () => {

    form.reset();

    localStorage.removeItem(STORAGE_KEY);
    bookingData = {};

    currentStep = 0;
    showStep(currentStep);

    closeResetModal();
});

// Click outside modal
window.addEventListener("click", (e) => {
    if (e.target === resetModal) closeResetModal();
});


/* =====================================================
   10. MPESA BUTTON (PLACEHOLDER)
===================================================== */

const mpesaBtn = document.getElementById("mpesaPayBtn");

if (mpesaBtn) {
    mpesaBtn.addEventListener("click", () => {

        if (!validateStep()) return;

        saveToStorage();

        alert("M-Pesa STK Push will be triggered here.");
    });
}


/* =====================================================
   11. INITIALIZE APP
===================================================== */

restoreFromStorage();
showStep(currentStep);