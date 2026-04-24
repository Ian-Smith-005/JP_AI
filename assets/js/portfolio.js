/*============================================================
    By Smith
   JOYALTY — portfolio.js
   ✓ Filterable portfolio grid (All, Web Design, Graphic Design, etc.)
   ✓ Active state on filter buttons
   ✓ Smooth show/hide animations for portfolio items
==============================================================*/
const buttons = document.querySelectorAll(".filter-btn");
const items = document.querySelectorAll(".portfolio-item");

buttons.forEach((btn) => {
  btn.addEventListener("click", () => {
    buttons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const filter = btn.getAttribute("data-filter");

    items.forEach((item) => {
      if (filter === "all" || item.classList.contains(filter)) {
        item.style.display = "block";
      } else {
        item.style.display = "none";
      }
    });
  });
});
