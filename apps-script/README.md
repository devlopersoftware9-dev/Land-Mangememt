# Land Management – Google Sheet + Apps Script edition

There is no hosting, no server and no cost. The Google Sheet is the database, and the app runs from the same sheet as a web link. Approval emails go through your Gmail.

## Setup (once, about 15 minutes)

1. **Create a new Google Sheet** from the **office Gmail** (the email the approval emails should go out from). Name it, for example, "Land Management RG2".
2. In the sheet menu, open **Extensions → Apps Script**.
3. There is a `Code.gs` file on the left. Delete everything in it, then paste in all of [`dist/Code.gs`](dist/Code.gs).
4. Click **+ → HTML** and create a file named **`Index`**. Paste in all of [`dist/Index.html`](dist/Index.html).
5. Click **+ → HTML** again and create a file named **`Decide`**. Paste in all of [`dist/Decide.html`](dist/Decide.html).
6. Optional but recommended: in **Project Settings (⚙)**, tick "Show appsscript.json". Then paste [`dist/appsscript.json`](dist/appsscript.json) into that file. This sets the timezone to Asia/Karachi.
7. Click **Save (💾)**.
8. Go back to the sheet and refresh the page. A **"Land Management"** menu appears at the top.
   - Click **Land Management → 1. Setup**.
   - Google will ask for permission (Gmail, Sheets). Click **Allow**. If you see "unverified app", choose Advanced → Go to … (unsafe). The app is yours, so this is fine.
   - When Setup finishes, a box shows the **admin password**. **Write it down.**
9. Back in Apps Script, click **Deploy → New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (so the director's Approve link opens without a login; your own app still has its own login)
   - Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
10. In the sheet, click **Land Management → 2. Save web app URL**.
11. Open the URL and log in with the admin email and password. Then:
    - **Settings → Users**: add the staff (Accounts, Land Management, Registry Officer).
    - **Settings → Approval email**: check the director email and the CC list.
    - **Settings → Change my password**.

## Day-to-day

- Share the **web app link** with staff. They do **not** need access to the sheet.
- The director only receives emails. They either click Approve/Reject, or reply "Approved" / "Rejected".
- The system checks Gmail every 5 minutes for the director's replies.
- These tabs are protected, so nobody can edit them by hand: `PlotEvents`, `Ownerships`, `Audit`, `InboundEmails`, `Approvals`.

## When the code changes

Paste the new `dist/` files over the old ones. Then go to **Deploy → Manage deployments → ✏ → Version: New version → Deploy**. The URL stays the same.

## Limits (be aware)

- Google Sheets is comfortable with a few thousand plots and tens of thousands of history rows. For something much bigger, move to the Laravel version (`/app`).
- Gmail sending limit: about 100 emails/day on free Gmail, 1,500/day on Google Workspace.
- Registry scans: upload the scan to Google Drive and paste its link into the "scanned copy" field.

## Developer notes

- Source is split into modules: `Core.gs`, `Db.gs`, `Auth.gs`, `Expense.gs`, `Parser.gs`, `Plots.gs`, `Registry.gs`, `Approval.gs`, `Views.gs`, `Setup.gs`.
- `dist/Code.gs` is all of them joined into one file.
- Rebuild `dist/` after a change:
  ```bash
  cd apps-script && ./build.sh
  ```
- Tested with Node mocks of SpreadsheetApp, Gmail, Cache and Lock:
  - the full company-managed registry flow, from sale to handover, including both director approvals (link and email reply), spoofed and unknown replies, and the intiqal balance;
  - a repurchase and the resulting ownership chain;
  - every screen rendered in English and Urdu.
  - The expense totals match the Google Sheet (Rs 213,200 / Rs 103,125).
