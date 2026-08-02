# Slice 2-2 Runtime Failure Fix — Mark-All dual-store

## Cause

`mark_my_notifications_read_excluding_owner_and_chat` early-returned when legacy
`notifications` unread was empty, skipping `markNonChatNonOwnerNotificationEventsRead`.

## Fix

`markMemberANotificationsAllRead` in `inbox-read-bridge.ts`:

1. legacy non-chat/non-owner mark (may be 0)
2. **always** notification_events A mark
3. return `{ updated, legacyUpdated, eventUpdated }`

Bell UI continues to resync via A projection — does not subtract `updated`.

## Re-verify

RT-A6 then RT-A7 on clean state after deploy of this fix commit.
