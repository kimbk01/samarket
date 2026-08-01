# Phase 2-4 — Native Runtime Identity

**Status:** PASS (2026-08-01) — Runtime `.qa-logs/badge-ssot-phase2/native-runtime-identity.json`  
**Phase 2:** **BADGE SSOT CLOSED** (2-1…2-4 all PASS)  
**Authority:** `domain_badge_native_identity_v1`  
**Code:** `lib/notifications/badge-native-runtime-identity.ts`  
**Runtime:** `scripts/badge-native-runtime-identity.ts`

## Scope (identity only — no structure change)

```
AppIcon Projection.appIconTotal
  → Capawesome Badge.set / Badge.get
  → Android Launcher (OEM Cap path)
  → FCM badge_count → setNumber
  → APNS aps.badge
```

**Forbidden:** Projection · Writer · RoomUnread · Bell · Lifecycle · Explain · formula · Heal · Legacy delete · OEM patch

## PASS criteria

| Gate | Required |
|------|----------|
| Static wires Cap / NativeBadgeSync / FCM / setNumber / APNS / logout clear | PASS |
| FCM/APNS payload builders use same integer as Projection | PASS |
| Xiaomi: Warm / BG→FG / Cold / Logout→0 / Login rebuild · `Badge.get == Projection` | PASS |
| Samsung: same | PASS |
| AppIcon Authority unchanged (Explain == Projection) | PASS |

## Phase 2 CLOSED when

```
2-1 Explain PASS
2-2 Writer PASS
2-3 Lifecycle PASS
2-4 Native Runtime PASS
AppIcon Authority PASS
Projection == Native == Launcher == Badge.get()
```

Then declare **PHASE 2 — BADGE SSOT CLOSED**. Only then Phase 3 Bell.

## Explicitly not done here

- Bell SSOT (Phase 3)
- Legacy delete / Product PASS / LOCK (Phase 4)
- Changing Cap / FCM / APNS implementation (identity prove only)
