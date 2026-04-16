document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contactForm");
  const btn = document.getElementById("contactSubmitBtn");
  const feedback = document.getElementById("contactFeedback");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = form.querySelector("#contactName")?.value.trim();
    const email = form.querySelector("#contactEmail")?.value.trim();
    const phone = form.querySelector("#contactPhone")?.value.trim();
    const subject = form.querySelector("#contactSubject")?.value.trim();
    const message = form.querySelector("#contactMessage")?.value.trim();

    // Client-side validation
    if (!name || !email || !message) {
      showFeedback("Please fill in your name, email and message.", "error");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      showFeedback("Please enter a valid email address.", "error");
      return;
    }

    // Loading state
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML =
      '<i class="fa-solid fa-circle-notch fa-spin me-2"></i>Sending...';
    hideFeedback();

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, subject, message }),
      });

      // Safe parse
      const raw = await res.text();
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch (_) {
        throw new Error("Server returned an unexpected response.");
      }

      if (data.success) {
        showFeedback(
          "✓ Message sent! We'll get back to you within 24 hours. Check your inbox for a confirmation.",
          "success",
        );
        form.reset();
      } else {
        showFeedback(
          data.error || "Something went wrong. Please try again.",
          "error",
        );
      }
    } catch (err) {
      showFeedback(
        "Connection error. Please try again or email us directly at joyaltyphotography254@gmail.com",
        "error",
      );
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  function showFeedback(msg, type) {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.style.display = "block";
    feedback.className = `contact-feedback contact-feedback-${type}`;
    feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideFeedback() {
    if (!feedback) return;
    feedback.style.display = "none";
  }
});
