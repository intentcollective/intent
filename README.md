# intent collective website

Static site, no build step. Four pages:

| Page | File | Data |
|---|---|---|
| Home and Manifesto | `index.html` + `js/index.js` + `js/anchors.js` + `js/subscribe.js` | Debate Schedule sheet (read only) |
| Structure | `structure.html` + `js/structure.js` | Fellows sheet (private), Debate Schedule sheet |
| Discourse | `discourse.html` + `js/discourse.js` | Discourse sheet |
| Zeitgeist | `zeitgeist.html` + `js/zeitgeist.js` | Zeitgeist sheet |

Typeface: DM Sans only. Logo mark and wordmark are in `assets/`.

Google Apps Script files, kept in `apps-script/` as the backup of what runs in Google. You paste each one into Google's script editor; the website never loads them. Keep each file identical to the deployed version: after any change in the editor, commit it here too. Like every file in this repo, they are publicly readable, so put nothing secret in them.

| File | Used for |
|---|---|
| `apps-script/discourse.gs` | Discourse posting |
| `apps-script/zeitgeist.gs` | Zeitgeist posting |
| `apps-script/fellows-debate.gs` | Fellow registration, debate scheduling, changes and cancellations, email notice, bounce protection |

---

## Running debates: a guide for Principal Design Fellows

Two places do all the work. The **Structure page** schedules a debate. The **Debate Schedule** tab of the "Fellows and Debate Schedule" spreadsheet changes or cancels one. The sheet is the master record: the website, the public calendar and every email follow it, never the other way round.

### Schedule a debate

1. Publish the Discourse post for the debate first.
2. On the Structure page, open **+ Schedule a debate** and fill in the host, the date and time (US Eastern), a one-sentence subject, the Discourse post, the meeting link and the password. Check the date and time before you submit: once scheduled, any later change is emailed to everyone.
3. That is all. The row appears in the sheet, every Fellow and confirmed Subscriber gets a notice, a reminder is queued for 24 hours before the start, the event appears in the public calendar, and the card appears on the Index and Structure pages within about 5 minutes.

### Change the date or time

1. In Debate Schedule, edit the **Date** cell. Write it as `2027-04-03 10:00` (US Eastern, 24-hour).
2. Choose **Intent Collective > Send debate changes now**, or wait: the hourly run does the same.

Everyone gets a "New date" email that also shows the previous date. The old reminder is replaced by one for the new time, the calendar event moves, and the site updates.

### Change the subject, host, Discourse link or meeting link

Edit the cell. The site and the calendar follow, and queued reminders use the new text. No email is sent. The meeting link is never emailed; it appears on the debate card one hour before the start.

### Cancel a debate

1. In the **Status** cell, choose `cancelled` from the dropdown.
2. Choose **Intent Collective > Send debate changes now**, or wait for the hourly run.

Everyone gets a "Cancelled" email with a calendar file that removes the debate from their calendar. Queued notices and reminders for it are dropped. The public calendar event is renamed "Cancelled: ...". The card stays on the site labelled Cancelled, without Join or calendar links, and the red Next debate outline moves to the next debate. The row stays in the sheet as the record.

### Undo a cancellation

Set **Status** back to `scheduled`, then choose **Send debate changes now**. Everyone gets a fresh notice and a new reminder is queued.

### Rules

- **Never delete a row.** Deleting skips every email, so nobody is told. Cancel instead.
- **Change things only in the sheet, never in the calendar.** An event deleted or edited by hand in the calendar is put back within the hour.
- **Do not edit** the `Event ID`, `Announced` or `Added` columns. The script keeps them.
- Each change is announced once. Moving a date back and forth sends one email per move.
- Past debates are never announced, so editing an old row is safe.

### The Intent Collective menu

It sits at the right end of the sheet's menu bar, after Help.

- **Send debate changes now:** announces changes at once instead of waiting for the hourly run, and sends any emails that are due.
- **Catch up notices and reminders:** for every upcoming debate, queues a notice and a reminder for anyone on the list who has not had them. Use it after a debate was added by hand in the sheet, or after the Outbox tab was cleared. It never sends anything twice.

If the menu does not appear, the browser is usually signed in to several Google accounts. Open the sheet in a window signed in to one account only (an incognito window works), or open **Extensions > Apps Script**, pick `onOpen` in the function list and click **Run**.

### Emails and timing

Emails go to Principal Design Fellows first, then Design Fellows, then Subscribers. A Gmail account sends about 100 emails a day, so on a long list some arrive over the following days (see section 5f). Nobody is ever emailed about a debate that has already started.

---

## 1. The master password

One password now covers every form on the site: Discourse, Zeitgeist, fellow registration, and debate scheduling.

It lives in six places. If you ever change it, change all six, then redeploy the scripts (see section 2):

- `js/discourse.js`, `js/zeitgeist.js`, `js/structure.js` (constant `POST_PASSWORD`)
- `apps-script/discourse.gs`, `apps-script/zeitgeist.gs`, `apps-script/fellows-debate.gs` (variable `PASSWORD`)

How much protection this gives:

- The real check happens inside each Apps Script. A row is only added if the password sent matches.
- The password is still readable by anyone who opens the page source or the browser's network tab. Treat it as a light gate against casual or accidental use, not real authentication.
- Because it is one shared password, any fellow who knows it can register people or schedule debates, not only Principal Design Fellows. For now, Principal Design Fellows host the debates, so share the password with them only.
- The password is not written in this README on purpose, since the repository is public. Do not paste it into public pages.

## 2. Required now: update the two existing scripts

Posting on Discourse and Zeitgeist will fail until the scripts know the new password.

For each of the two existing Google Sheets (Discourse, then Zeitgeist):

1. Open the Sheet, then **Extensions > Apps Script**.
2. Replace the code with the updated file from this project (`apps-script/discourse.gs` for Discourse, `apps-script/zeitgeist.gs` for Zeitgeist). Check that the `SHEET_NAME` line still matches your tab name, or leave it and the script uses the first tab.
3. Save, then **Deploy > Manage deployments**.
4. Click the pencil icon, set **Version** to **New version**, then **Deploy**.
5. The `/exec` URL stays the same, so `js/discourse.js` and `js/zeitgeist.js` need no URL change.

Then upload the updated `js/discourse.js` and `js/zeitgeist.js`.

---

## 3. Discourse sheet

Reading: the published CSV URL is already set in `js/discourse.js` (`SHEET_CSV_URL`).

Header row, any order: `Name, Title, Date, Content, Link, Tag` (`Link` and `Tag` are optional). Clicking an entry opens it at `discourse.html#post-<slug>`.

Posting from the site: already deployed. The "+ Share a post" toggle appears because `POST_ENDPOINT_URL` is set in `js/discourse.js`. The script stores the date as a date only; the time is kept underneath so ordering still works.

### The editor

Buttons: **B**, *I*, <u>U</u>, **Line** (a horizontal rule), **Link**, **Image** and **Video**. Image and Video ask for a URL and show a real preview inside the editor. A small x on the preview removes it. Behind the scenes each one is saved as the `[img:URL]` or `[video:URL]` tag described below, so the sheet and the public page work as before. Older posts that contain lists or headings still display correctly; the editor just no longer has buttons for them.

### Correcting a published post

The page has no edit button on purpose. The password is readable in the page source, so a page-based edit could let anyone change a fellow's writing. Corrections are made in the Google Sheet instead, which only the sheet's owner can open:

1. Open the Discourse sheet and find the post's row.
2. Edit the `Title` or `Content` cell. Content is simple HTML (`<p>`, `<b>`, `<i>`, `<u>`, `<a href>`, `<hr>`) plus the `[img:URL]` and `[video:URL]` tags.
3. Wait a few minutes for Google to refresh the published sheet, then hard refresh the page.
4. Changing a title changes that post's link (it is built from the title and date), so old shared links to it will stop working.

### Images and video in a post

Type either tag anywhere in the Content text, in the Sheet cell or in the composer:

```
[img:https://example.com/path/to/image.jpg]
[video:https://youtube.com/watch?v=xxxxxxxxxxx]
```

- `[img:URL]` is any direct image URL.
- `[video:URL]` is a YouTube or Vimeo link (youtu.be, youtube.com/watch, youtube.com/shorts, Vimeo, unlisted Vimeo).
- You can use several in one post, mixed with normal text.

Raw `<img>` or `<iframe>` pasted into a post is deliberately stripped by the sanitizer. Only these tags can add media. If a tag does not render, hard refresh (Cmd/Ctrl+Shift+R), since GitHub Pages can cache `js/discourse.js`.

## 4. Zeitgeist sheet

Reading: the CSV URL is set in `js/zeitgeist.js`. Header row, any order: `Name, Title, Link, Date, Preview`.

Posting: deployed, with the "+ Share a link" toggle. Cards open an internal detail view at `zeitgeist.html#link-<slug>` with a "Visit link" button.

---

## 5. Fellows and Debate Schedule

This needs one Google Sheet with two tabs and one Apps Script. The same script handles both forms, and it emails fellows when a debate is scheduled.

### 5a. The Structure page

Page order: Debate (schedule and host form), Fellowships (two tiers and the registration form), Pillars, Disciplines, Methodology.

The fellowship has two tiers:

- **Principal Design Fellows** lead a pillar, set debate topics, and host debates.
- **Design Fellows** take part across all pillars.

For now, only Principal Design Fellows schedule debates. As the fellowship grows, Design Fellows will be able to reach out to pillar leaders to propose a debate. The page says this in the Debate section.

### 5b. Create the spreadsheet

Sign in to Google as **intentcollectivedesign@gmail.com** first. Email notices are sent from whichever account deploys the script, so this is how they come from that address.

Create a spreadsheet and make two tabs with these exact names and header rows (row 1):

**Tab `Fellows`** (private, never published):

```
Fellowship | First Name | Last Name | Email | LinkedIn | Recommended By | Added | Status
```

**Tab `Debate Schedule`**:

```
Host | Date | Subject | Status | Discourse | Meeting | Added | Event ID | Announced
```

**Tab `Subscribers`** (private, never published). You do not need to create it: the script creates it the first time someone signs up for debate notices. Its columns are:

```
First Name | Last Name | Email | Added | Status | Token
```

`Status` is `pending` until the person clicks the confirmation link, then `confirmed`. It becomes `unsubscribed` if they unsubscribe, or `bounced` if their address fails. `Token` is a private code used in the confirm and unsubscribe links. Leave it alone.

Column order does not matter, but the header names must match. The `Fellowship` column holds `Principal Design Fellow` or `Design Fellow`. If older rows say `Master Design Fellow` or `Principal Design Fellow` from the earlier three-tier version, edit them to match. Nothing in the script depends on those names.

`Status` is optional. Leave it empty for normal fellows. Put `skip` to stop emailing someone. The script writes `bounced` there automatically (see section 5f). If you do not add the column, it is created the first time `flagBouncedFellows` runs.

Add your existing fellows' names and emails to the `Fellows` tab now, so they receive notices. Only the `Email` and `Status` columns are used for the notice.

The live setup keeps personal data apart: the `Fellows`, `Subscribers` and `Outbox` tabs are in a private spreadsheet ("Fellows and Subscribers", shared with nobody), named by `FELLOWS_SPREADSHEET_ID` at the top of the script. The spreadsheet the script is attached to holds only `Debate Schedule`, so it can be shared with Principal Design Fellows (each by their own Google account, as Editor, with the Added, Event ID and Announced columns protected). Never share the private spreadsheet, and never share either one by link.

Entering a debate by hand in the sheet: put the date in the Date column as `2026-12-05 10:00` (US Eastern, 24-hour). Format that column as plain text so Sheets does not rewrite it.

`Status` is `scheduled` or `cancelled`; make it a dropdown (select the column below the header, then Insert > Dropdown, with "Reject the input" under Advanced options). An empty Status counts as scheduled. `Event ID` and `Announced` are added and filled by the script; do not edit them. A debate entered by hand gets no notice on its own: use **Catch up notices and reminders** in the sheet's Intent Collective menu (see 5f).

### 5c. Publish ONLY the Debate Schedule tab

1. In the spreadsheet: **File > Share > Publish to web**.
2. Under Link, do **not** choose "Entire document". Choose the **Debate Schedule** tab.
3. Choose **Comma-separated values (.csv)**, then **Publish**.
4. Copy the URL.
5. Open `js/structure.js` and paste it into `DEBATE_CSV_URL`.

Do not publish the `Fellows` tab. It contains emails and LinkedIn links, and a published sheet is readable by anyone with the link. The site never needs to read it.

### 5d. Add or update the script

1. In the spreadsheet: **Extensions > Apps Script**.
2. Replace the code with `apps-script/fellows-debate.gs`.
3. Check the tab names at the top match your tabs. Set `SEND_EMAIL_NOTICE = false` if you want to turn off the email notice.
4. Save.
5. **Approve permissions before deploying.** In the function dropdown pick `flagBouncedFellows`, click **Run**, and approve when Google asks. The script needs: your spreadsheets, sending email, outside web requests (the email domain check and fetching the wordmark for emails), reading Gmail (the bounce cleanup), and showing a web page (the confirm and unsubscribe links). This is your own script on your own sheet.
6. Deploy:
   - **First time:** **Deploy > New deployment > type: Web app**. Execute as: **Me**. Who has access: **Anyone**. Click **Deploy**, then copy the Web app URL (ends in `/exec`) into `js/structure.js`, in `POST_ENDPOINT_URL`.
   - **Every later change:** **Deploy > Manage deployments**, click the pencil icon, set **Version** to **New version**, then **Deploy**. The URL stays the same. Do not use "New deployment" again, since that creates a second deployment with a different URL.

Saving the code alone does not update the live web app. It keeps running the old version until you deploy a new version.

### 5e. Using it

On the Structure page, the two small toggles appear once `POST_ENDPOINT_URL` is set.

- **Become a fellow:** the page shows a contact line with a mailto link to intentcollectivedesign@gmail.com. There is no application form, because a form would need its own mail setup.
- **+ Register a fellow:** fellowship (Principal Design Fellow or Design Fellow), first name, last name, email, confirm email, LinkedIn link, recommending fellow, and the password. LinkedIn and recommending fellow are optional. The row is added to the `Fellows` tab.
  - The email must be typed twice, and its domain must be able to receive mail. This is checked on the page and again in the script, so a typo such as `name@adasd.com` is rejected instead of being saved.
  - The domain check proves the domain has a mail server, not that the mailbox exists. The second email field is what catches typos at a real domain.
- **+ Get debate notices by email** (on the Index and on the Structure page, under the upcoming debates): anyone can enter first name, last name and email, with no password. They get a confirmation email and only start receiving notices after clicking its link. The script checks the address, ignores bots with a hidden field, and always gives the same reply so the form never reveals who is on the list.
- **+ Schedule a debate:** host name, date and time in US Eastern, a one-sentence subject, the Discourse post, the meeting link, and the password.
  - The page previews Seoul and London times as you pick the date, and notes if the day is not a Saturday.
  - For the Discourse post, type to search the Discourse sheet. Once a host name is entered, that host's posts are listed first. You can also paste any link.
  - The row is added to `Debate Schedule`, then every Fellow and every confirmed Subscriber gets one email with the subject, host, Eastern, Seoul and London times, and both links.

The schedule shows upcoming debates soonest first, each with Eastern, Seoul and London times. A session moves to **Past debates** two hours after it starts. Past debates are collapsed, grouped by year, and the newest year opens first, so the page stays short as history grows.

### 5f. About the email notice, subscribers and bounces

- **Who gets a notice:** every Fellow in the `Fellows` tab and every Subscriber whose `Status` is `confirmed`. Anyone marked `bounced`, `skip` or `unsubscribed` is left out, and so are duplicate and invalid addresses.
- **One email each.** Notices are sent individually, not as one BCC, so a Subscriber's email carries their own unsubscribe link. Fellows' emails say they are sent because they are Fellows and carry an Unsubscribe link too. Each Fellow gets a `Token` (column added to the `Fellows` tab automatically) the first time a notice is queued for them; unsubscribing sets their `Status` to `unsubscribed`, and they stay a Fellow. To resume their notices, clear the Status cell.
- **Look:** the emails use the site's colors (paper background, a thin-bordered box like the debate cards, red labels) and carry the wordmark from `assets/wordmark.png`, attached inside the email so it shows in every mail app. If the image cannot be fetched, the email shows the name as text. Fonts fall back to Helvetica or Arial, since mail apps do not load DM Sans.
- **Confirm and unsubscribe links** open a small page in the site's colors, served by the same script. They only work while the web app is deployed with Who has access: Anyone.
- **Daily limit and the Outbox.** A regular Gmail account can send to about 100 recipients per day (Google Workspace, about 1,500). Confirmation emails count too, and 10 emails a day are kept free for them. When a debate is scheduled, every Fellow and confirmed Subscriber is added to an `Outbox` tab. Up to 40 notices go out right away, Fellows first, and the rest are sent automatically, up to 90 per hourly run, as soon as Google's daily allowance allows. A 300-person list therefore takes about three days. A notice is never sent after its debate has started, and anyone who unsubscribes, bounces or is removed while waiting is skipped. The page tells you how many went out and how many are waiting.
- **Switch the automatic sending on once:** in the script editor pick `installNoticeTrigger` in the function dropdown, click Run, and approve the permission. Running it again is safe. Until you do, waiting notices stay in the Outbox, and the page reminds you.
- **Sending order:** Principal Design Fellows first, then Design Fellows, then Subscribers, each in the order they appear in the sheet. Reminders that are due go before everything else.
- **Reminder:** when a debate is more than a day away, each recipient also gets a reminder email about 24 hours before the start. It is sent by the same hourly timer, so it arrives within the hour after the 24-hour mark. It is skipped for anyone who has unsubscribed or bounced by then, and not created at all for a debate scheduled less than a day ahead. People who sign up after a debate was scheduled get no notice or reminder for it. Each recipient receives two emails per debate, which counts against the daily limit.
- **Add to calendar:** both emails have one "Add to your calendar" block in the box with two choices: this debate (Google Calendar link, or the attached `.ics` file, which Gmail also shows as an event card at the top), or "Future debates: Subscribe in Google Calendar > · Apple or Outlook >" (the public calendar). The event is one hour long. Its location and description point to the website, not to the meeting.
- **Public debate calendar:** every debate is also an event in the public Google Calendar set in `DEBATE_CALENDAR_ID` at the top of the script. The account that deploys the script must own the calendar or have "Make changes to events" permission, and the first run asks you to approve calendar access. The event is added when a debate is scheduled, and the hourly timer keeps the calendar in step with the `Debate Schedule` tab: an edited row updates its event, and deleting the row of a future debate removes its event. Past events stay. Each row's event is remembered in an `Event ID` column, added automatically; do not edit it. The event never contains the meeting link, and has no location, because calendar apps offer map directions for any location. The notice and reminder emails, the "You're subscribed" page and the Structure page link to the whole calendar (Google Calendar, and a webcal link for Apple Calendar and Outlook), so people can subscribe once. To sync right away, run `syncDebateCalendar` from the script editor. Leave `DEBATE_CALENDAR_ID` empty to switch the calendar off.
- **The meeting link is never emailed.** Emails link to the debate page on the website. The Join link appears on the debate card (Index and Structure) from one hour before the start until the card moves to Past debates, and the page switches by itself without a refresh. The link is still stored in the Meeting column of the Debate Schedule sheet, and that sheet is published, so a determined person could read it there. In Zoom, turn **off** "Join before host" and turn **on** the waiting room, so anyone who arrives early waits until you start.
- **Changing or cancelling a debate.** Edit the row; never delete it.
  - *New date or time:* edit the Date cell. Within the hour everyone gets a "New date" email (with the earlier date shown as "Previously"), queued notices and reminders for the old date are dropped, and a new reminder is queued.
  - *Cancel:* set Status to `cancelled`. Within the hour queued emails for it are dropped and everyone gets a "Cancelled" email with a calendar file that removes the event. The public calendar event is retitled "Cancelled: ...", and the card stays on the site labelled Cancelled, without Join or calendar links. Set Status back to `scheduled` to reinstate it: everyone gets a fresh notice.
  - *Subject, host or Discourse link:* edit the cell. Queued reminders pick it up. No email is sent.
  - The `Announced` column holds what recipients were last told, so each change is announced once. Past debates are never announced.
  - The sheet has an **Intent Collective** menu (it appears after the sheet is reloaded): **Send debate changes now** acts at once instead of waiting for the hourly run; **Catch up notices and reminders** queues a notice and a reminder for every upcoming debate for anyone who has not had them (after the Outbox was cleared, or when the list is switched on).
  - The calendar file in every email and on every card has a UID made from the Event ID, so a calendar app treats a new date or a cancellation as the same event. An event added with the Google Calendar link is a separate copy and must be changed by hand.
- **Outbox statuses:** `queued` (waiting, or a reminder not due yet), `sent`, `skipped` (unsubscribed or removed), `expired` (the debate had started), `failed`, `replaced` (the date changed, or a cancellation was undone), `cancelled` (the debate was cancelled). Types: `notice`, `reminder`, `change`, `cancel`. The `Type` column says notice or reminder, and `Send After` is when a reminder is due. Old rows can be deleted at any time.
- **Large lists:** a list over a few hundred people cannot be fully notified before a debate that is only days away. At that size, move to a Google Workspace account or a mailing service.
- If the email fails, the debate is still saved and the page shows why.

### Privacy for Subscribers

Subscribers are members of the public, so keep their details private and honor their choices:

- Never publish the `Subscribers` tab, and share the spreadsheet only with people who manage the collective.
- Every notice has an unsubscribe link. Unsubscribing is instant and permanent until the person signs up again and confirms.
- Do not use the list for anything other than debate notices.
- To delete someone entirely on request, delete their row.

Why bounces happen: every debate notice goes to every address in the `Fellows` and confirmed `Subscribers` lists. One bad address bounces back to the sending account each time a debate is scheduled. Three layers prevent this:

1. **Check at registration.** The page and the script reject bad formats and domains that cannot receive mail.
2. **Skip list.** Anyone with `Status` set to `bounced`, `skip` or `unsubscribed` is never emailed. Subscribers also must confirm by email before they are ever emailed a notice.
3. **Automatic cleanup.** `flagBouncedFellows()` reads recent delivery-failure notices in Gmail and marks the matching people `bounced` in both the Fellows and Subscribers tabs. Run it by hand from the Apps Script editor, or add a daily trigger: **Triggers (clock icon) > Add Trigger > `flagBouncedFellows` > Time-driven > Day timer**. To email someone again after fixing their address, clear their `Status` cell.

Gmail keeps retrying a failed message for about a day and sends a "Delivery incomplete" notice, then a final failure notice. Notices already on their way will stop by themselves. If a bad row is already in the sheet, delete it or set its `Status` to `skip`.

---

## 5g. How the Index and Structure pages are organized

**Index** introduces the collective and invites people in. Top to bottom: the headline and what the collective does; **Next Live Debate** (free and open, with every upcoming debate read from the Debate Schedule sheet by `js/index.js`, soonest first, the next one outlined in red; if nothing is scheduled it shows the most recent past debate without the outline); Why Participate; Professional Experience (organizations where Principal Design Fellows have worked, A-Z); and the Manifesto with the image caption at the bottom.

**Structure** explains how it works: a short overview, Live Debate (with the full schedule and the host form), Fellowship (Principal Design Fellows and Design Fellows, where Principal Design Fellows have worked, and email notices), Pillars, Becoming a Design Fellow (criteria, contact email and the registration form), Intellectual Foundation, and Methodology. A row of jump links under the title leads to each section.

Things to keep in mind:

- Public participation is open and free. Fellowship is a selective appointment and is never required to attend a debate. Fellows receive the email notice of each scheduled debate automatically, and anyone can sign up for the same notices with the form under the upcoming debates (section 5f).
- Keep at least one future debate in the Debate Schedule sheet. When none is upcoming, the Index shows the most recent past debate instead.
- The manifesto stays on the Index. Its first paragraph shows by default and the rest opens with "Read the full manifesto". The Manifesto link in the navigation (`index.html#manifesto`) opens it automatically.
- Anchor links (such as `index.html#manifesto` or `structure.html#fellowship`) are kept flush under the sticky header by `js/anchors.js`, which re-aligns the section while the debate card and schedule finish loading. Load it on any page that has `#` links to its own sections.
- The professional experience lists are plain text on purpose. Edit them in `index.html` and `structure.html` (`<ul class="credential-list">`), keep them in A-Z order, and only list organizations where a current Principal Design Fellow has actually worked. The note under the list states that this is not an endorsement or affiliation.
- The Pillars list is in `structure.html` (`<div class="pillar-list">`), in A-Z order with fellow initials.
- Section rules are 2px lines drawn inside the text column (see `.section-block > .wrap::before` in `css/style.css`). Change `--rule-strong` to adjust their strength.
- The next-debate card needs the same published Debate Schedule CSV as the Structure page. If you ever change `DEBATE_CSV_URL` in `js/structure.js`, change it in `js/index.js` too.

### Navigation labels

The four navigation labels replace one letter with a drawn glyph (M&#9651;NIFESTO, STRUCTUR&#8801;, DISC&#9673;URSE, ZEI&#8593;GEIST). The glyphs are small inline SVGs in the header of each page, and each link keeps the real page name as its accessible label. The same header block must be used on every page. When you add a page, copy the `<nav class="site-nav">` block from an existing page and move `aria-current="page"` to the right link.

---

## 6. Deploy

**GitHub Pages:** upload the contents of this folder to your repo (keep the `css`, `js` and `assets` folders), then Settings > Pages > source = default branch, root.

**GoDaddy or any static host:** upload the contents into your hosting root (`public_html/`) with `index.html` at the top level.

Do not upload the three `.gs` files to the website if you would rather keep them private. They are only reference copies for pasting into Google's editor.

## 7. Troubleshooting

- **Nothing changed after upload:** hard refresh (Cmd/Ctrl+Shift+R). GitHub Pages caches files for a while.
- **"Incorrect password" even with the right one:** the script on Google's side still has the old password. Redeploy it as a new version (section 2).
- **Toggles missing on the Structure page:** `POST_ENDPOINT_URL` in `js/structure.js` is still the placeholder.
- **Debate list says it is not connected or cannot load:** check `DEBATE_CSV_URL`, and that the Debate Schedule tab (not the whole document) is published as CSV.
- **A debate shows the wrong time:** the Date cell must be US Eastern, like `2026-12-05 10:00`.
- **New rows take a few minutes to appear after a reload:** normal. Google refreshes published CSVs on a short delay. New items appear immediately on your own screen after you submit.
- **Email did not arrive:** check the Fellows tab has an `Email` header and valid addresses, that the person's `Status` is not `bounced` or `skip`, check spam, and confirm you approved the email permission when deploying.
- **Registering says the domain cannot receive mail:** the address has a typo in the part after the `@`. Correct it and try again. If the address is real and the domain is unusual, add the row to the `Fellows` tab by hand.
- **The form says "Couldn't reach the posting service" after a script update:** the deployment is no longer set to Execute as **Me** and Who has access **Anyone**. Open **Manage deployments > pencil** and set both, with Version **New version**.
- **"Delivery incomplete" notices keep arriving:** a bad address is still in the `Fellows` tab. Delete the row or set `Status` to `skip`, then run `flagBouncedFellows` once.
