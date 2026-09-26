/* ============================================
   CONFIG — the only line you need to edit
   ============================================ */
// Paste the "Web app" URL you get after deploying the Apps Script
// (see /apps-script/Code.gs and the README) here:
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbwKvdIPac6gEXZRs3qNni1L6b5CtrMvmJFdlKSRq3MsyRzF7p3MUMA6Fezd5IcBEZKb/exec";

const IMAGES_PATH = "images/works/";

/* ============================================
   State
   ============================================ */
let allWorks = [];
let activeCategory = "Design";

// Popup carousel state — slides can be a mix of images and videos
let carouselSlides = [];
let carouselIndex = 0;
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

  items.forEach((item) => {
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

    card.appendChild(thumb);
    card.appendChild(title);

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
   MainContent -> slides
   "image:a.jpg,image:b.jpg,video:https://youtube.com/watch?v=xxxx"
   ============================================ */
function parseSlides(mainContent) {
  return (mainContent || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const sep = entry.indexOf(":");
      if (sep === -1) return null;
      const type = entry.slice(0, sep).trim().toLowerCase();
      const value = entry.slice(sep + 1).trim();
      if ((type !== "image" && type !== "video") || !value) return null;
      return { type, value };
    })
    .filter(Boolean);
}

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
    if (carouselSlides.length > 1) {
      if (e.key === "ArrowLeft") showPrevSlide();
      if (e.key === "ArrowRight") showNextSlide();
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
    if (touchStartX === null || carouselSlides.length <= 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    const SWIPE_THRESHOLD = 40;
    if (dx > SWIPE_THRESHOLD) showPrevSlide();
    else if (dx < -SWIPE_THRESHOLD) showNextSlide();
  });
}

function openModal(item) {
  const modal = document.getElementById("modal");
  const content = document.getElementById("modal-content");
  content.innerHTML = "";
  clearCarouselArrows();

  carouselSlides = parseSlides(item.MainContent);
  carouselIndex = 0;
  carouselAlt = item.Title || "";

  const slideHolder = document.createElement("div");
  slideHolder.className = "carousel-slide";
  slideHolder.id = "carousel-slide";
  content.appendChild(slideHolder);

  renderSlide();

  if (carouselSlides.length > 1) {
    buildCarouselArrows(modal);
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
  carouselSlides = [];
  document.body.style.overflow = "";
}

/* ============================================
   Carousel — renders whichever slide type is current
   (loops both directions)
   ============================================ */
function renderSlide() {
  const holder = document.getElementById("carousel-slide");
  if (!holder || carouselSlides.length === 0) return;

  holder.innerHTML = "";
  const slide = carouselSlides[carouselIndex];

  if (slide.type === "video") {
    const embedSrc = parseVideoEmbed(slide.value);
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
    holder.appendChild(wrap);
  } else {
    const img = document.createElement("img");
    img.src = IMAGES_PATH + slide.value;
    img.alt = carouselAlt;
    holder.appendChild(img);
  }
}

function buildCarouselArrows(modal) {
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "modal-arrow modal-arrow-prev";
  prev.id = "modal-arrow-prev";
  prev.setAttribute("aria-label", "Previous");
  prev.innerHTML = "&#8592;";
  prev.addEventListener("click", showPrevSlide);

  const next = document.createElement("button");
  next.type = "button";
  next.className = "modal-arrow modal-arrow-next";
  next.id = "modal-arrow-next";
  next.setAttribute("aria-label", "Next");
  next.innerHTML = "&#8594;";
  next.addEventListener("click", showNextSlide);

  modal.appendChild(prev);
  modal.appendChild(next);
}

function clearCarouselArrows() {
  const prev = document.getElementById("modal-arrow-prev");
  const next = document.getElementById("modal-arrow-next");
  if (prev) prev.remove();
  if (next) next.remove();
}

function showPrevSlide() {
  if (carouselSlides.length <= 1) return;
  carouselIndex = (carouselIndex - 1 + carouselSlides.length) % carouselSlides.length;
  renderSlide();
}

function showNextSlide() {
  if (carouselSlides.length <= 1) return;
  carouselIndex = (carouselIndex + 1) % carouselSlides.length;
  renderSlide();
}
