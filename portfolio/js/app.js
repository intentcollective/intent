/* ============================================
   CONFIG — the only line you need to edit
   ============================================ */
// Paste the "Web app" URL you get after deploying the Apps Script
// (see /apps-script/Code.gs and the README) here:
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbydBGZs_uReOlKYaAYjBUTQbEZj__6by1Tw8BdOXMRG9zab9YCIWUWJbve-jVqNO8mO/exec";

const IMAGES_PATH = "images/works/";

/* ============================================
   State
   ============================================ */
let allWorks = [];
let activeCategory = "Design";

// Image carousel state (used only when the open item has multiple images)
let carouselImages = [];
let carouselIndex = 0;
let carouselImgEl = null;
let carouselAlt = "";
let touchStartX = null;

/* ============================================
   Init
   ============================================ */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  setupNav();
  setupModal();
  loadWorks();
});

/* ============================================
   Fetch + render
   ============================================ */
async function loadWorks() {
  const grid = document.getElementById("work-grid");
  try {
    const res = await fetch(SHEET_API_URL);
    if (!res.ok) throw new Error("Network response was not ok");
    const data = await res.json();
    // Sheet's top data row = newest. The Sheet API returns rows in sheet
    // order already, so no re-sorting is needed here.
    allWorks = Array.isArray(data) ? data : [];
    render();
  } catch (err) {
    console.error("Could not load works:", err);
    grid.innerHTML = '<p class="grid-empty">Could not load work right now.</p>';
  }
}

function render() {
  const grid = document.getElementById("work-grid");
  const emptyMsg = document.getElementById("grid-empty");
  const items = allWorks.filter(
    (w) => (w.Category || "").trim() === activeCategory
  );

  grid.querySelectorAll(".work-card").forEach((el) => el.remove());

  if (items.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  items.forEach((item, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "work-card";
    card.setAttribute("aria-label", `Open ${item.Title || "work"}`);

    const thumb = document.createElement("img");
    thumb.className = "work-thumb";
    thumb.loading = "lazy";
    thumb.alt = item.Title || "";
    thumb.src = item.ThumbnailPath ? IMAGES_PATH + item.ThumbnailPath.trim() : "";

    const title = document.createElement("p");
    title.className = "work-title";
    title.textContent = item.Title || "Untitled";

    const type = document.createElement("p");
    type.className = "work-type";
    type.textContent = item.Type === "video" ? "Video" : "";

    card.appendChild(thumb);
    card.appendChild(title);
    if (type.textContent) card.appendChild(type);

    card.addEventListener("click", () => openModal(item));
    grid.appendChild(card);
  });
}

/* ============================================
   Nav
   ============================================ */
function setupNav() {
  const nav = document.getElementById("main-nav");
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-link");
    if (!btn) return;
    activeCategory = btn.dataset.category;
    nav.querySelectorAll(".nav-link").forEach((b) =>
      b.classList.toggle("is-active", b === btn)
    );
    render();
  });
}

/* ============================================
   Modal
   ============================================ */
function setupModal() {
  const modal = document.getElementById("modal");
  const closeBtn = document.getElementById("modal-close");
  const content = document.getElementById("modal-content");

  closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") {
      closeModal();
      return;
    }
    if (carouselImages.length > 1) {
      if (e.key === "ArrowLeft") showPrevImage();
      if (e.key === "ArrowRight") showNextImage();
    }
  });

  // Swipe-to-navigate on mobile
  content.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.touches[0].clientX;
    },
    { passive: true }
  );
  content.addEventListener("touchend", (e) => {
    if (touchStartX === null || carouselImages.length <= 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    const SWIPE_THRESHOLD = 40;
    if (dx > SWIPE_THRESHOLD) showPrevImage();
    else if (dx < -SWIPE_THRESHOLD) showNextImage();
  });
}

function openModal(item) {
  const modal = document.getElementById("modal");
  const content = document.getElementById("modal-content");
  content.innerHTML = "";
  clearCarouselArrows();
  carouselImages = [];
  carouselIndex = 0;
  carouselImgEl = null;
  carouselAlt = item.Title || "";

  if (item.Type === "video") {
    const embedSrc = parseVideoEmbed((item.MainContent || "").trim());
    const wrap = document.createElement("div");
    wrap.className = "video-embed";
    if (embedSrc) {
      // No autoplay param -> loads with a click-to-play poster frame.
      const iframe = document.createElement("iframe");
      iframe.src = embedSrc;
      iframe.allow = "autoplay; fullscreen; picture-in-picture";
      iframe.allowFullscreen = true;
      wrap.appendChild(iframe);
    }
    content.appendChild(wrap);
  } else {
    const files = (item.MainContent || "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    carouselImages = files;

    const img = document.createElement("img");
    img.src = files.length ? IMAGES_PATH + files[0] : "";
    img.alt = carouselAlt;
    content.appendChild(img);
    carouselImgEl = img;

    if (files.length > 1) {
      buildCarouselArrows(modal);
    }
  }

  const title = document.createElement("p");
  title.className = "modal-title";
  title.textContent = item.Title || "";
  content.appendChild(title);

  const desc = document.createElement("p");
  desc.className = "modal-description";
  desc.textContent = item.Description || "";
  content.appendChild(desc);

  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.hidden = true;
  document.getElementById("modal-content").innerHTML = "";
  clearCarouselArrows();
  carouselImages = [];
  document.body.style.overflow = "";
}

/* ============================================
   Image carousel (loops both directions)
   ============================================ */
function buildCarouselArrows(modal) {
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "modal-arrow modal-arrow-prev";
  prev.id = "modal-arrow-prev";
  prev.setAttribute("aria-label", "Previous image");
  prev.innerHTML = "&#8592;";
  prev.addEventListener("click", showPrevImage);

  const next = document.createElement("button");
  next.type = "button";
  next.className = "modal-arrow modal-arrow-next";
  next.id = "modal-arrow-next";
  next.setAttribute("aria-label", "Next image");
  next.innerHTML = "&#8594;";
  next.addEventListener("click", showNextImage);

  modal.appendChild(prev);
  modal.appendChild(next);
}

function clearCarouselArrows() {
  const prev = document.getElementById("modal-arrow-prev");
  const next = document.getElementById("modal-arrow-next");
  if (prev) prev.remove();
  if (next) next.remove();
}

function showPrevImage() {
  if (carouselImages.length <= 1) return;
  carouselIndex = (carouselIndex - 1 + carouselImages.length) % carouselImages.length;
  updateCarouselImage();
}

function showNextImage() {
  if (carouselImages.length <= 1) return;
  carouselIndex = (carouselIndex + 1) % carouselImages.length;
  updateCarouselImage();
}

function updateCarouselImage() {
  if (!carouselImgEl) return;
  carouselImgEl.src = IMAGES_PATH + carouselImages[carouselIndex];
  carouselImgEl.alt = carouselAlt;
}

/* ============================================
   Video URL -> embed URL
   ============================================ */
function parseVideoEmbed(url) {
  if (!url) return null;

  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  );
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  const vimeo = url.match(/vimeo\.com\/(?:.*\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  return null;
}
