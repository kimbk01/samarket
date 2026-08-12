# 08 — Conversation UX (Read / Sync)

**Mode:** STOP · Product requirement

---

## 1. When is a room “read”?

| Trigger | Product rule |
|---------|----------------|
| **ACK** | Server/participant unread cleared by explicit read cursor / mark-read API. **Authority clear.** |
| **Room Enter** | May **optimistic** clear local badge; must confirm with ACK. Enter alone without ACK = temporary UI only. |
| **Back** | Leaving room after ACK stays cleared. Back without ACK must not claim global clear. |
| **Foreground** | May refresh projection from server; must not invent clears. |
| **Resume** | Same as Foreground — re-fetch authority; reconcile optimistic. |

**Product sentence:** Unread is cleared when **Read ACK succeeds**. Enter/Back/Foreground are UX timing, not second authorities.

---

## 2. Sync order (product)

```text
1. Room Row badge     ← participant unread_count (message unit)
2. Hub Badge          ← count of rooms with unread > 0 (room unit)
3. Bottom Badge       ← GD + Group hubs only (room unit)
4. App Icon B term    ← all member B rooms (+ missed once)
5. Native / Launcher  ← echo App Icon total (A + B)
```

Rules:

- Row can be > 0 while Hub counts that room as 1.
- Hub decrease must follow Room clear (same room).
- Bottom / App Icon must not clear before Hub for that room.
- No surface invents a private unread total.

---

## 3. Domain UX notes

| Domain | Enter room | Expected cascade |
|--------|------------|------------------|
| GD / Group | ACK → Row0 → Hub−1 → Bottom−1 → AppIcon−1 | |
| Trade | ACK → Row0 → TradeHub−1 → AppIcon−1; Bottom unchanged | |
| Customer Order | ACK → Row0 → OrderHub−1 → AppIcon−1; Bottom unchanged | |
| Owner SO | ACK → Owner surfaces only; Member App Icon unchanged | |

---

## 4. Live sync audit signals

| Observation | Product reading |
|-------------|-----------------|
| Header chat 3 = Bottom 3 | GD+Group sync OK on screenshot |
| Trade Hub 2 ≠ Trade list length | Correct if list is “all rooms” |
| Order Hub 14 large vs Bottom 3 | Correct separation |
| App Icon 20 vs Bottom 3 | Expected if Trade+Order unread large |
| Red vertical stripe on messenger list | **Visual product defect** (not a badge formula, still FAIL UX) |
| Dual App Icon 20 vs 22 | Sync/authority story FAIL |

---

## 5. Forbidden UX shortcuts

- Clearing App Icon by opening Bell
- Clearing Trade Hub by opening Bottom Chat
- Mark-all notifications clearing chat unread
- Optimistic clear without eventual ACK reconciliation
