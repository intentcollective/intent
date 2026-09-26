/* ============================================
   CONFIG — the only line you need to edit
   ============================================ */
// Paste the "Web app" URL you get after deploying the Apps Script
// (see /apps-script/Code.gs and the README) here:
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbxBgyzrJ0IhYV8-ucGj3ZSD9kvmSDrgiE2SN4DX-Y_NCCjbiC8mjXYQplNS7GgMDkC5/exec";

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
      const prefix = sep !== -1 ? entry.slice(0, sep).trim().toLowerCase() : "";

      if (prefix === "image" || prefix === "video") {
        const value = entry.slice(sep + 1).trim();
        return value ? { type: prefix, value } : null;
      }

      // Legacy entry with no type prefix (from before mixed slides
      // existed) — infer the type: a URL is a video, anything else
      // is treated as an image filename.
      if (!entry) return null;
      const inferredType = /^https?:\/\//i.test(entry) ? "video" : "image";
      return { type: inferredType, value: entry };
    })
    .filter(Boolean);
}

function parseVideoEmbed(url) {
  if (!url) return null;

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtube.com" || host === "music.youtube.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    let id = parsed.searchParams.get("v");
    if (!id && (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live")) {
      id = parts[1];
    }
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  if (host === "vimeo.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    let id = null;
    let hash = null;

    if (parts.length === 2 && /^\d+$/.test(parts[0])) {
      // Unlisted-video format: vimeo.com/ID/HASH
      id = parts[0];
      hash = parts[1];
    } else {
      for (let i = parts.length - 1; i >= 0; i--) {
        if (/^\d+$/.test(parts[i])) {
          id = parts[i];
          break;
        }
      }
    }

    if (!id) return null;
    return hash
      ? `https://player.vimeo.com/video/${id}?h=${hash}`
      : `https://player.vimeo.com/video/${id}`;
  }

  if (host === "player.vimeo.com") {
    return parsed.href; // already an embed URL
  }

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

  carouselSlides = parseSlides(item.MainContent);
  carouselIndex = 0;
  carouselAlt = item.Title || "";

  const carouselWrap = document.createElement("div");
  carouselWrap.className = "carousel-wrap";

  const slideHolder = document.createElement("div");
  slideHolder.className = "carousel-slide";
  slideHolder.id = "carousel-slide";
  carouselWrap.appendChild(slideHolder);

  content.appendChild(carouselWrap);

  renderSlide();

  if (carouselSlides.length > 1) {
    buildCarouselArrows(carouselWrap);
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

function buildCarouselArrows(wrap) {
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "modal-arrow modal-arrow-prev";
  prev.setAttribute("aria-label", "Previous");
  prev.innerHTML = "&#8592;";
  prev.addEventListener("click", showPrevSlide);

  const next = document.createElement("button");
  next.type = "button";
  next.className = "modal-arrow modal-arrow-next";
  next.setAttribute("aria-label", "Next");
  next.innerHTML = "&#8594;";
  next.addEventListener("click", showNextSlide);

  wrap.appendChild(prev);
  wrap.appendChild(next);
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
