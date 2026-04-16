/* THEME TOGGLE + LOCAL STORAGE */
const themeToggle = document.getElementById("themeToggle");

function setTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);

  if (theme === "light") {
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
  } else {
    themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
  }
}

const savedTheme = localStorage.getItem("theme") || "light";
setTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  const currentTheme = document.body.getAttribute("data-theme");
  const newTheme = currentTheme === "light" ? "dark" : "light";
  setTheme(newTheme);
});
