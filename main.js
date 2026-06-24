const menuToggle = document.querySelector(".mobile-menu-toggle");
const siteNav = document.querySelector(".site-nav");

if (menuToggle && siteNav) {
  menuToggle.addEventListener("click", () => {
    siteNav.classList.toggle("active");
    menuToggle.textContent = siteNav.classList.contains("active") ? "×" : "☰";
  });
}
