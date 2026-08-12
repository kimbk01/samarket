# Phase 2-5 — Delivery Adapter Layer HARD LOCK

**Declared:** 2026-08-01 (team lead)  
**Canonical detail:** `2026-08-01-phase2-5-cross-platform-notification-delivery-strategy.md` §L0

## Locked stack

| Layer | Contents | Mutate? |
|-------|----------|---------|
| Product | AppIconTotal · Bell · Bottom · Trade · Customer · Owner | LOCK |
| Projection | Badge Projection · Bell Projection · Explain Matrix | LOCK |
| Authority | RoomUnread · Notification Event | LOCK |
| **Delivery Adapter** | Android · iOS · Web | **S3 only** |
| Platform | Android Launcher · APNS · Browser | OS |

## Adapter duties (same contract)

- Android → `Notification.setNumber(appIconTotal)`
- iOS → `aps.badge = appIconTotal`
- Web → Badge API (`appIconTotal`) when supported

## Principle

Implementers deliver projected numbers. They do **not** recalculate badges.

## Status

S3 APPROVED · Layer LOCK · implementation not started · FINAL LOCK not declared.

## Operating principles

See `2026-08-01-dibay-notification-final-operating-principles-lock.md` (Kernel LOCK · Adapter SRP · user-visible PASS · one product).
