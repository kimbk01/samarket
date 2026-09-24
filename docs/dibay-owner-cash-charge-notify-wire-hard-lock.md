# DIBAY Owner Cash Charge Notify Wire — HARD LOCK

**ACTIVE.** Cursor: `.cursor/rules/dibay-owner-cash-charge-notify-wire-hard-lock.mdc`  
Evidence: `.tmp/notification-cd2-cash-charge-notify/PRODUCTION_PROOF.json`  
Prior audit: `.tmp/notification-forensic-audit/AUDIT_CLOSURE_REPORT.md` (CD-2)

## FINAL AUTHORITY

| | |
|---|---|
| HEAD / ORIGIN / PRODUCTION | `96cefb6b5637196075f02aa22fc4bb8fe92a536f` |
| DEPLOYMENT | `dpl_BxDJCARaA9pKFd1zkprRrsuFoEvB` |
| STATUS | Ready |
| ALIAS | `https://samarket.vercel.app` |

**CD-2 OWNER CASH CHARGE NOTIFY WIRE — HARD LOCKED**

## Locked contract

1. Sole Admin decision path: `POST /api/admin/business-cash-charges` (`op=approve|reject`).
2. After successful approve → `safeNotifyOwnerBusinessCashChargeCompleted`.
3. After successful reject → `safeNotifyOwnerBusinessCashChargeRejected`.
4. Helpers live in `lib/stores/advertising/delivery-ad-business-cash-charge-notify.ts` — do not invent a second notify writer.
5. Money authority remains AST-005 RPCs via `canonical-business-cash-writer` — notify is post-decision side effect only.

## First divergence (closed)

Helpers existed; Admin route had **0 callers** → Owner got no inbox/push after credit/reject.

## Do not reopen without new evidence

- Do not remove notify calls from the canonical route.
- Do not add a parallel Cash money path for “notify convenience”.
- Do not claim live Admin approve/reject device PASS from this lock alone (`ADMIN_RUNTIME` remains separately provable).

## Change gate

Touch Cash charge Admin POST / notify helpers → regression-only. Reopen only on Owner PRODUCT FAIL + new first divergence.
