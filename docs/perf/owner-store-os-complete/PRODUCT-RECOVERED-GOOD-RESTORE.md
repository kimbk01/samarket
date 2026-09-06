# Owner Product New — RECOVERED_GOOD restore

**User Production evidence (2026-09-06 ~15:29):**  
Dashboard content visible · Product registration = header only + blank white body.

**Authority:** user screenshot overrides Playwright PASS.

## What previously worked

`ad7942be6` — Product composer **private** height + inner `overflow-y-auto` scroll.  
User-confirmed form visible + register process after that recovery.

## What broke it again

Shared-scroll SELECTIVE_RESTORE for Product (`a48c78865` → later height stacks) made Product New blank again on user runtime (height ownership mismatch under fixed header).

## Restore now

1. Exclude Product CREATE/EDIT from shared scroll host  
2. Shell main = `h-full` + `pt-[calc(safe-top+3.5rem+0.75rem)]` (composer only)  
3. Form = `h-[calc(100dvh-…)]` + scroll body `flex-1 overflow-y-auto`  
4. Keep BottomNav hidden on Product CREATE/EDIT  
5. Non-product Owner pages keep `.owner-stack-shell` CSS SSOT  

**STATUS until user confirms:** FAIL / NOT CLOSED
