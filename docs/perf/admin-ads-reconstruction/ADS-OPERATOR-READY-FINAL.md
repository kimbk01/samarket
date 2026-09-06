# ADS / EXPOSURE — PRODUCT GAP CLOSE + PRODUCTION FINAL

**Base reconstruction:** `ebd398339`  
**This close:** PRODUCT GAP (paid extend + Delivery hide semantics) then Production bind + P1–P24  

**Verdict (pre-Production bind):** code gaps below closed in this run; Production P1–P24 / SHA bind filled after push.

## Prior INVALID conclusion

「다음 단계는 Production P1–P24 재감사뿐」 = **INVALID**. Two PRODUCT GAPS were still open.

## PRODUCT GAP close (this run)

### 1. Paid / compensation extension

| Product | PAID | COMPENSATION | FREE silent | Notes |
|---|---|---|---|---|
| Delivery | Admin GET/POST `/api/admin/delivery-ads/[id]/extend` → quote → Cash debit → `end_at` → `delivery_ad_extension_snapshots` → audit `extended` | same route `ADMIN_FREE_COMPENSATION` + reason | **UNSUPPORTED** (no UI) | Schedule save lengthening `end_at` → `use_extension_flow` |
| Feed | Member `renewFeedAdCampaign` Point spend↔period | Admin `extend_compensation` | **UNSUPPORTED** | pause ⇒ not renderer-eligible |
| Popup | **UNSUPPORTED** (no extend CTA) | **UNSUPPORTED** | **UNSUPPORTED** | schedule/transition only |
| Trade/Community Promote | **UNSUPPORTED** (new purchase) | **UNSUPPORTED** | — | — |

### 2. Delivery hide semantics

- Independent HIDDEN/SANCTIONED state: **not** in canonical SM → **UNSUPPORTED**
- Fake 「숨김」 CTA / pause·end rename: **removed / not offered**
- Operator verbs: **일시중지 / 재개 / 강제 종료 / 종료** only
- Owner labels: `PAUSED_ADMIN` = 관리자 일시중지; `TERMINATED` = 강제 종료

### 3. Customer parity

- Owner history reads audit `before_json`/`after_json`; `extended` shows before→after end + amount/kind + reason
- Shared lifecycle source (campaign row); no separate Admin status copy

### 4. Collateral P0/P1 closed in same Ads boundary

- Control plane collision/delivery/ending counts: `unavailable` ≠ `0`
- Owner popup creative source max: `POPUP_CREATIVE_SOURCE_MAX_BYTES` (8MB) aligned with Admin
- Feed ops default filter: excludes live `exposing` (not dumping ACTIVE into actionable)

## Authority matrix

| PRODUCT | APPLICATION | PAYMENT | CREATIVE | PLACEMENT | SCHEDULE | EXECUTION | ELIGIBILITY | RENDERER | ADMIN MUTATION | CUSTOMER STATUS SOURCE | HISTORY SOURCE | EXTENSION AUTHORITY | SANCTION AUTHORITY |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Delivery | delivery applications | Cash | delivery creatives | delivery inventory | campaign window | store_*_ad_campaigns | delivery gates | stores discovery | delivery-ads actions + `/extend` | Owner delivery ads | delivery_ad_audit_logs (+ extension_snapshots) | Admin extend PAID/COMP; schedule blocked | pause/terminate only — **no hide** |
| Feed | feed_ad_requests | Point | feed creatives | feed placements | campaign window | feed_ad_campaigns | status=active+window | feed slot | feed-ad-requests PATCH | member feed presentation | request/campaign memo | Member renew PAID; Admin compensate | pause/end — **no hide** |
| Popup | owner requests | Cash | popup pipeline 1440×1000 | popup surfaces | campaign window | platform_popup_campaigns | popup eligibility | popup renderer | popup transition | Owner popup | popup audit | **UNSUPPORTED** | pause/end — **no hide** |
| Trade Promote | point_promotion_orders | Point | post | boost | order window | promotion orders | promote eligibility | trade feed | promote PATCH | member promote | order history | **UNSUPPORTED** | approve/reject |
| Community Promote | point_promotion_orders | Point | post | pin | order window | promotion orders | promote eligibility | community feed | promote PATCH | member promote | order history | **UNSUPPORTED** | approve/reject |

Chat paid advertising: **NOT SUPPORTED**.

## Binary (code close)

- duplicate writer / purchase / fake hide mapping / paid extend money bypass (Delivery+Feed paths): closed in code
- Production bind + P1–P24: see ship section after push

Do **not** claim `ADS SSOT = HARD LOCK` until Production SHA match + P1–P24 critical PASS.
