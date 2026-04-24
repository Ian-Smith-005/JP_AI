(function () {
  const body = document.getElementById("footerBody");
  if (!body) return;
  const obs = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        body.classList.add("footer-visible");
        obs.disconnect();
      }
    },
    { threshold: 0.1 },
  );
  obs.observe(body);

  window.subscribeNewsletter = function () {
    const email = document.getElementById("newsletterEmail").value.trim();
    const msg = document.getElementById("newsletterMsg");
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      msg.textContent = "Please enter a valid email address.";
      msg.style.display = "block";
      return;
    }
    msg.textContent = "✓ Thank you! We'll be in touch.";
    msg.style.display = "block";
    document.getElementById("newsletterEmail").value = "";
  };
})();
