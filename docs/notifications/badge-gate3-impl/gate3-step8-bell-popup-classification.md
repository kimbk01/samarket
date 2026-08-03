# Gate 3 Step 8 — Bell Popup classification

| Piece | 기존 역할 | 새 역할 | 분류 |
|-------|-----------|---------|------|
| Header Bell digit | A (Step 4) | A only · display | **KEEP** |
| Bell click → panel open | Mixed list / mark-all | Navigate `/notifications` | **ROUTE** |
| Panel list fetch | Surface-scoped inbox | Removed as Bell authority | **DELETE** |
| Panel important rooms / invites pinned | CM friend requests in panel | Messenger entry (not Bell A) | **ROUTE** (CM header actions) |
| Panel missed-call sum | Independent | Forbidden | **DELETE** |
| Panel mark-all | Surface mark body | Center mark-all = canonical A | **ROUTE** |
| “모두 보기” → `/mypage/notifications` | Legacy page | `/notifications` | **ROUTE** |
| `supplementalUnreadCount` in digit | Was ignored (Step 4 sync) | Still ignored | **DELETE** (as authority) |

```text
Bell click → /notifications
Popup cannot compute independent digit
Popup cannot include conversation rooms
Notification Center data = Member Notification Authority A only
```

## Mark unread (재안읽음)

**EXCLUDED this step.**  
근거: 제품 혼동·이중 토글 위험. 필요 시 이후 UI 단계에서 `read_at = null` + A reconcile로 추가.

## Delete-all / soft dismiss

`dismissMemberNotificationCenterEvents` selects current member rows that pass `isMemberNotificationAListItem`, then soft-dismisses via `dismissNotificationEventFromInbox` (`deleted_at` / inbox hide). Source order·trade entities are not deleted.

Preservation: soft dismiss is the archive/hidden policy for A center rows (including security/payment-classified A events). Physical hard-delete of those events is not used by Center bulk actions.
