# Slice 2 Authority — status

```text
SLICE 1 FACTS LOCKED
SLICE 2 AUTHORITY LOCKED
SLICE 2.5 DESIGN SYSTEM + ACCESSIBILITY HARD LOCK
SLICE 3 UI NOT AUTHORIZED
```

## Implemented

| Item | Evidence |
|------|----------|
| Authority SSOT | `lib/mypage/mypage-authority-contract.ts` |
| Motion ms LOCK | `MYPAGE_MOTION_MS` + `docs/customer-platform/03-NAVIGATION.md` |
| Logout Danger (Slice 3 MOVE) | Account `menu_row` modal; profile chrome has no logout |
| Push logout confirm ban | `/mypage/logout` · `/my/logout` → redirect `/mypage` |
| Modal-only logout | `LogoutContent` CONTRACT + Instagram `menu_row` |
| Double-tap My scroll_only | vitest + `shouldMainBottomNavRouteScrollOnly` comment |
| verify | `npm run verify:mypage-authority-contract` PASS |
| vitest | mypage-authority + bottom-nav-route-commit PASS |
| tsc | PASS |

## Exit checklist

1. verify:mypage-authority-contract PASS
2. related vitest PASS
3. tsc PASS
4. Logout = Danger + modal; push confirm removed
5. Motion constants = docs
6. This file records **SLICE 2 AUTHORITY LOCKED**

## Next

Slice 2.5 → **HARD LOCKED** (see `SLICE2.5-DESIGN-SYSTEM-STATUS.md`).  
Slice 3 UI — **NOT AUTHORIZED**.
