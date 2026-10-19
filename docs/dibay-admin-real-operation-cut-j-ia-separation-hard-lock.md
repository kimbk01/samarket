# DIBAY Admin Real Operation — CUT J IA SEPARATION

**Status:** HARD LOCK (CUT J) + **J-AMD-1 implemented** (`members` after `dashboard`) + J-AMD-3 (delivery sections) + J-AMD-4 (chat sections)  
**Companion:** `lib/admin/admin-real-operation-cut-j-ia-separation-hard-lock.ts`  
**IA amendment design:** `docs/admin/dibay-admin-ia-owner-approved-amendment.md`  
**Gate:** `npm run verify:admin-real-operation-cut-j-ia-separation-hard-lock`  
**Depends on:** CUT A–I (do not squash)

## Purpose

Separate Admin IA by operator work:

- **DOMAIN MANAGEMENT** — Delivery / Trade / Community / Messenger
- **COMMON OPERATION** — Finance / Ads·Exposure / Support / Notifications / System
- **CROSS-DOMAIN** — deep-links only (Store hub, Placement Map, Action Center)
- **MEMBERS** (J-AMD-1 target) — Users / global reports / sanction log / audit (URLs preserved)

## Invariants

1. Nav SSOT = `components/admin/admin-menu.ts`
2. Workspace routing = `lib/admin/admin-workspace-routing.ts`
3. No duplicate primary leaf for the same canonical path
4. HOME / Category config stay Delivery; delivery-ads ops entry is Ads
5. Placement Map is read orchestration — not a config writer
6. No ads-v2 / finance wallet / support inbox DB / new Admin shell
7. AST-002 store point charges and platform-inquiries are not primary nav
8. CUT I Production P0 carry remains NOT_PROVEN / PARTIAL / NOT_IMPLEMENTED
9. `ads` and `promotion` remain **sibling** workspaces (B-X1 rejected — no single parent)
10. Full workspace reorder (J-AMD-2) is **rejected**
11. CUT J must not be fully unlocked / rewritten as a new lock

## Live workspace order (enforced today)

`CUT_J_WORKSPACE_ORDER` — matches current `adminMenu` top-level keys:

`dashboard → members → delivery → trade → community → messenger → finance → ads → promotion → support → notifications → system`

## J-AMD-1 — Owner-approved limited amendment (IMPLEMENTED)

**Status:** `OWNER_APPROVED_IMPLEMENTED`

### Clause

1. Insert workspace **`members` immediately after `dashboard`**.
2. Keep the **relative order** of every other workspace unchanged.
3. Target order (`CUT_J_WORKSPACE_ORDER_J_AMD_1`):

`dashboard → members → delivery → trade → community → messenger → finance → ads → promotion → support → notifications → system`

4. **Members leaves (URL preserve only):**

| key | path |
|---|---|
| users | `/admin/users` |
| global-reports | `/admin/reports` |
| reports-logs | `/admin/reports/log` |
| audit-logs | `/admin/audit-logs` |

5. When menu implementation is separately authorized: move these leaves to `members`; do not leave duplicate primary leaves under `system` (invariant 3).
6. **Unchanged by J-AMD-1:** API gates, DB, RLS, writers, Domain independence, Ads/Promotion registry separation (CUT C), legacy primary forbidden, CUT I honesty, permission contracts.
7. **Rejected under this amendment:** J-AMD-2 full reorder · B-X1 single ads+promotion parent · CUT J full unlock.

### Related Owner-approved design (not menu code)

See `docs/admin/dibay-admin-ia-owner-approved-amendment.md`: M1 labels · M2 deep-links · M3 IA doc · M5 dashboard shortcut. M4 held.

## J-AMD-3 — Owner-approved (IMPLEMENTED)

**Status:** `OWNER_APPROVED_IMPLEMENTED` (Owner decision **A-1**, limited CUT J amendment)
**SSOT constants:** `CUT_J_J_AMD_3_DELIVERY_TREE` · `CUT_J_J_AMD_3_ADDED_LEAF` · `CUT_J_J_AMD_3_MOVED_OUT_OF_DELIVERY` · `CUT_J_J_AMD_3_REMOVED_SECTIONS` in `lib/admin/admin-real-operation-cut-j-ia-separation-hard-lock.ts`
**Contract test:** `lib/admin/__tests__/admin-real-operation-cut-j-ia-contract.test.ts` (`J-AMD-3 delivery operator-task sections match live menu`)

### Clause

1. **Workspace top-level order unchanged** (`CUT_J_WORKSPACE_ORDER`). J-AMD-1 `members` unchanged.
2. **Every existing leaf `key` / `path` / `matchPaths` / `status` unchanged** — only parent sections and ordering change. Section nodes are header-only (no `path`).
3. Delivery workspace restructured into operator-task sections:

| # | Section key | Label (ko / en) | Children (in order) |
|---|---|---|---|
| — | `delivery-dashboard` (leaf `/admin/delivery`) | — | — |
| 1 | `delivery-section-stores` (new) | 매장 / Stores | `stores-commerce` · `business-shops` · `store-products-admin` · **`store-inquiries-admin` (new leaf)** · `store-reports-admin` · `store-reviews-admin` |
| 2 | `delivery-orders` (reused; retitled) | 주문 / Orders | `delivery-orders-list` · `delivery-orders-action-queue` · `delivery-orders-cancel` · `delivery-orders-refund` · `delivery-orders-logs` · `delivery-order-chats` |
| 3 | `delivery-section-field` (new) | 배달 현장 / Field operations | `delivery-ops-console` · `delivery-operations-stats` · `delivery-riders-ops` · `delivery-operation-alerts` · `delivery-auto-actions` |
| 4 | `delivery-section-fees` (new) | 수수료·정산 / Fees & settlement | `store-fee-policies-admin` · `store-settlements-admin` |
| 5 | `delivery-section-promotions` (new) | 혜택·프로모션 / Benefits & promotions | `store-coupon-control-center` · `gift-certificates` · `store-promo-control` |
| 6 | `delivery-section-home-layout` (new) | 매장 홈 화면 구성 / Store home layout | `stores-home-shelves` · `stores-industries-management` (2 children kept) · `stores-browse-policy` · `delivery-bottom-nav` |
| 7 | `delivery-section-settings` (reused; retitled) | 배달 설정 / Delivery settings | `delivery-distance` · `store-settings-alerts` · `commerce-settings-admin` · `store-payment-events-admin` |

4. **Added primary leaf:** `store-inquiries-admin` → `/admin/store-inquiries` (status `done`) under delivery › 매장. The route previously existed but was hidden from primary nav (B7); it is now the single primary leaf for that path. Support workspace still does **not** list `/admin/store-inquiries`.
5. **Moved out of delivery (same keys / paths):**

| key | path | new location |
|---|---|---|
| `runtime-health` | `/admin/runtime-health` | system › `platform-system` (master-only) › `system-manage` |
| `delivery-release-gate` | `/admin/delivery-release-gate` | system › `platform-system` (master-only) › `system-manage` |
| `delivery-order-notifications` | `/admin/order-notifications` | support, immediately after `admin-inbox` (label 「전체 처리 대기함」 / "All pending work") |

6. **Removed (empty) section nodes:** `delivery-section-operations` · `delivery-section-management` · `delivery-section-policies` · `delivery-section-platform`. Their i18n keys are kept untouched.
7. **Labels:** new/override keys live only in `lib/i18n/catalog/admin-delivery-ops-ux.ts` (spread last, ko+en parity): `admin_menu_delivery_section_stores`, `admin_menu_delivery_ops` (override → 주문 / Orders), `admin_menu_delivery_section_field`, `admin_menu_delivery_section_fees`, `admin_menu_delivery_section_promotions`, `admin_menu_delivery_section_home_layout`, `admin_menu_delivery_section_settings` (override → 배달 설정 / Delivery settings), `admin_menu_store_inquiries_admin` (매장 문의 / Store inquiries). New section keys are registered in `ADMIN_MENU_TITLE_KEY_BY_ITEM_KEY`; `store-inquiries-admin` uses default derivation.
8. **Invariants kept:** one primary leaf per path (invariant 3) · section headers have no path · delivery-ads primary remains ads workspace · HOME / Category config stay delivery · legacy `sidebarPublic:false` ads untouched · no API / DB / RLS / writer / permission change.

## J-AMD-4 — Owner-approved (IMPLEMENTED)

**Status:** `OWNER_APPROVED_IMPLEMENTED` (Owner decision **O-C12**, `docs/admin/dibay-admin-chat-audit-design.md` §2)
**SSOT constants:** `CUT_J_J_AMD_4_MESSENGER_TREE` · `CUT_J_J_AMD_4_REPOINTED_LEAVES` · `CUT_J_J_AMD_4_MOVED_INTO_MESSENGER` · `CUT_J_J_AMD_4_REMOVED_SECTIONS` · `CUT_J_J_AMD_4_REDIRECTS`
**Contract test:** `lib/admin/__tests__/admin-real-operation-cut-j-ia-contract.test.ts` (`J-AMD-4 chat workspace sections match live menu`)

1. Workspace order unchanged; leaf keys unchanged; no route deleted.
2. Chat (`messenger`) workspace: `messenger-hub` (채팅 대시보드) → `messenger-section-rooms` 채팅방 (`chat-all` 전체채팅 · `chat-general` 일반 1:1 · `chat-group` 그룹 · `chat-trade-messenger` 거래 · `delivery-order-chats-messenger` 배달 주문) → `messenger-section-reports` 신고·제재 (`chat-reported` 채팅 신고 — single queue: CM + legacy `chat_reports` + `reports` chat targets) → `messenger-section-calls` 통화 기록 (`chat-messenger`) → `messenger-section-system` 시스템 (`chat-messenger-perf` · `ops-docs-chat`).
3. `/admin/chats` = all chat types (CM rooms, `type` filter). 「거래」「배달 주문」 now point at `/admin/chats?type=trade|store_order`; the old `?from=messenger` URLs remain as `matchPaths` only (no duplicate leaves). Trade workspace `chat-trade` and Delivery `delivery-order-chats` are unchanged.
4. `ops-docs-chat` (`/admin/docs/chat`) moved from system › ops into chat › 시스템 (same key/path). Empty `messenger-advanced` section removed (i18n key kept).
5. `/admin/chats/trade-complete` → redirect `/admin/trade-flow?panel=complete` (matchPath of `chat-trade-flow`, never a leaf).
6. Labels: `lib/i18n/catalog/admin-chat-r1-pages.ts` only (ko+en).

## Gate

```bash
npm run verify:admin-real-operation-cut-j-ia-separation-hard-lock
npx vitest run lib/admin/__tests__/admin-real-operation-cut-j-ia-contract.test.ts
```

Live gate continues to enforce **current** `CUT_J_WORKSPACE_ORDER` vs `adminMenu` until a separate menu-implementation authorization updates both together.
