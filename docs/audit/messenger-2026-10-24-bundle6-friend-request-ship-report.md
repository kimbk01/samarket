# §2 묶음 6 친구 요청 — 운영 반영 보고

`[배포 구분] 웹만 — Vercel 배포 후 앱 재시작만 하면 반영 (재빌드 불필요)`

- 시각: 2026-10-24 ~07:10 PHT
- Owner: 「계획되어진 다음으로 진행」→ TEST APP PASS 후 **main + 운영 DB**

## 원인·보완 (반영 직전)

TEST APP T2/T7에서 중앙 팝업 NOT_PROVEN → 원인: `GlobalIncomingFriendRequestHost` 가 레이아웃에 **미장착**.  
`MessagingGlobalChrome`에 Host 장착 + idle defer 정책 연결.

## 반영 범위

- 웹: 상호 친구 요청 API/UI/LOCK/Realtime/i18n
- DB 파일: `20261201120000_cm_mutual_friend_request_atomic.sql`
- 적용 스크립트: `scripts/apply-cm-mutual-friend-request-atomic-migration.mjs`
- 기존 Contact 백필 없음 · 네이티브 미변경

## 게이트 (커밋 직전)

| 게이트 | 결과 |
|---|---|
| eslint (범위 파일, error) | PASS (0 error) |
| `typecheck:build` | PASS |
| vitest (lock/rpc/cta/mount) | PASS (26) |
| `verify:i18n-key-exposure` | PASS |
| TEST APP T1–T7 | PASS (팝업 Host 장착 전 뱃지·목록 PASS · Host 장착은 본 커밋) |

## 레이어

| 레이어 | 판정 |
|---|---|
| CODE | 본 커밋 |
| PUSH / DEPLOY | main 푸시 → Vercel Production |
| 운영 DB | apply 스크립트 결과 별도 기록 |
| DEVICE | NOT_PROVEN (앱 재시작 후 Owner 확인) |
