# DIBAY Notification Golden Rule LOCK

**Declared:** 2026-08-01 (team lead — final)  
**Mutate:** Forbidden without explicit team-lead override.  
**Supersedes informal language:** Never use “Badge.get PASS” as a product gate.

**Related:**  
`2026-08-01-dibay-notification-final-operating-principles-lock.md`  
`2026-08-01-phase2-5-cross-platform-notification-delivery-strategy.md` §L0  
`2026-08-01-dibay-notification-ssot-roadmap-lock.md`

---

## Five independent layers (only view of the system)

```
① Authority          LOCK
   RoomUnread · Notification Event

② Projection         LOCK
   Badge · Bell · Explain

③ Delivery Adapter   implementable (S3)
   Android · iOS · Web

④ Platform           OS / browser
   Android Launcher · APNS · Browser Badge

⑤ Surface            display only
   App Icon · Bell · Bottom · Trade · Customer · Owner
```

### One-way pipeline (never reverse, never skip)

```
Authority → Projection → Delivery Adapter → Platform → Surface
```

---

## Absolute bans

| Ban | Why |
|-----|-----|
| Fix Launcher by editing RoomUnread | Returns project to day zero |
| Fix Launcher by editing Badge Projection | Wrong layer |
| Fix Launcher by editing Bell Projection | Wrong layer / wrong surface |
| Adapter computes Trade / Customer / Owner / Bell | Adapter SRP violation |
| Surface recomputes digits | Structure break — Surface **displays** Projection only |

Delivery bugs stay in **Delivery Adapter** (or Platform settings). Kernel stays LOCK.

---

## Adapter responsibility (only)

| Adapter | Sole duty |
|---------|-----------|
| Android | `appIconTotal` → Launcher (`setNumber` / S3 rules) |
| iOS | `appIconTotal` → `aps.badge` |
| Web | `appIconTotal` → Browser / PWA Badge when supported |

Adapters do **not** calculate Trade, Customer, Owner, or Bell.

---

## Surface responsibility (display only)

App Icon · Bell · Bottom · Trade · Customer · Owner each **render** their Projection.  
They must not invent a second total.

---

## PASS criteria (mandatory language)

**Forbidden:** “Badge.get PASS”, Cap prefs PASS, cache-only PASS.

**Required:** User-visible surfaces match Explain Matrix **100%**:

- Launcher / App Icon  
- Bell  
- Bottom  
- Trade  
- Customer  
- Owner  

---

## Product PASS (all required)

Declared only when **all** proven under the same flow:

1. Android real Launcher  
2. iOS real App Icon  
3. Bell  
4. Bottom  
5. Trade  
6. Customer  
7. Owner  
8. FCM / APNS  
9. Explain Matrix  

Until then: RUNTIME PARTIAL · FINAL LOCK not declared.

---

## Cursor role (permanent)

```
NOT: “person who builds / revises the notification Kernel”
IS:  “Delivery Adapter developer who consumes the LOCKed Kernel”
```

**Kernel is finished.**  
**Remaining work: Platform Delivery only.**

## Delivery Adapter Versioning

```
Delivery Adapter v1 → Android Delivery v1 · iOS Delivery v1 · Web Delivery v1
```

OEM/OS change → bump Adapter version only. Never Kernel.  
Detail: `2026-08-01-dibay-notification-design-complete-final-verdict.md`.

---

## Status

| Item | Status |
|------|--------|
| Golden Rule | **LOCK** |
| Design phase | **COMPLETE** |
| Direction | APPROVED / NORMAL |
| Kernel | COMPLETE / LOCK |
| S3 Adapter implement | Not started (await explicit order) |
| FINAL LOCK | Not declared |
