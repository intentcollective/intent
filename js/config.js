/* ==========================================================================
   Intent Collective: shared settings
   The two web addresses that more than one page needs live here, so a change
   is made in ONE place. Loaded before the other scripts on the Index and
   Structure pages (see the script tags at the bottom of those pages).

   DEBATE_CSV_URL
     The published CSV of the "Debate Schedule" tab. After re-publishing that
     tab (File > Share > Publish to web > Debate Schedule > .csv), paste the
     new link here. Never publish the Fellows, Subscribers or Outbox tabs.

   FELLOWS_DEBATE_ENDPOINT
     The /exec web app address of the Fellows + Debate Apps Script. It stays
     the same when you deploy a new VERSION; it only changes if you create a
     brand new deployment.
   ========================================================================== */

window.IC_CONFIG = {
  DEBATE_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9ZJLaJ6cAp46DwDBtRw2M4VN6iZzUb3M94T71lmpiCi7niP7Qsxlnn8wIyrEJj2rxEtlhlKh49afy/pub?gid=335122004&single=true&output=csv",
  FELLOWS_DEBATE_ENDPOINT: "https://script.google.com/macros/s/AKfycbwJsylXmVramfW8iNDgVPFtfQ-wBvzfQ9FiJ66OU-4Aejd1-JAqr0lCmQVSOWXc-fiBUw/exec"
};
