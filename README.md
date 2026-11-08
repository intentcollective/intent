# intent collective website

Static site, no build step. Four pages:

| Page | File | Data |
|---|---|---|
| Manifesto | `index.html` | none |
| Structure | `structure.html` + `js/structure.js` | Fellows sheet (private), Debate Schedule sheet |
| Discourse | `discourse.html` + `js/discourse.js` | Discourse sheet |
| Zeitgeist | `zeitgeist.html` + `js/zeitgeist.js` | Zeitgeist sheet |

Typeface: DM Sans only. Logo mark and wordmark are in `assets/`.

Google Apps Script files (these are NOT uploaded to the website; you paste each one into Google's script editor):

| File | Used for |
|---|---|
| `google-apps-script.gs` | Discourse posting |
| `google-apps-script-news.gs` | Zeitgeist posting |
| `google-apps-script-fellows-debate.gs` | Fellow registration, debate scheduling, email notice, bounce protection |

---

## 1. The master password

One password now covers every form on the site: Discourse, Zeitgeist, fellow registration, and debate scheduling.

It lives in six places. If you ever change it, change all six, then redeploy the scripts (see section 2):

- `js/discourse.js`, `js/zeitgeist.js`, `js/structure.js` (constant `POST_PASSWORD`)
- `google-apps-script.gs`, `google-apps-script-news.gs`, `google-apps-script-fellows-debate.gs` (variable `PASSWORD`)

How much protection this gives:

- The real check happens inside each Apps Script. A row is only added if the password sent matches.
- The password is still readable by anyone who opens the page source or the browser's network tab. Treat it as a light gate against casual or accidental use, not real authentication.
- Because it is one shared password, any fellow who knows it can register people or schedule debates, not only Principal Design Fellows. For now, Principal Design Fellows host the debates, so share the password with them only.
- The password is not written in this README on purpose, since the repository is public. Do not paste it into public pages.

## 2. Required now: update the two existing scripts

Posting on Discourse and Zeitgeist will fail until the scripts know the new password.

For each of the two existing Google Sheets (Discourse, then Zeitgeist):

1. Open the Sheet, then **Extensions > Apps Script**.
2. Replace the code with the updated file from this project (`google-apps-script.gs` for Discourse, `google-apps-script-news.gs` for Zeitgeist). Check that the `SHEET_NAME` line still matches your tab name, or leave it and the script uses the first tab.
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
Host | Date | Subject | Discourse | Meeting | Added
```

Column order does not matter, but the header names must match. The `Fellowship` column holds `Principal Design Fellow` or `Design Fellow`. If older rows say `Master Design Fellow` or `Principal Design Fellow` from the earlier three-tier version, edit them to match. Nothing in the script depends on those names.

`Status` is optional. Leave it empty for normal fellows. Put `skip` to stop emailing someone. The script writes `bounced` there automatically (see section 5f). If you do not add the column, it is created the first time `flagBouncedFellows` runs.

Add your existing fellows' names and emails to the `Fellows` tab now, so they receive notices. Only the `Email` and `Status` columns are used for the notice.

If you prefer the Fellows list in a different spreadsheet, see `FELLOWS_SPREADSHEET_ID` at the top of the script.

Entering a debate by hand in the sheet: put the date in the Date column as `2026-12-05 10:00` (US Eastern, 24-hour). Format that column as plain text so Sheets does not rewrite it.

### 5c. Publish ONLY the Debate Schedule tab

1. In the spreadsheet: **File > Share > Publish to web**.
2. Under Link, do **not** choose "Entire document". Choose the **Debate Schedule** tab.
3. Choose **Comma-separated values (.csv)**, then **Publish**.
4. Copy the URL.
5. Open `js/structure.js` and paste it into `DEBATE_CSV_URL`.

Do not publish the `Fellows` tab. It contains emails and LinkedIn links, and a published sheet is readable by anyone with the link. The site never needs to read it.

### 5d. Add or update the script

1. In the spreadsheet: **Extensions > Apps Script**.
2. Replace the code with `google-apps-script-fellows-debate.gs`.
3. Check the tab names at the top match your tabs. Set `SEND_EMAIL_NOTICE = false` if you want to turn off the email notice.
4. Save.
5. **Approve permissions before deploying.** In the function dropdown pick `flagBouncedFellows`, click **Run**, and approve when Google asks. The script needs: your spreadsheets, sending email, one outside web request (the email domain check), and reading Gmail (the bounce cleanup). This is your own script on your own sheet.
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
- **+ Schedule a debate:** host name, date and time in US Eastern, a one-sentence subject, the Discourse post, the meeting link, and the password.
  - The page previews Seoul and London times as you pick the date, and notes if the day is not a Saturday.
  - For the Discourse post, type to search the Discourse sheet. Once a host name is entered, that host's posts are listed first. You can also paste any link.
  - The row is added to `Debate Schedule`, then every fellow in the `Fellows` tab gets one email with the subject, host, Eastern, Seoul and London times, and both links.

The schedule shows upcoming debates soonest first, each with Eastern, Seoul and London times. A session moves to **Past debates** two hours after it starts. Past debates are collapsed, grouped by year, and the newest year opens first, so the page stays short as history grows.

### 5f. About the email notice and bounces

- Recipients are sent as BCC, so fellows cannot see each other's addresses.
- Gmail accounts can send to about 100 recipients per day (Google Workspace accounts, about 1,500). The script reports an error if you have more fellows than the daily limit.
- If the email fails, the debate is still saved and the page shows why.
- Duplicate and invalid addresses are skipped, and so is anyone whose `Status` is `bounced` or `skip`.

Why bounces happen: every debate notice goes to every address in the `Fellows` tab. One bad address bounces back to the sending account each time a debate is scheduled. Three layers prevent this:

1. **Check at registration.** The page and the script reject bad formats and domains that cannot receive mail.
2. **Skip list.** Any fellow with `Status` set to `bounced` or `skip` is never emailed.
3. **Automatic cleanup.** `flagBouncedFellows()` reads recent delivery-failure notices in Gmail and marks the matching fellows `bounced`. Run it by hand from the Apps Script editor, or add a daily trigger: **Triggers (clock icon) > Add Trigger > `flagBouncedFellows` > Time-driven > Day timer**. To email someone again after fixing their address, clear their `Status` cell.

Gmail keeps retrying a failed message for about a day and sends a "Delivery incomplete" notice, then a final failure notice. Notices already on their way will stop by themselves. If a bad row is already in the sheet, delete it or set its `Status` to `skip`.

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
