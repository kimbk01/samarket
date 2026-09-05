# OWNER FUNCTION / PROCESS MATRIX

**Authority:** Store OS COMPLETE plan preserved · Function preservation program  
**Updated:** 2026-09-06  
**Baseline compare:** pre-`7fd97bd07` (Owner P0 shell) ↔ HEAD  
**State:** OWNER ADMIN STORE OS = FAIL / NOT CLOSED

## WITHDRAWN coarse verdicts

| Claim | Status |
|---|---|
| PRODUCT create/edit/sold-out/buyer = COMPLETE PRODUCT PASS | **WITHDRAWN** — proves only partial actions, not full registration process |
| Prior domain-level PASS without process inventory | **WITHDRAWN** as complete-domain authority |

## Compare method

A = current Owner Store OS  
B = immediately-before Store OS reconstruction (`7fd97bd07^`)  
C = canonical backend/API  

STATUS only: `PRESERVED` · `MISSING` · `BROKEN` · `REPLACED` · `NOT_SUPPORTED` · `NOT_PROVEN` · `HIDDEN_BUT_EXISTS` · `ACCIDENTALLY_REMOVED`

---

## PRODUCT

| DOMAIN | FUNCTION | PRE-OS | CURRENT | ROUTE | UI ENTRY | COMPONENT | READ | WRITE | VALIDATION | PRIMARY CTA | STATUS | ACTION REQUIRED |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PRODUCT | List | yes | yes | `/products` | BottomNav · Drawer | `OwnerProductsHubClient` | list API | — | — | register | PRESERVED | |
| PRODUCT | Create entry | yes | yes | `/products/new` | `+ 상품 등록` | hub | — | — | — | open form | PRESERVED | |
| PRODUCT | Category | yes | yes | sticky | picker | `OwnerStoreMenuSectionPicker` | menu-sections | `menu_section_id` | required | pick | PRESERVED | |
| PRODUCT | Image upload/preview/remove | yes | yes | Basics | `OwnerProductImagesBlock` | thumb/images | upload+JSON | dim/required | save | PRESERVED | prove remove |
| PRODUCT | Name / summary / price / discount | yes | yes | Basics | `OwnerProductForm` | row | POST/PATCH | required name/price | Save | PRESERVED | |
| PRODUCT | Inventory | yes | yes | Basics | form | | POST/PATCH | | | PRESERVED | |
| PRODUCT | Options groups/values/delta/sold-out/default | yes | yes | Options | `OwnerProductOptionsTab` | options_json | POST/PATCH | group validate | Save | PRESERVED code · **NOT_PROVEN persist** | complete process proof |
| PRODUCT | Status band (orders/visible/sold-out/recommend) | yes | yes | form | toggles | | POST/PATCH | | | PRESERVED | |
| PRODUCT | Create-time sold_out | UI | UI+API allowlist | POST | form | | POST | | | **BROKEN→FIXED local** | deploy + prove |
| PRODUCT | Edit / delete / hide / show / resume | yes | yes | edit · hub | form+hub | | PATCH | | | PRESERVED | prove UI paths |
| PRODUCT | Language tab | placeholder | placeholder | form | | — | — | | | NOT_SUPPORTED | |
| PRODUCT | Copy | never | no | — | — | — | — | | | NOT_SUPPORTED | |
| PRODUCT | Buyer reflection | — | — | buyer store | | public | — | | | NOT_PROVEN complete | after full registration |

### PRODUCT registration process differential

| STEP | BEFORE | CURRENT | BACKEND | VERDICT | FIX |
|---|---|---|---|---|---|
| Start Products → +등록 | yes | yes | — | PRESERVED | |
| Category | yes | yes | menu_section | PRESERVED | |
| Image | yes | yes | thumb required | PRESERVED | |
| Basic info | yes | yes | yes | PRESERVED | |
| Price + discount | yes | yes | yes | PRESERVED | |
| Inventory | yes | yes | yes | PRESERVED | |
| Options editor | yes | yes (scroll tab) | options_json | PRESERVED code · mobile CTA scroll harden | data-attrs + scroll safe band |
| Validation | yes | yes | API | PRESERVED | |
| Save → list | yes | yes | POST | PRESERVED | |
| Create-time 품절 | UI | silent coerce→hidden on Prod | POST deny sold_out | **BROKEN** (local allowlist fixed) | ship POST sold_out |
| Buyer detail sold-out cue | list OK | detail ignored `product_status` | API returns sold_out | **BROKEN→FIXED local** | `StoreProductPublic` soldOut OR status |
| Language | placeholder | placeholder | none | NOT_SUPPORTED | |

**Form/Options/Images byte-identical vs pre-P0.** Gaps = incomplete QA + create sold_out coerce + mobile options tap.

**Current complete-process runtime (Local):** `PASS` · `LOCAL_PROVEN`  
Evidence: `recovery/product-complete-process-proof.json`  
Owner→Buyer: list · detail · options · sold-out · resume · create sold_out status · cleanup  

**Current complete-process runtime (Prod):** NOT_PROVEN (fixes undeployed)

---

## ORDERS

| DOMAIN | FUNCTION | PRE-OS | CURRENT | STATUS | ACTION |
|---|---|---|---|---|---|
| ORDERS | Reception list + RT | yes | yes | PRESERVED | |
| ORDERS | Accept + prep time | yes | yes | PRESERVED | UI prove |
| ORDERS | Reject / cancel / cancel-request | yes | yes | PRESERVED | |
| ORDERS | preparing → ready → delivering → complete | yes | yes | PRESERVED | Policy A skip arrived primary |
| ORDERS | Pickup ready→complete | yes | yes | PRESERVED | |
| ORDERS | Arrived primary CTA | Policy A | Policy A | HIDDEN_BUT_EXISTS API | do not invent |
| ORDERS | Detail expand / receipt | yes | yes | PRESERVED | |
| ORDERS | Detail overlay auto-accept | unmounted | unmounted | HIDDEN_BUT_EXISTS | keep |
| ORDERS | Chat ensure + open | yes | yes | PRESERVED | |
| ORDERS | Long-pending UX | no | yes | PRESERVED (added) | web PASS |
| ORDERS | History / filter / search | yes | yes | PRESERVED | |
| ORDERS | Badge split vs customers | yes | yes | PRESERVED/REPLACED wiring | |
| ORDERS | Owner refund approve | no | no | NOT_SUPPORTED | |
| ORDERS | Sound / push / deeplink | yes code | yes code | PRESERVED code · NOT_PROVEN device | native later |
| ORDERS | ACCIDENTALLY_REMOVED / BROKEN | — | — | **NONE** | |

**ORDERS inventory:** reconciled · **ACCIDENTALLY_REMOVED/BROKEN = NONE** · no restore.  
**ORDERS runtime:** `ORDER_SAFE_FLOW` API LOCAL_PROVEN · full UI surface walk NOT_PROVEN (local Next flaky) · native later.

## STORE MANAGEMENT

| DOMAIN | FUNCTION | PRE-OS | CURRENT | ROUTE | UI ENTRY | STATUS | ACTION |
|---|---|---|---|---|---|---|---|
| STORE | Basic info (name/desc/image/phone/address/category) | yes | yes | `/basic-info` | Drawer · Manage | PRESERVED | |
| STORE | Hours / temp / open / delivery fee / min / prep / pickup | yes | yes | `/profile` | Drawer · Manage | PRESERVED | |
| STORE | Visibility / open toggles | yes | yes | hub · `/settings` | toggles | REPLACED UX | same writers |
| STORE | Ops/approval status | yes | yes | `/ops-status` | Drawer | PRESERVED | |
| STORE | Holidays / delivery polygon | never | no | — | — | NOT_SUPPORTED | |
| STORE | Staff | never | no | — | — | NOT_SUPPORTED | DEFERRED |

---

## DASHBOARD

| DOMAIN | FUNCTION | PRE-OS | CURRENT | DESTINATION | STATUS | ACTION |
|---|---|---|---|---|---|---|
| DASHBOARD | Store status | yes | yes | settings writers | PRESERVED | |
| DASHBOARD | Urgent / flow / inventory cells | yes | yes | orders/products filters | PRESERVED | |
| DASHBOARD | Today sales | yes | yes | settlements | PRESERVED | |
| DASHBOARD | Customer strip | yes | yes | chats/inquiries/center | PRESERVED | reviews not on home card |
| DASHBOARD | Finance strip | yes | yes | finance · settlements | PRESERVED | |
| DASHBOARD | Reviews on home care | no | no | hub only | HIDDEN_BUT_EXISTS | optional |

---

## CUSTOMER

| DOMAIN | FUNCTION | PRE-OS | CURRENT | ROUTE | STATUS | ACTION |
|---|---|---|---|---|---|---|
| CUSTOMER | Care hub (4 leaves) | yes | yes | `/customer-care` | PRESERVED | web hub PASS |
| CUSTOMER | Order chats / room | yes | yes | order-chats · order-chat | PRESERVED | reply prove |
| CUSTOMER | Store inquiries | yes | yes | `/inquiries` | PRESERVED | |
| CUSTOMER | Reviews + reply | yes | yes | `/reviews` | PRESERVED | |
| CUSTOMER | DIBAY support center | yes | yes | customer-center | PRESERVED | |

---

## FINANCE / SETTLEMENT

| DOMAIN | FUNCTION | PRE-OS | CURRENT | ROUTE | STATUS | ACTION |
|---|---|---|---|---|---|---|
| FINANCE | Coin/Cash balances · history · convert · top-up · withdraw | yes | yes | `/finance` | PRESERVED | surface prove |
| FINANCE | Settlements | yes | yes | `/settlements` | PRESERVED | |
| FINANCE | Legacy points/business-cash pages | pages | redirect→finance | | REPLACED | keep redirects |

---

## PROMOTION

| DOMAIN | FUNCTION | PRE-OS | CURRENT | ROUTE | STATUS | ACTION |
|---|---|---|---|---|---|---|
| PROMOTION | Coupons | yes | yes | `/coupons` | PRESERVED | |
| PROMOTION | Gift certificates | yes | yes | `/gift-certificates` | PRESERVED | |
| PROMOTION | Banners / notices | yes | yes | `/banners` · `/notices` | PRESERVED | |
| PROMOTION | Delivery ads (+ new/partner/popup) | yes | yes | `/ads/*` | PRESERVED | |

---

## NOTIFICATIONS

| DOMAIN | FUNCTION | PRE-OS | CURRENT | ROUTE | STATUS | ACTION |
|---|---|---|---|---|---|---|
| NOTIF | Header bell inbox | yes | yes | Tier1 overlay | PRESERVED | |
| NOTIF | Drawer/Manage「알림」→ settings | yes (mis-target) | **fixed → canonical inbox** | `/stores/owner/notifications` | **BROKEN→FIXED local** | prove after deploy |
| NOTIF | Slug inbox/settings | yes | yes (compat) | `/stores/[slug]/owner/notifications*` | HIDDEN_BUT_EXISTS | keep compat |
| NOTIF | Notification settings page | slug only | **canonical added** | `/stores/owner/notification-settings` | **MISSING→FIXED local** | prove |
| NOTIF | Event classification | repaired code | shipped prior | domain SSOT | PRESERVED code | typed Prod proof |
| NOTIF | Physical device sound | — | — | — | NOT_PROVEN | Android/iOS |

---

## NAVIGATION / DISCOVERY

| DOMAIN | FUNCTION | STATUS | NOTES |
|---|---|---|---|
| NAV | BottomNav 5 | PRESERVED | |
| NAV | Drawer complete map | PRESERVED | web behavioral PASS |
| NAV | Bell vs hamburger | PRESERVED | web PASS |
| NAV | Notifications discoverability | **FIXED local** | was settings mis-href |
| NAV | Android drawer open | **FAIL** | remaining |

---

## Canonical `/stores/owner/*` routes

`/` · apply · orders · order-chats · order-chat/[id] · products · products/new · products/[id]/edit · menu(→products) · menu-categories · customer-care(+leaves) · inquiries · reviews · basic-info · profile · settings · ops-status · edit(→profile) · finance · settlements · points(→finance) · business-cash(→finance) · coupons · gift-certificates · banners · notices · ads(+sub) · **notifications** · **notification-settings**

---

## Existing recovery items (not dropped)

| Item | Status |
|---|---|
| Customer canonical hub | PASS behavioral (web) |
| Drawer map / bell vs hamburger | PASS behavioral (web) |
| Notification classification code | shipped; event-typed Prod proof pending |
| Long-pending UX | PASS behavioral (web) |
| Canonical notifications route | **IMPLEMENTED local** — runtime NOT_PROVEN |
| Create sold_out POST | **IMPLEMENTED local** — Prod still coerce |
| Android drawer | FAIL |
| iOS Owner / sound | NOT_PROVEN (device locked) |
| Android NEW ORDER sound quality | open |

---

## Program sequence (binding)

FUNCTION RECON → PRODUCT COMPLETE → ORDERS → STORE → DASHBOARD → CUSTOMER → FINANCE → PROMOTION → NOTIF → NAV → ROUTE WALK → RESPONSIVE → ANDROID → IOS → GATES → COMMIT → PUSH → PRODUCTION → TRUE FINAL CLOSE

**Matrix status:** INCOMPLETE (Product complete-process FAIL; other domains inventory done, runtime proofs remaining)
