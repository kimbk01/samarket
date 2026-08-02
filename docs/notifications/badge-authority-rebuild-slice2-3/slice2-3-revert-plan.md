# Slice 2-3 Revert Plan

## Independent commits (recommended)

1. audit docs + B projection module + Builder owner exclusion + A+B App Icon  
2. General+Group surface tests (if separate)  
3. Trade  
4. Customer Store Order  
5. missed call call_id  
6. Member web App Icon docs/tests polish  

Do **not** mix Native · FCM · B_store · C_store · Bell UI · 공지 domain in the same commit.

## Revert

```bash
# Revert only Slice 2-3 commits (example — use actual SHAs after commit)
git revert <slice2-3-sha> --no-edit
```

**Do not** revert Slice 2-2 (`d6dbb91d4` / `1a814053b`) when rolling back B_member.

## Dirty tree

Pre-existing untracked `.qa-logs/` / Phase docs — leave untouched.

## Failure policy

No digit hacks · no UI force-zero · no TTL-only · no FCM overwrite · no Native self-heal.
