# OWNER POLICY LOCK — Ads / Exposure

**STATUS:** LOCKED  
**IMPLEMENTATION:** Authorized via Owner build approve (this document is the contract).  
**NO NEW AUDIT · NO NEW CUT · NO PRODUCT REDESIGN** beyond this contract.

## Product matrix

| Product | Approval | Payment | Admin |
|---|---|---|---|
| Community Boost | None | Point | Auto live → sanction |
| Trade Boost | None | Point | Auto live → sanction |
| Feed Banner | Yes | Member Point | 확인중 / 보류 / 승인 |
| Delivery Banner | Yes | Owner Cash | 확인중 / 보류 / 승인 |
| Delivery Sponsored | Yes | Owner Cash | 확인중 / 보류 / 승인 |
| Owner Popup | Yes | Cash | 확인중 / 보류 / 승인 |
| Admin Direct Banner/Popup | None | None | Create → Operations (not force Live) |

## FINAL CORRECTION LOCK

1. **Runtime ≠ Admin writable** — Ops status: 활성 / 일시중지 / 종료. Runtime: 현재 노출 / 노출 대기 / 비노출 / 예약 (resolver/placement only). No Admin writer for “현재 노출”.
2. **Boost sanction single CTA** — 제재(노출 중지)=pause, 재개=resume. No duplicate “상위노출 중지”. `paused` label = 제재 중.

## FINAL LOCATION / PERIOD LOCK

List+detail always show: placement hierarchy · runtime status · start · end · remaining.  
Remaining: 시작까지 / 종료까지 / 종료됨 / — or 기간 정보 오류.  
**1970 epoch render forbidden.** Single canonical formatter; no per-screen date formatters.

## FINAL PLACEMENT SEMANTICS LOCK

- **Applications:** requested placement only; no Slot invent; runtime = 승인 전 / —.
- **Operations:** actual placement (+ Slot when assigned); runtime = projection.
- **Admin Direct:** skips approval queue; enters Operations; does **not** force customer Live.

## Admin IA

전체 광고 · 상위노출 관리 · 광고 승인 · 노출 관리 · 광고 위치 · 광고 상품/가격 · 광고 이력

Legacy product hubs: absorb then PUBLIC retire; do not delete routes before redirect.
