# DIBAY Delivery Ads — Finance + Admin Approval Authority Design

**Document type:** Historical technical authority design (Delivery Ads boundary only)
**Status:** **SUPERSEDED — ARCHIVE EVIDENCE ONLY** · **IMPLEMENTATION_ALLOWED = FALSE**
**Not:** physical schema lock · migration · RPC signatures · runtime QA

## Three-currency reconstruction amendment (2026-09-02)

This document no longer authorizes a finance product or implementation. Its Store Points / Business Cash / Business Credit / Store Cash / Gift Store Cash / ads-wallet language records the superseded design only.

Current product authority is `docs/dibay-currency-ssot-hard-lock.md`:

- Delivery Ads may consume canonical **Cash** only.
- **Point, Coin, and Cash** are the only product currencies.
- Settlement is an operational record, never a wallet or currency.
- Legacy balances, ledgers, migrations, and spend/refund records are accounting evidence only.
- No legacy authority may have an active reader/writer, recharge/adjust/convert path, Owner/Admin mutation CTA, navigation item, notification term, or product card.

All sections below are retained solely for historical decision traceability and must not be used as current product or implementation authority.

Evidence tags used below: `OWNER_LOCKED` · `CODE_CONFIRMED` · `CONFLICT` · `MISSING` · `REWORK` · `NOT_PROVEN` · `DESIGN_PENDING`

---

## 1. Locked contracts

### 1.1 Finance product (`OWNER_LOCKED`)

**Store Points**

- `store_id` scoped (selected store)
- Generated from authorized store economic / revenue activity
- Arbitrary top-up **forbidden**
- Withdrawal allowed according to canonical store finance policy
- Conversion → Business Cash **allowed**
- Default conversion **1 SP = 1 BC**, Admin/policy-configurable (`DEFAULT_1_TO_1_CONFIGURABLE`; §3.2)
- Not member/personal points
- **Not** AST-002 Business Credit

**Business Cash**

- `store_id` scoped (selected store; not owner-wide aggregate)
- Direct top-up **allowed**
- Store Points → Business Cash conversion **allowed** (same rate contract §3.2)
- Withdrawal **forbidden**
- Spend authority for Delivery Ads + Partner
- **Not** Gift Store Cash
- **Not** `delivery_ad_accounts` (owner-scoped ads shadow wallet)

### 1.2 Existing authority verdict (`CODE_CONFIRMED` reconciliation)

| Product asset | Verdict | Class |
|---|---|---|
| Store Points | `NO_EXISTING_MATCH` | **C** |
| Business Cash | `NO_EXISTING_MATCH` | **C** |

Do **not** rename or repurpose AST-002, Gift Store Cash (`store_cash_*`), or `delivery_ad_accounts` to force a product match.

### 1.3 Admin approval (`OWNER_LOCKED`)

```text
OWNER   create / edit / fund / submit / respond / resubmit
ADMIN   review / request changes / approve / reject / schedule / pause / resume / end
CUSTOMER  approved + eligible inventory consumer only
```

- `APPROVAL_AUTHORITY = ADMIN ONLY` for Store Promotion · Banner · Partner
- Owner self-approval **forbidden**
- Unfunded Admin intake **forbidden**
- Pre-approval Customer exposure **forbidden**
- `PARTNER_ADMIN_APPROVAL = REQUIRED`
- No unpaid ACTIVE membership
- No payment-only activation

### 1.4 Boundary markings (this document)

| Mark | Meaning |
|---|---|
| `PROPOSED_CONCEPTUAL_AUTHORITY` | Product/economic authority name only |
| `PHYSICAL_SCHEMA = NOT_LOCKED` | Table count, balance storage, request tables, RPC signatures **not** decided |
| `AUTHORIZED_STORE_ECONOMIC_INFLOW_INTERFACE` | Store Points may receive authorized store-economic credit |
| `OUT_OF_SCOPE_FOR_DELIVERY_ADS_AUTHORITY_DESIGN` | Gift/Settlement → Store Points source rules, %, timing, recognition |

---

## 2. Finance authority graph

```text
MEMBER (user_id)
  └── AST-001 D-Point                    [OUT — member asset]

STORE (selected store_id)
  ├── AST-002 Business Credit            [PRESERVE — order-fee; NOT Store Points; NOT Business Cash]
  ├── AST-003 Settlement                 [PRESERVE — settlement; NOT spend wallet]
  ├── Gift Revenue + Gift Store Cash     [PRESERVE — Gift HARD LOCK; NOT Business Cash]
  │
  ├── STORE POINTS                       [PROPOSED_CONCEPTUAL_AUTHORITY · CLASS C · PHYSICAL_SCHEMA NOT_LOCKED]
  │     ← AUTHORIZED_STORE_ECONOMIC_INFLOW_INTERFACE
  │     → withdrawal (canonical finance policy)
  │     → convert to Business Cash
  │
  └── BUSINESS CASH                      [PROPOSED_CONCEPTUAL_AUTHORITY · CLASS C · PHYSICAL_SCHEMA NOT_LOCKED]
        ← direct top-up (funding rail)
        ← Store Points conversion
        → Delivery Ads secure/spend
        → Partner fee secure/spend
        ✗ withdrawal

LEGACY / NON-CANONICAL (compat read only; no new product writes as BC)
  └── delivery_ad_accounts (owner_user_id) + legacy BC ledger/fundings
  └── Stage 1 AD_SPEND on store_cash_ledger (historical ads debit of Gift Store Cash)
```

**CLASS C** means: new canonical **product** authorities are required because no existing wallet satisfies the locked economic contracts.  
**CLASS C does not lock physical schema.**

---

## 3. Proposed conceptual authority

All names below are **PROPOSED_CONCEPTUAL_AUTHORITY**.  
**PHYSICAL_SCHEMA = NOT_LOCKED** for every row.

| Conceptual name | Role | Notes |
|---|---|---|
| Store Points balance | Store-scoped SP balance | Not AST-002 `stores.point_balance` |
| Store Points ledger | Append-only SP history | Human-readable entry kinds |
| Business Cash balance | Store-scoped BC balance | Not `store_cash_accounts`; not `delivery_ad_accounts` |
| Business Cash ledger | Append-only BC history | Top-up · convert-in · ad spend · ad refund · partner spend · partner refund |
| BC top-up request | Funding rail request | Rail ≠ balance authority |
| SP → BC conversion operation | Dual-ledger economic move | Idempotent; same `store_id` |
| Ads / Partner funding binding mark | Exactly-once secure proof for an application | Pattern from Stage 1 spend mark; **not** Store Cash wallet |

Do **not** treat this section as deciding:

- number of tables
- whether balance is projected vs stored column
- whether request tables exist separately
- RPC names or signatures

Unless a future implementation gate makes one structure mandatory under existing DIBAY asset architecture.

### 3.1 Store Points inflow

```text
AUTHORIZED_STORE_ECONOMIC_INFLOW_INTERFACE = REQUIRED (product)
SOURCE_MAPPING = OUT_OF_SCOPE_FOR_DELIVERY_ADS_AUTHORITY_DESIGN
```

Gift / Settlement may be inspected only for **interface compatibility**.  
This design does **not** decide Gift Revenue → Store Points, Settlement → Store Points, percentages, timing, or recognition writers.  
Do **not** redesign Gift or Settlement products.

### 3.2 Conversion value rule (`OWNER_LOCKED`)

```text
CONVERSION_VALUE_RULE = DEFAULT_1_TO_1_CONFIGURABLE
CONVERSION_RATE_SSOT = REQUIRED
CONVERSION_RATE_SNAPSHOT_PER_TRANSACTION = REQUIRED
OWNER_RATE_DISCLOSURE_BEFORE_CONFIRM = REQUIRED
RATE_CHANGE_NOTICE = REQUIRED_WHEN_NON_DEFAULT_OR_CHANGED
```

| Rule | Contract |
|---|---|
| Default rate | **1 Store Point = 1 Business Cash value** |
| Rate authority | Hardcoded rate **forbidden** — canonical **config/policy SSOT** (Admin/policy may change later) |
| Past conversions | Applied **rate snapshot** preserved on the conversion ledger/operation — never recalculated when policy changes |
| Owner UI before write | Show: held Store Points · **current applied rate** · points to convert · Business Cash to receive · policy-change notice when rate ≠ default or changed |
| Confirm gate | **No write** until Owner final confirm |
| After confirm | One economic operation: SP debit + BC credit using **that moment’s rate snapshot** + idempotency identity |

Example (non-default): if rate becomes 1 SP → 0.9 BC, Owner must see before confirm: “현재 전환율 1:0.9 / 100 포인트 전환 시 Business Cash 90 지급” **and** that the rate differs from the default 1:1 — not only the net amount.

Structural requirements (unchanged): same `store_id`; dual ledger; atomic or compensating-safe; no member wallet; no campaign dependency; no Gift rewrite; no AST-002 involvement.

Physical placement of the rate SSOT table/config = **implementation sequencing** later — not locked as schema here (`PHYSICAL_SCHEMA = NOT_LOCKED`).

---

## 4. Writer matrix (document only — do not implement)

| Operation | Actor | Caller boundary | Store identity | Canonical balance authority | Ledger | Idempotency | Auth |
|---|---|---|---|---|---|---|---|
| BC top-up credit | Admin (after Owner request) | Server/RPC only | `store_id` | Business Cash (conceptual) | BC ledger | Required | Admin + request state |
| SP → BC convert | Owner-initiated (after rate disclosure + confirm) | Server/RPC only | same `store_id` | SP debit + BC credit at **rate snapshot** | Both ledgers + snapshot | Required | Owner of store |
| Ads secure debit | Owner submit path | Server/RPC only | campaign `store_id` | Business Cash | BC ledger + binding mark | Exactly-once per application | Owner; price snapshot |
| Ads refund | Admin reject path | Server/RPC only | same store/application | Business Cash | BC ledger + binding mark | Exactly-once refund | Admin |
| Partner fee secure | Owner apply path | Server/RPC only | membership `store_id` | Business Cash | BC ledger + binding mark | Exactly-once per apply | Owner |
| Partner fee refund | Admin reject path | Server/RPC only | same | Business Cash | BC ledger | Exactly-once | Admin |
| SP economic inflow | Source domain later | Out of scope writers | `store_id` | Store Points | SP ledger | Per source rules | Source domain |
| SP withdrawal | Canonical finance later | Out of scope detail | `store_id` | Store Points | SP ledger | Required | Finance policy |

**Rules**

- Owner UI never directly writes balances
- Admin UI never invents balances (no fake “grant as payment”)
- All balance changes pass canonical server/RPC authority
- Service-role use must be narrow and explicit

---

## 5. Top-up rail

**Product:** Business Cash direct top-up = **REQUIRED** (`OWNER_LOCKED`).

**Technical default (rail design only):**

```text
Owner requests BC top-up
  → Admin verifies (manual_confirm pattern)
  → Admin approves
  → canonical Business Cash credit
  → immutable BC ledger entry
```

**FUNDING RAIL ≠ BALANCE AUTHORITY**

Pattern references (`CODE_CONFIRMED`):

- `store_point_charge_requests` + `approve_store_point_charge_request` — **REUSE_PATTERN** for rail shape; **DO_NOT_REUSE_AUTHORITY** (credits AST-002)
- Disabled Delivery Ads Business Cash charge-request structure — **REUSE_PATTERN** only; **DO_NOT_REUSE_AUTHORITY** (was owner-scoped / ads-shadow)

The rail must credit the **new canonical store-scoped Business Cash** authority — never AST-002 merely because the rail pattern came from AST-002.

No automated payment-gateway credit to store prepaid wallets was found as a current store-wallet rail (`CODE_CONFIRMED` absence for store BC/AST-002 PG top-up). Gateway remains a future option, not locked here.

---

## 6. Store Points → Business Cash boundary

```text
INVARIANT
  same store_id
  rate from CONVERSION_RATE_SSOT (default 1:1; Admin/policy configurable)
  Owner disclosure + confirm BEFORE any write
  Store Points debit
  + Business Cash credit
  amounts = f(points, rate_snapshot_at_confirm)
  one economic operation
  one idempotency identity
  rate snapshot stored with the operation
  atomic or compensating-safe
  dual audit trail
  human-readable history
  past ledger amounts never recalculated when rate changes

FORBIDDEN
  hardcoded rate in React/UI constants as authority
  write before Owner confirm
  silent rate change without Owner-visible rate + notice
  member wallet
  campaign dependency
  Gift wallet rewrite
  AST-002 involvement
```

**Owner conversion screen (required):** held Store Points · applied rate · points to convert · Business Cash to receive · change notice when rate is non-default or changed from default 1:1.

`CONVERSION_VALUE_RULE = DEFAULT_1_TO_1_CONFIGURABLE` (see §3.2) — **not an implementation blocker**.  
Existing cross-asset convert RPC Store Points → Business Cash: **ABSENT** (`CODE_CONFIRMED`). Closest dual-ledger **pattern**: Gift Revenue → Store Cash conversion approve — **REUSE_PATTERN only** (not rate SSOT authority).

---

## 7. Ads funding binding

At valid Owner submit (Store Promotion or Banner):

1. Validate campaign, commercial price snapshot, selected store, Business Cash balance  
2. If insufficient: **no debit · no campaign intake · no Admin queue**  
3. If sufficient: **exactly-once Business Cash debit** + payment/spend **binding mark** + lifecycle → `SUBMITTED`

Reuse **only the pattern** from Stage 1:

- `store_cash_delivery_ad_spend` / `store_cash_delivery_ad_refund`  
- `delivery_ad_store_cash_spends` as binding-mark shape  

**DO_NOT_REUSE_AUTHORITY:** Gift `store_cash_accounts` as Business Cash.

Admin reject of a funded application:

```text
FUNDED SUBMIT → ADMIN REJECT → BUSINESS CASH REFUND (exactly once) → REJECTED
```

Ledger/audit must retain both secure and refund records. Admin must not invent balances to simulate payment.

---

## 8. Partner funding binding

```text
Business Cash sufficient
  → fee secure (exactly-once BC debit + binding mark)
  → PENDING_REVIEW
  → Admin review
  → Admin approve → ACTIVE
     or Admin reject → BC refund + terminal non-active Partner state
```

- No payment-only ACTIVE  
- No discount before Admin approval (`PENDING_REVIEW` never discounts — `CODE_CONFIRMED` policy)  
- Current Partner apply → `PENDING_REVIEW` **without fee secure** = incomplete product (`CODE_CONFIRMED` / `CONFLICT`)

### 8.1 Partner reject status mapping (`CODE_CONFIRMED` enum audit)

Existing membership statuses (`delivery-ad-commercial-contract.ts` + migration `20261201250000_delivery_ads_r4_partner_membership_pending.sql`):

```text
NONE | PENDING_REVIEW | ACTIVE | PAST_DUE | CANCEL_PENDING | ENDED
```

**`REJECTED` does not exist.**

```text
TERMINAL_NON_ACTIVE_STATUS_MAPPING = DESIGN_PENDING_EXISTING_ENUM_AUDIT
```

- Do **not** map Admin reject of a pending application to `ENDED` by default (`ENDED` = end of membership lifecycle, not “application rejected”)  
- Do **not** invent a new enum in this design turn  
- Future impl gate must choose an existing-compatible terminal non-active mapping or a separately approved enum extension

---

## 9. Campaign approval state machine

Maps to existing campaign lifecycle vocabulary (`delivery-ad-lifecycle.ts`) — **REUSE_BACKEND** for status names. Funding mark is separate SSOT (binding), not a new Owner-facing lifecycle enum unless later needed.

| Product step | Finance | Lifecycle |
|---|---|---|
| Draft / edit | none | `DRAFT` |
| Secure + submit | BC debit + binding | → `SUBMITTED` |
| Admin starts review | none | → `UNDER_REVIEW` |
| Request changes | **hold** secured funds (no refund, no second debit) | → `CHANGES_REQUESTED` |
| Owner resubmit | no second debit | → `SUBMITTED` **same campaign / same case / same thread** |
| Approve | none | → `APPROVED` then schedule authority → `SCHEDULED` → `ACTIVE` |
| Reject | BC refund exactly once | → `REJECTED` |
| Pause / resume / end | per existing ops (no invent pay) | `PAUSED_*` / `ENDED` / … |

Customer exposure only when: approved path + scheduled/active + inventory eligible + funding allows go-live.

---

## 10. Partner approval state machine

| Step | Finance | Membership |
|---|---|---|
| No membership / can apply | — | effective `NONE` |
| Secure fee + apply | BC debit + binding | → `PENDING_REVIEW` |
| Admin approve | none | → `ACTIVE` (snapshots fee/discount/period as today) |
| Admin reject | BC refund exactly once | → **terminal non-active** (`DESIGN_PENDING` mapping; **not** auto-`ENDED`) |
| Owner cancel while ACTIVE | policy later | → `CANCEL_PENDING` → eventually `ENDED` (existing cancel path; distinct from reject) |

Discount only for `ACTIVE` / `CANCEL_PENDING` (existing eligible set) — never `PENDING_REVIEW`.

---

## 11. Admin queue contract

### 11.1 Eligibility invariant

Admin queue must **not** derive paid-application eligibility from lifecycle status alone:

```text
ADMIN_VISIBLE_AS_FUNDED_REVIEW =
  application state eligible for review
  AND canonical funding/secure binding mark exists
  AND funding belongs to same store + product + application
```

Prevents legacy/unfunded rows from appearing as valid paid applications.

### 11.2 Work buckets

Prefer **one operational Ads queue** with filters over unnecessary separate products:

- 검토 대기  
- 검토 중  
- 수정 요청  
- 재제출  
- 승인  
- 예약  
- 진행 중  
- 일시중지  
- 반려  
- 종료  
- Partner 검토  

---

## 12. Admin review detail contract

### Common (all paid applications)

- Owner  
- Store  
- Product type  
- Funding state + Business Cash secured amount  
- Immutable price / fee snapshot  
- Requested duration / period  
- Lifecycle / membership status  
- Case / thread  
- Timeline  

### Store Promotion additionally

- Promotion target  
- HOME / PRIMARY / SECONDARY  
- Category  
- Actual customer-surface preview  
- Advertising disclosure presentation  

### Banner additionally

- Inventory position (human)  
- Creative  
- Crop / geometry  
- Destination  
- Actual target-surface preview  

### Partner additionally

- Store  
- Membership price  
- Discount  
- Paid period  
- Secured funding  
- Current membership status  

---

## 13. Admin action contract

Every Admin CTA requires:

```text
UI → server action → authorization → legal state transition → audit
  → Owner notification where required → next-state UI
```

**Campaign:** review start · request changes · approve · reject · schedule · pause · resume · end · reply/message  

**Partner:** approve · reject · operational status actions allowed by membership policy  

Button existence alone is **not** PASS.

---

## 14. Case / thread interface

```text
one campaign = one ops case = one thread = one timeline
```

Changes requested flow:

```text
Admin request changes
  → Owner notification
  → exact campaign deeplink
  → Owner edit + reply
  → resubmit same case
  → Admin continues review
```

Consume existing Delivery Ads ops-thread interface (CUT3).  
**Do not redesign Messenger.**

---

## 15. Finance ↔ Approval connected matrix

| Step | Finance write | Campaign / Partner write | Admin visible | Customer |
|---|---|---|---|---|
| Insufficient | none | none | NO | NO |
| Secure + submit | BC debit + binding mark | `SUBMITTED` / Partner `PENDING_REVIEW` | YES | NO |
| Under review | none | `UNDER_REVIEW` where applicable | YES | NO |
| Changes requested | hold secured funds | `CHANGES_REQUESTED` | YES | NO |
| Owner resubmit | no second debit | `SUBMITTED`, same case | YES | NO |
| Approve | none | `APPROVED` / Partner `ACTIVE` after Admin | YES | only after campaign eligibility |
| Schedule | none | `SCHEDULED` | YES | not before schedule |
| Active | none | `ACTIVE` | YES | YES if inventory eligible |
| Reject | exactly-once BC refund | Campaign `REJECTED` / Partner **terminal non-active mapping TBD** | YES | NO |

---

## 16. Compatibility / history

**Preserve (no destructive rollback):**

- AST-002 balances / ledger / charge history  
- Gift Revenue · Gift Store Cash · gift ledgers / conversion / cash-out  
- Stage 1 `AD_SPEND` / `AD_REFUND` on `store_cash_ledger`  
- `delivery_ad_store_cash_spends`  
- Legacy `delivery_ad_accounts` · BC ledger · fundings · charge requests  
- Campaign commercial snapshots  
- Partner membership history  

Future product writers migrate **forward** to conceptual Store Points / Business Cash authorities.  
Historical finance remains readable/auditable.  

**Do not pretend** old Store Cash ads debits or owner-scoped ads prepaid **were always** the new Business Cash.

---

## 17. Existing-code disposition

| Area | Label | Evidence |
|---|---|---|
| Stage 1 Store Cash as Ads pay authority | `CONFLICT` · `DO_NOT_REUSE_AUTHORITY` | Debits Gift Store Cash; UI/API still say Business Cash |
| Exactly-once spend/refund RPCs | `REUSE_PATTERN` | Stage 1 migration + `delivery-ad-store-cash-contract.ts` |
| Legacy `delivery_ad_accounts` (owner_user_id) | `CONFLICT` · `DO_NOT_REUSE_AUTHORITY` | Ads-only shadow; wrong identity key |
| Legacy BC funding contracts | `REWORK` / `LEGACY` | Product paths disabled; tables preserved |
| AST-002 charge rail | `REUSE_PATTERN` · `DO_NOT_REUSE_AUTHORITY` | Rail shape only |
| Campaign lifecycle module | `REUSE_BACKEND` | `delivery-ad-lifecycle.ts` |
| Partner writer / statuses | `REWORK` | `PENDING_REVIEW` without fee; no `REJECTED`; approve UI exists |
| Submit-anyway insufficient UX | `CONFLICT` | Unfunded Admin intake forbidden by Owner lock |
| Admin queue / review CTAs | `REWORK` / `NOT_PROVEN` completeness | Shell vs full server+notify chain |
| Owner↔Admin thread runtime | `NOT_PROVEN` / `REWORK` | Tables exist; end-to-end hops incomplete historically |
| Customer paid approved exposure | `NOT_PROVEN` | Fixture/geometry ≠ funded approved campaign |
| Gift / Settlement as SP writers | `OUT_OF_SCOPE` | Inflow interface only |

Pattern file dispositions:

| Path | Disposition |
|---|---|
| `lib/stores/advertising/delivery-ad-store-cash-contract.ts` | `REUSE_PATTERN` · `DO_NOT_REUSE_AUTHORITY` |
| `lib/stores/advertising/delivery-ad-business-cash-contract.ts` | `REWORK` · `DO_NOT_REUSE_AUTHORITY` |
| `supabase/migrations/20260830140000_store_point_system.sql` | `REUSE_PATTERN` · `DO_NOT_REUSE_AUTHORITY` |
| `supabase/migrations/20261201280000_delivery_ads_stage1_store_cash_authority.sql` | `REUSE_PATTERN` · `DO_NOT_REUSE_AUTHORITY` |
| `lib/stores/advertising/delivery-ad-lifecycle.ts` | `REUSE_BACKEND` |
| `lib/stores/advertising/delivery-ad-partner-membership-writer.ts` | `REWORK` |

Never infer financial authority from a filename.

---

## 18. Remaining technical decisions

| Decision | Status |
|---|---|
| Physical schema for Store Points / Business Cash | `PHYSICAL_SCHEMA = NOT_LOCKED` |
| Asset registry ID assignment under `dibay-asset-contract-ssot` | Implementation sequencing |
| `CONVERSION_VALUE_RULE` | **LOCKED** = `DEFAULT_1_TO_1_CONFIGURABLE` |
| Where to put canonical conversion rate SSOT + snapshot/idempotency binding | Implementation sequencing (policy already locked) |
| Partner reject → existing enum mapping | `TERMINAL_NON_ACTIVE_STATUS_MAPPING = DESIGN_PENDING_EXISTING_ENUM_AUDIT` |
| Exact Gift/Settlement → Store Points writers | `OUT_OF_SCOPE_FOR_DELIVERY_ADS_AUTHORITY_DESIGN` |
| Automated PG top-up vs manual_confirm only | Rail default = manual_confirm; PG not locked |
| Migration order off Stage 1 Store Cash ads debit | After `NEXT_GATE` only |

---

## 19. Stop gates

```text
FINANCE_PRODUCT_CONTRACT = LOCKED
CONVERSION_VALUE_RULE = DEFAULT_1_TO_1_CONFIGURABLE
CONVERSION_RATE_SSOT = REQUIRED
CONVERSION_RATE_SNAPSHOT_PER_TRANSACTION = REQUIRED
OWNER_RATE_DISCLOSURE_BEFORE_CONFIRM = REQUIRED
RATE_CHANGE_NOTICE = REQUIRED_WHEN_NON_DEFAULT_OR_CHANGED
ADMIN_APPROVAL_AUTHORITY = LOCKED
PARTNER_ADMIN_APPROVAL = REQUIRED
FINANCE_EXISTING_AUTHORITY = NO_EXISTING_MATCH
FINANCE_AUTHORITY_CLASS = C
FINANCE_DB_AUTHORITY = DESIGNED_PENDING_IMPL
PHYSICAL_FINANCE_SCHEMA = NOT_LOCKED
PRODUCT_BLUEPRINT_LOCK = NOT_YET_FINAL
IMPLEMENTATION_ALLOWED = FALSE
NEXT_GATE = EXPLICIT_OWNER_APPROVAL_FOR_IMPLEMENTATION_SEQUENCING
```

**This document excludes wrong existing authorities and defines economic · writer · approval boundaries for new canonical authorities.**  
It does **not** claim physical wallets are fully designed or ready to migrate.

**STOP.** No implementation plan expansion. No migration. No Stage 1 code change from this document alone.
