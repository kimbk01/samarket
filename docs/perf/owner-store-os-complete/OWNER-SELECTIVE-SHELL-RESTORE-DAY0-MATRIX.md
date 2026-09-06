# Owner SELECTIVE_SHELL_RESTORE — Day-0 Matrix

**CURRENT:** `c1ded394e`  
**PRE_STORE_OS:** `1771318be`  
**LAYOUT_REFERENCE:** `d4f512232` (pattern only)  
**Date:** 2026-09-06

## Product / Store field RESTORE

| Surface | Field RESTORE |
|---|---|
| Product (`OwnerProductForm`) | **∅** — PRE 대비 UI 필드 손실 없음 |
| Store BasicInfo | **∅** — 바이트 동일 |
| Store Profile | **∅** — holiday dual-write는 KEEP/GAIN |

Presentation REWORK (not field restore): Product composer shell/scroll/header; CREATE BottomNav; dual header.

## KEEP (verified in tree)

| Item | Evidence |
|---|---|
| Customer hub/care | `OwnerCustomerCareHubView`, care routes |
| Reviews single-flight | `OwnerStoreReviewsView` |
| Ads greeting i18n | `OwnerDeliveryAdsHubView` + catalog |
| Holiday dual-write | `OwnerStoreProfileForm` |
| Finance summary / Cash debit | `OwnerStoreFinanceView` + finance API |
| sold_out / product_status | form + POST allowlist |
| Drawer IA | `owner-nav-registry.ts` |

## Route matrix (40)

| ROUTE | DOMAIN | PAGE_TYPE | HEADER | SCROLL | BOTTOM_NAV | STATUS |
|---|---|---|---|---|---|---|
| /stores/owner | hub | ROOT | Mobile / empty→Stack | ScrollShell | yes | KEEP |
| /stores/owner/apply | onboarding | CREATE | Stack (apply shell) | private 100dvh | no | REWORK |
| /stores/owner/orders | orders | WORK_QUEUE | Mobile | direct class | yes | REWORK |
| /stores/owner/order-chats | orders | LIST | Mobile | direct class | yes | REWORK |
| /stores/owner/order-chat/[orderId] | orders | OTHER | flash/redirect | — | — | DEFER |
| /stores/owner/products | catalog | LIST | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/products/new | catalog | CREATE | Stack | ScrollShell | no | REWORK shell |
| /stores/owner/products/[id]/edit | catalog | EDIT | Stack | ScrollShell | no | REWORK shell |
| /stores/owner/menu | catalog | OTHER | redirect | — | — | REMOVE_DEAD alias |
| /stores/owner/menu-categories | catalog | SETTINGS | Mobile | ScrollShell | yes* | KEEP |
| /stores/owner/basic-info | store | SETTINGS | Mobile | ScrollShell | no | KEEP |
| /stores/owner/profile | store | SETTINGS | Mobile | ScrollShell | no | KEEP |
| /stores/owner/settings | store | SETTINGS | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/edit | store | OTHER | redirect | — | — | REMOVE_DEAD alias |
| /stores/owner/ops-status | ops | DETAIL | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/customer-care | care | ROOT | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/customer-care/customer-center | care | WORK_QUEUE | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/customer-care/messages | care | LIST | redirect | ScrollShell | yes | DEFER |
| /stores/owner/customer-care/inquiries | care | LIST | redirect | ScrollShell | yes | DEFER |
| /stores/owner/customer-care/messages/[id] | care | DETAIL | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/customer-care/inquiries/[id] | care | DETAIL | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/inquiries | care | LIST | Mobile | ScrollShell | yes | REWORK |
| /stores/owner/reviews | care | LIST | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/notices | store | LIST | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/banners | store | LIST | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/coupons | growth | LIST | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/gift-certificates | growth | LIST | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/ads | growth | LIST | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/ads/partner | growth | OTHER | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/ads/[campaignId] | growth | DETAIL | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/ads/new/banner | growth | CREATE | Mobile | ScrollShell | yes→hide | REWORK |
| /stores/owner/ads/new/store-sponsored | growth | CREATE | Mobile | ScrollShell | yes→hide | REWORK |
| /stores/owner/ads/new/platform-popup | growth | CREATE | Mobile | ScrollShell | yes→hide | REWORK |
| /stores/owner/ads/popup/[requestId] | growth | DETAIL | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/finance | finance | FINANCE | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/settlements | finance | FINANCE | Mobile | ScrollShell | yes | KEEP |
| /stores/owner/business-cash | finance | OTHER | redirect | — | — | REMOVE_DEAD alias |
| /stores/owner/points | finance | OTHER | redirect | — | — | REMOVE_DEAD alias |
| /stores/owner/notifications | notifications | LIST | dual Mobile+Detail | ScrollShell | yes | REWORK |
| /stores/owner/notification-settings | notifications | SETTINGS | dual Mobile+Detail | ScrollShell | yes | REWORK |

## Implementation gate outcomes

1. Field RESTORE = empty → proceed presentation SSOT without Product/Store field cherry-pick from `d4f512232`.
2. Shell defects to fix in order: dual header → scroll bypass → BottomNav CREATE eligibility → overlay lock → Store Preview modal → Transition/Back parents → dual notification headers.
