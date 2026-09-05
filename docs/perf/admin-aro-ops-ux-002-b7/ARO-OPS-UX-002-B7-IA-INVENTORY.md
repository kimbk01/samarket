# ARO-OPS-UX-002-B7 — CURRENT IA INVENTORY (pre/post minimum change)

Operational frequency = priority class (not click telemetry).

## NAV OWNER

| Layer | Authority |
|---|---|
| REGISTRY | `components/admin/admin-menu.ts` |
| SIDEBAR / WORKSPACE | `lib/admin/admin-workspace-routing.ts` |
| BREADCRUMB | `resolveAdminBreadcrumb` (same) |
| FREQUENCY META | `lib/admin/management/operational-frequency-registry.ts` |

## FIRST DIVERGENCE (fixed)

1. Finance: B4 `/admin/finance` buried under store-currency after Point → **root first**
2. Delivery: daily orders/stores after policies/settings → **ops before config**
3. Ads: B5 nested under “배달 광고”; legacy `ads-paid` peer of live tools → **flatten + legacy demote**
4. Support: `store-inquiries` legacy primary → **HIDE entry (route KEEP)**
5. Notifications: sound prefs under System → **move to 알림 CONFIG**
6. Labels: generic “캠페인” / “매장 Coin·Cash” / “고객센터” → operational names

## POST-CHANGE MATRIX (primary visible)

| TOP | LABEL (ko intent) | ROUTE | OWNER | PAGE | FREQ | ACTION | DUP | LEGACY | STUB | DECISION |
|---|---|---|---|---|---|---|---|---|---|---|
| 운영 | 운영 개요 | /admin | dashboard | CONTROL | REALTIME | Y | N | N | N | KEEP |
| 배달 | 배달 운영 | /admin/delivery | delivery | DOMAIN_DASHBOARD | DAILY | Y | N | N | N | KEEP root |
| 배달 | 주문… | /admin/stores/orders | delivery | OPERATION | REALTIME | Y | N | N | N | KEEP / raise |
| 배달 | 매장 | /admin/stores | delivery | MANAGEMENT | FREQUENT | Y | N | N | N | KEEP |
| 배달 | HOME/카테고리 | shelves / category-policy | delivery | CONFIG | CONFIG | Y | N | N | N | KEEP after daily |
| 거래 | 거래 운영 | /admin/trade | trade | DOMAIN_DASHBOARD | DAILY | Y | N | N | N | KEEP |
| 거래 | 거래 게시물 | /admin/posts-management | trade | MANAGEMENT | FREQUENT | Y | N | N | N | KEEP |
| 커뮤니티 | 커뮤니티 운영 | /admin/community | community | DOMAIN_DASHBOARD | DAILY | Y | N | N | N | KEEP (W3) |
| 채팅 | 메신저 운영 | /admin/messenger | messenger | DOMAIN_DASHBOARD | DAILY | Y | N | N | N | KEEP |
| 채팅 | 전체 채팅 | /admin/chats | messenger | ARCHIVE/TOOL | OCCASIONAL | Y | soft | N | N | KEEP under advanced |
| 재무 | 재무 관제 | /admin/finance | finance | CONTROL | REALTIME | Y | N | N | N | KEEP / promote root |
| 재무 | Point 충전 | /admin/point-charges | finance | SPECIALIST | DAILY | Y | N | N | N | KEEP child |
| 광고/노출 | 광고/노출 관제 | /admin/delivery-ads | ads | CONTROL | DAILY | Y | N | N | N | KEEP / flatten root |
| 광고/노출 | 노출 위치 | inventory#placement-map | ads | CONFIG | FREQUENT | Y | N | N | N | KEEP |
| 광고/노출 | Popup | /admin/platform-popup | ads | SPECIALIST | FREQUENT | Y | N | N | N | KEEP |
| 광고/노출 | 레거시… | promoted-items etc | ads | LEGACY | ARCHIVE | partial | D | Y | N | DEMOTE under ads-legacy |
| 고객지원 | 고객지원 관제 | /admin/support | support | CONTROL | DAILY | Y | N | N | N | KEEP |
| 고객지원 | 이전 문의 | /admin/support/archive | support | ARCHIVE | ARCHIVE | Y | N | N | N | KEEP |
| 고객지원 | (hidden) store-inquiries | /admin/store-inquiries | — | LEGACY | — | — | D | Y | N | HIDE primary |
| 알림 | 푸시·알림 발송 | /admin/notifications | notifications | OPERATION | OCCASIONAL | Y | N | N | N | KEEP |
| 알림 | 알림 설정 | /admin/settings/notifications | notifications | CONFIG | CONFIG | Y | N | N | N | MOVE from system |
| 시스템 | Prelaunch Reset | /admin/prelaunch-reset | system | CONFIG | CONFIG | Y | N | N | N | KEEP |

## REMOVED / HIDDEN FROM PRIMARY

- `support-legacy` / `cp-store-inquiry` (route preserved)
- `ads-delivery-ops` section wrapper (children promoted)
- `ads-paid` as peer of live ads (moved under `ads-legacy`)

## ALIASES PRESERVED

- Existing `matchPaths` / query deeplinks unchanged (feed/trade applications, placement hash, jobs tab, messenger from=).
