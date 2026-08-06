# Slice 3 MyPage UI IA — status

```text
SLICE 1 FACTS LOCKED
SLICE 2 AUTHORITY LOCKED
SLICE 2.5 DESIGN SYSTEM HARD LOCKED
SLICE 3 UI CODE LOCKED
SLICE 3 DEPLOY / RUNTIME NOT YET
```

## ProfileSettingsSheet logout (Authority check)

| Check | Result |
|-------|--------|
| Writer | same `LogoutActionTrigger` |
| Confirm | same `LogoutConfirmModal` (Danger modal) |
| Variant | `danger_button` (allowed Danger) |
| Separate writer / confirm | **No** — Slice 2 Authority OK |

Hub Account uses `menu_row` → same trigger + same modal.

## KEEP / MOVE / MERGE / ADD

| Action | Item | Evidence |
|--------|------|----------|
| KEEP | Points, required, store, account rows, service, support | hub sections retained |
| MOVE | Logout off profile → Account | `MyInfoAccountMenuSection` `menu_row` + modal |
| MERGE | Trade activity onto home | `MYPAGE_HOME_TRADE_ITEMS` + `MyInfoTradeMenuSection` |
| ADD | Manner/trust on profile | `mypage-profile-manner-row` → `/mypage/trust` |
| ADD | Privacy in support | `/privacy` in `MYPAGE_HOME_SUPPORT_ITEMS` |

## Hub order (mobile)

Profile(+manner) → assets → required → **trade** → store → **account(+logout)** → service → support

## Code files (this slice)

| Path | Role |
|------|------|
| `lib/mypage/mypage-home-menu-config.ts` | Trade + privacy items |
| `components/mypage/home/MypageProfileSummary.tsx` | Manner row; logout removed |
| `components/mypage/myinfo/MyInfoHomeMenuSections.tsx` | Trade section; account logout |
| `components/mypage/MyPageHomeDashboard.tsx` | IA reorder |
| `components/mypage/myinfo/MyInfoProfileSection.tsx` | Logout removed (legacy surface) |

## Explicitly not in this Runtime gate yet

- Production deploy / SHA match
- APK · iOS · Windows · Tablet home IA Runtime
- CTA · modal · scroll · existing entry verification
- Auth / Messenger / Call / Badge (unchanged by design)

## Next (fixed)

1. Isolated commit (Slice 3 hub only)
2. `origin/main` push
3. Production deploy
4. SHA match
5. Multi-runtime home IA
6. → **SLICE 3 UI RUNTIME LOCK**
