# DIBAY Device SSOT — FD5 Community Presentation HARD LOCK

**Status:** IMPLEMENTATION COMPLETE · NOT LOCKED  
**Declared:** 2026-09-26  
**Evidence:** `.tmp/fd5-community-runtime/` (pending device close)

FD1–FD4 remain READ-ONLY. This lock owns Community presentation only.

## AUTHORITY

| Item | Value |
|---|---|
| HEAD BEFORE | `47e28a4b54a6ba9c1f9b8b6d9f5d84ea4d143bae` |
| CURRENT COMMUNITY PRESENTATION DEFECT | NONE PROVEN until device close |

## FIRST DIVERGENCE

`resolveLayoutMode` already produced `PHONE_SINGLE` / `TABLET_STACKED` / `TABLET_DUAL` / `DESKTOP_*`.

The first Community layer that did not consume LayoutMode was `CommunityUiScope` + `CommunityFeed` 767 `matchMedia`. They encoded mobile/wide assumptions only, so Community could not distinguish SINGLE / STACKED / DUAL.

767 was not itself the root cause. Missing presentation authority was.

## COMMUNITY PRESENTATION CONTRACT

```text
PHONE_*     → SINGLE
TABLET compact / below floor → STACKED
TABLET sufficient usable width → DUAL
DESKTOP narrow → STACKED
DESKTOP sufficient width → DUAL
UNKNOWN_SAFE → STACKED (no Device guess, no dual)
```

URL `/philife/:postId` remains selection authority. Dual consumes that URL.  
Phone list → detail → back is unchanged.

## COMMUNITY DUAL FLOOR

| | |
|---|---|
| LIST_MIN | 360 (phone-proven list surface, padding inside pane) |
| DETAIL_MIN | 480 (reading surface; `max-w-3xl` 768 is content cap) |
| GAP/PADDING | 1px pane divider; card/page padding stays inside each pane |
| FINAL FLOOR | 840 |
| LOCK | CANDIDATE until device runtime close |

Do not treat 840 as a Tablet Device cutoff.

## DO NOT

- Replace 767 with 840 as a Device identity
- Mount Phone navigation on Tablet stacked
- Duplicate Community trees
- Let CSS `@media` choose SINGLE/DUAL
- Reopen Messenger 768, Trade grid, Call, FD1–FD4

## NEXT

Device runtime on Samsung / Xiaomi / iPhonebk, then LOCK.  
FD6 TRADE is forbidden until FD5 is LOCKED.
