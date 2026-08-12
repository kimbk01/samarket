# DIBAY Notification — Design Complete Final Verdict

**Declared:** 2026-08-01 (team lead)  
**Mutate design direction:** Forbidden.  
**Implementation of S3:** Not started in this verdict — await explicit implement order.

---

## Current status (official)

| Item | Status |
|------|--------|
| Notification structure / design phase | **COMPLETE** |
| Notification Kernel | **COMPLETE** |
| RoomUnread Authority | LOCK |
| Badge Projection | HARD LOCK |
| Bell Projection | HARD LOCK |
| Explain Matrix | LOCK |
| Notification Event | LOCK |
| Cross-Platform Delivery Strategy | **LOCK (design complete)** |
| Delivery Adapter (S3) | **Not implemented** |
| Platform Delivery | Incomplete |
| FINAL PRODUCT LOCK | **Not declared** |

**Supreme docs:**  
`2026-08-01-dibay-notification-golden-rule-lock.md`  
`2026-08-01-dibay-notification-final-operating-principles-lock.md`  
`2026-08-01-phase2-5-cross-platform-notification-delivery-strategy.md`

---

## Why direction must never reverse

The critical discovery (Spike):

```
Badge.get  ≠  Launcher
```

That split:

```
Kernel / Projection problems   vs   Platform Delivery problems
```

Must remain separated for the life of DIBAY. Never “fix Launcher” by editing Kernel.

---

## Cursor role (permanent)

```
NOT: person who revises the Notification system / Kernel
IS:  Delivery Adapter developer
```

Kernel → Projection → Explain = **finished**.  
Remaining = Platform Delivery via Adapters only.

---

## Editable scope

| Allowed | Forbidden (STOP) |
|---------|------------------|
| Android Delivery Adapter | Badge Projection “because Launcher invisible” |
| iOS Delivery Adapter | RoomUnread |
| Web Delivery Adapter | Bell Projection / Explain / Notification Event |

Adapter duty only:

```
appIconTotal → OS (Launcher / aps.badge / Browser Badge)
```

---

## PASS language

Forbidden: `Badge.get PASS`.  
Required: user-visible Android Launcher · iOS App Icon · Bell · Bottom · Trade · Customer · Owner ≡ Explain Matrix 100%.

---

## Delivery Adapter Versioning (new permanent rule)

Delivery Adapters are versioned like Kernel artifacts — **Kernel stays frozen; Adapters evolve with OS/OEM**.

```
Delivery Adapter v1
  ├── Android Delivery v1
  ├── iOS Delivery v1
  └── Web Delivery v1
```

Future Android 16 / iOS / One UI / HyperOS changes → **bump Adapter version only**.  
Never reopen RoomUnread / Badge / Bell Projection to chase OEM.

Version bumps require:

1. Explicit changelog under `docs/notifications/` (adapter version note)  
2. Same product contract (`appIconTotal` in → OS badge out)  
3. User-visible re-proof on affected platforms  

---

## Remaining work (one item)

1. Implement **Notification Delivery Adapter v1 (S3)** — `appIconTotal` → OS only.  
2. Prove identical UX on Android · iOS · Web (user-visible).  
3. Only then declare **DIBAY Notification System FINAL LOCK**.

**Final declaration:** `2026-08-01-dibay-notification-team-lead-final-declaration.md`  
(Design COMPLETE ≠ Product COMPLETE; Kernel PRs always REJECT.)

---

## Team lead evaluation

Largest harvest: **Notification Kernel fully separated from Platform Delivery**.  
That separation is lifetime design. Design will not be reopened if Golden Rule + Adapter Versioning hold.
