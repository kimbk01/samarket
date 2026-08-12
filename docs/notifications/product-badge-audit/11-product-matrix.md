# 11 — Product Matrix

**Mode:** STOP · Master table  
**PASS/FAIL** = product coherence vs intended A/B/C (not code unit tests)

---

## A. Surface definitions (①–⑩)

### App Icon (S01)

| # | Product |
|---|---------|
| ① | Member attention total on launcher |
| ② | A + B_member room(+missed once) count |
| ③ | New A event or new unread member room / missed |
| ④ | A read/delete or room Read ACK / missed resolve |
| ⑤ | N/A as list; decreases when A/B clear |
| ⑥ | N/A |
| ⑦ | MemberAppIconTotal |
| ⑧ | Self |
| ⑨ | Includes A only (Bell ⊂) |
| ⑩ | Includes Bottom’s rooms as subset of B |

### Bell Digit (S02)

| # | Product |
|---|---------|
| ① | Unread member notifications |
| ② | A count |
| ③ | Eligible A insert unread |
| ④ | Read / delete A |
| ⑤ | Mark read / open detail policy |
| ⑥ | Delete / tombstone |
| ⑦ | A_member_unread_notification_count |
| ⑧ | Yes (A term) |
| ⑨ | Self |
| ⑩ | No |

### Bell Popup (S03)

Same authority as Bell Digit / NC. Preview of A. Chat never listed.

### Notification Center (S04)

Full A inbox. Filters without chat. Read/delete/archive per 07.

### Bottom Chat (S05)

| # | Product |
|---|---------|
| ① | Unread social chat rooms needing open |
| ② | \|GD\| + \|Group\| rooms |
| ③ | New unread in GD/Group |
| ④ | Read ACK those rooms |
| ⑤ | Room ACK |
| ⑥ | Leave/archive room |
| ⑦ | bottomChatUnreadRooms |
| ⑧ | Yes (B subset) |
| ⑨ | No |
| ⑩ | Self |

### General Hub (S08) / Group Hub (S09)

Unread room count for domain. App Icon yes. Bell no. Bottom yes.

### Trade Hub (S10)

| # | Product |
|---|---------|
| ① | Unread trade rooms |
| ② | Unread Trade Room Count |
| ③ | Peer new message in trade room |
| ④ | Trade room Read ACK |
| ⑤ | ACK |
| ⑥ | Leave/archive |
| ⑦ | tradeHubUnreadRooms |
| ⑧ | Yes (B) |
| ⑨ | No |
| ⑩ | No |

### Order Hub Customer (S11)

Unread customer SO rooms. App Icon yes. Bell no. Bottom no.

### Room Row (S13)

Unread **message** count. Feeds room→hub room flag. App Icon via hub aggregation.

### Trade List (S16)

Shows trade conversations (classification). Digit on list ≠ “list length”; unread is Hub.

### Owner FAB Chat (S21)

B_store room count @ store. App Icon member no. Bell no. Bottom no.

### Owner FAB Ops (S22)

C action count @ store. Member surfaces no.

---

## B. Master matrix

| Surface | Authority | Projection | Writer | Reader | Badge Meaning | Increase | Decrease | Read | Delete | AppIcon | Bell | Bottom | Trade | Order | Owner | Legacy | Current | PASS/FAIL |
|---------|-----------|------------|--------|--------|---------------|----------|----------|------|--------|---------|------|--------|-------|-------|-------|--------|---------|-----------|
| App Icon | A+B_member | MemberAppIcon | echo | Cap/OS | A+B_member | A/B↑ | A/B↓ | via A/B | via A | Self | A⊂ | B⊂ | B⊂ | B⊂ | No | Chat+Notif often +owner | Cap≈A+B; unified larger | **FAIL** |
| Bell Digit | A | A count | notif pipeline | Header | Unread A | A insert | A read/del | mark/detail | delete | Yes | Self | No | No | No | No | Mixed | A path | **PASS*** |
| Bell Popup | A | A list | same | Header panel | A preview | — | — | — | — | — | Self | No | No | No | No | Popup | Often NC route | **FAIL** |
| NC | A | A list | same | NC page | A inbox | — | — | mark | delete | A⊂ | Sync digit | No | No | No | No | Mixed tabs | A filters | **PASS*** |
| Bottom Chat | B GD+G | room count | participants | BottomNav | Unread GD+Group rooms | msg | ACK | ACK | leave | Yes | No | Self | No | No | No | Same intent | Shows 3 | **PASS*** |
| General Hub | B GD | room count | participants | Messenger | Unread GD rooms | msg | ACK | ACK | leave | Yes | No | Yes | No | No | No | Same | Present | **PASS*** |
| Group Hub | B Group | room count | participants | Messenger | Unread Group rooms | msg | ACK | ACK | leave | Yes | No | Yes | No | No | No | Same | Present | **PASS*** |
| Trade Hub | B Trade | room count | participants | Messenger | Unread Trade rooms | msg | ACK | ACK | leave | Yes | No | No | Self | No | No | Same | Shows 2 | **PASS*** |
| Order Hub | B Cust SO | room count | participants | Messenger | Unread order rooms | msg | ACK | ACK | leave | Yes | No | No | No | Self | No | Same | Shows 14 | **PASS*** |
| Room Row | B room | msg unread | participants | List row | Unread messages | msg | ACK | ACK | — | via B | No | via B | via B | via B | Owner only owner | Same | Present | **PASS*** |
| Trade List | B Trade | classification list | — | trade-chats | Rooms exist ≠ unread | — | — | — | — | via Hub | No | No | List | No | No | Confusion risk | Rooms present asas55 | **PASS*** / empty unreproduced |
| Owner FAB Chat | B_store | store rooms | SO chat | Owner FAB | Unread store chat | cust msg | ACK | ACK | — | **No** | No | No | No | Owner | Self | Often leaked | Cap excludes; unified not | **FAIL** |
| Owner FAB Ops | C | store ops | order ops | Owner FAB | Action required | new ops | complete | action | expire | **No** | No | No | No | Ops | Self | user_id leak risk | Contract forbids | **AUDIT** |
| Community header chat | B GD+G | same Bottom | participants | Header | Same Bottom | — | — | — | — | Yes | No | =Bottom | No | No | No | — | =3 | **PASS*** |
| List chrome stripe | — | — | UI | Messenger | Non-badge defect | — | — | — | — | — | — | — | — | — | — | — | Red stripe | **FAIL** |
| FCM/APNS badge | echo AppIcon | badge_count | dispatcher | OS | Echo | — | — | — | — | Echo | — | — | — | — | — | Echo | Must = MemberAppIcon | **FAIL** if dual |

\*PASS\* = **directionally correct on audited member screenshots**, not Product PASS overall. Any row FAIL forces overall PRODUCT FAIL.

---

## C. Cross-surface invariants (product)

| Invariant | Status |
|-----------|--------|
| Chat never in Bell | OK on asas55 |
| Owner never in Member App Icon (single number) | **FAIL** (dual total) |
| Bottom = GD+Group only | OK on asas55 |
| AppIcon ≥ Bottom + TradeHub + OrderHub + Bell (no double count) | Roughly holds for Cap 20 |
| One App Icon truth in payload + OS | **FAIL** |
| No visual chrome defects on badge-bearing screens | **FAIL** (red stripe) |
