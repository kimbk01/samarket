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

**Current complete-process runtime (Local):** `PASS_OPTIONS_PERSIST_BUYER_PARTIAL`  
- sections / image / options persist / edit = PASS  
- buyer detail name = PASS · buyer list = FAIL · buyer options cue = FAIL (still open)  
- sold-out detail cue was BROKEN (inventory-only); fixed in `StoreProductPublic` — re-prove  

**Current complete-process runtime (Prod):** FAIL prior run — save OK; options empty (script); not redeployed.

---

## ORDERS

| DOMAIN | FUNCTION | PRE-OS | CURRENT | ROUTE | UI ENTRY | COMPONENT | READ | WRITE | STATUS | ACTION REQUIRED |
|---|---|---|---|---|---|---|---|---|---|---|
| ORDERS | New order reception | yes | yes | `/orders` | BottomNav · Drawer · Home | OrdersView/MobileBody | GET orders · counts | create via buyer checkout | LOCAL_PROVEN | `orders-complete-process-proof.json` |
| ORDERS | Order alert / badge counts | yes | yes | `/orders` · hub | CTA · tabs · KPI | OrdersView/MobileBody | meta pending/delivery counts | — | LOCAL_PROVEN | local API+UI counts |
| ORDERS | Detail expand / receipt / payment | yes | yes | card | 상세 | MockCard | GET detail | — | LOCAL_PROVEN | pending+completed detail API |
| ORDERS | Accept with prep time | yes | yes | card | accept sheet | AcceptSheet · MockCard | detail/list | PATCH `accepted` + `estimated_prep_minutes` | LOCAL_PROVEN | 15m persisted |
| ORDERS | Preparing | yes | yes | card | primary CTA | MockCard · process model | list/detail | PATCH `preparing` | LOCAL_PROVEN | |
| ORDERS | Ready | yes | yes | card | primary CTA | MockCard · process model | list/detail | PATCH `ready_for_pickup` | LOCAL_PROVEN | |
| ORDERS | Delivery / arrived | delivery yes | delivery yes | card | primary CTA | MockCard · process model | list/detail | PATCH `delivering`; `arrived` supported but not primary | LOCAL_PROVEN delivering · IMPLEMENTED arrived | delivering proved; arrived edge exists |
| ORDERS | Pickup | yes if fulfillment=`pickup` | yes | card | primary CTA | process model | list/detail | ready→completed | IMPLEMENTED | not exercised in local proof |
| ORDERS | Complete | yes | yes | card | primary CTA | MockCard · apply SSOT | list/detail/buyer | PATCH `completed` | LOCAL_PROVEN | |
| ORDERS | Reject / cancel | yes | yes | reject sheet | 취소/거절 | RejectSheet · cancel policy | list/detail | cancel-request route / PATCH through apply | IMPLEMENTED | not exercised to avoid extra terminal pollution |
| ORDERS | Buyer cancel / problem state | status support | status support | cancelled tab | badges/notices | process model · cancel policy | list/detail/events | buyer/admin writers | IMPLEMENTED | not owner-owned primary write |
| ORDERS | Long-pending treatment | no | yes | New tab | sections | stale-pending | created_at | — | IMPLEMENTED · HISTORICAL WEB PASS | no long-waiting row in final local done-tab proof |
| ORDERS | History / filters / search | yes | yes | `/orders` | tabs · search · filter · sort | MobileBody | GET list | — | LOCAL_PROVEN | local UI observed |
| ORDERS | Order chat/contact | yes | yes | card/footer | 채팅 · 전화 | ChatSlide · phone CTA | detail room id | ensure room | LOCAL_PROVEN chat ready · IMPLEMENTED phone | room ready proved |
| ORDERS | Refund linkage | partial/admin | admin-owned | cancelled tab | status badges | process model | refund statuses | Admin | NOT_SUPPORTED for owner approve | owner cannot approve refund |
| ORDERS | Push / sound / deeplink linkage | yes code | yes code | bell/deeplink | alert sound · URL params | alert debounce · deeplink handlers | notifications | read ack | IMPLEMENTED | physical push/sound NOT_PROVEN |

**Current ORDERS runtime (Local):** `PASS` / `LOCAL_PROVEN` for representative safe flow.  
Evidence: `docs/perf/owner-store-os-complete/recovery/orders-complete-process-proof.json`

- API/cookie flow: buyer creates order → owner GET detail pending → owner PATCH `accepted(15m)` → `preparing` → `ready_for_pickup` → `delivering` → `completed` → buyer GET completed.
- Owner list/history/UI: completed order found in owner list API, done tab rendered with 5 tabs, 4 KPI cards, search/filter chrome, highlighted completed order, order no, chat CTA.
- Not Production proof. No commit/push performed.

---

## STORE MANAGEMENT

**Current runtime (Local):** `PASS` / `LOCAL_PROVEN`  
Evidence: `docs/perf/owner-store-os-complete/recovery/store-management-complete-proof.json`

| DOMAIN | FUNCTION | PREVIOUS UI | CURRENT UI | BACKEND OWNER | AUTHORITY | PERSISTENCE | PUBLIC/BUYER EFFECT | STATUS |
|---|---|---|---|---|---|---|---|---|
| STORE | Basic info | `/basic-info` profile form | `/basic-info` section shell | `PATCH /api/me/stores/[storeId]` | owner-owned editable public profile | `stores` row | public store detail | PRESERVED |
| STORE | Name | identity field when owner edit allowed | same; locked when `owner_can_edit_store_identity=false` | `stores.store_name` | backend identity permission | PATCH only if allowed | public name/search | PRESERVED_LOCKED_BY_BACKEND_AUTHORITY |
| STORE | Description | textarea | branding hero intro | `stores.description` | owner profile | PATCH persisted | public detail text | PRESERVED |
| STORE | Images | profile image + gallery | logo uploader + gallery uploader | upload-image + store PATCH | owner media | `profile_image_url`, `gallery_images_json` | public logo/gallery | PRESERVED |
| STORE | Contact | phone/kakao/GCash contact | contact/payment subblocks | store PATCH | owner profile | `phone`, `kakao_id`, `email`, `website_url` | buyer contact/payment display | PRESERVED |
| STORE | Address/location | address form/map coords | address book linked store + manual coords fallback | store PATCH + address linkage | address/location SSOT | `region/city/district/address_line*`, `lat/lng` | delivery ETA/serviceability/pickup display | PRESERVED |
| STORE | Category/topic | category selectors | taxonomy category/topic selectors or locked display | store PATCH + taxonomy validator | identity permission + taxonomy backend | `business_type`, `store_category_id`, `store_topic_id` | browse/search grouping | PRESERVED_LOCKED_BY_BACKEND_AUTHORITY |
| STORE | Business data | profile metadata | profile/service commerce sections | store PATCH | owner public profile | `business_hours_json` slices | public detail/order info | PRESERVED |
| STORE | Hours | open/close note | auto business hours + note | store PATCH sanitizer | `business_hours_json` | `auto_business_hours`, `note` | public open/hour label | PRESERVED |
| STORE | Holiday | no supported holiday calendar | no dedicated UI | none | no shipped owner backend | none | none | NOT_SUPPORTED |
| STORE | Temporary closure/pause | open toggle/temp closed | temp closed checkbox + home open toggle | store PATCH | `stores.is_open` | persisted | public detail/order availability | PRESERVED |
| STORE | Visibility | visibility toggle | home/settings visibility toggle | store PATCH | `stores.is_visible` + first-list trigger | persisted | public slug/list 404/restore | PRESERVED |
| STORE | Open state | open toggle | home/profile open toggle | store PATCH | `stores.is_open` | persisted | buyer sees open/closed | PRESERVED |
| STORE | Delivery | delivery checkbox | service configuration checkbox | store PATCH | `stores.delivery_available` | persisted | buyer delivery option/serviceability | PRESERVED |
| STORE | Pickup | pickup checkbox | service configuration checkbox | store PATCH | `stores.pickup_available` | persisted | buyer pickup option | PRESERVED |
| STORE | Delivery area | legacy/manual area not owner-owned | global delivery serviceability policy | delivery serviceability runtime | backend/global policy | no owner polygon | buyer eligibility by policy | REPLACED_GLOBAL_POLICY |
| STORE | Delivery fee | fee fields | commerce detail delivery fee mode | store PATCH sanitizer | `business_hours_json` commerce extras | persisted | public/order fee copy | PRESERVED |
| STORE | Minimum order | min order field | commerce detail min order | store PATCH sanitizer | `business_hours_json.min_order_php` | persisted | public minimum order | PRESERVED |
| STORE | Prep time | prep field | commerce detail prep minutes | store PATCH sanitizer | `business_hours_json.prep_time_minutes` | persisted | ETA/order prep guidance | PRESERVED |
| STORE | Service configuration | delivery/pickup/payment/public notices | profile service + commerce sections | store PATCH | owner service config | `stores` booleans + `business_hours_json` | buyer order options/detail | PRESERVED |
| STORE | Staff | never supported | no UI | none | none | none | none | NOT_SUPPORTED |

---

## DASHBOARD

**Current runtime (Local):** `PASS` / `LOCAL_PROVEN`  
Evidence: `docs/perf/owner-store-os-complete/recovery/dashboard-complete-proof.json`

| DOMAIN | FUNCTION | PREVIOUS UI | CURRENT UI | NEXT ACTION | STATUS | ACTION |
|---|---|---|---|---|---|---|
| DASHBOARD | Store status | status/toggles | inline visibility/open toggles | management writer | PRESERVED | |
| DASHBOARD | Urgent order | urgent order card | urgent card with latest pending id | exact order deep link (`order_id`) | BROKEN→FIXED local | `latest_pending_order_id` added to snapshot/API seed |
| DASHBOARD | Problem/resolution | inventory/problem cells | inventory issue cells | product filters/resolution surface | PRESERVED | |
| DASHBOARD | Today order | today metric | today order tile | orders fresh-list context | BROKEN→FIXED local | was settlement-only destination |
| DASHBOARD | Sales | sales metric | sales/avg tiles | finance | BROKEN→FIXED local | was settlement-only destination |
| DASHBOARD | Customer | care strip | order chat / inquiry / support queue | customer queue leaves | PRESERVED | |
| DASHBOARD | Sold-out | quick action | sold-out quick action | products `status=sold_out` | BROKEN→FIXED local | fixed malformed `?storeId...?status` URL |
| DASHBOARD | Finance | finance strip | finance CTA | finance | PRESERVED | |
| DASHBOARD | Settlement | finance strip | settlements CTA | settlements | PRESERVED | |
| DASHBOARD | Promotion | absent from quick action | promotion quick action | coupons promo domain | ACCIDENTALLY_REMOVED→FIXED local | quick action restored |
| DASHBOARD | Decorative dead metric | legacy coarse tiles | all audited tiles have href/writer | none | PRESERVED_NO_DEAD_METRIC | |

---

## CUSTOMER

**Current runtime (Local):** `PASS` / `LOCAL_PROVEN`  
Evidence: `docs/perf/owner-store-os-complete/recovery/customer-complete-proof.json`

| DOMAIN | FUNCTION | PREVIOUS UI | CURRENT UI | BACKEND OWNER | DETAIL/ACTION | UNREAD/BADGE | DEEPLINK/NOTIFICATION | STATUS |
|---|---|---|---|---|---|---|---|---|
| CUSTOMER | Care hub | 4-leaf hub | `/customer-care` work queue | mixed domain readers | leaf links | real counts only | canonical customer hub | PRESERVED |
| CUSTOMER | Order chat list | order chats | `/order-chats` list | `store_orders` + messenger rooms | list→messenger room proved | participant unread_count | messenger return href | PRESERVED |
| CUSTOMER | Order chat detail/reply | messenger room | community messenger room | messenger domain | room send/action | room unread | room notification domain | PRESERVED |
| CUSTOMER | Store inquiries list/detail | inquiry cards | `/inquiries` inline detail cards | `store_inquiries` | reply/close PATCH; no data in local run | open count badge | `/stores/owner/inquiries` | PRESERVED_INLINE_DETAIL |
| CUSTOMER | Reviews list/detail | review cards | `/reviews` inline detail cards | `store_reviews` | owner reply PATCH proved | need-reply count via ops snapshot | buyer notification on first reply | PRESERVED_INLINE_DETAIL |
| CUSTOMER | DIBAY support | old admin notes | Support cases history + legacy archive | support cases + admin notes archive | contact support action + archive detail | admin-note unread badge | `/customer-care/customer-center` | REPLACED_SUPPORT_CASES_WITH_LEGACY_ARCHIVE |

---

## FINANCE / SETTLEMENT

**Current runtime (Local):** `PASS` / `LOCAL_PROVEN`  
Evidence: `docs/perf/owner-store-os-complete/recovery/finance-settlement-complete-proof.json`

| DOMAIN | FUNCTION | PRE-OS | CURRENT | ROUTE | STATUS | ACTION |
|---|---|---|---|---|---|---|
| FINANCE | Coin balance/recognition/history/conversion | yes | yes | `/finance` | LOCAL_PROVEN | API assets + convert quote + Coin history visible |
| FINANCE | Cash balance/top-up/spend/history | yes | yes | `/finance` | LOCAL_PROVEN | business cash ledger/top-up + Cash history visible |
| FINANCE | Withdrawal/payout history | yes | yes | `/finance` | LOCAL_PROVEN | withdrawals history + withdrawal surface visible |
| SETTLEMENT | Order-linked revenue/commission/discount/refund | yes | yes | `/settlements` | LOCAL_PROVEN | settlement summary backed by ledger facts |
| SETTLEMENT | Settlement detail/history | yes | yes | `/settlements` | LOCAL_PROVEN | read-only list/detail/order link visible |
| FINANCE | Legacy points/business-cash pages | pages | redirect→finance | `/points` · `/business-cash` | REPLACED | keep redirects |

---

## PROMOTION

**Current runtime (Local):** `PASS` / `LOCAL_PROVEN`  
Evidence: `docs/perf/owner-store-os-complete/recovery/promotion-complete-proof.json`

| DOMAIN | FUNCTION | PRE-OS | CURRENT | ROUTE | STATUS | ACTION |
|---|---|---|---|---|---|---|
| PROMOTION | Coupons list/create/detail/lifecycle/cost | yes | yes | `/coupons` | LOCAL_PROVEN | API list/detail + UI list/create/detail |
| PROMOTION | Gift certificates apply/products/redemptions | yes | yes | `/gift-certificates` | LOCAL_PROVEN | applications/products/redemptions + UI apply/history |
| PROMOTION | Banners list/create/active | yes | yes | `/banners` | LOCAL_PROVEN | API list + UI add/list surface |
| PROMOTION | Notices list/create | yes | yes | `/notices` | LOCAL_PROVEN | fixture has 0 notices; list/create surface visible |
| PROMOTION | Delivery ads list/detail/status/performance | yes | yes | `/ads/*` | LOCAL_PROVEN | API detail/performance + UI list/detail |

---

## NOTIFICATIONS

**Current runtime (Local):** `PASS` / `LOCAL_PROVEN`  
Evidence: `docs/perf/owner-store-os-complete/recovery/notifications-complete-proof.json`

| DOMAIN | FUNCTION | PRE-OS | CURRENT | ROUTE | STATUS | ACTION |
|---|---|---|---|---|---|---|
| NOTIF | Header bell inbox/badge/read | yes | yes | Tier1 overlay + `/notifications` | LOCAL_PROVEN | inbox API + badge + read safe action check |
| NOTIF | Drawer/Manage「알림」→ settings | yes (mis-target) | **fixed → canonical inbox** | `/stores/owner/notifications` | **BROKEN→FIXED local** | drawer lands on inbox locally |
| NOTIF | Slug inbox/settings | yes | yes (compat) | `/stores/[slug]/owner/notifications*` | HIDDEN_BUT_EXISTS | keep compat |
| NOTIF | Notification settings/preferences/mute/sound | slug only | **canonical added** | `/stores/owner/notification-settings` | **MISSING→FIXED local** | settings route and switches proved locally |
| NOTIF | Push/deeplink/event classification | repaired code | ads classify as marketing | domain SSOT | LOCAL_PROVEN | delivery_ad sample classified marketing |
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
