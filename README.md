# 🏗 Daglig tillsyn

A mobile-first web app for daily inspection of overhead cranes and hoists, built as a single HTML file with a [Google Apps Script](https://script.google.com) backend and Google Sheets as the database. Designed to replace paper inspection sheets in industrial environments. The check is performed in connection with use, and each inspection is valid for 24 hours.

The interface is in Swedish — all labels, checklist items, and messages are in Swedish regardless of the user's device language.

---

## Features

- **Equipment register** — every crane and hoist listed with unit number, location, department, and model
- **Colour-coded status** at a glance in the object list:
  * Green — inspected within the last 24 hours, no findings
  * Red — inspection expired, open finding, or never inspected
- **24-hour validity** — an inspection is valid for exactly 24 hours from the moment it was signed, not until the end of the calendar day. Opening an expired unit shows a warning that inspection is required before use.
- **Six-group checklist** — rope, hoist block, limit switches, control pendant, brake, and emergency stop
- **Three answer options** per item — *No finding*, *Finding*, or *Not applicable*, since some items don't exist on every unit
- **Mandatory descriptions** — selecting *Finding* opens a comment field that must be filled in; the app won't save without it, and the text becomes the basis for the work order
- **Expandable guidance** — the general advice for each checklist item is available inline, one tap away
- **Extra-inspection flags** — units requiring additional checks before use are marked in the list and warned about when the inspection opens
- **Open findings carry forward** — opening an inspection on a unit with an unresolved finding shows a warning to verify the work order and remedy first
- **Login with name + PIN** — no email or account required, validated server-side so PINs never reach the browser
- **Admin view** — manage users and equipment, delete individual inspections, view all history
- **Statistics** — units with valid versus expired inspections, most common findings by checklist item, inspections per person
- **Export** — download all data as CSV (semicolon-separated, UTF-8 BOM for Excel compatibility) or JSON
- **Offline queue** — if the network fails, the inspection is stored locally and sent automatically once the connection returns
- **Three themes** — Dark, Classic, and Light, saved per device
- **PWA-ready** — can be added to the home screen on iOS and Android, with a Service Worker handling updates automatically

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Single-file HTML + vanilla JS + CSS |
| Backend | Google Apps Script (web app endpoint) |
| Database | Google Sheets |
| Hosting | GitHub Pages |
| Fonts | Google Fonts (DM Sans, DM Mono) |

No build tools, no frameworks, no dependencies to install. No paid services — the backend runs entirely within a normal Google account.

---

## Getting Started

### 1. Create the spreadsheet

Create a new sheet at [sheets.google.com](https://sheets.google.com). Tabs and headers are generated automatically in step 3.

### 2. Add the backend

In the spreadsheet: **Extensions → Apps Script**. Delete the default code, paste the contents of `Kod.gs`, and save.

### 3. Run the setup

Select the `skapaUppsattning` function and click **Run**. Approve the permission prompt (it's your own script requesting access to your own spreadsheet).

This creates four tabs:

| Tab | Contents |
|---|---|
| `Anvandare` | Name, PIN, role |
| `Traverser` | The equipment register |
| `Checklista` | The 13 inspection items |
| `Kontroller` | The log, filled in as the app is used |

An admin account is created in `Anvandare`. **Change its PIN before putting the app into use.**

### 4. Deploy as a web app

**Deploy → New deployment → Web app**, with:

- **Execute as:** Me
- **Who has access:** Anyone

Copy the resulting URL.

### 5. Configure the app

Open `index.html` and update the constant near the top of the `<script>` tag:

```javascript
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/.../exec';
```

### 6. Deploy

Upload `index.html` and `sw.js` to GitHub Pages (or any static host) — both must be in the same directory. Share the URL with your team.

The Service Worker caches the app and handles updates automatically. When you upload a new version, bump `CACHE_VERSION` at the top of `sw.js`; users are then offered the update the next time they open the app, with no need to remove and re-add the home screen icon.

---

## Usage

### Operators
1. Open the URL in a mobile browser
2. Tap **Share → Add to Home Screen** to install as an app
3. Log in with your name and PIN
4. Pick the crane or hoist, work through the checklist, and sign

A red unit needs inspecting before use — either its 24 hours have elapsed, it has an open finding, or it has never been inspected. Findings must be described before the inspection can be saved. Report them to your supervisor before further use and raise a work order with maintenance.

### Admin
Log in with an admin account to access:
- Add and remove users
- Add and remove equipment
- Delete individual inspections
- Statistics and CSV/JSON export

---

## Editing the spreadsheet directly

Everything in the sheet takes effect immediately — the app reloads its data at every login, so the HTML file never needs touching.

The inspection items live in the `Checklista` tab. Edit the wording, add items, or set `aktiv` to `Nej` to hide one. The `punkt` column determines which guidance text is shown.

Users, equipment, and logged inspections can be edited the same way. A few columns must match exactly:

| Column | Accepted values |
|---|---|
| `roll` | `admin` or `personal`, lower case |
| `aktiv` | `Ja` or blank to show, `Nej` to hide |
| `extrakontroll` | `Ja` for the extra-inspection flag, otherwise `Nej` or blank |

**About the ID columns.** Every row needs a unique, non-empty `id`. The value itself is arbitrary — `T-001` works as well as the generated string — but a unit's ID is what links it to its inspection history, so never change the ID of an existing unit or it loses its record. The easiest approach is to copy the row above and increment the last part.

**About timestamps.** `skapad` in `Anvandare` is informational only. `tidpunkt` in `Kontroller` is not: it drives validity, colour coding, sorting, and statistics. It is stored in ISO format in UTC (`2026-07-24T16:09:33.412Z`) and converted to local time for display. If you edit one by hand, keep the format — and be aware that Sheets may silently reformat a cell that looks like a date. To remove a test inspection, delete the whole row rather than editing it.

Rather than deleting a unit permanently, consider setting `aktiv` to `Nej`. It disappears from the app but keeps its history.

---

## Security Notes

- The Apps Script endpoint is open to anyone with the URL, which is what allows the app to reach it from GitHub Pages without a Google login.
- PINs are validated server-side. The endpoint returns only a yes/no and the user's role — PINs are never sent to the browser and never appear in the page source.
- The user list cannot be read without a valid admin ID, and every admin action is verified against the spreadsheet rather than trusted from the client.
- This is reasonable protection for an internal inspection form, but it is not full authentication. Don't share the URL outside the organisation.
- For higher requirements, add a shared secret that the Apps Script requires on every request.

---

## Quick access

Scan the QR code with your phone's camera to open the app:

<img src="QR_Traverstillsyn.png" alt="QR code for Daglig tillsyn" width="180">

`https://im4fun.github.io/traverstillsyn/`

---

## License

© 2026 CARÅ. All rights reserved.
