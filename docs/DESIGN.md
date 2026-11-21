# Land Management System – Design

Status: **structure built (21-11-2026)**. The map and a few details are still pending (see the end of this file).

## 1. What the system does

The system tracks land from purchase until each plot's registry is handed over, plus the full history of each plot.

```
Zameen khareedi ──► Layout (roads, parks, masjid, green belt, graveyard…) ──► Plots
                                                                     │
       ┌─────────────────────────────────────────────────────────────┘
       ▼
  Available ─► Sold ─► Payment Clear ─► Registry in process ─► Registered
      ▲          │            │                                   │
      └──────────┴── Cancelled / Transferred / Repurchased ◄──────┘
```

* **No sale price, installment, land purchase price or repurchase amount is stored.** These are only ticks / statuses.
* **What IS stored:** registry maliyat and registry expenses.
* **History is permanent:** `plot_events` (timeline) and `plot_ownerships` (who held it, from–to). These rows cannot be edited or deleted.
* **Multi-project:** every project/society is separate. Switch projects from the top bar.
* **English / Urdu:** each user can switch the language. Urdu screens are right-to-left with the Nastaleeq font.

## 2. Roles

| Role | Does |
|---|---|
| Admin | Everything, users, rates, cancel files |
| Accounts | Sell, Payment Clear, transfer, repurchase, registry demand, send approvals, Check & Verify, expense |
| Land Management | Land purchase ticks, intiqals, non-saleable areas, selects intiqal(s) + "Fard Jari" message |
| Registry Officer | Fard received, hand over fard, registry done, record, hand over |
| Viewer | Read only |

## 3. Registry procedure

```
Payment Clear
  └► Demand (customer's demand; maliyat; Raasta A or B)
       └► [EMAIL] Fard approval to director ──► director Approve/Reject
            └► "Check & Review" email to us ──► we Verify
                 └► Land Management: pick 1-3 intiqals (area balance checked) + "Fard Jari" message
                      └► Registry Officer: Fard received
                           ├► Raasta A (client khud): Fard handed over ─► client's registry no/date recorded ✔
                           └► Raasta B (company karwaye):
                                Expense sheet (filer/non-filer) ─► [EMAIL] director ─► Check & Verify
                                ─► Expense Paid (tick) ─► Registry done ─► Registry recorded in office (+ copy)
                                ─► Handed over to client ✔
```

* A director rejection goes back one step after we verify it, so the data can be corrected and sent again.
* An unanswered link expires after 7 days. The file then goes back one step and we get a notification.
* An optional **Seller expense approval** (only 236-C, like the "Seller Registery Exp" sheet) is available on Raasta A.

## 4. Director approval by email (no login)

1. The email goes **To** the director, **CC** the RG officer and others. The subject keeps the sheet format plus a reference:
   `Request Approval--Registery Exp Rs.213200/- Plot_21.24 [APR-0002]`
   `Fard Approval Request--Plot_21.24 RG2 6.25 Marla Maliyat Rs.3100000/- [APR-0001]`
2. The director has two ways to answer:
   * Click **Approve / Reject** in the email. This opens a confirm page, so Gmail's link scanner cannot approve on its own. Links are single use and expire.
   * **Reply** "Approved" / "Rejected" (Urdu "منظور" / "نامنظور" also works). Every 2 minutes, `approvals:poll-inbox` reads the Gmail inbox over IMAP.
3. Safety checks on a reply:
   * The reply must come from the director's registered email.
   * Gmail's `Authentication-Results` header must pass DMARC, or SPF and DKIM.
   * Only the newly typed text is read, never the quoted original email.
   * An unclear reply, an unknown sender or a failed check moves nothing forward. We get a notification instead, and can record the decision by hand with a remark.
4. Every incoming email is stored in `inbound_emails` as evidence.

## 5. Registry expense template (Google Sheet copy)

| Line | Payer | Rule |
|---|---|---|
| Stamp Paper | buyer | maliyat × 1% + 1,100 |
| TMA Sale Tax | buyer | 1% |
| 236-K | buyer | filer 1.25% / non-filer 10.5% |
| Registration Fee | buyer | 0.5% |
| PLRA | buyer | 3,600 up to 31 lac, +100 per lac above |
| Excise | buyer | 0 up to 5 marla, fixed above |
| Intiqal fee 1,500, CG verification 500, Mix exp 5,000, Map/Naksha fee, LA commission | buyer | fixed |
| 236-C | seller | filer 2.75% / non-filer 11.5% (held < 3 years) |
| 7E FBR | seller | 1% (off by default) |
| Makaan | seller | 2% of land value (off by default) |

* Buyer and seller filer status are separate. The sheet had one tick for both.
* Each line can be unticked, or its amount overridden by hand. The line then shows "changed by hand".
* Rates can be edited in **Settings → Registry Rates**. Saved expenses keep their old amounts.
* Tested: plot 2.24, maliyat 31 lac, filer → **127,950 + 85,250 = 213,200** (same as the sheet). Seller-only 37.5 lac → **103,125**.

## 6. Units

1 marla = **270 sq ft**, 1 kanal = 20 marla. Areas are stored in sq ft and shown as `1K-07M-246sft`.

## 7. Main tables

`projects`, `land_purchases` (ticks only), `intiqals` (with balance), `land_parcels` (non-saleable), `streets`, `plots`, `customers`, `plot_ownerships`, `plot_events`, `registry_cases`, `registry_case_intiqal` (1-3 intiqals per plot), `approval_requests`, `inbound_emails`, `expense_rates`, `registry_expenses`, `registry_expense_lines`, `documents`, `audit_logs`, `settings`.

## 8. Code map

| Where | What |
|---|---|
| `app/Services/Workflow/PlotService.php` | sell / payment clear / transfer / cancel / repurchase – writes history |
| `app/Services/Workflow/RegistryWorkflow.php` | every registry step + role and status checks |
| `app/Services/Approval/ApprovalService.php` | sends approval email, one-click links, records decisions |
| `app/Services/Approval/InboxProcessor.php` + `ReplyParser.php` | reads director replies |
| `app/Services/Expense/RegistryExpenseCalculator.php` | the sheet's calculation |
| `database/data/rg2_plots.php` | RG2 plot list (draft) |

## 9. Pending / to verify

1. **RG2 map PDF**: shapes for the clickable map, plot sizes, corner/park-facing flags, and park/road areas. The plot list (297 plots, streets 21–33 + P.01, P-2, P.03) was read from the PDF text only. Some numbers were not found: 21.04–21.12 (even), 21.71, 21.73, 22.12, 27.24, 28.18, 32.23, 32.25.
2. **Excise** fixed amount above 5 marla (sheet says 200–400).
3. Gmail **App Passwords** for the office account (SMTP + IMAP).
4. **Hosting**: PHP 8.2+, MySQL 8, and a cron for `schedule:run`.
