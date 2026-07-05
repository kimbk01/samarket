# CM Home List SSOT — Architecture Specification

> **Status:** 2026-07-05 — M1a **PASS-1 committed** (`39f9b3f4`). M1b **HOLD** until explicit approval after [13-m1b-acceptance-criteria.md](./13-m1b-acceptance-criteria.md) sign-off.
>
> **Scope:** Community Messenger 홈 대화 목록 (`chats` / `groups`) — 일반 DM, private_group, trade, store_order.
>
> **Out of scope:** Native / Call / Push / WebView establishment, UI 리뉴얼, `service.ts` 분리.

## Document index

| # | File | Purpose |
|---|------|---------|
| 01 | [01-ownership.md](./01-ownership.md) | Owner / Reader / Writer matrix (To-Be vs As-Is) |
| 02 | [02-lifecycle.md](./02-lifecycle.md) | Create → Restore lifecycle per room type |
| 03 | [03-function-inventory.md](./03-function-inventory.md) | `service.ts` export inventory + risk |
| 04 | [04-dead-code-audit.md](./04-dead-code-audit.md) | Dead vs structure violation; 5-condition delete gate |
| 05 | [05-event-contract.md](./05-event-contract.md) | Event → Intent; Authority / Priority / Replay |
| 06 | [06-reducer-contract.md](./06-reducer-contract.md) | `applyHomeListPatch` Pre/Post conditions |
| 07 | [07-cache-contract.md](./07-cache-contract.md) | Storage-only cache; legal data flow |
| 08 | [08-realtime-contract.md](./08-realtime-contract.md) | RT = Event only; forbidden chains |
| 09 | [09-state-transition-contract.md](./09-state-transition-contract.md) | NONE / ACTIVE / LEFT state machine |
| 10 | [10-ssot-design.md](./10-ssot-design.md) | One-page SSOT summary + milestone map |
| 11 | [11-architecture-compliance-checklist.md](./11-architecture-compliance-checklist.md) | PR / CI contract violation checks |
| 12 | [12-m1a-acceptance-criteria.md](./12-m1a-acceptance-criteria.md) | M1a frozen scope + PASS conditions |
| 13 | [13-m1b-acceptance-criteria.md](./13-m1b-acceptance-criteria.md) | M1b frozen scope + PASS conditions (approval pending) |

## Approved work order

```
01 Ownership → 02 Lifecycle → 03 Function Inventory → 04 Dead Code
→ 05 Event → 06 Reducer → 07 Cache → 08 RT → 09 State Transition
→ 10 SSOT Design → 11 Compliance → 12 M1a Acceptance → [M1a committed]
→ 13 M1b Acceptance → [explicit M1b approval] → M1b (≤3 files) → PASS → M2
```

## Pipeline (legal path only)

```
Event → [Authority gate] → Reducer (applyHomeListPatch) → Cache (mirror) → UI (derive)
```

Membership SSOT: **Server DB** (`community_messenger_participants.left_at`).
