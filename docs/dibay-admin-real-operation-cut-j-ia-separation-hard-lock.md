# DIBAY Admin Real Operation — CUT J IA SEPARATION

**Status:** HARD LOCK (CUT J) + **J-AMD-1 implemented** (`members` after `dashboard`) + J-AMD-3 (delivery sections) + J-AMD-4 (chat sections) + J-AMD-5 (common menu restructure)  
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
| `runtime-health` | `/admin/runtime-health` | system › `platform-system` (master-only) › `system-manage` (J-AMD-5: flat system leaf, `roles: ["master"]`) |
| `delivery-release-gate` | `/admin/delivery-release-gate` | system › `platform-system` (master-only) › `system-manage` (J-AMD-5: flat system leaf, `roles: ["master"]`) |
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

## J-AMD-5 — Owner-approved (IMPLEMENTED)

**Status:** `OWNER_APPROVED_IMPLEMENTED` (Owner approval 2026-10-20 PHT, design v4 **O-1 · O-2 · O-3**, O-8 hide list)
**Source:** `docs/admin/dibay-admin-unified-operations-design-v4.html` §1 + appendix (195 rows)
**SSOT constants:** `CUT_J_J_AMD_5_WORKSPACE_LABELS` · `CUT_J_J_AMD_5_MEMBERS_LEAVES` · `CUT_J_J_AMD_5_ADDED_STAFF_LEAF` · `CUT_J_J_AMD_5_PROMOTION_TREE` · `CUT_J_J_AMD_5_SYSTEM_TREE` · `CUT_J_J_AMD_5_INTERNAL_TOOLS(_SECTION)` · `CUT_J_J_AMD_5_MASTER_ONLY_SYSTEM_LEAVES` · `CUT_J_J_AMD_5_HIDDEN_LEAVES` · `CUT_J_J_AMD_5_REMOVED_LEAVES` · `CUT_J_J_AMD_5_MOVED_INTO_PROMOTION` · `CUT_J_J_AMD_5_REMOVED_SECTIONS`
**Contract tests:** `lib/admin/__tests__/admin-real-operation-cut-j-ia-contract.test.ts` (`J-AMD-5 …`, incl. the 195-path preservation snapshot `lib/admin/__tests__/fixtures/admin-menu-pre-j-amd-5-leaves.ts`)

### Clause

1. **Workspace order unchanged (O-1).** Workspace keys, leaf keys, paths, matchPaths and redirects unchanged except as listed below. No URL change, no route deleted, no API / DB / RLS / permission change.
2. **Group labels — i18n values only (keys unchanged):** `admin_menu_home` 운영 → **운영 홈** · `admin_menu_members` 회원 → **회원·권한** · `admin_menu_delivery` 배달 → **배달·매장** · `admin_menu_finance` 재무 → **결제·정산** · `admin_menu_ads` 광고 / 노출 → **광고·배너** · `admin_menu_promotion` 프로모션 / 이벤트 → **플랫폼 운영** (en analogous).
3. **Leaf / section labels (appendix 「명칭 변경」, values only):** section `finance-member-point` Point → **회원 포인트** · 전체 신고 현황 · 제재 기록 · 관리자 작업 기록 · 모니터링 · 로그인 설정 · 플랫폼 운영 홈 · 프로모션 배너 · 인트로 · 사장님 이벤트 신청 · 회원 포인트 충전 / 회원 포인트 내역 / 충전 상품 / 적립 정책 · 포인트 지급 시험 (실지급) · 포인트 소멸 · 추천 실험 / 추천 분석 / 추천 모니터링 / 추천 배포 / 추천 자동화 / 추천 보고서 · 출시 준비 점검 · 출시 첫 주 점검 · 긴급 조치 · 운영 가이드 (`admin_menu_docs_board`). Already applied before J-AMD-5 (unchanged): 전체 처리 대기함 · 주문별 금액 추적 · 매장 코인 내역 · 매장 캐시 내역. Page titles that reuse these keys follow (title = menu label).
4. **Members:** add existing sub-screens `users-phone-verification` → `/admin/users/phone-verification` (휴대폰 인증) and `users-deletion-requests` → `/admin/users/deletion-requests` (탈퇴 요청). F3 (2026-10-20) adds the new screen `admin-staff` → `/admin/staff` (관리자 계정·권한) as the **last** members leaf, `roles: ["master"]` (its APIs require super_admin; access table rule = super_admin) — `CUT_J_J_AMD_5_ADDED_STAFF_LEAF`.
5. **System → 플랫폼 운영 (O-2)**, as header-only sections (section keys reused; label values `admin_menu_settings_startup_group` → 앱 화면 구성, `admin_menu_growth_recommendation` → 추천, `admin_menu_cp_content` → 공통 콘텐츠):
   - `settings-startup` 「앱 화면 구성」: `settings-os-start` · `settings-intro` · `settings-startup-config` · `menu-main-bottom-nav` · `my-banners` · `my-sections` · `my-services`
   - `growth-rec` 「추천」: `manage-ab` · `rec-analytics` · `rec-monitoring` · `rec-deployments` · `rec-automation` · `manage-reports`
   - `cp-content` 「공통 콘텐츠」: `cp-notice` · `cp-faq` (hidden) · `cp-legal` · `cp-business`
   - Existing top leaves kept in order: `promotion-home` · `promotion-events` · `promotion-popup` · `promotion-ptr-ads` · `promotion-banners` · `promotion-owner-requests`.
6. **Removed menu leaves (URL kept, still highlightable):**

| key | path | covered by |
|---|---|---|
| `cp-action-queue` | `/admin/customer-platform#action-queue` | `cp-dashboard` (path prefix) — same screen as 고객지원 › 전체 처리 대기함 |
| `app-categories` | `/admin/categories` (redirect → `/admin/menus/trade`) | `menu-trade` matchPaths |
| `promotion-notifications` | `/admin/platform-promotion/notifications` | notifications › `cp-notification-engine` matchPaths (new) |

7. **Hidden via `sidebarPublic: false` (O-8, code / URL / key kept):** `cp-faq` (no page) · `app-countries` · `app-languages` · `app-meta`.
8. **Internal tools (O-3):** section `platform-system` 「내부 도구」 (`admin_menu_dev` value → 내부 도구), `roles: ["master"]`, 24 flat leaves: ops-board · ops-docs · ops-runbooks · ops-knowledge · ops-knowledge-graph · ops-learning · ops-maturity · ops-benchmarks · qa-board · ops-routines · product-backlog · dev-sprints · release-notes · release-archive · production-migration · backup · dr · automation · launch-readiness · launch-week · security · performance · usage · memo. The former `manage` section (`["admin","master"]`) tools are now master-only (dashboard 「manage」 quick links follow). Server-side enforcement (access table) is a separate F2 item.
9. **System leaves (flat, in order):** 시스템 개요 `cp-dashboard` · 모니터링 `cp-monitoring` · 시스템 상태 `system-status` · 런타임 상태 `runtime-health` · 릴리즈 게이트 `delivery-release-gate` · 배포 `system-deploy` · 설정관리 `settings-general` · 로그인 설정 `settings-auth` · 긴급 조치 `system-hotfix` · 데이터 초기화 `system-prelaunch-reset` · 운영 가이드 `ops-docs-board` (all admins) · hidden `app-countries` / `app-languages` / `app-meta` · 「내부 도구」. Leaves that were master-only before (`system-status` · `runtime-health` · `delivery-release-gate` · `system-deploy` · `system-hotfix` · `system-prelaunch-reset`) keep `roles: ["master"]` — no visibility change. 채팅 가이드 stays in chat (J-AMD-4).
10. **Removed (empty) section nodes:** `customer-platform` · `app-config` · `platform-ops` · `manage` · `manage-knowledge` · `manage-eval` · `system-release` · `system-manage` (i18n keys kept). `lib/admin-menu-config.ts` adapter now reads `settings-startup` / `platform-system`.
11. **Preservation invariant:** one primary leaf per path; each of the 195 pre-J-AMD-5 leaves (192 paths + 3 path-less legacy keys) still resolves to a live leaf path, a matchPaths entry or `CUT_J_J_AMD_5_REMOVED_LEAVES.coveredBy`, and highlights a sidebar leaf. Live leaves: 195 (195 − 3 + 2, + 1 F3 `admin-staff`).

### Live tree after J-AMD-5 (ko labels)

| Workspace | Leaves |
|---|---|
| 운영 홈 | `/admin` |
| 회원·권한 | 회원관리 · 휴대폰 인증 · 탈퇴 요청 · 전체 신고 현황 · 제재 기록 · 관리자 작업 기록 · 관리자 계정·권한 (F3, master) |
| 배달·매장 · 거래 · 커뮤니티 · 채팅 | unchanged (J-AMD-3 / 거래 v2 / 커뮤니티 v2 / J-AMD-4) |
| 결제·정산 | 재무 관제 · 회원 포인트 (회원 포인트 충전 · 회원 포인트 내역 · 충전 상품 · 적립 정책 · 포인트 지급 시험 (실지급) · 포인트 소멸) · 재무 관제 section (전체 거래 · 매장별 · 주문별 금액 추적 · 매장 코인 내역 · 매장 캐시 내역 · 수수료/미납 · 광고 지출 · 출금 · 재무 설정) |
| 광고·배너 | unchanged (7 public + hidden legacy) |
| 플랫폼 운영 | 플랫폼 운영 홈 · 이벤트 · 팝업 · 당겨서 새로고침 광고 · 프로모션 배너 · 사장님 이벤트 신청 · 앱 화면 구성 (7) · 추천 (6) · 공통 콘텐츠 (공지 · 약관 · 사업자 정보; FAQ hidden) |
| 고객지원 | 고객지원 관제 · 이전 문의 기록 · 관리자 알림함 · 전체 처리 대기함 |
| 알림 | 푸시·알림 발송 (+ `/admin/platform-promotion/notifications`) · 알림 설정 · 푸시 디바이스 |
| 시스템 | see clause 9 · 내부 도구 (24, master) |

## Gate

```bash
npm run verify:admin-real-operation-cut-j-ia-separation-hard-lock
npx vitest run lib/admin/__tests__/admin-real-operation-cut-j-ia-contract.test.ts
```

Live gate continues to enforce **current** `CUT_J_WORKSPACE_ORDER` vs `adminMenu` until a separate menu-implementation authorization updates both together.
