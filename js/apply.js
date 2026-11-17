/* ==========================================================================
   Intent Collective: Design Fellow application
   A public form on structure.html (Roles, Design Fellows card). It asks the
   Fellows + Debate Apps Script to email the application to
   intentcollectivedesign@gmail.com, with Reply-To set to the applicant.
   Nothing is stored in a sheet. No password.

   The endpoint address is set in js/config.js. The script must have the
   "apply" handler (apps-script/fellows-debate.gs) and be deployed as a new
   version, or the form answers "Unknown request type."
   ========================================================================== */

(function () {
  const ENDPOINT = (window.IC_CONFIG && typeof window.IC_CONFIG.FELLOWS_DEBATE_ENDPOINT === "string") ? window.IC_CONFIG.FELLOWS_DEBATE_ENDPOINT : "";

  const el = (id) => document.getElementById(id);
  const toggle = el("apply-toggle");
  const panel = el("apply-composer");
  const submit = el("ap-submit");
  if (!toggle || !panel || !submit) return;
  if (!ENDPOINT || ENDPOINT.includes("PASTE_YOUR")) return;

  toggle.hidden = false;
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    toggle.setAttribute("aria-expanded", String(!panel.classList.contains("hidden")));
  });

  function setStatus(message, kind) {
    const s = el("ap-status");
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
      return j.Answer.some(a => a.type === 15 && /[a-z0-9-]+\.[a-z]{2,}\.?$/i.test(String(a.data).replace(/^\d+\s+/, "").trim()));
    } catch (err) {
      return true;
    }
  }

  submit.addEventListener("click", async () => {
    const firstName = el("ap-first").value.trim();
    const lastName = el("ap-last").value.trim();
    const email = el("ap-email").value.trim();
    const linkedin = el("ap-linkedin").value.trim();
    const note = el("ap-note").value.trim();
    const website = el("ap-website").value; // hidden field; humans leave it empty

    if (!firstName || !lastName || !email || !linkedin || !note) {
      setStatus("Please fill in every field.", "error"); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setStatus("Enter a valid email address.", "error"); return;
    }
    if (!/^https?:\/\//i.test(linkedin)) {
      setStatus("The LinkedIn link must start with https://", "error"); return;
    }

    submit.disabled = true;
    setStatus("Checking email…", null);
    if (!(await emailDomainOk(email))) {
      setStatus("That email’s domain can’t receive mail. Please check for typos.", "error");
      submit.disabled = false;
      return;
    }

    setStatus("Sending…", null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight
        body: JSON.stringify({ type: "apply", firstName, lastName, email, linkedin, note, website }),
      });
      const data = await res.json();
      if (data.status !== "ok") {
        setStatus(data.message || "Something went wrong. Try again.", "error");
      } else {
        ["ap-first", "ap-last", "ap-email", "ap-linkedin", "ap-note"].forEach(id => { el(id).value = ""; });
        setStatus(data.message || "Thank you. Your application was sent.", "ok");
      }
    } catch (err) {
      setStatus("Couldn’t reach the service. Please try again later, or write to intentcollectivedesign@gmail.com.", "error");
      console.error(err);
    }
    submit.disabled = false;
  });
})();
