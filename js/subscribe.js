/* ==========================================================================
   Intent Collective: debate notice sign-up
   A small public form (first name, last name, email) that asks the
   Fellows + Debate Apps Script to add the person to the Subscribers tab and
   email a confirmation link. No password: this is open to everyone.

   Used on index.html and structure.html. Both pages have the same element
   ids (sub-toggle, sub-composer, sub-first, sub-last, sub-email, sub-website,
   sub-submit, sub-status).

   The endpoint address is set in js/config.js.
   ========================================================================== */

(function () {
  const ENDPOINT = (window.IC_CONFIG && window.IC_CONFIG.FELLOWS_DEBATE_ENDPOINT) || "https://script.google.com/macros/s/AKfycbwJsylXmVramfW8iNDgVPFtfQ-wBvzfQ9FiJ66OU-4Aejd1-JAqr0lCmQVSOWXc-fiBUw/exec";

  const el = (id) => document.getElementById(id);
  const toggle = el("sub-toggle");
  const panel = el("sub-composer");
  const submit = el("sub-submit");
  if (!toggle || !panel || !submit) return;

  const ready = ENDPOINT && !ENDPOINT.includes("PASTE_YOUR");
  if (!ready) return;

  const openLabel = "+ Get debate notices by email";
  function setLabel(label) {
    toggle.textContent = "";
    const sp = document.createElement("span");
    sp.className = "tg-sign";
    sp.textContent = label.charAt(0);
    toggle.appendChild(sp);
    toggle.appendChild(document.createTextNode(label.slice(1)));
  }
  toggle.hidden = false;
  toggle.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    setLabel(panel.classList.contains("hidden") ? openLabel : "\u2212 Close");
  });
  setLabel(openLabel);

  function setStatus(message, kind) {
    const s = el("sub-status");
    s.textContent = message || "";
    s.classList.toggle("is-error", kind === "error");
    s.classList.toggle("is-ok", kind === "ok");
  }

  // Checks that the email's domain has a real mail server. If the lookup
  // itself fails, the address is let through (the script checks again).
  async function emailDomainOk(email) {
    const domain = email.split("@")[1];
    if (!domain) return false;
    try {
      const res = await fetch("https://dns.google/resolve?name=" + encodeURIComponent(domain) + "&type=MX");
      const j = await res.json();
      if (j.Status !== 0 || !j.Answer) return false;
      return j.Answer.some(a => {
        if (a.type !== 15) return false;
        const host = String(a.data).replace(/^\d+\s+/, "").trim();
        return /[a-z0-9-]+\.[a-z]{2,}\.?$/i.test(host);
      });
    } catch (err) {
      return true;
    }
  }

  submit.addEventListener("click", async () => {
    const firstName = el("sub-first").value.trim();
    const lastName = el("sub-last").value.trim();
    const email = el("sub-email").value.trim();
    const website = el("sub-website").value; // hidden field; humans leave it empty

    if (!firstName || !lastName || !email) {
      setStatus("First name, last name, and email are required.", "error"); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setStatus("Enter a valid email address.", "error"); return;
    }

    submit.disabled = true;
    setStatus("Checking email\u2026", null);
    if (!(await emailDomainOk(email))) {
      setStatus("That email's domain can't receive mail. Please check for typos.", "error");
      submit.disabled = false;
      return;
    }

    setStatus("Sending\u2026", null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight
        body: JSON.stringify({ type: "subscribe", firstName, lastName, email, website }),
      });
      const data = await res.json();
      if (data.status !== "ok") {
        setStatus(data.message || "Something went wrong. Try again.", "error");
      } else {
        ["sub-first", "sub-last", "sub-email"].forEach(id => { el(id).value = ""; });
        setStatus(data.message || "Check your email to confirm.", "ok");
      }
    } catch (err) {
      setStatus("Couldn't reach the sign-up service. Please try again later.", "error");
      console.error(err);
    }
    submit.disabled = false;
  });
})();
