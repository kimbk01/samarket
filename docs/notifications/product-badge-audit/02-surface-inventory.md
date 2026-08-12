# 02 — Surface Inventory

**Mode:** STOP · Product audit  
**Rule:** Every product-visible badge surface. No omission by “not in this slice.”

---

## Member — global chrome

| # | Surface | Where user sees it |
|---|---------|-------------------|
| S01 | App Icon | OS launcher / home screen digit or dot |
| S02 | Bell Digit | Philife/Community header bell |
| S03 | Bell Popup / Popover | Header inbox panel (if present) |
| S04 | Notification Center | Full page `/notifications` or `/my/notifications` |
| S05 | Bottom Chat | Main bottom nav Chat tab digit |
| S06 | Bottom Trade tab | Main bottom nav Trade (badge if any) |
| S07 | Bottom other tabs | Home / Community / My — badge if any |

## Member — Community messenger home

| # | Surface | Where |
|---|---------|-------|
| S08 | General Hub | Messenger home “일반/친구” hub row digit |
| S09 | Group Hub | Messenger home group hub row digit |
| S10 | Trade Hub | Messenger home Trade hub row digit |
| S11 | Order Hub (Customer) | Messenger home Order hub row digit |
| S12 | Community header Chat | Community top bar chat icon digit |
| S13 | Room Row (any domain) | Per-room unread digit in list |
| S14 | Room Header | Inside open room (usually no badge; leave marker) |
| S15 | Messenger list chrome glitch | Non-badge visual (red stripe observed) — product surface defect |

## Member — Trade / Order destinations

| # | Surface | Where |
|---|---------|-------|
| S16 | Trade List | `/trade-chats` (or trade chat list) — room presence vs unread |
| S17 | Trade Room | Open trade room |
| S18 | Order List (Customer) | Customer store-order chat list |
| S19 | Order Room (Customer) | Open customer SO room |
| S20 | Delivery surfaces | Delivery status UI / related badges if any |

## Owner — store shell

| # | Surface | Where |
|---|---------|-------|
| S21 | Owner FAB Chat | Store owner FAB chat digit (store-scoped B) |
| S22 | Owner FAB Orders / Ops | Store owner FAB order attention (C) |
| S23 | Owner Hub | Owner messenger / order hub |
| S24 | Owner Row | Owner room or order row badge |
| S25 | Owner Dashboard | Dashboard notification / attention chips |
| S26 | Owner store switcher | Per-store badge isolation |

## Push / Native carriers (echo, not authority)

| # | Surface | Where |
|---|---------|-------|
| S27 | FCM notification shade | Android system tray (count not always shown) |
| S28 | APNS badge | iOS push badge payload |
| S29 | Capacitor Badge plugin | WebView → native badge set |
| S30 | Android notification channel summary | Summary `setNumber` carrier |

## Community / social (if product shows digit)

| # | Surface | Where |
|---|---------|-------|
| S31 | Community feed activity | Like/comment indicators (may be A or local UI) |
| S32 | Friend request badge | Requests entry |

## Explicitly out of badge product (document for clarity)

| Item | Note |
|------|------|
| Marketing banner ephemeral | Not App Icon / Bell digit unless product says persistent A |
| Call UI in-call | Not App Icon authority |
| Web browser tab favicon | Not product App Icon |

---

## Inventory count

**Documented surfaces:** S01–S32 (+ exclusion notes).  
Any future surface with a red digit must be added here before Product PASS.

---

## Surface definitions (index)

Full ①–⑩ fields live in `11-product-matrix.md` §A. Condensed product meaning:

| Surface | Displays | Number meaning | ↑ | ↓ / Read | App Icon | Bell | Bottom |
|---------|----------|----------------|---|----------|----------|------|--------|
| App Icon | Launcher digit | A + B_member | A/B unread | A clear / room ACK | Self | A⊂ | B⊂ |
| Bell Digit | Header bell | A unread | A insert | A read/delete | Yes | Self | No |
| Bell Popup | A preview list | Same A | — | Same A | — | Self | No |
| Notification Center | Full A inbox | Same A | — | Read/delete/archive | A⊂ | Sync | No |
| Bottom Chat | Chat tab | \|GD\|+\|Group\| rooms | msg | ACK | Yes | No | Self |
| General / Group Hub | Hub row | Unread rooms | msg | ACK | Yes | No | Yes |
| Trade Hub | Hub row | Unread Trade rooms | peer msg | Trade ACK | Yes | No | No |
| Order Hub | Hub row | Unread Cust SO rooms | peer msg | SO ACK | Yes | No | No |
| Room Row | List row | Unread **messages** | msg | ACK | via B | No | via B |
| Trade / Order List | Destination list | Rooms exist; unread = Hub | — | — | via Hub | No | No |
| Owner FAB Chat | Owner FAB | B_store rooms @ store | cust msg | ACK | **No** | No | No |
| Owner FAB Ops | Owner FAB | C actions @ store | new ops | complete | **No** | No | No |
| Community header chat | Top chat icon | Same as Bottom | — | — | Yes | No | =Bottom |
| Delivery / Community activity | Domain UI | A if status/activity event | A | A read | via A | via A | No |
| FCM / APNS / Cap | Native echo | Must = Member App Icon | — | — | Echo | — | — |
