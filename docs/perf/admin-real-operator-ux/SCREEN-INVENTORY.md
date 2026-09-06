# SCREEN INVENTORY — Real Operator UX

Evidence: Owner Production screenshots 2026-09-06 (`samarket.vercel.app`).

Scope: Admin operator-facing routes under 10 top-level domains. Presentation only; backend SSOT preserved.

## Systemic root

Canonical domain data is rendered too directly → enums / table names / UUID / frequency taxonomy / generic Statement·Member CTAs dominate → operators must manually translate system state into work.

## Priority screens (Owner evidence)

| ROUTE | CLASS | PRIMARY TASK | RAW TERMS | DUPLICATION | VERDICT |
|---|---|---|---|---|---|
| `/admin/delivery-ads` | A+B | Review ads awaiting action | QA titles, WAITING_ADMIN, store_sponsored, Statement/Finance/Member | Same CTAs every card | FAIL |
| `/admin/delivery-ads/[id]` | C | Approve / request edit / reject | reason_required, UUID, ISO dates, config tabs | Config mixed with decision | FAIL |
| `/admin/finance` | A+B+E | Process money requests | SALE_EARN, ledger, store_order:, Statement/원본 | Identical settlement cards | FAIL |
| `/admin/community` | A | Review reports | community_reports, DAILY_CRITICAL… | 지금 처리할 일 ≈ 문제/신고 | FAIL |
| `/admin/messenger` | A | Chat reports + lists | UUID primary, FREQUENT…, general_direct | Taxonomy as labels | FAIL |

## Domains to sweep (same patterns)

운영 · 배달 · 거래 · 고객지원 · 알림 · 시스템 — same shell/frequency/CTA patterns via shared domain dashboard + control planes.

## Implementation order

1. Shared operator labels + domain dashboard shell
2. Ads CP + Ads detail
3. Finance CP
4. Community / Messenger (shell)
5. Support + remaining terminology
6. Visual QA → push → Production re-audit
