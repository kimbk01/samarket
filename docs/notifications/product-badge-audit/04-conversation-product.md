# 04 — Conversation Product (B)

**Mode:** STOP · Product requirement

---

## 1. What Conversation Badge is

Conversation answers: “Which **rooms** (or missed calls) still need me?”

Unit of Hub / Bottom / App Icon B term = **unread room count** (not sum of message counts), unless a surface explicitly says message-count (Room Row).

| Unit | Surfaces |
|------|----------|
| Unread **room** count | Hub, Bottom Chat, App Icon B |
| Unread **message** count | Room row badge |

---

## 2. Domains

### General Direct (GD)

| Surface | Badge meaning | App Icon | Bell | Bottom |
|---------|---------------|----------|------|--------|
| Room Badge | Unread messages in that room | via room→B | No | via Bottom aggregate |
| Hub Badge | Unread GD room count | Yes (B) | No | Yes (part of Bottom) |
| Bottom Badge | GD + Group rooms only (product lock) | Yes (B) | No | Self |

### Group

| Surface | Badge meaning | App Icon | Bell | Bottom |
|---------|---------------|----------|------|--------|
| Room Badge | Unread messages | via B | No | via Bottom |
| Hub Badge | Unread Group room count | Yes (B) | No | Yes |
| Bottom Badge | included in Bottom Chat | Yes (B) | No | Self |

### Trade

| Surface | Badge meaning | App Icon | Bell | Bottom |
|---------|---------------|----------|------|--------|
| Room Badge | Unread messages in trade room | via B | No | **No** (not Bottom) |
| Hub Badge | Unread Trade **room** count | Yes (B) | No | **No** |
| Trade List | Rooms you have (classification); unread ≠ list length | Hub drives unread | No | No |
| Bottom | Trade **must not** inflate Bottom Chat | — | — | Trade excluded |

**Product:** Trade Hub digit = unread trade rooms. Trade List showing many rooms with Hub=2 is **correct** if only 2 have unread.

### Order (Customer)

| Surface | Badge meaning | App Icon | Bell | Bottom |
|---------|---------------|----------|------|--------|
| Room Badge | Unread messages | via B | No | No |
| Hub Badge | Unread customer SO room count | Yes (B) | No | **No** |
| Bottom | Excluded from Bottom Chat | — | — | No |

### Owner (store) — Conversation B_store only

| Surface | Badge meaning | Member App Icon | Member Bell | Member Bottom |
|---------|---------------|-----------------|-------------|---------------|
| Owner Room Badge | Unread messages | **No** | No | No |
| Owner Hub Chat | Unread owner SO rooms @ store | **No** | No | No |
| Owner FAB Chat | Same store-scoped room count | **No** | No | No |

---

## 3. Increase / decrease / read (product)

| Event | Effect |
|-------|--------|
| Peer sends message in room you left | Room unread ↑ → Hub ↑ → App Icon B ↑; Bottom ↑ only if GD/Group |
| You open room + Read ACK | Room unread → 0 → Hub ↓ → App Icon B ↓; Bottom ↓ if GD/Group |
| You send message only | Does not clear peer’s unread; your unread usually unchanged |
| Delete room / leave | Room leaves projection |
| Missed call resolve | B missed term ↓ (policy) |

---

## 4. Live observation vs product

| Surface | Product | Live (asas55 screenshots) | Note |
|---------|---------|---------------------------|------|
| Bottom Chat | GD+Group rooms | **3** | Matches community header chat **3** |
| Trade Hub | Unread trade rooms | **2** | OK as room unread |
| Order Hub | Unread SO rooms | **14** | Large; still B not Bell |
| Trade List empty | Must show rooms if any | asas55 had rooms — empty claim unreproduced | Account-specific |
| App Icon includes Trade+Order B | Yes | Icon 20 vs Bottom 3 | Expected if Trade/Order unread large; dual 20 vs 22 was the fail |
