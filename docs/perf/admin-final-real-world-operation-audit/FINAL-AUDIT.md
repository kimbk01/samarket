# DIBAY ADMIN FINAL REAL-WORLD OPERATION AUDIT

HEAD: `816b3b9041dc539841d8f2fafe43bd3843f00d08`  
ORIGIN: `816b3b9041dc539841d8f2fafe43bd3843f00d08`  
PRODUCTION: `816b3b9041dc539841d8f2fafe43bd3843f00d08` (`https://samarket.vercel.app`)

PRODUCT CODE CHANGE: **NONE**  
COMMIT / PUSH / DEPLOY: **FORBIDDEN (this audit)**

MODE: AUDIT + INVENTORY + GAP + FINAL IA DESIGN ONLY  

**Scope boundary:** CUT I P0 Production E2E locks (Finance / Delivery Ads / Popup / Feed / Support / Partner / Reset Storage·Auth scoped / Tablet) remain **CLOSED** for runtime. This audit does **not** reopen those E2E proofs. It judges **Admin IA · workflow · management coverage** against Owner’s real-world operation bar.

Screenshot start: Production `/admin/community/reports` (Community workspace active).

---

### A. EXECUTIVE JUDGMENT

| Gate | Verdict |
|---|---|
| ADMIN STRUCTURE | **PARTIAL** |
| DOMAIN SEPARATION | **PARTIAL** |
| COMMON OPERATION | **PARTIAL** |
| ADS / EXPOSURE MANAGEMENT | **PARTIAL** |
| PREVIEW | **PARTIAL** |
| MEMBER MANAGEMENT | **PARTIAL** |
| STORE / OWNER MANAGEMENT | **PASS** (hub deep-links exist; not universal coverage) |
| SETTLEMENT | **PARTIAL** |
| RESET | **FAIL** vs Owner selective-reset target (scoped Reset still valid under old contract) |
| DASHBOARD | **PARTIAL** |
| **REAL-WORLD ADMIN READY** | **FAIL** |

**One-line:** Top-level 10 workspaces exist, but operator ownership clarity, selective Reset, settlement findability, and Dashboard coverage are not at “daily ops ready.”

---

### B. CURRENT ADMIN ROUTE INVENTORY (summary)

SSOT: `components/admin/admin-menu.ts` · routing: `lib/admin/admin-workspace-routing.ts`  
Visible menu leaves: **152** · `app/admin/**/page.tsx`: **242** · Menu↔page both: **151** · Pending leaf: **1** (`/admin/customer-platform/faq`) · Exact path duplicates: **0** · Orphan pages (no menu leaf): **39**

| TOP WORKSPACE | LEAVES | rootPath | Owns (intended) | Must not own |
|---|---|---|---|---|
| 운영 (`dashboard`) | 1 | `/admin` | Action Center + aggregate Control Plane | Domain mutation SSOT |
| 배달 (`delivery`) | 33 | `/admin/business` | Store/order/config/ops | Common Ads mutation plane as primary |
| 거래 (`trade`) | 14 | `/admin/trade` | Listings/trade moderation/settings | Member Point wallet |
| 커뮤니티 (`community`) | 9 | `/admin/community` | Philife/community content + domain promo/point UX | Feed-ads campaign SSOT |
| 채팅 (`messenger`) | 8 | `/admin/chats/general` | Chat pillar ops views | Merging chat mutation authorities |
| 재무 (`finance`) | 8 | `/admin/point-charges` | Point/Coin/Cash ops surfaces | Ads placement registry |
| 광고/노출 (`ads`) | 16 | `/admin/delivery-ads` | Cross-domain ad control plane + legacy ads section | Partner-as-AdProduct |
| 고객지원 (`support`) | 3 | `/admin/support` | Support cases (+ legacy store inquiry) | Community report SSOT |
| 알림 (`notifications`) | 2 | `/admin/notifications` | Campaign / devices | Finance/Ads mutation |
| 시스템 (`system`) | 58 | `/admin/customer-platform` | Members, global reports, settings, Reset, ops docs | Day-to-day domain ops |

Full leaf path list: see explore inventory (Dashboard→System). Key Community leaves matching screenshot:

| LABEL (UI) | KEY | PATH | CLASSIFICATION |
|---|---|---|---|
| 커뮤니티 운영 | community-home | `/admin/community` | DOMAIN OPERATION |
| 카테고리 | community-topics | `/admin/community/topics` | CONFIGURATION |
| 게시글 | community-posts | `/admin/community/posts` | DOMAIN OPERATION |
| 댓글 | community-comments | `/admin/community/comments` | DOMAIN OPERATION |
| 신고 | community-feed-reports | `/admin/community/reports` | DOMAIN OPERATION (moderation) |
| 모임 신고 | philife-meeting-reports | `/admin/philife/meeting-reports` | DOMAIN OPERATION (separate table) |
| 커뮤니티 홍보 | community-promotions | `/admin/community/promotions` | DOMAIN ENTRY → paid-exposure queue |
| 운영 설정 | community-feed-settings | `/admin/community/settings` | CONFIGURATION |
| 포인트 정책 | community-point-policies | `/admin/community/point-policies` | DOMAIN UX over FINANCE Point SSOT |

---

### C. DOMAIN MATRIX

#### DELIVERY — EXISTS (selected)

| Item | EXISTS | ROUTE | OWNER | USED | DUPLICATE | MISSING / COMMON LINK |
|---|---|---|---|---|---|---|
| Stores / Owners hub | YES | `/admin/business`, `/admin/business/[id]` | Delivery business ops | YES | — | Finance/Ads/Support deep-links on hub |
| Products | YES | `/admin/store-products` | Delivery | YES | — | — |
| Orders | YES | `/admin/stores/orders`, `/admin/store-orders` | Delivery | YES | legacy `/admin/delivery-orders*` aliases | — |
| HOME composition | YES | `/admin/stores-home-shelves` | Delivery CONFIG | YES | — | CROSS-LINK from Ads Placement Map |
| Category / Browse | YES | `/admin/stores-category-policy` | Delivery CONFIG | YES | — | Live browse preview |
| Coupons / Gifts | YES | `/admin/store-coupon-control`, `/admin/gift-certificates` | Delivery commerce | YES | — | Gift finance tabs |
| Settlements | YES | `/admin/store-settlements` | STORE settlement | YES | redirects from orders paths | Not on Action Center |
| Store reports/reviews | YES | `/admin/store-reports`, `/admin/store-reviews` | Delivery moderation | YES | ≠ Support | — |
| Ads entry | PARTIAL | Delivery still has discovery/promo leaves; primary Ads ops under `ads` | Split | YES | risk of dual entry | Prefer CROSS-LINK to `/admin/delivery-ads` |

#### TRADE

| Item | EXISTS | ROUTE | OWNER | NOTES |
|---|---|---|---|---|
| Hub / listings | YES | `/admin/trade`, `/admin/posts-management` | Trade | — |
| Reports | YES | `/admin/reports?domain=trade…` | `reports` | Shared System reports surface filtered |
| Trade post ads | YES | `/admin/trade-post-ads`, `/admin/trade-ad-policies` | Trade ads SSOT | Also mirrored under Ads (`ad-applications?domain=trade`) |
| Users context | YES | `/admin/users?from=trade` | Members (System) | Context entry, not duplicate SSOT |
| Prototype | YES orphan | `/admin/trade-prototype*` | Legacy | **HIDE/ARCHIVE candidate** |

#### COMMUNITY (screenshot focus)

| Item | EXISTS | ROUTE | CANONICAL OWNER | VERDICT |
|---|---|---|---|---|
| Posts / comments / topics / settings | YES | `/admin/community/*` | Community / philife | KEEP domain |
| **신고** | YES | `/admin/community/reports` | **`community_reports`** | KEEP domain moderation · ≠ Support · ≠ meeting_reports |
| **모임 신고** | YES | `/admin/philife/meeting-reports` | **`meeting_reports`** | KEEP separate authority |
| philife alias | YES | `/admin/philife/reports` = re-export of community reports | Same page | KEEP alias |
| **커뮤니티 홍보** | YES | `/admin/community/promotions` | **`point_promotion_orders` domain=community** | KEEP domain entry · **≠ feed_ad_campaigns** · CROSS-LINK Ads plane |
| **포인트 정책** | YES | `/admin/community/point-policies` | **`board_point_policies`** (same Point SSOT as Finance) | KEEP scoped UX · CROSS-LINK `/admin/point-policies` · **not a second wallet** |

#### MESSENGER / CHAT

| Item | EXISTS | ROUTE | NOTES |
|---|---|---|---|
| General / Group | YES | `/admin/chats/general`, `/group` | Pillar separation preserved |
| Trade chat | YES | `/admin/chats/trade` (+ messenger query) | Context dual entry |
| Order chat | YES | `/admin/order-chats` | Delivery + messenger entries |
| Reported | YES | `/admin/chats/reported` | Moderation |
| CM messenger | YES | `/admin/chats/messenger` | Community messenger admin |
| Call admin | Limited | perf/ops pages only if present | Do not invent Call as chat pillar |

---

### D. COMMON OPERATION MATRIX

| Workspace | Owns data? | Role | Gap |
|---|---|---|---|
| **운영** | NO (aggregates) | Control Plane | Incomplete domain coverage (orders/settlement/community/coin AC) |
| **재무** | YES Point/Coin/Cash ops | Common money | Settlement lives under Delivery; Coin withdraw not on Action Center |
| **광고/노출** | YES Delivery/Feed/Popup/Trade apps | Control plane + domain writers | **ads-legacy** still visible; Community promo not labeled as paid-exposure |
| **고객지원** | YES support cases | Common cases | Must not absorb `community_reports` |
| **알림** | YES campaigns/devices | Common | Thin |
| **시스템** | Mixed | Members + Reset + ops sprawl (**58 leaves**) | Overweight for daily ops; Reset buried |

---

### E. ADS / EXPOSURE MASTER MATRIX

| DOMAIN | PRODUCT | APPLICATION | BILLING | APPROVAL | CREATIVE | EXECUTION | PLACEMENT | ADMIN ROUTE | PREVIEW | DUPLICATE UI | GAP |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Delivery | store_sponsored / banner | Owner apply → execution row | Cash | `admin_delivery_ad_transition` | `delivery_ad_creatives` | store_*_ad_campaigns | delivery-ad-inventory | `/admin/delivery-ads` (+ inventory map) | Placement Map + HOME/CATEGORY live previews (config) | Delivery discovery leaves | Operator path OK if Ads workspace used |
| Feed | feed campaigns | `/admin/ad-applications?domain=feed` | Point (feed rules) | feed admin | feed creatives | `feed_ad_campaigns` | TRADE_HOME etc. | `/admin/feed-ads` | Partial / campaign UI | — | Preview depth varies |
| Popup | platform popup | Owner request | Cash/product rules | popup admin | popup creative | popup campaigns | global surfaces | `/admin/platform-popup` | **REAL creative** `AdminPlatformPopupPreview` (DibayPopupAd) | — | Strongest preview |
| Trade | trade post boost / post ads | trade queues | Point / product | trade ads | trade creatives | `trade_post_ads` / promotions | trade surfaces | `/admin/trade-post-ads`, Ads trade apps | Partial | Dual Trade+Ads entries | Label which is Control Plane |
| Community | paid exposure “더 알리기” | `point_promotion_orders` community | **Point** | community promotion queue | post-based | order status | community feed boost | `/admin/community/promotions` (= `ad-applications?domain=community`) | **Weak / text-queue** (not Placement Map) | Same component dual path | **Operator thinks “Ads” but leaf only under Community** |
| Partner | membership | partner apply | Cash fee | partner approve | N/A | membership | N/A | `/admin/delivery-ads/partner` | N/A | **Not AdProduct** | Keep ≠ AdProduct |

---

### F. DUPLICATE / UNUSED / LEGACY

**TRUE DUPLICATE (same mutation owner, dual primary risk):**  
- `/admin/community/promotions` ↔ `/admin/ad-applications?domain=community` — **same component** → treat one as CONTEXT ENTRY, label Control Plane link.  
- `/admin/ad-applications?domain=trade` ↔ trade promo surfaces — related, not always identical writer.  

**MISPLACED (operator perception, not SSOT error):**  
- Community **포인트 정책** looks Finance but is **scoped Point policy UX** — needs CROSS-LINK + copy.  
- Community **홍보** looks pure Community but is **paid exposure** — needs Ads plane CROSS-LINK.  

**SEPARATE DOMAIN (not duplicates):**  
- `community_reports` vs `meeting_reports` vs Support cases vs System `/admin/reports` merge.  

**UNUSED / ORPHAN (candidates):**  
- `/admin/operations` (HARD LOCK resurrect-forbidden hub)  
- `/admin/trade-prototype*`  
- `/admin/store-points`, `store-point-charges`, `store-point-policies` (redirect archive)  
- `/admin/platform-inquiries` (legacy support boundary)  
- philife meetings/sections orphans  

**LEGACY VISIBLE IN NAV:**  
- `ads > ads-legacy` (ad-products, post-ads, benefits, exposure-policies, home-feed, personalized-feed, banners)  
- `support > store-inquiries`  
- `system > growth-rec` (recommendation ops)  

**CONTEXT ENTRY (keep):** Store hub Finance/Ads/Support links; `?from=trade` users; order-chats messenger query.

---

### G. MEMBER / STORE CONTEXT

**MEMBER**  
- Canonical list: `/admin/users` (System)  
- Point: Finance `/admin/point-charges`, ledger, policies  
- Community activity: domain pages; reports enrich author  
- Support: `/admin/support` with member reference types  
- **Gap:** No single Member context hub assembling Point + reports + Support + Trade/Community activity (journey J1 = PARTIAL)

**STORE / OWNER**  
- Hub: `/admin/business/[id]` with tabs + deep-links Finance / Ads / Partner / Support / Settlement KPI  
- **Verdict:** Strongest existing context hub → **PASS** as pattern to extend (not rewrite)

---

### H. SETTLEMENT MATRIX

| ACTOR | MONEY | SOURCE | LEDGER / TABLE | ADMIN ROUTE | STATUS | GAP |
|---|---|---|---|---|---|---|
| MEMBER | Point | charge / reward / reclaim | `point_ledger`, `point_charge_requests` | `/admin/point-charges`, ledger, community point UX | EXISTS | Community reward reclaim tied to reports |
| STORE OWNER | Coin | earn / withdraw | `store_economic_point_*`, `coin_withdrawal_requests` | `/admin/finance` panels | EXISTS | Withdraw not on Action Center |
| STORE | Cash | top-up / ad spend | `business_cash_*`, cash charge requests | `/admin/delivery-ads/cash-charges`, finance hub | EXISTS | Nested under Ads path historically |
| STORE | Settlement | order payout | `store_settlements`, fee policies | `/admin/store-settlements`, `/admin/store-fee-policies` | EXISTS | Under **Delivery**, not Finance — operator findability gap |
| STORE/MEMBER | Gift | gift products/cash-out | gift_* | `/admin/gift-certificates` | EXISTS | Delivery workspace |
| BUYER/STORE | Refund | order refund | order refund APIs | `/admin/stores/orders/refunds` | EXISTS | Delivery |

**Problem:** Finance E2E PASS ≠ settlement IA completeness. Store settlement is real but **not co-located/labeled** under Finance common operation.

---

### I. RESET MATRIX

**CURRENT contract (CUT H + P0-11):** preset bundles + explicit UUID textareas + dry-run counts + Storage explicit objects + Auth `@manual.local` · **Production execute ALWAYS BLOCKED**.

| ENTITY | SELECTABLE UI | SELECT-ALL | PLAN/COUNT | EXECUTE (non-prod) | PROD EXECUTE | GAP |
|---|---|---|---|---|---|---|
| Members | ID textarea only | NO | profiles count | Auth DELETE safe only | BLOCKED | No type checkbox |
| Stores/Owners | ID textarea | NO | stores count | No row delete step | BLOCKED | No type checkbox |
| Community posts | via preset/member | NO | count only | **NO DB delete** | BLOCKED | Asymmetric vs Trade posts |
| Comments | NO | NO | NO | NO | — | **NOT_SUPPORTED** |
| Trade posts | content/member IDs | NO | YES | YES posts delete | BLOCKED | — |
| Chat | preset inventory | NO | counts≈0 | NO | — | **NOT_SUPPORTED** |
| Orders | block-if>0 | NO | gate | NO delete | BLOCKED | Not selectable wipe |
| Ads | campaign IDs + presets | NO | Delivery strong; Feed/Popup weak | Delivery campaigns | BLOCKED | Partial |
| Coupons/Gifts/Support/Notifications | NO / gift blocker | NO | inventory/block | NO | — | **NOT_SUPPORTED** as selectable |
| Point/Coin/Cash | finance gate block | NO | blocker | NO | BLOCKED | Safety not selective wipe |
| Storage/Auth | derived | NO | YES | YES (scoped) | BLOCKED | OK under old contract |

**CURRENT RESET COVERAGE:** Scoped prelaunch + Storage/Auth cleanup — **PASS for prior P0 contract**.  
**OWNER TARGET COVERAGE:** Per-type checkbox + select-all + dependency/protection/Finance/Storage/Auth dry-run — **FAIL / NOT_SUPPORTED**.  
**Do not market current Reset as full selective Reset.**

---

### J. DASHBOARD

| Area | CURRENT | REAL DATA | ACTIONABLE | MISSING |
|---|---|---|---|---|
| Action Center | Bell-driven cards | YES (most) | YES | Orders queue, Settlement, Community moderation, Coin withdraw; Partner/Popup counts often stub 0 |
| KPI / Status / Trend | RPC aggregate | YES | NO | — |
| Urgent block | Mixed | Partial | Soft | Report badges not fully wired |
| Notice | Placeholder | STUB | NO | Real system notice |
| Quick links | Menu projection | Static | NO | Not ops state |

**TARGET:** Read-only Control Plane showing DIBAY flow: members · stores · orders · trade · community · chat · Point/Coin/Cash · settlement · ads · support · reports · partner · system — each with pending + deeplink to canonical queue. **No new SSOT tables.**

---

### K. OPERATOR JOURNEYS

| ID | Journey | Verdict | Evidence |
|---|---|---|---|
| J1 Member | search → profile → Point → reports → Support | **PARTIAL** | Users + Finance + Support exist; no unified member context hub |
| J2 Store | store → owner → orders → settlement → Coin/Cash → Ads → Partner → Support | **CONNECTED** | `/admin/business/[id]` deep-links |
| J3 Community | post → report → author → moderation → Support | **PARTIAL** | Reports/moderation domain OK; Support context not always one click; Point reclaim side-effect exists |
| J4 Ads | domain → product → creative → placement → preview → execution | **PARTIAL** | Delivery strong; Community promo weak preview; legacy ads clutter |
| J5 Finance | entity → ledger → request → approval → settlement/refund | **PARTIAL** | Point/Cash/Coin OK; settlement/refund under Delivery paths |
| J6 Reset | type select → dry-run → protect → confirm → execute | **BROKEN** vs Owner target | Preset+UUID only; no per-type select-all; Prod execute blocked (intentional) |

---

### L. FINAL RECOMMENDED IA (DESIGN ONLY)

Principles: DOMAIN owns service ops · COMMON owns cross-cutting · 운영 = Control Plane · **no DB merge** · CROSS-LINK over MOVE when SSOT is already correct.

```
운영                            [KEEP] Control Plane — expand coverage
  ├─ Action Center             [KEEP] + add Orders/Settlement/Community/Coin cards (NEW ENTRY widgets, same APIs)
  └─ (no domain mutation)

배달                           [KEEP]
  ├─ 업체 / 매장 허브          [KEEP]
  ├─ 주문 / 배달 운영          [KEEP]
  ├─ HOME / 카테고리 CONFIG    [KEEP] + CROSS-LINK Ads Placement Map
  ├─ 정산 / 수수료             [KEEP] + CROSS-LINK 재무
  ├─ 쿠폰 / 상품권             [KEEP]
  └─ Ads 운영 전체             [CROSS-LINK] → 광고/노출 (do not dual-primary)

거래                           [KEEP]
  ├─ 게시물 / 카테고리 / 설정  [KEEP]
  ├─ 신고 / 후기               [KEEP]
  ├─ 거래 홍보/광고            [KEEP domain] + CROSS-LINK 광고/노출
  └─ trade-prototype           [HIDE/ARCHIVE]

커뮤니티                       [KEEP]
  ├─ 게시글 / 댓글 / 카테고리  [KEEP]
  ├─ 신고 (community_reports)  [KEEP] + CROSS-LINK 고객지원 (case 생성 시)
  ├─ 모임 신고 (meeting_reports) [KEEP] separate
  ├─ 커뮤니티 홍보             [KEEP] label “Point 유료노출” + CROSS-LINK 광고/노출
  ├─ 포인트 정책               [KEEP] label “커뮤니티 적립/회수 정책” + CROSS-LINK 재무 Point
  └─ 운영 설정                 [KEEP]

채팅                           [KEEP] pillars separated (general/group/trade/order/CM)

재무                           [KEEP]
  ├─ Member Point 큐/원장/정책 [KEEP]
  ├─ Store Coin / Cash         [KEEP]
  ├─ 정산 바로가기             [NEW ENTRY / CROSS-LINK] → store-settlements
  └─ 환불/출금 진입            [CROSS-LINK]

광고 / 노출                    [KEEP]
  ├─ Delivery Ads + Placement Map [KEEP]
  ├─ Feed Ads / Popup          [KEEP]
  ├─ Trade / Community 유료노출 [NEW ENTRY or CROSS-LINK leaves] → existing queues
  ├─ Partner                   [KEEP] ≠ AdProduct
  └─ ads-legacy                [HIDE/ARCHIVE]

고객지원                       [KEEP] cases only; CROSS-LINK from domain reports

알림                           [KEEP]

시스템                         [KEEP but slim]
  ├─ 회원                      [KEEP]
  ├─ Pre-launch Reset          [KEEP] (selective UI = future CUT)
  ├─ Settings / security       [KEEP]
  └─ growth-rec / ops sprawl   [HIDE or ARCHIVE many] after Owner review
```

Screenshot items — **do not blindly MOVE**:

| Menu | KEEP/MOVE | Why |
|---|---|---|
| 커뮤니티 홍보 | **KEEP** + CROSS-LINK Ads | Owner = `point_promotion_orders` community, not feed-ads |
| 포인트 정책 | **KEEP** + CROSS-LINK Finance | Same `board_point_policies`; domain-scoped UX |
| 신고 / 모임 신고 | **KEEP** both | Different tables; not Support SSOT |

---

### M. GAP REGISTER

#### P0 (blocks real-world Admin ready)

| ID | ROUTE / AREA | OWNER | PROBLEM | IMPACT | ROOT | TARGET | SEVERITY |
|---|---|---|---|---|---|---|---|
| ARO-IA-001 | Community sidebar + Ads/Finance | Nav SSOT | Operator cannot see DOMAIN vs COMMON relationship for 홍보/포인트/신고 | Wrong daily ops path / distrust of IA | Labels + missing CROSS-LINKs | KEEP leaves + explicit CROSS-LINK + copy | **P0** |
| ARO-AC-001 | `/admin` Action Center | Control Plane | Missing Orders / Settlement / Community / Coin-withdraw actionable cards; Partner/Popup counts stub | Cannot “see DIBAY running” | Incomplete aggregation wiring | Real counts + deeplinks only | **P0** |
| ARO-RST-001 | `/admin/prelaunch-reset` | Reset planner | No per-type checkbox / select-all; execute coverage ≠ Owner entity list | Cannot run Owner’s selective cleanup workflow | Old scoped preset contract | New selection UX + supported matrix (keep Prod execute block) | **P0** |

#### P1

| ID | PROBLEM | TARGET |
|---|---|---|
| ARO-FIN-001 | Settlement/refund findability under Delivery only | Finance CROSS-LINK + optional Finance nav entry |
| ARO-ADS-001 | `ads-legacy` still primary-visible | HIDE/ARCHIVE after Owner confirm |
| ARO-ADS-002 | Community promo preview weak | Runtime-backed preview design using community exposure resolver |
| ARO-MBR-001 | No Member context hub | Assemble deep-links (Users → Point/Support/Reports) |
| ARO-SYS-001 | System 58-leaf sprawl | Slim to daily-critical + archive |

#### P2

| ID | PROBLEM |
|---|---|
| ARO-ORPH-001 | 39 orphan pages / prototypes | Catalog → ARCHIVE/REMOVE CANDIDATE |
| ARO-DASH-002 | NoticeCard stub | Real notice or remove |

#### DEFERRED

| ID | ITEM |
|---|---|
| ARO-RST-PROD | Production Reset **execute** remains ALWAYS BLOCKED (safety — not “enable”) |
| ARO-RST-FULL | Full universal wipe — OUT OF SCOPE |

---

### N. IMPLEMENTATION PLAN (do not start)

1. **AUTHORITY / ROUTE CLEANUP** — ads-legacy visibility, orphan catalog, redirect aliases documented  
2. **DOMAIN IA CLARITY** — Community (and Trade) labels + CROSS-LINKs (ARO-IA-001)  
3. **COMMON CONTROL CONNECTION** — Finance↔Settlement, Ads↔domain paid-exposure  
4. **ADS / PREVIEW** — community promo preview design  
5. **MEMBER / STORE CONTEXT** — Member hub pattern from Store hub  
6. **SETTLEMENT** — findability under Finance without moving SSOT  
7. **RESET SELECTIVE UI/COVERAGE** — checkbox matrix + dry-run (ARO-RST-001); keep Prod execute blocked  
8. **DASHBOARD** — Action Center coverage (ARO-AC-001)  
9. **TABLET / PRODUCTION FINAL PROOF** — only after IA/Reset/Dashboard CUTs  

---

### O. FIRST IMPLEMENTATION BOUNDARY

**NEXT ITEM:** `ARO-IA-001` — Community (screenshot) Domain↔Common operator clarity  
**WHY:** First divergence on Production screenshot; SSOT already correct — wrong MOVE would break Point/paid-exposure authorities; highest leverage before Reset UI redesign.  
**SOURCE:** `/admin/community/reports` sidebar · `admin-menu.ts` · promotions/point-policies/reports owners above  
**SEVERITY:** P0  
**BOUNDARY:**  
- KEEP `/admin/community/promotions`, `/admin/community/point-policies`, `/admin/community/reports`, `/admin/philife/meeting-reports`  
- Add explicit CROSS-LINK + operator labels to Ads Control Plane / Finance Point / Support  
- Do **not** merge into feed-ads or Support SSOT  
- Do **not** implement Reset selective UI or Dashboard expansion in the same CUT  

**IMPLEMENTATION: NOT STARTED**

---

## CLOSE

REAL-WORLD ADMIN READY = **FAIL** (structure audit).  
CUT I P0 runtime locks = **unchanged CLOSED**.  

**STOP.** No code · no commit · no push · no deploy.
