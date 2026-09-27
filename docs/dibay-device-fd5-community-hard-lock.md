# DIBAY Device SSOT — FD5 Community Presentation HARD LOCK

**Status:** OWNER CORRECTED — Community dual revoked  
**Declared:** 2026-09-26  
**Corrected:** 2026-09-27

FD1–FD4 remain READ-ONLY. This lock owns Community presentation only.

## AUTHORITY

| Item | Value |
|---|---|
| LAST KNOWN GOOD | `47e28a4b54a6ba9c1f9b8b6d9f5d84ea4d143bae` |
| FIRST BAD | `150a46e55878cca98391492e603c83251189e40c` |
| DUAL INTRODUCTION | `feat(device): resolve Community presentation from LayoutMode` |
| ORIGINAL COMMUNITY | `max-w-[66rem]` single column. Hub / read / write / edit are separate routes. |

## OWNER CONTRACT

Tablet / Windows landscape means: use the available width.

It does **not** mean: split Community into left and right panes.

```text
HUB   /philife           → single Community feed
READ  /philife/:postId   → single Community detail
WRITE /philife/write     → single Community write
EDIT  /philife/write?edit= → single Community edit
```

No `[LIST][DETAIL]`. No Community master-detail. No Community dual-pane.

DeviceClass / WindowClass / Orientation stay classification and window authority.
They do not authorize Messenger-style Community split.

## DO NOT

- Restore `resolveCommunityPresentation` / `shouldComposeCommunityDual`
- Mount a master list beside detail / write / edit
- Fix independent pane scroll — dual panes must not exist
- Replace 767 with 840 as a Device identity
- Reopen Messenger 768, Trade grid, Call, FD1–FD4
