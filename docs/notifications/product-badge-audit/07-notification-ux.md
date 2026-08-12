# 07 — Notification UX (Bell)

**Mode:** STOP · Product UX design (requirement)

---

## 1. Surfaces under audit

| Surface | Current (Gate 3 era) | Product require |
|---------|----------------------|----------------|
| Bell Digit | A count | A count; hide when 0 |
| Bell Popup | Step 8 often routes away | Optional preview; if removed, digit click → NC |
| Notification Center | Full page list | Primary A inbox |
| Route | `/notifications` family | Stable dedicated NC |
| Modal / detail | Event detail | Required for status/community items |

---

## 2. Interaction product rules

| Action | Product behavior |
|--------|------------------|
| Click Bell (digit area) | Open Popup **or** NC (one product choice). Must show A list. Must not open chat. |
| Long-press Bell | Optional: mark-all / filter shortcut. If unsupported, do nothing (no crash). |
| 전체 읽음 | Marks all eligible A unread → read. Digit → 0. App Icon A term ↓. Chat untouched. |
| 단건 읽음 | Open detail or swipe-read → that A item read. Digit −1. |
| 삭제 | Removes from inbox; digit ↓ if was unread. Soft-delete preferred. |
| 전체 삭제 | Confirms; clears A inbox. Does not clear Conversation B. |
| 공지 | Listed under notice filter; tap → detail / deep link. |
| 광고 | If in A: same as notice with ad chrome; if ephemeral: never digit. |
| Detail | Required for actionable A; back returns to NC with correct unread. |
| 필터 | 전체 / 거래 / 배달·주문 / 커뮤니티 / 공지 (product). **No chat tab.** |
| Paging | Infinite or page; unread count remains authority-based, not “loaded rows”. |
| Archive | Optional; archived unread must not inflate Bell. |

---

## 3. Competitor / Legacy comparison (product intent)

| Product | Bell / Inbox model | Chat in inbox? | Notes for DIBAY |
|---------|--------------------|----------------|-----------------|
| 카카오톡 | Alert + chat separated; chat has own badge | Chat not mixed as “알림” primary | Match: chat ≠ Bell |
| Telegram | Mentions/channels vs chats | Chats in chat list | Match: Bottom/Hub for chat |
| 당근 | Activity/alerts vs chat | Chat separate | Trade status can be A; trade chat B |
| 배민 | Order status push + inbox | Chat secondary | Order status → A; order chat → B |
| 요기요 | Similar order-centric alerts | Chat separate | Same |
| DIBAY Legacy | Mixed notification_events + chat families | Often chat_message in same store | Rebuild goal: A-only Bell |

---

## 4. Live UX audit (asas55)

| Check | Result |
|-------|--------|
| Digit vs list | Both empty — consistent |
| Click path | NC route (no popup) — acceptable only if NC is complete A UX |
| Chat pollution | Not observed |
| Filter / archive polish | Incomplete vs competitor bar — product UX debt |
| Popup Step 8 | Regression vs “popup inbox” expectation — UX FAIL if product promised popup |

**Product UX verdict contribution:** FAIL until Bell interaction + NC completeness are explicitly accepted as the product.
