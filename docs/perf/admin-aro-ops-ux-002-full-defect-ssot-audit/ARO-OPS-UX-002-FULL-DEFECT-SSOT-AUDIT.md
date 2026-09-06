# DIBAY ADMIN — FULL DEFECT / SSOT AUDIT

CURRENT PROD:  
SHA: `ad7942be6`  
DEPLOY: `dpl_2vJvuPLnwd5CuBUy5NAywDxJyD52`  
AUTH: PASS (prior fixture-close session)

PRODUCT CODE CHANGE: **NONE**  
MODE: AUDIT ONLY → STOP

---

## CONFIRMED DEFECTS

### DEF-001 — Order → Admin Store context missing
| Field | Value |
|---|---|
| ID | DEF-001 |
| AREA | Delivery / Order |
| SEVERITY | **P1** |
| CLASS | `PUBLIC_ROUTE_LEAK` + `BROKEN_CONTEXT` + `MANUAL_RESEARCH_REQUIRED` |
| SYMPTOM | Order detail “매장” CTA opens public `/stores/{slug}` |
| EXPECTED | Admin Order → Admin Store hub `/admin/business/{storeId}` (optional public preview secondary) |
| ACTUAL | `/stores/aa11` only (Production proven) |
| CODE OWNER | `components/admin/delivery-orders/DeliveryOrderDetailClient.tsx:478-480` |
| READ OWNER | `store_orders` → `map-store-order-to-admin-delivery` (`storeId` + `storeSlug` both present) |
| MUTATION OWNER | N/A (nav) |
| DB OWNER | `store_orders.store_id` |
| FIRST DIVERGENCE | Admin operational nav chooses consumer surface |
| ROOT CAUSE | **One-off wrong href**: `order.storeId` available; `businessCcBackToStoreHref(storeId)` already exists and is used by Cancellations/Refunds/Products/Reviews/Reports — Order detail alone hardcodes public slug |
| RELATED SURFACES | Not systemic across all Admin; adjacent delivery screens correct |
| SSOT DECISION | Canonical Admin Store context = `/admin/business/{storeId}` via `businessCcBackToStoreHref` |
| MINIMUM FIX | Replace primary href with `businessCcBackToStoreHref(order.storeId)`; keep public as optional secondary preview; adjust i18n label |
| PRODUCTION EVIDENCE | Fixture-close V2 on `ad7942be6`: order `3f6cf459-…` → `/stores/aa11` only |
| VERDICT | **CONFIRMED PRODUCT GAP** |

### DEF-002 — Action Center Messenger health hard-zero
| Field | Value |
|---|---|
| ID | DEF-002 |
| AREA | Action Center / Messenger |
| SEVERITY | **P1** |
| CLASS | `HARDCODED_COUNT` + `FAKE_DATA` |
| SYMPTOM | “채팅 (메신저)” always shows count 0 with `alwaysShow` |
| EXPECTED | Real read-model count or omit card / UNAVAILABLE |
| ACTUAL | `count: 0` hardcoded |
| CODE OWNER | `components/admin/dashboard/AdminActionCenter.tsx:347-357` |
| READ OWNER | None (fake) |
| ROOT CAUSE | Placeholder domain card never wired to queue read-model |
| MINIMUM FIX | Bind real messenger actionable metric or remove alwaysShow fake zero |
| VERDICT | **CONFIRMED** |

### DEF-003 — Action queue error → 0 (error-as-empty)
| Field | Value |
|---|---|
| ID | DEF-003 |
| AREA | Action Center / admin-bell |
| SEVERITY | **P1** |
| CLASS | `ERROR_AS_ZERO` |
| SYMPTOM | Source query failure appears as “0건” pending |
| EXPECTED | UNAVAILABLE / error banner |
| ACTUAL | `safeCount`: `if (res.error) return 0` |
| CODE OWNER | `lib/admin/admin-action-queue.ts:177-179` (+ consumers Support/apps/reports counts) |
| ROOT CAUSE | Fail-soft count helper collapses transport/DB errors into empty |
| RELATED | Contrasts with domain-dashboard `count-exact.ts` which returns `null` → UNAVAILABLE |
| MINIMUM FIX | Propagate unavailable; never map error→0 for operational queues |
| VERDICT | **CONFIRMED** |

### DEF-004 — Point vs Cash permission asymmetry
| Field | Value |
|---|---|
| ID | DEF-004 |
| AREA | Finance auth |
| SEVERITY | **P0** (money mutation authority) |
| CLASS | `WRONG_PERMISSION` + `MISSING_PERMISSION` |
| SYMPTOM | Point mutations gated by `requireAdminPermission("point")`; Cash top-up only `requireAdminApiUser()` |
| EXPECTED | Both money approvals use explicit finance permission keys |
| ACTUAL | Any route-admin can hit Cash charge APIs; Point needs `point` key (operators may lack it → UI reachable / API 403 or reverse) |
| CODE OWNER | Point: `app/api/admin/point-charges/**`; Cash: `app/api/admin/business-cash-charges/route.ts` |
| ROOT CAUSE | Incomplete permission rollout — Cash never keyed |
| MINIMUM FIX | Align Cash (and Settlement/Coin) to explicit permission keys; sync UI role matrix |
| VERDICT | **CONFIRMED** |

### DEF-005 — Legacy finance READ still live
| Field | Value |
|---|---|
| ID | DEF-005 |
| AREA | Finance |
| SEVERITY | **P1** |
| CLASS | `DUPLICATE_SSOT` |
| SYMPTOM | Legacy charge tables still readable; pending badges can mix AST-002 `store_charges` |
| EXPECTED | Canonical Point/Cash queues only; legacy GET 410 or unused |
| ACTUAL | GET `store-point-charges`, `delivery-ads/business-cash/charge-requests` still read legacy tables; `AdminStorePointPendingProvider` counts `store_charges` |
| CODE OWNER | `app/api/admin/store-point-charges/route.ts`; `.../business-cash/charge-requests/route.ts`; `AdminStorePointPendingProvider.tsx` (~820) |
| SSOT DECISION | Keep CUT A/E: no new write to legacy; retire/quarantine legacy READ from Admin pending UI |
| MINIMUM FIX | Stop using `store_charges` for pending UI; point Admin pending at canonical queues only |
| VERDICT | **CONFIRMED** |

### DEF-006 — Support Cash charge deeplink loses request focus
| Field | Value |
|---|---|
| ID | DEF-006 |
| AREA | Support → Finance/Cash |
| SEVERITY | **P1** |
| CLASS | `WRONG_DEEPLINK` + `MANUAL_RESEARCH_REQUIRED` |
| SYMPTOM | `BUSINESS_CASH_CHARGE_REQUEST` href adds `?requestId=` but queue page ignores query |
| EXPECTED | Open Cash queue with exact request selected |
| ACTUAL | Generic cash-charges list |
| CODE OWNER | `lib/support/support-reference-admin-href.ts:84-89`; `AdminDeliveryAdCashChargeQueuePage.tsx` (no requestId consume) |
| MINIMUM FIX | Consume `requestId` in queue page OR deep-link to row hash/filter |
| VERDICT | **CONFIRMED** |

### DEF-007 — Support Partner deeplink is list-only
| Field | Value |
|---|---|
| ID | DEF-007 |
| AREA | Support → Partner |
| SEVERITY | **P1** |
| CLASS | `WRONG_DEEPLINK` + `MANUAL_RESEARCH_REQUIRED` |
| SYMPTOM | `PARTNER_MEMBERSHIP` drops `referenceId` → membership list only |
| EXPECTED | Exact membership/detail when id present |
| ACTUAL | List root |
| CODE OWNER | `lib/support/support-reference-admin-href.ts:91-97` |
| MINIMUM FIX | Include membership id in canonical Partner Admin route |
| VERDICT | **CONFIRMED** |

### DEF-008 — Action Center store applications → unfiltered stores
| Field | Value |
|---|---|
| ID | DEF-008 |
| AREA | Action Center / Store |
| SEVERITY | **P1** |
| CLASS | `WRONG_DEEPLINK` + `MANUAL_RESEARCH_REQUIRED` |
| SYMPTOM | “입점 검토” → `/admin/stores` without pending filter |
| EXPECTED | Exact pending/under_review queue |
| ACTUAL | Full store list |
| CODE OWNER | `AdminActionCenter.tsx:243-252` vs queue filter in `admin-action-queue.ts` (~331) |
| MINIMUM FIX | Href with `approval_status` / dedicated applications queue route |
| VERDICT | **CONFIRMED** |

### DEF-009 — Chat “hide from list” is client-only
| Field | Value |
|---|---|
| ID | DEF-009 |
| AREA | Messenger / Chat Admin |
| SEVERITY | **P1** |
| CLASS | `WRONG_DESTRUCTIVE_SEMANTICS` + `FAKE_SUCCESS` |
| SYMPTOM | Operator may believe room is moderated/hidden server-side |
| EXPECTED | Durable moderation hide OR clear “session UI only” labeling |
| ACTUAL | Client Set removal (`AdminChatListPage`) |
| CODE OWNER | `components/admin/chats/AdminChatListPage.tsx` (~286-295) |
| MINIMUM FIX | Relabel as session-only OR wire canonical hide API |
| VERDICT | **CONFIRMED** |

### DEF-010 — Chat hard-delete vs CM room SSOT split
| Field | Value |
|---|---|
| ID | DEF-010 |
| AREA | Chat delete |
| SEVERITY | **P1** |
| CLASS | `DUPLICATE_SSOT` + `WRONG_DESTRUCTIVE_SEMANTICS` |
| SYMPTOM | Admin bulk hard-delete hits `chat_rooms`/`product_chats`; Prelaunch chat wipe targets CM rooms — parallel authorities |
| EXPECTED | One documented ownership map per room type (GENERAL/GROUP/TRADE/ORDER) |
| ACTUAL | Dual paths without seed-policy chat entry |
| CODE OWNER | `app/api/admin/chat/rooms/bulk-delete/route.ts`; prelaunch chat scope; `seed-policies.ts` (chat absent) |
| MINIMUM FIX | Document + enforce single mutation owner per pillar; add chat to management policy matrix |
| VERDICT | **CONFIRMED (authority debt)** |

### DEF-011 — `view=statement` unread
| Field | Value |
|---|---|
| ID | DEF-011 |
| AREA | B3 Finance |
| SEVERITY | **P2** |
| CLASS | `WRONG_ROUTE` (query contract) — **cosmetic** |
| SYMPTOM | Links emit `view=statement`; UI ignores param |
| EXPECTED | Either consume view or stop emitting |
| ACTUAL | `storeId` alone mounts statement |
| CODE OWNER | `AdminStoreFinancePanels.tsx:68-74`; `businessCcFinancialStatementHref` |
| VERDICT | **CONFIRMED non-blocking** |

### DEF-012 — Placement Map weak preview
| Field | Value |
|---|---|
| ID | DEF-012 |
| AREA | Ads / Placement |
| SEVERITY | **P2** |
| CLASS | `MOCK_PREVIEW` / weak adapter |
| SYMPTOM | Placement map uses thumbnail-only creative, not placement renderer |
| EXPECTED | Same representation as studio/detail preview or explicit “map thumbnail” label |
| ACTUAL | Thumbnail path in `AdminPlacementMapPanel` |
| NOTE | Detail/studio paths use real `DeliveryAdCampaignPlacementPreviews` — not global fake |
| VERDICT | **CONFIRMED P2** |

### DEF-013 — ads-legacy still in primary Ads tree
| Field | Value |
|---|---|
| ID | DEF-013 |
| AREA | B7 IA |
| SEVERITY | **P2** |
| CLASS | `LEGACY_PRIMARY_LEAK` |
| SYMPTOM | `ads-legacy` children still under Ads primary nav |
| EXPECTED | Archive/hide from primary operational nav |
| ACTUAL | Present as demoted but visible group (`admin-menu.ts:856-878`) |
| VERDICT | **CONFIRMED P2** |

### DEF-014 — Community dashboard recent posts lack entity deeplink
| Field | Value |
|---|---|
| ID | DEF-014 |
| AREA | Community dashboard |
| SEVERITY | **P2** |
| CLASS | `WRONG_DEEPLINK` |
| SYMPTOM | Recent items href to `/admin/community/posts` without post id |
| CODE OWNER | `load-community-domain-dashboard.ts` (~69-75) |
| VERDICT | **CONFIRMED P2** |

---

## PUBLIC ROUTE LEAKS

| Occurrence | Classification |
|---|---|
| **Order detail → `/stores/{slug}` alone** | **WRONG ADMIN CONTEXT (DEF-001)** |
| Business hub / Stores list “공개 매장” + `target=_blank` | INTENTIONAL PREVIEW |
| Posts/products “웹에서 보기” `/post/` | INTENTIONAL PREVIEW |
| Community `/philife/` open in new tab beside Admin links | INTENTIONAL PREVIEW |
| Trade chat notification → member messenger room | INTENTIONAL PREVIEW (member surface) |

**Systemic public-helper reuse across all Admin ops: NOT proven.**  
**Order detail is the confirmed operational eject.**

---

## DEAD / FAKE CTA

| Item | Class |
|---|---|
| Action Center `domain-chat` count:0 alwaysShow | FAKE_DATA (DEF-002) |
| Chat list “목록에서만 제거” | FAKE_SUCCESS / wrong semantics (DEF-009) |
| Cash `?requestId=` from Support | Dead query (DEF-006) |

Critical specialist CTAs for Point/Settlement/Support reply/Ads transition: **wired** in code (not dead) — permissions asymmetry is separate (DEF-004).

---

## DUPLICATE SSOT / MUTATIONS

| Topic | Status |
|---|---|
| Legacy charge READ vs canonical Cash/Point queues | DUPLICATE READ (DEF-005) |
| Chat hard-delete vs CM prelaunch wipe | DUPLICATE destructive owners (DEF-010) |
| Delivery `admin_delivery_ad_transition` | Single Admin mutation path — OK |
| Application id == Execution id | KEEP_CURRENT schema debt — not defect |
| Coin→Cash | Owner only — Admin CTA absent = correct |

---

## WRONG MONEY / STATE / OWNER

| Check | Verdict |
|---|---|
| B3 fee from `store_settlements.platform_fee_*` | **CORRECT** (no sale×rate in statement) |
| B4 Point/Coin/Cash/Settlement separated | **CORRECT** |
| Point pays Delivery Ads | **NOT FOUND** |
| Coin auto fee / negative Cash / forced convert | **NOT FOUND** in Admin finance |
| Cash permission weaker than Point | **WRONG_PERMISSION (DEF-004)** |
| Feed presentation `approved`→`active` alias | Latent P2 helper risk — monitor |

---

## FAKE / MOCK / SHELL

| Item | Verdict |
|---|---|
| Domain dashboards Delivery/Trade/Community/Messenger | Real loaders; null≠0 on exact counts |
| Action Center messenger card | Fake zero (DEF-002) |
| Ads detail/studio preview | Real renderer |
| Placement map preview | Weak thumbnail (DEF-012) |
| B2 KPI mock hardcoded | NOT_PROVEN |

---

## ERROR-AS-EMPTY

| Path | Verdict |
|---|---|
| `admin-action-queue.safeCount` | **ERROR_AS_ZERO (DEF-003)** |
| Domain `count-exact` | OK (null → UNAVAILABLE) |
| Finance/Ads/Support control planes | Mixed: some UNAVAILABLE chips; some sections still []→「0건」 smell (prior PARTIAL) |

---

## PERMISSION MISMATCH

| Surface | Issue |
|---|---|
| Point | Fine-grained `point` key |
| Cash | Any admin API user |
| Support | `isRouteAdmin` only |
| Trade hard delete | `requireAdminApiUser` without `product_edit` |
| Reset | master/super_admin — roughly aligned |

---

## MANUAL RE-SEARCH FLOWS

| Flow | Issue |
|---|---|
| Order → Admin Store | Broken — public only (DEF-001) |
| Support Cash request | List without row focus (DEF-006) |
| Support Partner | List without membership id (DEF-007) |
| AC Store applications | Unfiltered stores (DEF-008) |
| Support→Finance (settlement case) | **LIVE proven** with storeId statement |
| Ads Support case | FIXTURE_ABSENT (not product) |

---

## LEGACY PRIMARY LEAKS

- `ads-legacy` still under Ads primary tree (DEF-013)
- Legacy finance GET endpoints still serve reads (DEF-005)
- System menu clutter under master — P2 historical

---

## SSOT MATRIX (minimum)

| ENTITY | UI OWNER | READ OWNER | MUTATION OWNER | DB/RPC | MONEY/STATUS |
|---|---|---|---|---|---|
| Order | Delivery Orders Admin | `store_orders` / admin delivery map | store-order status/refund APIs | `store_orders` | Store ops |
| Store | `/admin/business/[id]` | stores + CC panels | store status/visibility APIs | `stores` | — |
| Owner | business hub / users | profiles | — | profiles | — |
| Member | `/admin/users` | profiles | — | profiles | Point owner |
| Point | Finance / point-charges | point ledgers | `approve_user_point_charge_request` | Point authority | **user** |
| Coin | Finance / coin-withdrawals | store economic points | coin_withdrawal_* ; convert Owner | Coin authority | **store** |
| Cash | Finance / business-cash-charges | business_cash_ledger | approveBusinessCashTopUp; ad debit/refund | Cash authority | **store** |
| Settlement | store-settlements | `store_settlements` | PATCH settlement | `store_settlements` | fee snapshot |
| Sale fee / unpaid | B3/B4 obligation | settlements + obligations | no forced Coin debit | Option B contract | Cash shortfall |
| Ad Product | delivery-ads / products | product tables | product config | product | — |
| Application/Execution | delivery-ads | campaigns (id shared KEEP) | `admin_delivery_ad_transition` | `store_*_ad_campaigns` | Cash/Point by track |
| Creative | creatives studio | `delivery_ad_creatives` | creative writers | creatives | — |
| Placement | inventory/placement-map | `delivery_ad_inventories` | inventory writers | inventories | — |
| Exposure | eligibility resolvers | runtime eligibility | not Admin fake ACTIVE | resolvers | — |
| Support Case | `/admin/support` | `support_cases` | reply/status APIs | support_* | — |
| Notification | signal only | `notification_events` / deliveries | notify writers | notifications | not business SSOT |
| Trade Post | posts-management | posts | bulk soft/hard | posts | — |
| Community Post | community posts | engine posts | bulk delete | community posts | — |
| Comment | community comments | comments | soft only | comments | — |
| Chat Room | chats/* / order-chats | chat_rooms / CM / product_chats | hide(list)/hard split **debt** | multi | — |
| Prelaunch Reset | `/admin/prelaunch-reset` | planner scopes | `executePrelaunchReset` | selective DELETE | ≠ normal delete |

**Duplicate flags:** legacy charge READ; chat delete dual path.

---

## P0

1. **DEF-004** Point vs Cash permission asymmetry (money mutation)

## P1

1. **DEF-001** Order → Admin Store public leak (confirmed Production)  
2. **DEF-003** Action queue error→0  
3. **DEF-002** Action Center messenger fake zero  
4. **DEF-005** Legacy finance pending READ  
5. **DEF-006 / DEF-007** Support Cash/Partner exact deeplink  
6. **DEF-008** Store applications generic href  
7. **DEF-009 / DEF-010** Chat hide/hard authority clarity  

## P2

- DEF-011 view=statement unread  
- DEF-012 Placement map weak preview  
- DEF-013 ads-legacy visibility  
- DEF-014 Community recent generic href  
- System label “Data Management” wording  
- Feed presentation approved→active alias (latent)

---

## ORIGINAL OWNER INTENT CONFORMANCE

| Domain | Verdict |
|---|---|
| Delivery | **PARTIAL** — ops exist; Order→Store Admin context DEVIATED |
| Store | **PARTIAL** — hub exists and is rich; entry from Order broken |
| Order | **DEVIATED** on Admin Store handoff |
| Finance | **PARTIAL** — B3/B4 SSOT largely exact; permission + legacy READ debt |
| Ads | **PARTIAL** — lifecycle/billing mostly exact; map preview weak; legacy nav |
| Placement | **PARTIAL** |
| Support | **PARTIAL** — reply≠resolve OK; some context deeplinks generic; Ads fixture absent |
| Notification | **PARTIAL** — exact admin route exists on some events; list surface incomplete |
| Trade | **PARTIAL** — delete wiring present |
| Community | **PARTIAL** |
| Messenger | **PARTIAL** — pillars separated; Action Center fake metric; hide semantics weak |
| Delete | **PARTIAL** — trade/community OK; chat policy gap |
| Reset | **PARTIAL** — entry+executor exist; no prod execute this audit |
| Tablet/Admin op | **NOT_PROVEN** this audit (no new device run) |

---

## FINAL

REAL-WORLD ADMIN READY: **FAIL**  
(reason: at least one confirmed P1 workflow break DEF-001 + P0 permission DEF-004)

SSOT HARD LOCK: **NOT_ALLOWED**

FIRST REPAIR BOUNDARY:  
**DEF-001 root** — `DeliveryOrderDetailClient` must use `businessCcBackToStoreHref(order.storeId)` as primary Admin Store context (public preview secondary only).  
Do **not** invent a new Store SSOT or new route; helper already canonical.

Next after DEF-001 (suggested order, do not auto-start):  
DEF-004 → DEF-003 → DEF-002 → DEF-005 → Support deeplinks (006/007) → AC store apps (008) → Chat semantics (009/010).

PRODUCT CODE CHANGE: **NONE**

---

## HARD STOP

No implementation. No commit. No push. No deploy. No B10. No redesign wave.

Owner chooses the first repair boundary explicitly before any fix.
