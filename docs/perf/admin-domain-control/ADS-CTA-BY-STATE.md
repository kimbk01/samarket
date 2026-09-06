# ADS CTA BY STATE (canonical Delivery Ads)

SSOT: `adminActionAllowed` / `adminActionRequiresReason`  
Presentation: `lib/admin/domain-control/ads-operator-cta.ts`

| Lifecycle | Operator label | Primary CTAs | Reason |
|---|---|---|---|
| SUBMITTED / UNDER_REVIEW | 신청 접수 / 검수 중 | 검토 시작 · 승인 · 수정 요청 · 거절 | 수정요청/거절 |
| CHANGES_REQUESTED | 수정 요청됨 | (owner) — Admin waits | — |
| APPROVED | 승인됨 | schedule via writer; creative if banner | — |
| SCHEDULED | 예약됨 | 일시중지 · 종료 · 강제중단 | pause/terminate |
| ACTIVE | 집행 중 | 일시중지 · 종료 · 강제중단 | pause/terminate |
| PAUSED_ADMIN | 관리자 일시중지 | 재개 · 종료 · 강제중단 | terminate |
| ENDED / REJECTED / TERMINATED | 종료류 | 보관 | — |
| DRAFT | 작성 중 | 초안 삭제 (zero history only) | — |

Hide ≠ lifecycle. Payment FUNDED ≠ approval ≠ ACTIVE.
