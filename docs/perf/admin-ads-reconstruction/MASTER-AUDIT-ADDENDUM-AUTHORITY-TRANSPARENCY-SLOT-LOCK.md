# MASTER AUDIT ADDENDUM — ADMIN AUTHORITY / TRANSPARENCY / SLOT & ROTATION SSOT

**STATUS:** LOCK (implementation gate)  
**BASIS:** CURRENT AD PRODUCT / PLACEMENT MASTER AUDIT (KEEP)  
**HEAD AT LOCK:** `5dca2584a`  
**RULE:** 이 4축 LOCK 없이 One-page Workspace UI 구현 금지.  
**RULE:** 새 광고 엔진 금지. 기존 writer / resolver / renderer / audit / commercial snapshot 재사용.  
**RULE:** 엔진이 지원하지 않는 옵션을 Admin UI에 가짜로 넣지 않는다.

---

## 0. Principle

```text
ADMIN CAN CONTROL EVERYTHING.
EVERY CONTROL MUST LEAVE HISTORY.
Admin / Member / Owner see the SAME facts (role-filtered fields).
```

Product / Placement Master Table = **WHAT**  
This Addendum = **HOW it is operated** (authority · money/period statement · slot/rotation · empty fallback)

---

## 1. EXISTING vs GAP (honest inventory)

### 1.1 Proven EXISTING (reuse)

| Area | Evidence |
|---|---|
| Delivery lifecycle | `delivery-ad-lifecycle.ts` — APPROVE / REJECT / PAUSE / RESUME / END / TERMINATE / ARCHIVE transitions |
| Delivery audit | `delivery_ad_audit_logs` · `DELIVERY_AD_DELETE_CONTRACT` (physical delete = draft + no history only) |
| Delivery extend | `admin-delivery-ad-extension-writer.ts` — `PAID` \| `ADMIN_FREE_COMPENSATION` + quote + Cash snapshot + audit. Schedule save that lengthens end → `use_extension_flow` |
| Delivery commercial | packages · Partner discount · campaign commercial snapshots |
| Owner Delivery history | Owner ads history loads before/after (extension parity tests) |
| HERO carousel | `LAUNCH_BANNER_PLACEMENTS.home_hero_carousel`: `visibleAtOnce=1`, `autoSlideMs=5000`, `loop`, `dotsRequired`. Renderer: `StoresHomeHeroBanner` — multi active → carousel; **empty → hide** |
| Category top capacity | Stage2 `bannerAds.capacity` clamp **1..3** in product config |
| Feed slot cap | `FEED_AD_SLOT_MAX_CAMPAIGNS = 3` · gaps ∈ [4,6] · slide interval `FEED_AD_SLIDE_INTERVAL_MS=4000` |
| Feed priority | campaign `priority` + stable hash selection |
| Popup | single winner · `priority` DESC · frequency/suppression fields · pause/end |
| Occupancy presentation | `computePlacementOccupancy` — live / reserved / vacant over schedules (**presentation only; no capacity DB**) |

### 1.2 GAP (must LOCK + wire before claiming COMPLETE)

| Gap | Reality today | LOCK target |
|---|---|---|
| Unified Advertising Statement | Domain별 다른 detail/history | One canonical read-model adapter (role-filtered) |
| Internal admin memo | Delivery review notes 분산 · 통일 SSOT 없음 | `INTERNAL_MEMO` ≠ `PUBLIC_APPLICANT_MESSAGE` |
| Community Boost HOLD | Revert 후 `requiresAdminApproval: false` | Re-apply HOLD (`true`) on implement step 0 |
| Promote pause/resume/end | Feed/Delivery만 강함 · Boost lifecycle 약함 | Only expose CTA where writer exists; else no fake button |
| HERO capacity Admin setting | Occupancy default `STORES_HOME_HERO: 1` vs carousel multi-slide reality | Capacity SSOT: max concurrent campaigns in pool; Admin can set within engine clamp |
| Schedule overlap capacity | Occupancy heuristic “now” 중심 | Period-interval overlap required for “기간 만석” |
| HOUSE_AD / empty fallback policy | HERO empty = hide; no named HOUSE_AD product | Per-placement FALLBACK enum wired to real renderer behavior |
| Cross-domain statement parity | Member/Owner/Admin 필드 불일치 위험 | Same facts · different field mask |
| Operator jargon in UI | occupancy / collision / inventory | Human terms only (아래 §8) |

### 1.3 Explicitly UNSUPPORTED (do not fake in UI)

| Feature | Domains |
|---|---|
| Weighted / shuffle rotation | Delivery HERO · Feed (ordered / policy only) |
| Silent free extend (no reason/snapshot) | All |
| Physical hard-delete of ACTIVE/history | All |
| Promote EXTEND PAID Admin Cash | Promote (Point renew paths only where exist) |
| Popup EXTEND PAID | Unsupported today |
| Delivery store_sponsored Admin first-party create | Blocked (`store_promotion_blocked`) |
| FUTURE inventories sell/create | `STORES_CATEGORY_INLINE`, `STORE_DETAIL_RECOMMENDATION_BANNER` |

---

## 2. AXIS A — ADMIN FULL AUTHORITY

### 2.1 Verb dictionary (canonical meanings)

| Verb | Meaning | Allowed on |
|---|---|---|
| CREATE | Admin Direct / first-party where writer allows | Banner FP · Feed Admin · Popup Admin · **not** store_sponsored FP |
| VIEW | Read statement + creative + payment mask | All |
| EDIT | Non-money fields (copy, destination) within writer | Where writer supports |
| EXTEND | Lengthen end via extension flow | Delivery PAID/COMPENSATION; Feed renew/compensation where exists |
| SHORTEN | Move end earlier without charge | Schedule correction + audit |
| RESCHEDULE | Move start/end without net paid extend | Correction path + audit |
| APPROVE / REJECT / REQUEST_REVISION / HOLD | Request pipeline | Product policy |
| CANCEL | Cancel unpaid/open request | Request objects |
| DELETE_DRAFT | Physical delete only if draft + no history | Delivery contract |
| ARCHIVE | Hide from ops list · keep history | Post END/REJECT/TERMINATE |
| PAUSE / RESUME | Temporary remove/restore from exposure | Writer-backed only |
| END | Normal completion | Writer-backed |
| TERMINATE | Admin force kill while active/scheduled | Writer-backed |
| REFUND | Finance/ledger path only | No fake CTA |
| CHANGE_PLACEMENT | Move inventory/placement if writer supports | Else reject |
| CHANGE_PRIORITY / CHANGE_SLOT / CHANGE_ROTATION | Only if engine field exists | No fake |
| REPLACE_CREATIVE | Creative studio / feed slides | Writer-backed |
| VIEW_PAYMENT / VIEW_HISTORY | Statement | All |
| ADD_INTERNAL_MEMO | Internal only | All campaigns/requests |

**DELETE ≠ END ≠ TERMINATE ≠ ARCHIVE.** History rows are never Admin-purged.

### 2.2 Authority matrix (LOCK = wire only existing writers)

| Action | Delivery sponsored | Delivery banner | Feed banner | Trade boost | Community boost | Popup |
|---|---|---|---|---|---|---|
| APPROVE/REJECT | Y | Y | Y | Y | **Y after HOLD restore** | Y |
| REQUEST_REVISION | Y | Y | partial | — | — | — |
| PAUSE/RESUME | Y | Y | Y | GAP | GAP | Y |
| END | Y | Y | Y | GAP | GAP | Y |
| TERMINATE | Y | Y | end | — | — | end |
| EXTEND PAID | Y | Y | Member renew Point | — | — | UNSUPPORTED |
| EXTEND COMPENSATION | Y | Y | Admin extend_compensation if exists | — | — | UNSUPPORTED |
| SHORTEN / RESCHEDULE | Y (non-extend schedule) | Y | dates | — | — | dates |
| REPLACE_CREATIVE | — / store card | Y | Y | — | — | Y |
| CHANGE_PLACEMENT | limited | limited | placement field | — | — | surface |
| CHANGE_PRIORITY | — | order/priority if column | Y priority | pin policy | pin policy | Y |
| REFUND | finance | finance | point reverse if exists | point | point | finance |
| DELETE_DRAFT | draft only | draft only | no purge | no | no | no |
| INTERNAL_MEMO | **wire** | **wire** | **wire** | **wire** | **wire** | **wire** |

UI may show only **Y** cells. GAP cells: implement writer first or omit CTA.

### 2.3 Extend money policy (LOCK)

| Kind | When | Charge | Record |
|---|---|---|---|
| A · Advertiser extension | Owner/Member requested | Additional quote (days × unit − discount) | `PAID` + payment id + snapshot |
| B · Admin compensation | Service recovery | **0** charge | `ADMIN_FREE_COMPENSATION` + reason |
| C · Admin correction | Fix wrong schedule without paid lengthen | No charge; shorten or shift | `schedule` audit before/after · **not** silent free extend past paid end without kind |

Always persist: OLD_START · OLD_END · NEW_END · ADDITIONAL_DURATION · ADDITIONAL_PRICE · DISCOUNT · FINAL_ADDITIONAL_CHARGE · SOURCE · REASON · admin_id.

---

## 3. AXIS B — PERIOD / MONEY / HISTORY TRANSPARENCY

### 3.1 Advertising Statement (canonical fields)

Every REQUEST/CAMPAIGN exposes one statement (adapter over existing tables):

```text
AD_ID
DOMAIN
PRODUCT
PLACEMENT
SOURCE                  # MEMBER | OWNER | ADMIN | HOUSE_AD
APPLICANT
ADVERTISER
OBJECT                  # post | listing | store | creative-only
CREATIVE_REF
START_AT / END_AT / TIMEZONE
DURATION
UNIT_PRICE / ORIGINAL_PRICE / DISCOUNT / FINAL_PRICE / CURRENCY
PAYMENT_STATUS / PAYMENT_ID / REFUND
CURRENT_STATUS
ADMIN_DECISION
INTERNAL_MEMO[]         # admin only
PUBLIC_ADMIN_MESSAGE    # applicant-visible revision/reject reason
CREATED_AT / APPROVED_AT / ACTIVATED_AT / ENDED_AT
HISTORY[]               # append-only facts
```

### 3.2 Same facts · three surfaces

| Surface | Sees |
|---|---|
| Admin | Full statement + internal memo + override CTAs |
| Member | Own ads only · no internal memo · public messages yes |
| Owner | Own store ads only · Cash · no internal memo |

**No parallel price recalculation.** Role = field mask only.

### 3.3 History events (append-only)

```text
CREATED SUBMITTED PAID/HOLD APPROVED REJECTED EDITED
EXTENDED SHORTENED PLACEMENT_CHANGED SLOT_CHANGED CREATIVE_CHANGED
SCHEDULED ACTIVATED PAUSED RESUMED ENDED TERMINATED REFUNDED ARCHIVED
MEMO_ADDED
```

Admin power ↑ ⇒ audit strength ↑. Past facts are not rewritten; corrections are new events.

### 3.4 Period list filters (Admin)

전체 · 오늘 · 이번주 · 이번달 · 기간 직접선택  
+ Domain · Product · Placement · Applicant · Advertiser · Status · Payment · Source  
Sort: 최근 신청 · 시작 예정 · 종료 임박 · 금액 · Placement

---

## 4. AXIS C — BANNER SLOT / CAPACITY / ROTATION

### 4.1 Definitions (LOCK)

| Term | Meaning |
|---|---|
| **SLOT / CAPACITY** | Max **concurrent campaigns** that may be in the exposure pool for a placement over an overlapping schedule |
| **SLIDE** | User-visible carousel frame; HERO `visibleAtOnce = 1` |
| **DISPLAY_ORDER** | Admin-defined order of campaigns in the carousel pool |
| **PRIORITY** | Tie-break / selection weight where engine uses priority (Feed/Popup). Not synonym of DISPLAY_ORDER |
| **ROTATION** | How slides advance among active pool campaigns |

### 4.2 Capacity SSOT per placement (LOCK values = engine truth + Admin clamp)

| DOMAIN | PLACEMENT | CAPACITY SSOT today | Admin settable? | Notes |
|---|---|---|---|---|
| delivery | `STORES_HOME_HERO` | Pool of concurrent ACTIVE/SCHEDULED banners; UI default occupancy file says `1` (**GAP vs carousel**) | **YES — clamp min1..maxN** (N from launch policy; propose max **5** for Admin ops, wire to occupancy/override) | Carousel slides = ordered pool; not 5 simultaneous frames |
| delivery | `STORES_HOME_INLINE_1` | Default 1 | YES 1..3 | Composition gate may disable |
| delivery | `STORES_CATEGORY_TOP` | Stage2 `bannerAds.capacity` 1..3 | YES via category policy | |
| delivery | `STORES_SEARCH_TOP` | 1 (presentation) | limited · not launch-sellable | |
| delivery | `STORES_HOME_FEED` | insertion density (every N) ≠ banner slots | density policy | Sponsored ≠ banner capacity |
| delivery | `STORES_CATEGORY_FEED` | category everyN | density policy | |
| trade/community | Feed placements | **max 3 campaigns / feed slot** | not arbitrary UI | `FEED_AD_SLOT_MAX_CAMPAIGNS` |
| popup | surface | **1 winner** at a time | priority only | Not multi carousel |

### 4.3 Rotation (LOCK — real only)

| Placement | rotationMode | interval | shuffle | Admin fake? |
|---|---|---|---|---|
| `STORES_HOME_HERO` | `ordered_carousel` | **5000ms** | no | no weighted UI |
| Feed banner slides | `ordered_carousel` (within campaign) | **4000ms** | no | |
| Feed campaign pick | priority + stable hash | n/a | no random | |
| Popup | single winner | n/a | n/a | priority only |

### 4.4 Overlap / duplicate policy

| Policy | Default LOCK |
|---|---|
| OVERLAP_POLICY | Capacity counted on **schedule interval overlap**, not “지금만” |
| DUPLICATE_POLICY | Same advertiser + same placement + overlapping schedule: **warn**; Admin may override with audit (`MULTIPLE_ALLOWED` with reason) unless product sets `DUPLICATE_BLOCKED` |
| Human copy | 「같은 기간에 동일 광고주의 배너가 겹칩니다」 — not “collision” |

### 4.5 Capacity exceed

If overlapping campaigns ≥ capacity → 「기간 만석」.  
Admin options: other dates · other placement · raise capacity · end existing · **override + audit**.

---

## 5. AXIS D — EMPTY SLOT / DEFAULT FALLBACK

### 5.1 Fallback enum (LOCK)

| Code | Behavior | Proven today |
|---|---|---|
| `COLLAPSE_SLOT` | Hide region | HERO empty → hide (`StoresHomeHeroBanner`) |
| `ORGANIC_CONTENT` | Show organic only | Sponsored insertion when no paid |
| `DEFAULT_DIBAY_BANNER` / `HOUSE_AD` | Fill with DIBAY house creative | **GAP** — implement as `SOURCE=HOUSE_AD` / first-party no-charge campaign using **same renderer** |

Admin setting per placement chooses among **engine-supported** options only.  
Do not show `DEFAULT_DIBAY_BANNER` until HOUSE_AD writer path exists.

### 5.2 HOUSE_AD rules

- No charge · Admin-authored · low priority · same placement renderer  
- Distinct from paid Owner/Member campaigns in Statement `SOURCE`  
- Used when paid pool &lt; capacity **and** fallback = HOUSE_AD

### 5.3 Admin capacity card language (no jargon)

```text
배달 홈 · 상단 배너
비율 39:16
배너 수량 (capacity): 5
현재 노출: 3
예약: 1
빈 슬롯: 1
노출 순서 / 회전: 5초
빈 슬롯 처리: 영역 숨김 | DIBAY 기본 배너 | …
```

---

## 6. MASTER TABLE — ADDED COLUMNS (LOCK)

Existing columns KEEP. Append:

| Column | Meaning |
|---|---|
| CAPACITY | Max concurrent campaigns (or N/A for boost/popup-winner) |
| ROTATION | Mode + interval or N/A |
| DISPLAY_ORDER | Admin order supported? Y/N |
| PRIORITY | Engine priority field? Y/N |
| FALLBACK | COLLAPSE / ORGANIC / HOUSE_AD / N/A |
| DUPLICATE_POLICY | MULTIPLE_ALLOWED_WARN / DUPLICATE_BLOCKED |
| OVERLAP_POLICY | INTERVAL_CAPACITY |
| ADMIN_EXTEND | PAID+COMPENSATION / Point renew / UNSUPPORTED |
| ADMIN_MOVE | placement change supported? |
| ADMIN_DELETE | DRAFT_ONLY / NONE |
| STATEMENT | adapter domain key |
| MEMBER_HISTORY | Y/N surface |
| OWNER_HISTORY | Y/N surface |

### 6.1 Filled rows (ACTIVE products only — summary)

| PLACEMENT / PRODUCT | CAPACITY | ROTATION | FALLBACK | ADMIN_EXTEND | STATEMENT |
|---|---|---|---|---|---|
| STORES_HOME_HERO | Admin 1..5 (wire; fix default≠carousel) | ordered 5s | COLLAPSE (now) → +HOUSE_AD later | PAID+COMP | delivery_banner |
| STORES_HOME_INLINE_1 | 1..3 | single/ordered | COLLAPSE/composition off | PAID+COMP | delivery_banner |
| STORES_CATEGORY_TOP | 1..3 policy | single | composition | PAID+COMP | delivery_banner |
| STORES_SEARCH_TOP | 1 | single | fail-closed empty organic | PAID+COMP | delivery_banner |
| STORES_HOME_FEED | density everyN | n/a | ORGANIC | PAID+COMP | delivery_sponsored |
| STORES_CATEGORY_FEED | everyN | n/a | ORGANIC | PAID+COMP | delivery_sponsored |
| TRADE_/COMMUNITY_ feed banner | max 3/slot | slide 4s | skip slot | Point renew / comp | feed_banner |
| trade_promote_* | pin cap ≤3 | n/a | organic list | UNSUPPORTED Admin Cash | boost_trade |
| community_promote_* | top pin | n/a | organic | UNSUPPORTED Admin Cash | boost_community |
| Popup surfaces | 1 winner | n/a | no popup | UNSUPPORTED paid extend | platform_popup |

FUTURE placements: columns N/A · **no Admin sell UI**.

---

## 7. Operator language LOCK (UI)

**Forbidden in Admin primary UX:** 관제 · 집행 · inventory · occupancy · collision · resolver · slot utilization · Runtime:Y  

**Required:** 승인 대기 · 현재 노출 · 예약 · 일시중지 · 종료 예정 · 빈 슬롯 · 배너 수량 · 노출 순서 · 중복 기간 · 기간 만석 · 연장 · 기간 변경 · 위치 변경 · 광고 교체

---

## 8. Implementation order (REPLACES prior “UI first”)

1. Re-apply **Community Boost HOLD** (`requiresAdminApproval: true`) — KEEP money contract  
2. Extend Master Table columns in code SSOT module (read-only constants + adapters)  
3. **Advertising Statement** read-model (Delivery → Feed → Popup → Boost)  
4. Admin authority CTA map = writer-backed only + audit  
5. Capacity / schedule-overlap / duplicate human messages (fix HERO capacity default)  
6. Rotation display from launch/feed constants · no fake modes  
7. Fallback enum wired to renderer · HOUSE_AD only when writer ready  
8. One-page Domain Workspace UI (consumes statement + capacity cards)  
9. Placement cards · campaign drawer · internal memo  
10. Member history · Owner history (same statement)  
11. Admin Direct inline (no full-page wizard Primary)  
12. Samples (HERO multi-banner carousel + extend/pause/terminate)  
13. Production E2E · placement-level PASS only

---

## 9. Sample gates (must prove)

### Banner capacity / rotation

- capacity = configured value  
- A/B/C overlapping schedules · carousel order · pause removes slide · resume restores · terminate removes + history  

### Extend

- B end extended · PAID or COMPENSATION quote fields · Owner statement matches Admin  

### Transparency

- Owner September history shows pause/resume facts Admin recorded (no internal memo on Owner)

---

## 10. Complete criteria (addendum)

FAIL if:

- Admin action without history  
- Member/Owner statement money/dates/status ≠ Admin  
- Banner “빈 자리 N” without capacity / live / reserved breakdown  
- Fake rotation/capacity UI without engine  
- COMPLETE claimed without HERO multi-campaign + pause/resume/terminate proof  

PASS only when Admin can answer immediately:

- how many banners this placement allows  
- how many live / reserved / vacant  
- when a slot frees  
- rotation interval / order  
- what shows when empty  

…and Member/Owner see the same commercial facts.

---

## 11. Sign-off

| Item | Status |
|---|---|
| Product/Placement Master KEEP | LOCKED |
| Admin Full Authority verbs | LOCKED |
| Statement transparency | LOCKED (adapter TODO) |
| Slot/Capacity/Rotation | LOCKED (HERO capacity GAP explicit) |
| Empty/Fallback | LOCKED (HOUSE_AD GAP explicit) |
| One-page UI | **BLOCKED until this LOCK applied in code SSOT + statement scaffolding** |

**Next allowed step:** implement §8 steps 1–7 (contracts/adapters) then UI.  
**Not allowed:** jump to One-page chrome without Statement + capacity overlap SSOT.
