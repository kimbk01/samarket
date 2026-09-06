# ROUTE-AUTHORITY-INVENTORY

HEAD: 4d95ca8ac  
Generated: 2026-09-06T08:20:41Z  
Scope: Ads / Exposure only

## Lifecycle mutations (canonical)

| Product | Admin actions | API |
|---|---|---|
| Delivery | start_review, request_changes, approve, reject, pause→PAUSED_ADMIN, resume, end, terminate, archive | POST `/api/admin/delivery-ads/[id]/actions` |
| Feed | approve, reject, end, pause, resume, creative update | PATCH `/api/admin/feed-ad-requests/[id]` |
| Popup | request approve/reject; campaign approve/paused/active/ended | platform-popup-*-actions/transition |
| Promote | approve, reject | trade/community-promotion-orders PATCH |

Delivery has **no separate hide verb** — operator “숨김” maps to pause/end policy (document as product language over pause).

## Inventory

| ROUTE | PURPOSE | PRODUCT | DOMAIN | DATA OWNER | MUTATION OWNER | PAYMENT | PLACEMENT | RENDERER | DUPLICATE WITH | DISPOSITION |
|---|---|---|---|---|---|---|---|---|---|---|
| `/admin/delivery-ads` | Ops hub | Sponsored+Banner | Delivery | store_*_ad_campaigns | delivery-ad-writer | Cash | delivery inventory | stores discovery | — | KEEP |
| `/admin/delivery-ads/[id]` | Decision board | same | Delivery | same | same | Cash | same | same | — | KEEP |
| `/admin/delivery-ads/inventory#placement-map` | Placement inspect | registry | Multi | delivery_ad_inventories+feed+popup read | none (map) | — | all | — | — | KEEP (rebuild operator UX) |
| `/admin/delivery-ads/commercial-settings` | Price config | Delivery commercial | Delivery | commercial tables | commercial API | Cash | — | — | — | KEEP |
| `/admin/feed-ads` | Execution list | Feed banner | Trade/Community | feed_ad_campaigns | feed-ads POST create only | Point | feed placements | feed renderer | request queue | KEEP (rebuild operator list) |
| `/admin/ad-applications?domain=feed` | Review queue | Feed banner | Feed | feed_ad_requests | feed-ad-requests PATCH | Point | feed | feed | feed-ads | KEEP |
| `/admin/ad-applications?domain=trade` | Promote queue | Trade 더 알리기 | Trade | point_promotion_orders | trade-promotion-orders | Point | feed_boost | trade feed | promoted-items, trade-post-ads | KEEP |
| `/admin/community/promotions` | Promote queue | Community promote | Community | point_promotion_orders | community-promotion-orders | Point | community_top_pin | community feed | ad-applications?domain=community | KEEP (primary entry) |
| `/admin/ad-applications?domain=community` | Same writer | same | Community | same | same | Point | same | same | community/promotions | MERGE → redirect to community/promotions |
| `/admin/platform-popup` | Popup hub | Platform popup | Popup | platform_popup_* | popup writers | Cash (verify) | popup surfaces | popup renderer | — | KEEP (fix dup CTA) |
| `/admin/feed-ad-products` | Feed SKU catalog | Feed products | Feed | feed_ad_products | feed-ad-products PATCH | Point | — | — | ad-products legacy | KEEP |
| `/admin/promoted-items` | Entitlement list | Point promote | Trade/Community | point_promotion_orders | **READ only** | Point | — | — | promote queues | READ-ONLY HISTORY |
| `/admin/post-ads` | Legacy post ads | post_ads | Trade-legacy | post_ads | `/api/admin/ads` PATCH | legacy | legacy | legacy | trade promote / trade-post-ads | MERGE freeze writes + redirect |
| `/admin/ad-products` | Legacy catalog | ad_products | Ads-legacy | ad_products | ad-products PATCH | — | — | — | feed-ad-products / trade-ad-policies | MERGE freeze + REMOVE from ops nav |
| `/admin/banners` | CMS banners | admin_banners | App | admin_banners | banners API | — | CMS | CMS | Delivery banner / Popup | REMOVE from Ads nav (KEEP route under App if needed) |
| `/admin/trade-post-ads` | Trade post ads ops | trade post ads | Trade | trade post ads | trade-post-ads API | — | — | — | post-ads / promote | KEEP if live SKU else HISTORY |
| `/admin/trade-ad-policies` | Trade product config | trade ad products | Trade | trade-ad-products | trade-ad-products API | Point | — | — | ad-products | KEEP (config) |
| `/admin/stores-home-shelves` | HOME organic + ad gate | HOME config | Delivery config | store_composition | shelves API | — | slot gate | — | delivery-ads execution | KEEP CROSS_LINK only |
| `/admin/stores-category-policy` | Category organic + density | CATEGORY config | Delivery config | browse_scope | category-policy API | — | slot density | — | delivery-ads | KEEP CROSS_LINK only |
| `/admin/store-insertions` | Legacy | — | — | — | redirect | — | — | — | delivery-ads | REDIRECT (done) |
| `/admin/store-banner-ads` | Legacy | — | — | — | redirect/410 | — | — | — | delivery-ads | REDIRECT (done) |
| `/admin/member-benefits` | Benefits | Benefits | — | — | mutate | — | — | — | — | REMOVE from Ads nav |
| `/admin/exposure-policies` | Ranking exposure | Exposure | — | — | mutate | — | — | — | — | REMOVE from Ads nav |
| `/admin/home-feed` | Home feed config | Home feed | — | — | mutate | — | — | — | — | REMOVE from Ads nav |
| `/admin/personalized-feed` | Personalized | Rec | — | — | mutate | — | — | — | — | REMOVE from Ads nav |
| `/admin/ad-applications/[id]` | Legacy post_ads detail | post_ads | Trade-legacy | post_ads | ad-applications PATCH | — | — | — | ≠ trade promote queue | READ-ONLY HISTORY / REDIRECT |

## Duplicate authority findings (P0)

1. **Promote vs promoted-items vs post-ads vs ad-applications/[id]** — multiple menus for Point/legacy promote; mutate only via promotion-orders queues.
2. **ads-legacy cluster** still exposes writable post-ads / ad-products / banners under Ads IA.
3. **Feed list** (`/admin/feed-ads`) lacks lifecycle CTAs while queue has end — operator split FAIL.
4. **Popup hub** duplicate registration CTA + 「신청/캠페인」 terminology.

## Merge decisions (locked)

| Duplicate set | Canonical | Action |
|---|---|---|
| Trade/Community promote queues | `/admin/ad-applications?domain=trade` + `/admin/community/promotions` | KEEP both domain entries; redirect community chooser dup; promoted-items → history only |
| post-ads + ad-applications/[id] | Trade promote if Point product; else read-only history | Freeze legacy writers from Ads nav; redirect |
| ad-products | feed-ad-products + trade-ad-policies + delivery commercial | Remove from Ads ops nav; freeze catalog writes in legacy UI |
| admin banners under Ads | Delivery banner + Popup | Remove from Ads nav |
| exposure/home-feed/personalized/benefits | Out of Ads commerce | Remove from Ads nav |
| store-insertions / store-banner-ads | delivery-ads | Already redirect |

## Four live products (do not unify tables)

1. Delivery Cash ads  
2. Feed Point banners  
3. Platform Popup  
4. Point Promote (Trade / Community)

Chat paid advertising: **NOT SUPPORTED**
