# Gate 3 Step 9 — Push Routing (Transport)

**Verdict (code):**

```text
PUSH ROUTING TRANSPORT CODE PASS
```

| Declaration | Status |
|-------------|--------|
| PUSH ROUTING TRANSPORT CODE PASS | **YES** (scoped) |
| Badge Authority CODE PASS | **NO** |
| RUNTIME / PRODUCT / HARD LOCK | **NO** |
| Legacy Cutover | **NOT STARTED** |

---

## Principle

```text
FCM / APNs = Transport only
→ Canonical Event
→ Authority (A / B / C)
→ Projection
→ UI
→ Native absolute echo
```

**Forbidden:** `FCM → badge++` · Push invent Bell / Bottom / App Icon · Owner push → Member A.

---

## Files

| Path | Role |
|------|------|
| `push-routing-transport.ts` | Classify pipeline · tap A-read gate · FCM envelope |
| `fcm-data-payload-contract.ts` | Emit `recipientScope` / `pipeline` / Gate 2 keys |
| `PushRouteListener.tsx` | Tap → Member A read only when transport allows |
| `__tests__/push-routing-transport-contract.test.ts` | Static + pure contract |
| `gate3-step9-push-writer-classification.md` | KEEP / ROUTE / DELETE |

---

## Pipelines

| Pipeline | Scope | Tap Authority |
|----------|-------|---------------|
| `member_notification_a` | member | `read_at` on notificationId → A + App Icon resync |
| `conversation_b` | member | Route only; B via room mount + ACK |
| `owner_c` | store | Route to store admin; no Member A / App Icon |
| `delivery_only` | delivery_only | Route only; A/B/C unchanged |
| `call_signaling` | member | Call runtime; missed_call may mark A orphan |

`badgeCount` / `badge_count` = absolute Member App Icon echo after Domain compute.

---

## Out of scope (unchanged)

- Cap resume versionless paint
- room identity fallback `*:room:{uuid}`
- Legacy backfill / dual-write cutover
- Deploy / device Runtime QA
- Native App Icon arithmetic rewrite

---

## Next

```text
Legacy Cutover (Backfill → Adapter → Dual write end)
→ close Cap resume / room identity risks
→ Runtime QA
```
