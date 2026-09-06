# DIBAY OWNER ADMIN — ORIGINAL PLAN RECONCILIATION

**Authority:** Final Owner Store OS reconciliation program (not a new design plan).  
**Mode:** ORIGINAL APPROVED CONTRACT ↔ PRE-STORE-OS ↔ CURRENT ↔ BACKEND ↔ PRODUCTION  
**State:** OWNER ADMIN STORE OS = **FAIL / NOT CLOSED**  
**Updated:** 2026-09-06

---

## 1. Corrected forensic timeline

| Label | SHA | Meaning |
|---|---|---|
| **PRE_STORE_OS_BASELINE_SHA** | `1771318be5760fb99308128e03ccb9f72623b852` | Last commit before Store OS P0 (`7fd97bd07^`) |
| **LAST_GOOD_BEFORE_REGRESSION_SHA** | `d4f512232f0a4da1a81eacc0718005bb6925b476` | Product New used **document/flow layout** (form not nested in `flex-1 basis-0` under `h-[100dvh] overflow-hidden`) |
| **FIRST_BAD_SHA** | `e41d44c73760ffda98ae8f6620a0c03768ef1dfb` | Introduced composer `h-[100dvh] overflow-hidden` + form scroll `min-h-0 flex-1 basis-0` |
| **STORE_OS_RECONSTRUCTION_START** | `7fd97bd078106869688ad4ce19eea8b0111694ea` | Owner P0 shell + IA — **inherited** already-bad Product composer layout |
| **RECOVERED_GOOD_SHA** | `ad7942be6fe0fd0caa22a59a20e42a7596ce2dcd` | Product New height/scroll MINIMUM_FORWARD_FIX — **not** LAST_GOOD |

**Naming correction:** Do **not** call `ad7942be6` `LAST_GOOD_SHA`. It is `RECOVERED_GOOD_SHA`.

**Implication:** Store OS range `7fd97bd07`→`d5edced8c` had no visually usable Product New. Coarse PASS claims in that range are untrusted until re-proven under HARD PASS rules (§3).

---

## 2. HARD PASS rules (binding)

```
component exists ≠ PASS
route exists ≠ PASS
DOM exists ≠ PASS
href exists ≠ PASS
API 200 ≠ PASS
mutation success ≠ PASS
Playwright fill() ≠ PASS
HTMLAudioElement.play() ≠ sound PASS
Vercel Ready ≠ Production PASS
```

PASS requires: SEE → REACH → OPERATE → CTA → PERSIST (if write) → DOWNSTREAM → NAV BACK → mobile/tablet intact.

Zero-height / clipped / covered / non-scrollable / intercepted = **FAIL**.

---

## 3. Requirement ledger

Status vocabulary only:  
`PASS_PRODUCTION` · `BROKEN` · `MISSING` · `REGRESSED` · `PARTIAL` · `NOT_SUPPORTED` · `DEFERRED` · `NOT_PROVEN`

### PRODUCT

| REQ_ID | ORIGINAL REQUIREMENT | PRE-OS | CURRENT CODE | ROUTE | BACKEND | PROD RESULT | UI | UX | CTA | SSOT | STATUS | FIX | PROOF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P-01 | Product list | usable | `OwnerProductsHubClient` | `/products` | list API | see recovery | ok | ok | register | hub | PASS_PRODUCTION | — | product-complete after ad7942 |
| P-02 | Add product entry | usable | hub + drawer `product_new` | `/products/new` | — | ok | ok | ok | open | nav registry | PASS_PRODUCTION | — | bounded + complete |
| P-03 | Registration body visible + scroll | usable @ `d4f512232` | `OwnerProductForm` + shell | `/products/new` | — | recovered | ok | scroll | — | shell+form | PASS_PRODUCTION | `ad7942be6` | forensic + complete |
| P-04 | Category | yes | sticky picker | form | menu_section | ok | ok | ok | pick | form | PASS_PRODUCTION | — | complete |
| P-05 | Images upload/preview | yes | `OwnerProductImagesBlock` | Basics | upload | ok | ok | ok | save | images | PASS_PRODUCTION | — | complete |
| P-06 | Name/summary/price/discount | yes | form | Basics | POST/PATCH | ok | ok | ok | Save | form | PASS_PRODUCTION | — | complete |
| P-07 | Inventory | yes | form | Basics | POST/PATCH | ok | ok | ok | Save | form | PASS_PRODUCTION | — | complete |
| P-08 | Options groups/values/delta | yes | `OwnerProductOptionsTab` | Options | options_json | ok | ok | ok | Save | options | PASS_PRODUCTION | — | complete |
| P-09 | Status band (orders/visible/sold_out) | yes | toggles | form | product_status | ok | ok | ok | Save | form | PASS_PRODUCTION | — | complete |
| P-10 | Create-time sold_out | yes | POST allowlist | POST | product_status | ok | ok | ok | Save | product gate | PASS_PRODUCTION | prior allowlist | complete |
| P-11 | Edit → buyer reflection | yes | edit form | `/edit` | PATCH | ok | ok | ok | Save | form | PASS_PRODUCTION | — | complete |
| P-12 | Sold out → buyer → resume | yes | hub + public | hub/detail | PATCH | ok | ok | ok | toggle | product_status | PASS_PRODUCTION | buyer soldOut fix | complete |
| P-13 | Language tab | placeholder | placeholder | form | none | — | — | — | — | — | NOT_SUPPORTED | — | — |
| P-14 | Product copy | never | no | — | — | — | — | — | — | — | NOT_SUPPORTED | — | — |

### STORE MANAGEMENT

| REQ_ID | ORIGINAL REQUIREMENT | AUTHORITY | ROUTE | STATUS | NOTES |
|---|---|---|---|---|---|
| S-01 | Store name | ADMIN_APPROVAL / locked | basic-info | NOT_PROVEN | UI shows ops-change message; re-prove authority copy |
| S-02 | Description | OWNER_EDIT | basic-info | PARTIAL | persist OK; buyerFacingEffect script flaky — re-prove public |
| S-03 | Logo/image | OWNER_EDIT | basic-info | NOT_PROVEN | |
| S-04 | Phone/contact | OWNER_EDIT | basic-info/profile | NOT_PROVEN | |
| S-05 | Address/map | OWNER_EDIT | profile | NOT_PROVEN | |
| S-06 | Store category | READ_ONLY / locked | basic-info | NOT_PROVEN | |
| S-07 | Hours | OWNER_EDIT | profile | NOT_PROVEN | |
| S-08 | Holidays/temp pause | OWNER_EDIT | profile | PARTIAL | hoursNote→holidays dual-write FIXED LOCAL; Production buyer reflection pending |
| S-09 | Visibility toggle | OWNER_EDIT | hub/ops | PARTIAL | API toggle proven; UI one-tap path re-prove |
| S-10 | Open state | OWNER_EDIT | hub | PARTIAL | |
| S-11 | Delivery/pickup/fee/min/prep | OWNER_EDIT | profile/settings | PARTIAL | patch persist; buyer flags re-prove |
| S-12 | Service configuration | OWNER_EDIT | settings | NOT_PROVEN | |

### ORDERS

| REQ_ID | REQUIREMENT | SSOT | STATUS | NOTES |
|---|---|---|---|---|
| O-01 | New order queue | process model | PARTIAL | queue visible; full CTA chain re-prove Production |
| O-02 | Accept + prep time | transitions | NOT_PROVEN | local historical only |
| O-03 | Preparing/ready/delivery/complete | transitions | NOT_PROVEN | |
| O-04 | Reject/cancel | transitions | NOT_PROVEN | |
| O-05 | Long-pending distinct UX | stale-pending | PARTIAL | surface PASS; full process NOT_PROVEN |
| O-06 | Order detail/receipt | detail API | NOT_PROVEN | |
| O-07 | Order chat entry | order-chats | PARTIAL | hub link; list UI network flake observed |
| O-08 | Filters/search | orders UI | NOT_PROVEN | |
| O-09 | New order alert/badge | counts RPC | PARTIAL | |

### DASHBOARD

| REQ_ID | REQUIREMENT | STATUS | NOTES |
|---|---|---|---|
| D-01 | Store status first | PARTIAL | present; hierarchy audit needed |
| D-02 | Action-required orders | PARTIAL | |
| D-03 | pending ≠ today count | PARTIAL | prior proof; re-prove |
| D-04 | Customer attention | PARTIAL | |
| D-05 | Sold-out / product issue | PARTIAL | |
| D-06 | Finance/settlement cards | PARTIAL | |
| D-07 | Real CTA drill-downs | NOT_PROVEN | |

### CUSTOMER

| REQ_ID | REQUIREMENT | STATUS | NOTES |
|---|---|---|---|
| C-01 | Care hub (not silent inquiries redirect) | PARTIAL | hub root PASS; list leaves redirect to center by design |
| C-02 | Order chat list→detail | PARTIAL | single-flight JSON fix shipped `a5f78fe24`; list UI re-prove pending |
| C-03 | Store inquiries work | PASS_PRODUCTION | empty/list HARD PASS after `a5f78fe24` (`customer-ads-hard-pass-prod.json`) |
| C-04 | Reviews list+reply | PARTIAL | list HARD PASS Production (`a5f78fe24`); reply CTA path NOT_PROVEN this turn |
| C-05 | DIBAY support center | PARTIAL | UI loads |
| C-06 | Badges/deeplinks | NOT_PROVEN | |

### FINANCE / SETTLEMENT

| REQ_ID | REQUIREMENT | STATUS | NOTES |
|---|---|---|---|
| F-01 | Coin/Cash separation | PARTIAL | UI labels present; Cash ledger sign FIXED LOCAL |
| F-02 | Ledgers/history | PARTIAL | title i18n + cash debit sign FIXED LOCAL; Production re-prove |
| F-03 | Coin→Cash | PARTIAL | real API; hash scroll FIXED LOCAL |
| F-04 | Cash top-up | PARTIAL | real API; hash scroll FIXED LOCAL |
| F-05 | Withdrawal/payout | PARTIAL | real API path present |
| F-06 | Settlement discovery | PARTIAL | route reachable; truncated banner FIXED LOCAL |
| F-07 | Settlement read-only | PARTIAL | guide present; no fake payout |
| F-08 | Every number → real field | PARTIAL | finance A-summary uses server summary SSOT (no page invent) |

### PROMOTION

| REQ_ID | DOMAIN | STATUS |
|---|---|---|
| PR-01 | Coupon | NOT_PROVEN |
| PR-02 | Gift certificate | NOT_PROVEN |
| PR-03 | Banner | NOT_PROVEN |
| PR-04 | Notice | NOT_PROVEN |
| PR-05 | Delivery ads | PASS_PRODUCTION | greeting HARD PASS (`Hello, 테스트1`); no `Unable to load this content` after `a5f78fe24` |

### NOTIFICATIONS

| REQ_ID | REQUIREMENT | STATUS | NOTES |
|---|---|---|---|
| N-01 | Bell inbox open/close | PARTIAL | overlay open PASS; classification incomplete |
| N-02 | Bell ≠ hamburger | PASS_PRODUCTION | drawer-behavioral |
| N-03 | Ads ≠ Orders & delivery | NOT_PROVEN | must re-prove |
| N-04 | Preferences/sound settings | NOT_PROVEN | |
| N-05 | NEW ORDER sound physical | NOT_PROVEN | Android deferred |

### NAV / OPS / SHELL

| REQ_ID | REQUIREMENT | STATUS | NOTES |
|---|---|---|---|
| NAV-01 | BottomNav 5 primaries | PARTIAL | registry OK; runtime re-prove |
| NAV-02 | Drawer complete map | PARTIAL | panel+hrefs; settings href optional IA |
| NAV-03 | Ops-status resolution CTAs | NOT_PROVEN | |
| SH-01 | Composer height/scroll contract | PASS_PRODUCTION | ad7942 + contract test |
| SH-02 | No ambiguous 100dvh+basis-0 | PASS_PRODUCTION | product; audit other forms |

---

## 4. Accidentally removed / reachability (Store OS vs baseline)

From `1771318be` → `7fd97bd07` (+ later):

| Item | Class | Action |
|---|---|---|
| BottomNav order-chat / menu tabs | INTENTIONAL_REPLACEMENT | Keep Customers/Products multi-entry; prove discovery |
| Drawer omit of BottomNav primaries (historical) | ACCIDENTAL then fixed | Preserve registry complete map |
| Notifications → settings href | ACCIDENTAL_REMOVAL (misleading) | Fixed → `/notifications` |
| Product New height collapse (since `e41d44c73`) | BROKEN_REACHABILITY | Fixed `ad7942be6` |
| Staff UI | DEAD_LEGACY / NOT_SUPPORTED | Do not restore |

---

## 5. Execution progress

| Phase | State |
|---|---|
| Timeline correction | DONE |
| Ledger created | DONE (this file) |
| Product hard lock Production | PASS_PRODUCTION (ad7942+) |
| Store field-by-field Production | IN PROGRESS |
| Orders full CTA chain Production | IN PROGRESS |
| Dashboard / Customer / Finance / Promo / Notif | PENDING |
| Shell audit other forms | PENDING |
| QA script hardness | IN PROGRESS |
| Responsive matrix | PENDING |
| Ship web close | BLOCKED until domains PASS |
| Android / iOS | DEFERRED until web closed |

---

## 6. Current ship pointers

| | |
|---|---|
| HEAD (at ledger write) | see `git rev-parse HEAD` |
| RECOVERED_GOOD_SHA | `ad7942be6` |
| Production Product recovery deploy | `dpl_2vJvuPLnwd5CuBUy5NAywDxJyD52` |
| Admin ARO | PRESERVED (do not stage) |
