# 03 — Notification Product (Bell)

**Mode:** STOP · Product requirement (not current UI apology)

---

## 1. What Bell is

Bell = **Member Notification Authority (A)** surface.

Bell answers: “Do I have unread **non-conversation** alerts that need my attention?”

Bell is **not** Conversation (B). Bell is **not** Owner Ops (C).

---

## 2. What must enter Bell (product)

| Category | In Bell? | Authority | Notes |
|----------|----------|-----------|-------|
| 공지 (service / admin notice) | **YES** | A | Persistent inbox |
| 광고 / 마케팅 (persistent) | **PRODUCT DECIDE** | A if persists_in_inbox | Ephemeral push-only = NO digit |
| 거래 상태 (예약/완료/후기 요청 등) | **YES** | A | Status, not chat text |
| 주문 상태 (고객 배달/픽업 등) | **YES** | A | Member-facing status |
| Community 좋아요 | **YES** | A | Activity alert |
| Community 댓글 | **YES** | A | |
| Community 답글 | **YES** | A | |
| 친구 요청 | **YES** | A | |
| 시스템 / 보안 | **YES** | A | |
| Missed Call (orphan / policy A) | **YES if product maps to A** | A or B | Room-bound missed → prefer B; orphan → A |
| Missed Call (room-bound unresolved) | **NO Bell** | B | Conversation / room |
| **채팅 메시지 (모든 도메인)** | **NO** | B | Conversation only |
| Owner 신규 주문 / 수락 필요 | **NO** | C | Owner FAB only |
| Owner 주문 채팅 메시지 | **NO** | B_store | Owner FAB chat |

---

## 3. Chat message vs Bell — hard rule

```text
채팅 메시지 → Conversation (B) only
             → Room / Hub / Bottom / App Icon(B)
             → NEVER Bell digit
             → NEVER Notification Center as chat row (product)
```

Status events (“배송 출발”, “거래 완료”) are **not** chat messages → **Bell (A)**.

---

## 4. Bell Digit meaning

| Field | Product |
|-------|---------|
| ① 표시 | Unread A count (cap/display policy e.g. 99+) |
| ② 숫자 의미 | Distinct unread persistent member notifications |
| ③ 증가 | New eligible A event written unread |
| ④ 감소 | Mark read / delete / expire (product policy) |
| ⑤ 읽음 | Open detail or mark-read ACK (see 07) |
| ⑥ 삭제 | User delete or server tombstone |
| ⑦ Projection | A_member_unread_notification_count |
| ⑧ App Icon | **Included** as A term |
| ⑨ Bell | Self |
| ⑩ Bottom | **Not included** |

---

## 5. Notification Center vs Bell Digit

| Surface | Product role |
|---------|----------------|
| Bell Digit | Count of unread A |
| Bell Popup | Preview list of A (same filter as NC) |
| Notification Center | Full A inbox: list, filter, read, delete, archive |

Digit and list **must** use the same A eligibility. Digit≠0 with empty list (or reverse) = PRODUCT FAIL.

---

## 6. Live vs product (audit)

| Check | Product require | Live (asas55 2026-08-03) | Verdict |
|-------|-----------------|--------------------------|---------|
| Chat in Bell | Never | A=0 / empty NC — no chat pollution observed | OK this account |
| Click Bell | Popup or NC with A UX | Navigates to NC page (Gate 3 Step 8) | UX product gap (see 07) |
| Owner in Bell | Never | Not observed on member | Pending owner account |
