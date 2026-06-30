# DIBAY Notification Phase — CLOSE LOCK

**Status:** CLOSED · LOCK (2026-06-30)  
**Scope:** Notification Phase 1 umbrella — sound SSOT · FCM channel · device identity · admin UI · Philife eventKey · permission gate  
**This document:** Phase **종료 선언** only. No product code change.

---

## 1. Completed · LOCK (do not regress without explicit approval)

| Track | LOCK doc / evidence |
|-------|---------------------|
| Notification Sound SSOT Phase 1 | `docs/notifications/notification-sound-ssot-phase1-lock.md` · `npm run verify:notification-sound-ssot-contract` |
| Android FCM Message Channel (P3-1) | `.qa-logs/p3-1-fcm-channel-qa-report.json` — `dibay_chat_messages_v1` PASS |
| Push Device Identity SSOT | `docs/push/push-device-identity-ssot-lock.md` · `.cursor/rules/push-device-identity-ssot-lock.mdc` |
| Dead missed-call push module | Removed `lib/push/send-community-messenger-missed-call-push.ts` — superseded by `notifyMissedCallPipeline` |
| Admin legacy write UI | `e822721c` — legacy sound write read-only; SSOT table only |
| Philife eventKey SSOT | `ad93c5bd` — `community_comment` / `community_like` → SSOT `*_received` |
| Notification Permission SSOT | `docs/permissions/dibay-notification-permission-ssot.lock.md` |

**Invariant:** Legacy notification sound tables · admin mirror APIs remain **preserved** (no DROP / route delete in this Phase).

---

## 2. Explicitly out of scope (next Phase — not started here)

| Item | Why deferred |
|------|----------------|
| Notification Sound SSOT **Phase 2** | Custom URI playback · FCM Java channel ensure · room sound · user picker — **Android/Native** |
| **P3-2** MissedCallNotificationHelper | User-blocked until separate approval |
| **APNS / iOS** rollout | Platform track · `docs/dibay-notification-p0-ios-qa.md` |
| Call-adjacent push (`send-community-messenger-call-canceled-push`) | Call terminal path · HOLD |
| Legacy notification API / table **deletion** | Mirror + rollback contract — intentional retain |

---

## 3. Next Phase candidates (pick one per instruction)

1. **Notification Sound SSOT Phase 2** — requires Android/Java approval  
2. **P3-2** — MissedCallNotificationHelper · APNS · admin push UI (blocked until approved)  
3. **iOS notification rollout** — APNS E2E  
4. **Call-adjacent push consolidation** — separate from Notification Phase 1  
5. **Legacy API/table cleanup** — product decision + migration plan required  

---

## 4. Agent rule

- **Notification Phase is CLOSED.** Do not reopen Phase 1 tracks without red-team approval.
- New notification work must name **which next Phase candidate** (§3) it belongs to.
- **DO NOT** mix Phase 2 / P3-2 / iOS / Call-adjacent changes into Phase 1 LOCK files without explicit user approval.
