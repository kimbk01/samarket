# A/B Axis — DOCUMENT CONTRACT DRAFT (2026-08-02)

**Status:** DOCUMENT CONTRACT DRAFT  
**NOT declared:** CONTRACT LOCK · CODE PASS · RUNTIME PASS · PRODUCT PASS · HARD LOCK  
**Phase 1–3 LOCK:** **NOT reopened.** RoomUnread / Badge / Bell HARD LOCK remain CLOSED until explicit separate approval.

## Purpose

Slice 1 audit (2026-08-02) + product A/B separation draft, integrated into `docs/notifications` SSOT tree without mutating locked Phase bodies.

## Product contract priority (변경 금지 · HARD LOCK 헌장)

**1** 사용자 승인 명시 계약 → **2** Legacy UX 실측 → **3** 현재 DIBAY 구현  

- DIBAY ≠ Legacy (1순위 예외 없음) → Legacy를 기준으로 Gap. 코드로 계약 정당화 금지.  
- **Legacy ≠ 1순위 승인 계약** → Legacy를 따르지 않음. 보고·중단. 사용자 결정.  
- Badge + Notification + Push + Deep Link = **하나의 Authority Lifecycle**  
  `생성 → Push → Badge → 선택 → Deep Link → 확인 → Read → Projection → Badge 제거 → 재실행 유지`  
- **Atomic Change:** Lifecycle 단위로만 수정·검증.  
  `A Notification Lifecycle 완료 → LOCK → B Communication Lifecycle 완료 → LOCK → 통합 → HARD LOCK`  
  Notification↔Chat↔Store↔Call 조각 수정 연쇄 금지.  
- **PHASE0** Contract Wire → CODE PASS → STOP  
- **PHASE1** Legacy Evidence Collection (FACT ONLY · NO PASS/FAIL · NO KEEP/REVERT/FIX) → STOP  
- **PHASE2** Gap (후보만) → STOP → 사용자 승인 → Atomic Change → HARD LOCK

## Canonical draft docs (this tranche)

| Doc | Path |
|-----|------|
| Badge / App Icon / surface formulas | [`docs/notification-badge-authority.md`](../notification-badge-authority.md) |
| Notification Center UI/UX | [`docs/notification-center-product-contract.md`](../notification-center-product-contract.md) |
| Notices / campaigns domain | [`docs/notices-campaign-domain.md`](../notices-campaign-domain.md) |
| Legacy checklist | [`docs/notification-legacy-audit.md`](../notification-legacy-audit.md) |
| Legacy UX product contract | [`docs/notification-legacy-ux-product-contract.md`](../notification-legacy-ux-product-contract.md) |
| Legacy × DIBAY gap (FIX 후보) | [`docs/notification-legacy-gap-analysis.md`](../notification-legacy-gap-analysis.md) |

## Frozen LIVE SSOT (do not mutate this draft)

| Layer | LOCK doc / code |
|-------|-----------------|
| RoomUnread | Phase 1 CLOSED — participants unread origin |
| Badge Projection | `2026-08-01-phase2-badge-ssot-hard-lock.md` · `build-domain-badge-authority-http.ts` |
| Bell | `2026-08-01-phase3-bell-ssot-hard-lock.md` · `bellTotal = NotificationAttentionTotal` |
| Golden Rule | `2026-08-01-dibay-notification-golden-rule-lock.md` |
| Roadmap | `2026-08-01-dibay-notification-ssot-roadmap-lock.md` |
| Event lifecycle | `notification-event-ssot.md` |
| Surface units | `dibay-notification-surface-authority-product-lock.md` |
| Runtime | `2026-08-01-final-product-validation-runtime-partial.md` (RUNTIME PARTIAL) |

## Draft product sentence (target — not LIVE)

DIBAY manages system / notice / status changes on **axis A**, and peer messages + unacknowledged missed calls on **axis B**. List rows show per-room message unread; hubs / bottom / App Icon chat contribution use unread-room counts. Read/delete mutate authority sources; push / cache / Native adapters never invent totals.

## Next gates (separate approvals)

1. ~~Phase 3 limited reopen (Bell packaging)~~ → design recorded.  
2. ~~Member App Icon / Bell exclude Store ops~~ → **PRODUCT APPROVED** 2026-08-02 (`notification-badge-authority.md` §0–§1).  
3. Authority layers Identity→Domain→Surface — documented same.  
4. ~~Slice 2a+2b implementation~~ → **CODE landed** 2026-08-02 — next: CONTRACT/RUNTIME/device gates (no PRODUCT PASS yet).  
5. UI Slice 4 — Tier1 member center; messenger mixed center → discard candidate.  
6. Notices/campaign Slice 7 — separate from admin inquiry.

**Do not implement from this file alone.**
