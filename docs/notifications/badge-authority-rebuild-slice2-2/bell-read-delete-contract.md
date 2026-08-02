# Bell Read / Delete Contract (Slice 2-2)

## Individual read

Header: await mark → navigate (`PhilifeHeaderNotificationInbox.onActivate`).

## Mark all

`mark_my_notifications_read_excluding_owner_and_chat` — skips chat, owner commerce, missed_call, marketing.

## Delete

Existing `delete_ids` → `dismissNotificationEventFromInbox` (display_payload.deleted_at). Unread dismiss removes from A digit via eligibility.

## Isolation

Does not clear B rooms, B_store, or C ops state.
