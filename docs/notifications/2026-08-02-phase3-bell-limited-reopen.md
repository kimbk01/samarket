# Phase 3 Bell — LIMITED REOPEN (2026-08-02)

**Parent LOCK:** `2026-08-01-phase3-bell-ssot-hard-lock.md`  
**Design:** `2026-08-02-slice2-bell-a-axis-packaging-design.md`

## Reopen status

| Item | Value |
|------|-------|
| Scope | Packaging only — orphan missed out of Bell digit |
| Implementation | **NOT started** — design confirmed only |
| Full Phase 3 feature reopen | **NO** |
| Phase 1 RoomUnread | **LOCKED** |
| Phase 2 Badge formula | **LOCKED** except Explain/field minimum in Slice 2 design |
| Heal / digit hacks / UI center rewrite | **FORBIDDEN** |

## Allowed under this reopen (after impl approval)

- Exclude orphan `missed_call` from `bellTotal` / Tier1 digit  
- Align Tier1 A list + mark-all A scope with that digit  
- Adjust Bell Explain `total` identity  
- Keep `appIconTotal` numerically identical  

## Still forbidden

- Changing RoomUnread writers  
- Changing Bottom/Hub room math  
- Native / FCM / APNs inventing badge  
- Changing `decideMissedCallBellNotify`  
- Messenger mixed “알림 센터” discard (Slice 4)  
- Heal revival  

## Close condition

After Slice 2 CODE + contract tests PASS and App Icon identity proven:  
re-declare Phase 3 HARD LOCK with updated digit definition (A only).
