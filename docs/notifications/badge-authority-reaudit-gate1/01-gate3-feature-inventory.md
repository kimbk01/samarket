# 1. Gate3 · Slice 기능 변경 인벤토리

**Mode:** 증명 감사 · 해결책 구현 없음 · Partial Rollback **미결정**

관련 커밋 창: `d6dbb91d4` … `449e02771` (Bell A 분리 → Gate3 freeze → backfill/test)

---

## 1.1 기능 단위 인벤토리

| ID | 기능 | 도입/변경 커밋 | 변경 요약 | 셸/플래그 동반? |
|----|------|----------------|-----------|-----------------|
| F1 | Bell digit = A only | `d6dbb91d4` | Member Bell을 A_member로 분리 | 없음 |
| F2 | Member App Icon = A+B_member (owner SO 제외) | `06bab8001` | `storeOrderForAppIcon = buyer` only; `memberAppIconWebTotal` 추가 | 없음 |
| F3 | Dual HTTP 필드 유지 | `06bab8001` → `6c8e2c8eb` | `unifiedAttention` 계속 계산·반환 + member path 병행 | 없음 |
| F4 | Native/FCM echo MemberAppIcon | `e2cb00ec8` | Cap/FCM이 member total echo | 없음 |
| F5 | Owner C authority | `aa2d46b09` 등 Slice 2-5 | store ops 분리 | 없음 |
| F6 | Owner hub cache invalidate | `c78dd7a1e` `c673ac444` | read 후 hub refresh | 없음 |
| F7 | Gate3 A/B authority modules | `6c8e2c8eb` | `memberAppIconAuthority`, conversation B normalize/quarantine | 없음 |
| F8 | **Bell click → `/notifications`** | `6c8e2c8eb` Step8 | popup 제거, `router.push('/notifications')` | **셸 파일 미변경** |
| F9 | NC page `/notifications` 신설 | `6c8e2c8eb` | `app/(main)/notifications/page.tsx` | **셸 미연동** |
| F10 | See-all link → `/notifications` | `6c8e2c8eb` | 기존 `/mypage/notifications#…` 대체 | **경로 클래스 변경** |
| F11 | PushRouteListener | `6c8e2c8eb` | push routing 정렬 | 별도 |
| F12 | API `/api/me/notifications` 정리 | `6c8e2c8eb` | A-oriented PATCH 등 | 없음 |
| F13 | Cap resume versioning | `6c8e2c8eb` Step11 | versioned apply | 없음 |
| F14 | Room identity quarantine | `6c8e2c8eb` Step12 | incomplete room 제외 | 없음 |
| F15 | Legacy cutover / backfill | `6c8e2c8eb`+`fc1fc1410` | production backfill + incident | DB |
| F16 | Android/iOS delivery adapter touch | `6c8e2c8eb` | minor native | echo |
| F17 | Docs/tests freeze | `6c8e2c8eb`+`449e02771` | 대량 docs/tests | 없음 |

---

## 1.2 Gate3 커밋이 **건드리지 않은** 것 (중요)

`6c8e2c8eb` file list에 **없음**:

- `lib/layout/conditional-app-shell-flags.ts`
- `components/layout/OwnerLiteStoreBar.tsx`
- `components/layout/ConditionalAppShell.tsx` (FAB mount)
- `lib/navigation/bottom-nav-route-policy.ts`

→ OwnerLite/FAB가 NC에 보인 것은 “OwnerLite를 NC에 추가한 커밋”이 아니라,  
**F8/F9가 기존 셸 규칙을 그대로 타는 새 pathname을 연 것**.
