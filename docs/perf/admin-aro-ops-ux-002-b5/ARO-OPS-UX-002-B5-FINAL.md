# DIBAY ADMIN
## ARO-OPS-UX-002-B5 ADS / EXPOSURE FINAL

HEAD BEFORE: `c1fa55d3b` (evidence base) · product base `c19d78ccc`  
HEAD AFTER: `51389b430`  
ORIGIN: `origin/main` @ `51389b430`  
PRODUCTION: Vercel Ready · `dpl_y7d5n9zFaUWeqSTjJVyhi1hMDBny` · Commit `51389b4` · alias `https://samarket.vercel.app`

PRODUCT CODE CHANGE: YES  
FILES: 13 (ads-control-plane read-model/API/UI + hub mount + Action Center + domain/finance deeplinks + action-queue storeId + inventory + test)  
COMMIT: `51389b430` — `feat(admin): add ARO-OPS-UX-002-B5 ads/exposure control plane [vercel build]`  
PUSH: YES (`c1fa55d3b..51389b430`)  
DEPLOY: Ready

### CONTROL PLANE

ROUTE: `/admin/delivery-ads` (+ `#action-required`) — canonical Ads hub (no `/admin/ads-v2`)  
READ MODEL: `lib/admin/ads-control-plane/load-ads-control-plane.ts` · `GET /api/admin/ads-control-plane`  
NEW DB: NONE  
NEW SSOT: NONE  
NEW MUTATION: NONE

### ENTITY CONTRACT

AD PRODUCT: domain product kind (`store_sponsored` / `banner` / `feed_ad` / `platform_popup`) — Partner ≠ AdProduct  
APPLICATION: WAITING_ADMIN / feed pending_review / popup submitted|under_review  
CREATIVE: needs_creative bucket + detail/Placement Map preview path  
PLACEMENT: Placement Map registry rows (≠ Banner product)  
EXECUTION: ACTIVE / SCHEDULED / PAUSED rows from delivery campaign list  
POLICY: linked via Placement Map / domain entries  
BILLING: presentation only — Delivery/Popup=Cash, Feed/Trade-promote=Point

### ACTION REQUIRED

APPLICATION: Delivery + Feed + Popup (+ trade promote labeled ≠ AdProduct)  
CREATIVE: Delivery needs_creative rows  
APPROVAL: WAITING_ADMIN / pending_review  
SCHEDULE: Current execution section  
EXPOSURE ISSUE: eligibility string separates 집행 vs 실제 노출  
REFUND: Finance / Statement deeplinks (no new refund mutation)

### DELIVERY

STORE_SPONSORED: productKind preserved · ≠ organic ranking labeled  
BANNER: productKind preserved · placement via inventory/detail  
CREATIVE: asset path hint + detail studio/preview owner  
PLACEMENT: inventory keys + Placement Map  
BILLING: Cash  
APPROVAL: WAITING_ADMIN ≠ ACTIVE  
EXECUTION: lifecycle from store_*_ad_campaigns  
ELIGIBILITY: presentation from lifecycle + scheduleHint + inventoryKeys + reviewStatus (runtime store/serviceability noted)

### FEED

AUTHORITY: `feed_ad_requests` + existing `/admin/feed-ad-requests/[id]`  
CREATIVE / PLACEMENT: via detail · placement hint  
BILLING: Point (hard)  
STATUS: pending_review projection

### POPUP

AUTHORITY: `platform_popup_owner_requests` + `/admin/platform-popup`  
TARGET: request detail (GLOBAL_POPUP / domain surface hint)  
CREATIVE / PLACEMENT / SCHEDULE: existing popup detail authority  
BILLING: Cash / BUSINESS_CASH canonical  
STATUS: submitted|under_review

### CREATIVE / PREVIEW

RENDERER: existing Delivery detail / Placement Map preview (no fake mock renderer on Control Plane)  
ASSET / CTA / PLACEMENT CONTEXT / DEVICE CONTEXT: opened via detail + Placement Map aspect rows

### PLACEMENT MAP

REGISTRY: `listAllPlacementMapRows`  
DOMAINS / SURFACES: from registry  
ACTIVE EXECUTION: linked via execution table + map hrefs  
BANNER ≠ PLACEMENT: UI copy + separate sections

### BILLING

DELIVERY: Cash  
FEED: Point  
POPUP: Cash (canonical BUSINESS_CASH)  
REFUND: no new mutation · B4/B3 links  
B3 LINK: Statement when storeId present  
B4 LINK: `/admin/finance#action-required` · Finance entry → B5

### CROSS-LINK

DOMAIN DASHBOARD: Delivery/Trade/Community ads → `#action-required`  
STORE: Statement deeplink when storeId  
FINANCE: B4 primary entry `ads_control_plane`  
SUPPORT: domain entry only (no B6 redesign)  
NOTIFICATION: Action Center common-ads → `#action-required` (no new events)

### CTA / UX

STATE VALIDITY: Control Plane is read-only composition; transitions remain on existing detail owners  
APPROVE / REJECT / PAUSE / RESUME / END: existing Delivery Ads / Feed / Popup owners only  
DETAIL: primary CTA on rows

### TABLET 1024×768

Evidence: `prod-light-report.json` · `ads-1024x768.png`  
BODY X: PASS  
ACTION REQUIRED: PASS  
EXECUTION: PASS  
PREVIEW: via Placement/detail links (no clipping of Control Plane sections)  
PLACEMENT: PASS  
TABLE: own H-scroll classes present  
CTA: Review/Open reachable

### SCENARIOS

A1 DELIVERY: PASS (action → detail/Statement/Finance)  
A2 FEED: PASS (Point billing note + feed queue)  
A3 POPUP: PASS (popup queue + domain entry)  
A4 ACTIVE: PASS (execution + eligibility split)  
A5 REJECT/REFUND: HISTORICAL CLOSED evidence reuse (no new mutation)  
A6 PLACEMENT: PASS (Placement Map section)

### PROOF

B5-01: PASS  
B5-02: PASS  
B5-03: PASS  
B5-04: PASS  
B5-05: PASS  
B5-06: PASS  
B5-07: PASS  
B5-08: PASS  
B5-09: PASS  
B5-10: PASS  
B5-11: PASS  
B5-12: PASS  
B5-13: PASS  
B5-14: PASS  
B5-15: PASS  
B5-16: PASS (real preview via existing detail/Placement Map renderer)  
B5-17: PASS  
B5-18: PASS  
B5-19: PASS (read-only plane; mutations on owners)  
B5-20: PASS  
B5-21: PASS (no optimistic mutation UI)  
B5-22: PASS (Finance/Statement context; historical reject evidence)  
B5-23: PASS  
B5-24: PASS  
B5-25: PASS  
B5-26: PASS  
B5-27: PASS (entry only; no Support redesign)  
B5-28: PASS (Action Center deeplink)  
B5-29: PASS (UNAVAILABLE badge ≠ 0)  
B5-30: PASS  
B5-31: PASS  
B5-32: PASS

FIRST DIVERGENCE: Ads Control Plane missing on canonical hub  
ROOT OWNER: Admin Delivery Ads hub (`/admin/delivery-ads`)  
ROOT CAUSE: domain surfaces existed but no cross-domain Action-Required-first control plane

TYPECHECK: PASS (`npm run typecheck:build`)  
LINT: PASS  
I18N: PASS (`verify:i18n-key-exposure`)  
BUILD: PASS (`npm run build`)  
ROUTES: PASS (`verify:routes`)  
UNIT: PASS (`admin-aro-ops-ux-002-b5-ads-control-plane.test.ts`)

PRODUCTION LIGHT: PASS (`prod-light-report.json`)

RESULT: **PASS / CLOSED / LOCK**

ARO-OPS-UX-002-B5 = PASS / CLOSED / LOCK

HARD STOP — B6 Support / Notification, Menu Final IA, Device parity wave, B1R~B4 reopen: **금지**.
