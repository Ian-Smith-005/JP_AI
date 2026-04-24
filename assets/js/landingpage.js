  /*============================================================
   By Smith
   JOYALTY — landingpage.js
   ✓ AOS scroll animations (fade-up, fade-right, fade-left)
   ✓ Typing effect on hero headline
   ✓ Swiper.js for review carousel (autoplay, responsive breakpoints)
   ✓ Hamburger menu morphs to X on open/close
   ✓ Click outside menu to close (mobile)
   ✓ Parallax scrolling effect on wave SVGs
============================================================= */
AOS.init({
  duration: 1000,
  once: false,
});

/* TYPING */
const words = ["Memories", "Emotions", "Forever"];
let wordIndex = 0;
let letterIndex = 0;
const typing = document.getElementById("typing");

function type() {
  if (letterIndex < words[wordIndex].length) {
    typing.textContent += words[wordIndex][letterIndex];
    letterIndex++;
    setTimeout(type, 100);
  } else {
    setTimeout(erase, 2000);
  }
}

function erase() {
  if (letterIndex > 0) {
    typing.textContent = words[wordIndex].substring(0, letterIndex - 1);
    letterIndex--;
    setTimeout(erase, 60);
  } else {
    wordIndex++;
    if (wordIndex >= words.length) wordIndex = 0;
    setTimeout(type, 200);
  }
}

document.addEventListener("DOMContentLoaded", type);

/* SWIPER */
new Swiper(".reviewSwiper", {
  loop: true,
  autoplay: { delay: 3500 },
  slidesPerView: 1,
  spaceBetween: 30,
  breakpoints: {
    768: { slidesPerView: 2 },
    1024: { slidesPerView: 3 },
  },
});

/* HAMBURGER MORPH TO X */
const hamburgerBtn = document.querySelector(".navbar-toggler");
const navCollapse = document.getElementById("navMenu");

navCollapse.addEventListener("show.bs.collapse", () => {
  hamburgerBtn.classList.add("open");
});
navCollapse.addEventListener("hide.bs.collapse", () => {
  hamburgerBtn.classList.remove("open");
});

/* CLICK OUTSIDE TO CLOSE MENU */
document.addEventListener("click", (e) => {
  if (!hamburgerBtn.contains(e.target) && !navCollapse.contains(e.target)) {
    const collapseInstance = bootstrap.Collapse.getInstance(navCollapse);
    if (collapseInstance) collapseInstance.hide();
  }
});

/* PARALLAX SCROLLING EFFECT ON WAVES */
const waveContainer = document.querySelector(".wave-container");
if (waveContainer) {
  window.addEventListener("scroll", () => {
    const scrollY = window.scrollY;
    // Gentle parallax - waves move slower than page (creates depth)
    waveContainer.style.transform = `translateY(${scrollY * 0.18}px)`;
  });
}
