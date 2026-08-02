# Slice 2-2 Revert Plan

## Independent revert

Revert only Slice 2-2 commits (A projection + Bell ROUTE + UI filters + tests/docs).  
**Do not** revert Slice 2-1 foundation commit `ca86a20c1` unless intentionally rolling back classification identity.

## Safe rollback steps

1. `git revert <slice-2-2-sha(s)>` (prefer reverse order if multi-commit)
2. Confirm Bell digit again equals Phase B `NotificationAttentionTotal` path
3. Confirm `owner_intake` may reappear in Bell list/digit (expected pre-2-2)
4. Re-run `npm run verify:badge-authority-rebuild-isolation` + Slice 2-1 tests

## Must not touch on revert

- Slice 2-5 owner writer rewrite
- App Icon ChatAttention / owner rooms
- Native / FCM badge_count writers
- Unrelated dirty tree (`.qa-logs`, Phase0/1/2a untracked docs)

## Data

No DB migration in Slice 2-2 — revert is code-only; historical `owner_intake` rows remain in `notification_events`.
