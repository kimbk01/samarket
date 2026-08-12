# DIBAY Notification — Team Lead Final Declaration

**Declared:** 2026-08-01  
**Status:** Design COMPLETE · Delivery Adapter v1 NOT implemented · FINAL LOCK NOT declared  

---

## Do not confuse these two

| Complete (LOCK) | Incomplete |
|-----------------|------------|
| Notification Kernel | Cross-Platform Delivery **implementation** |
| Notification Architecture | Final Product |
| Cross-Platform Strategy (design) | FINAL PRODUCT LOCK |

Design finished ≠ Product finished.

---

## Sole remaining work

**Notification Delivery Adapter v1** — only.

```
appIconTotal → Android Adapter → Android Launcher
appIconTotal → iOS Adapter     → aps.badge
appIconTotal → Web Adapter     → Browser Badge
```

That is the entire editable scope until Product PASS.

---

## PR reject (always)

Any PR that modifies:

- RoomUnread  
- Badge Projection  
- Bell Projection  
- Explain Matrix  
- Notification Event  
- Badge / Bell **calculation**  

= **REJECT** (fixes Delivery by reopening Kernel).

---

## PR accept (only)

- Android Delivery Adapter  
- iOS Delivery Adapter  
- Web Delivery Adapter  
- Platform / OEM / OS compatibility within Adapter Versioning  

---

## Product PASS (single bar)

User-visible on **Android**:

Launcher · App Icon · Bell · Bottom · Trade · Customer · Owner  

**and the same flow on iOS** (and Web parity where applicable).

Until then: **never** declare FINAL LOCK.

---

## Cursor mandate

```
NOT: change the design / Kernel
IS:  implement Delivery Adapter v1 and verify on real devices
```

---

## Official labels

```
DESIGN COMPLETE / LOCK
DELIVERY ADAPTER v1  NOT STARTED
FINAL PRODUCT LOCK   NOT DECLARED
```

Canonical companion: `2026-08-01-dibay-notification-design-complete-final-verdict.md`  
Golden Rule: `2026-08-01-dibay-notification-golden-rule-lock.md`
