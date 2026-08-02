# RUNTIME A/B 3-device verdict (2026-08-02)

**Declared:** CODE PASS · **RUNTIME PARTIAL**  
**NOT declared:** BADGE AUTHORITY HARD LOCK · RUNTIME PASS · PRODUCT PASS

## Host

Local dirty tree `http://127.0.0.1:3000` (Phase 1–5 uncommitted). Production Cap WebView still points at prod — Cap/SpringBoard digit not proven against this host.

## Evidence

`.qa-logs/badge-authority-rebuild/runtime-ab-3device/1785652083529/`

| Surface | Xiaomi (aaaa) | Samsung (qqqq) | iPhone API (aaaa / UDID attached) |
|---------|---------------|----------------|-------------------------------------|
| A ↑ Bell+App Icon | PASS | PASS | PASS |
| A ↓ read | PASS | PASS | PASS |
| A ↓ delete | PASS | PASS | PASS |
| B ↑ Row/Bottom/App Icon | FAIL (flake/detail) | PASS | PASS |
| B same-room Row-only | PASS | PASS | PASS |
| B ↓ room read | **FAIL** | **FAIL** | **FAIL** |
| Owner → member A/B/App +0 | PASS | PASS (+ owner self) | PASS |

## Blocker for HARD LOCK

`PATCH mark_read` returns `ok:true` and `room-read` `ok:true`, but `community_messenger_participants.unread_count` and Domain `general_direct` room count **do not return to baseline**. Until B decrease is observed on all three devices (API + Cap/SpringBoard), HARD LOCK stays closed.

## Cap note

Android `capacitor.badge` dumps were taken; they reflect last WebView sync origin (often prod), not necessarily this local host.

## Next (measurement only)

1. Resolve why mark_read ok ≠ unread 0 (QA cursor vs product path) — **no product structure change until isolated**.
2. Re-run same harness; require Cap/SpringBoard echo on device WebView bound to the measured host.
3. Only then declare BADGE AUTHORITY HARD LOCK.
