/* =========================
CONTACT FORM VALIDATION
========================= */

const form = document.querySelector("form");

const nameInput = form.querySelector('input[type="text"]');
const emailInput = form.querySelector('input[type="email"]');
const phoneInput = form.querySelector('input[type="tel"]');
const messageInput = form.querySelector('textarea');

/* =========================
CREATE ERROR ELEMENT
========================= */
function showError(input, message) {
    removeError(input);

    const error = document.createElement("small");
    error.className = "error-message text-danger";
    error.textContent = message;

    input.style.border = "2px solid red";
    input.classList.add("shake");

    input.parentElement.appendChild(error);
}

/* =========================
REMOVE ERROR
========================= */
function removeError(input) {
    input.style.border = "";
    input.classList.remove("shake");

    const existingError = input.parentElement.querySelector(".error-message");
    if (existingError) existingError.remove();
}

/* =========================
VALIDATION RULES
========================= */
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
    return phone === "" || /^[0-9]{9,13}$/.test(phone);
}

/* =========================
FORM SUBMIT
========================= */
form.addEventListener("submit", function (e) {
    e.preventDefault();

    let valid = true;

    /* NAME */
    if (nameInput.value.trim() === "") {
        showError(nameInput, "Name is required");
        valid = false;
    } else {
        removeError(nameInput);
    }

    /* EMAIL */
    if (emailInput.value.trim() === "") {
        showError(emailInput, "Email is required");
        valid = false;
    } else if (!validateEmail(emailInput.value.trim())) {
        showError(emailInput, "Invalid email format");
        valid = false;
    } else {
        removeError(emailInput);
    }

    /* PHONE */
    if (!validatePhone(phoneInput.value.trim())) {
        showError(phoneInput, "Invalid phone number");
        valid = false;
    } else {
        removeError(phoneInput);
    }

    /* MESSAGE */
    if (messageInput.value.trim() === "") {
        showError(messageInput, "Message cannot be empty");
        valid = false;
    } else {
        removeError(messageInput);
    }

    /* SUCCESS */
    if (valid) {
        alert("Message sent successfully!");
        form.reset();
    }
});

/* =========================
LIVE VALIDATION (REMOVE ERROR ON TYPE)
========================= */
[nameInput, emailInput, phoneInput, messageInput].forEach(input => {
    input.addEventListener("input", () => removeError(input));
});

/* =========================
SHAKE ANIMATION (ADD VIA JS)
========================= */
const style = document.createElement("style");
style.innerHTML = `
.shake {
    animation: shake 0.3s;
}

@keyframes shake {
    0% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    50% { transform: translateX(6px); }
    75% { transform: translateX(-6px); }
    100% { transform: translateX(0); }
}
`;
document.head.appendChild(style);