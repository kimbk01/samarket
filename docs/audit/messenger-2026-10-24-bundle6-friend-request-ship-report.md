# §2 묶음 6 친구 요청 — 운영 반영 보고

`[배포 구분] 웹만 — Vercel 배포 후 앱 재시작만 하면 반영 (재빌드 불필요)`

- 시각: 2026-10-24 ~07:10 PHT
- Owner: 「계획되어진 다음으로 진행」→ TEST APP PASS 후 **main + 운영 DB**

## 원인·보완 (반영 직전)

TEST APP T2/T7에서 중앙 팝업 NOT_PROVEN → 원인: `GlobalIncomingFriendRequestHost` 가 레이아웃에 **미장착**.  
`MessagingGlobalChrome`에 Host 장착 + idle defer 정책 연결.

## 반영 범위

- 웹: 상호 친구 요청 API/UI/LOCK/Realtime/i18n
- DB 파일: `20270625120000_cm_mutual_friend_request_atomic.sql`
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
| CODE | `204cec578` + rename fix `1ef373533` · docs tip `21210d2b1` |
| PUSH | `origin/main` 반영 |
| DEPLOY | Vercel Git Integration (대기 금지 · Production Ready는 Owner/알림) |
| 운영 DB | **PASS** `20270625120000` · `FN_OK\|ACL_OK\|SR_OK\|MIG_OK` (`BUNDLE6_DB_APPLY_PASS`) |
| 중앙 팝업 Realtime | **NOT_PROVEN** (TEST APP T2/T7 · Host 장착 후 실기기 재측 전) |
| DEVICE | NOT_PROVEN (앱 재시작 후 실기기) |

## 종료 판정 (Owner 2026-10-24)

main+운영 DB PASS만으로 묶음 6 **완전 종료(CLOSED)로 판정하지 않는다.**  
중앙 팝업 Realtime 실측이 NOT_PROVEN인 한 CLOSED 금지. 잔여는 묶음 7과 섞지 않고 별도 게이트로 둔다.

## 운영 DB 비고

최초 파일명 `20261201120000` 은 운영에 이미 `delivery_ads_cut_b_ssot` 로 기록되어 RPC 미생성·스킵됨 → `20270625120000` 으로 재명명 후 적용.
