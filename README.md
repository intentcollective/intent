# Intent Collective website

Static site on GitHub Pages, no build step. Push to the default branch to publish. Hard refresh (Cmd/Ctrl+Shift+R) to see changes.

## Files

| Path | What |
|---|---|
| `index.html`, `structure.html`, `discourse.html`, `zeitgeist.html` | The four pages, each with its script in `js/` |
| `principles/` | Visual Identity Principles, linked from every footer |
| `guide/` | Principal Design Fellow Guide, shared by URL only, `noindex` |
| `js/config.js` | The Debate Schedule CSV and the Fellows + Debate endpoint |
| `js/anchors.js`, `js/calendar.js`, `js/subscribe.js`, `js/typography.js` | Shared helpers |
| `js/stone.js`, `assets/logo-base.png`, `assets/stone.png` | Easter egg: the Index logo throws its stone, which lands as the principles title's period |
| `css/style.css`, `assets/` | Styles, fonts, logo, wordmark |
| `apps-script/` | Copies of the deployed Apps Scripts. The site never loads them |
| `temporary/` | Design trials. See its README |
| `henry/`, `graphicdesigndiscourse/` | Separate sites, not part of Intent Collective |

Every file here is public. Never put a password or personal data in the repo.

New page: copy the header `<nav class="site-nav">` from an existing page and move `aria-current="page"`.

## Password

One posting password covers every form. It lives in the `PASSWORD` Script Property of the three Apps Script projects (Discourse, Zeitgeist, Fellows + Debate) and in the protected Password tab of the Debate Schedule sheet, where Principals read it. Change all four together. A missing property rejects every post. No redeploy is needed.

## Spreadsheets

**Debate Schedule** (the Fellows + Debate script is bound to it). Shared with Principals as Editors.

- Tab `Debate Schedule`: `Host | Date | Subject | Status | Discourse | Meeting | Added | Event ID | Announced | Debate ID`. Date is US Eastern as plain text, `2027-04-03 10:00`. Status is a dropdown, `scheduled` or `cancelled`. The script keeps the last four columns, which are protected.
- Tab `Password`, protected, editable by the owner only.
- Publish to web covers the Debate Schedule tab only, as CSV. Never the entire document.

**Fellows and Subscribers** (private, set in `FELLOWS_SPREADSHEET_ID`). Shared with nobody, never published.

- `Fellows`: `Fellowship | First Name | Last Name | Email | LinkedIn | Recommended By | Added | Status | Token`
- `Subscribers`: `First Name | Last Name | Email | Added | Status | Token`
- `Outbox`: the email queue, kept by the script.

Status `bounced`, `skip` or `unsubscribed` stops email. Subscribers get email only after confirming. To delete someone on request, delete their row.

**Discourse**: `Name, Title, Date, Content, Link, Tag`. Content is simple HTML (`p, b, i, u, a, hr`) plus `[img:URL]` and `[video:URL]` (YouTube or Vimeo). Posts are corrected in the sheet. Changing a title changes the post's link.

**Zeitgeist**: `Name, Title, Link, Date, Preview`.

Share Debate Schedule, Discourse and Zeitgeist with each Principal's own Google account as Editor, never by link.

## Debates

Principals follow `/guide/`. The sheet is the master record. The site, the public calendar and every email follow it.

- Never delete a row. Cancel instead. Each change is announced once, and past debates never.
- Sheet menu **Intent Collective**. **Send debate changes now** acts at once instead of within the hour. **Catch up notices and reminders** queues anything missing, after a row was added by hand or the Outbox was cleared. If the menu is missing, open the sheet in a window signed in to one Google account, or run `onOpen` in the script editor.
- The Join link shows on the card from one hour before the start until two hours after. It is never emailed, but it is in the published sheet.
- Public calendar: `DEBATE_CALENDAR_ID` in the script, kept in step every hour. Run `syncDebateCalendar` to sync at once.

## Email

- Sent from the account that deploys the script, intentcollectivedesign@gmail.com.
- Order: Principal Design Fellows, Design Fellows, Subscribers. A notice when a debate is scheduled, a reminder 24 hours before, an email for a new date or a cancellation.
- Gmail allows about 100 recipients a day. Up to 40 go at once and the rest wait in the Outbox, up to 90 per hourly run, with 10 a day kept for confirmations. Run `installNoticeTrigger` once to switch on the hourly run.
- Outbox status: `queued`, `sent`, `skipped`, `expired`, `failed`, `replaced`, `cancelled`.
- Bounces: `flagBouncedFellows` reads Gmail failure notices and marks people `bounced`. Give it a daily trigger.

## Deploying a script

1. Edit in the Apps Script editor and save.
2. **Deploy > Manage deployments**, pencil, Version **New version**, **Deploy**. Execute as **Me**, access **Anyone**. Never **New deployment**, which changes the URL.
3. Copy the code into `apps-script/` and commit, so the repo matches what runs.

## Troubleshooting

- **Old content after a push:** hard refresh. GitHub Pages caches for a few minutes, and published sheets refresh on a short delay.
- **"Incorrect password":** the Script Property is missing or differs from the Password tab.
- **"Couldn't reach the posting service":** the deployment is no longer Execute as Me, access Anyone.
- **Debates do not load:** check `DEBATE_CSV_URL` in `js/config.js` and that the Debate Schedule tab is published as CSV.
- **Wrong time:** the Date cell must be US Eastern, `2027-04-03 10:00`.
- **An email did not arrive:** check the address, that Status is empty or `confirmed`, and spam.
- **"Delivery incomplete" keeps arriving:** set the bad row's Status to `skip`, then run `flagBouncedFellows`.
