# Notification Center UI Contract (Gate 2)

**Replaces:** messenger Bell popup mixing `important_room` / invites / missed as Bell authority.

---

## Mobile

```text
Route: /notifications
Full screen
```

Header:

```text
←  |  알림  |  모두 읽음  |  ⋮
```

Overflow:

```text
읽은 알림 삭제
전체 삭제
알림 설정
```

Filters (no chat):

```text
전체 | 거래 | 주문·배달 | 시스템 | 혜택
```

List data = A base set (same recipient/type policy as Bell digit).  
Chat belongs in conversation hubs, not here.

---

## Tablet / Desktop

```text
Right drawer 360–420px
sticky header + sticky filters
independent list scroll
long notice → /notifications/[notificationId]
```

---

## Row

```text
[domain icon] title                    relative time
              1–2 lines body
              entity subtitle
              unread affordance
```

Actions: read/unread toggle · delete · open targetRoute.

---

## Visual states

| State | UI |
|-------|-----|
| unread | emphasis + dot + semibold title |
| read | default |
| deleted | absent from list |

99+ is display clamp only — never store 99 as authority.

---

## Empty / Error

Empty copy (i18n keys later; user-facing sentences only in UI):

```text
새로운 알림이 없습니다.
거래와 주문 진행 소식이 여기에 표시됩니다.
```

Error: show retry · **do not force A/App Icon to 0**.

---

## Mutation UX

```text
optimistic row state allowed
rollback on failure
canonical projection reconcile on success
App Icon updates only after successful mutation or server-guaranteed optimistic transaction
```

**Forbidden:** decrement Bell/App Icon digits with no event id mutation.
