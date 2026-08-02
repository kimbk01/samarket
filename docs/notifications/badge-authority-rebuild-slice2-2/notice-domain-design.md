# Notice Domain Design (Slice 2-2)

## Separation

- Admin inquiry / support chat ≠ notices
- Existing `app_notices` / store notices / settings notices remain separate product surfaces

## This slice

Persistent admin/system events in `notification_events` with types like `admin_notice` count as **A_member** when eligible.

## Deferred

Dedicated `/notices/[noticeId]` member notice domain + dual-read global notice model — document only; no large migration in 2-2.
