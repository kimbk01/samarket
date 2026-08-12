# Gate 1 — Projection Map

**Mode:** AUDIT ONLY  
**HEAD:** `449e02771`  
**Sources:** `build-notification-badge-projection.ts`, `build-domain-badge-authority-http.ts`, `member-conversation-b-authority.ts`, device evidence asas55

---

| Surface | 현재 입력 | 올바른 입력 (명령서) | 현재 문제 |
|---------|-----------|----------------------|-----------|
| App Icon (Cap/launcher) | `memberAppIconAuthority.appIconTotal` ≈ A + B_member | A + B | **이중 진리:** 동일 응답에 `unifiedAttention.appIconTotal` (owner rooms 포함) 더 큼 — asas55 20 vs 22 |
| App Icon (HTTP field `projection.appIconTotal`) | member A+B | A+B | Cap 경로와 대체로 일치 |
| Bell | A_member (`projection.bellTotal` / tier1) | A | 방향 OK; NC UX/셸 FAIL |
| Bell list | `/api/me/notifications` A filter | A only | Empty when A=0 OK |
| Bottom Chat | GD+Group rooms | GD+Group rooms | asas55=3 · 방향 OK |
| Trade Hub | Trade unread rooms | Trade unread rooms | asas55=2 · 방향 OK |
| Order Hub | Customer SO unread rooms | Customer SO rooms | asas55=14 · 방향 OK |
| Chat Row | participant.unread_count | room message unread | 단위 OK |
| Owner FAB | hub GET store chat + ops | store C / B_store | member 셸에 OwnerLite 노출로 NC 오염 |
| Native/FCM badge_count | echo MemberAppIcon | echo A+B | echo 계약 OK; 입력 dual이면 위험 |

---

## Actual live formula (server)

```text
notificationA = resolveMemberNotificationAuthorityFromRows(...)
conversationB = resolveMemberConversationAuthority(...)  // B_member rooms; owner SO normalized separately
memberAppIconAuthority = A + B_member          // Cap path

unifiedAttention.appIconTotal = ChatAttention(+owner rooms) + NotificationAttention
                                // STILL COMPUTED AND RETURNED
```

명령서: `badge_count`는 A+B 결과물 하나.  
**현재:** 권위 필드가 응답에 둘 이상 → 제품 혼선 → FAIL.

---

## UI projection defects (non-numeric)

| Surface | Defect |
|---------|--------|
| `/notifications` | `showOwnerLiteStoreBar` true (bottom-nav eligible + not excluded) |
| `/notifications` | `showFloat` true → `FloatingAddButton` |
| Messenger list | red chrome stripe (visual) |
