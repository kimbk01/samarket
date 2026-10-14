# DIBAY TEST → PRODUCTION — 누적 실행 상태

최종 완료(종료 조건 1–10)가 충족되기 전까지 **전체 완료로 표시하지 않는다.**

## A. P0 라이브 격리

| 항목 | 상태 | 증거 |
|---|---|---|
| 코드 게이트 (cron/push/mutation/SMS) | PASS (code) | `verify:test-prod-isolation-p0` + unit |
| TEST Supabase 프로젝트 | PASS (Owner) | ref=`tcwnueuzuxftyomttdyu` ≠ 운영 |
| Vercel Custom Environment `test` | PASS (Owner) | env scope = `test` only |
| TEST URL/anon JWT ref | PASS (실측) | host/JWT `ref` = `tcwnueuzuxftyomttdyu` |
| TEST `service_role` JWT ref | NOT_PROVEN | Secret — local pull 불가; Owner 대시보드 확인 필요 |
| Preview/Production 키 상속 | PASS (실측) | `test`에 Agora/FCM/APNS/SMS **없음** (미상속) |
| TEST 배포·라이브 게이트 실측 | NOT_PROVEN | 배포·도메인·브랜치 트래킹 미완 |

### TEST env 키 (실측 `vercel env ls test`)

Owner 등록 5: `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `NEXT_PUBLIC_DIBAY_RUNTIME_SURFACE` · `PUSH_DISPATCH_ENABLED`

Agent 추가(test only, Production 미변경): `NEXT_PUBLIC_APP_DEPLOY_TIER=staging` · `NEXT_PUBLIC_APP_NAME=DIBAY TEST` · `WEB_PUSH_ENABLED=0` · `CRON_SECRET`(TEST 전용 신규)

## B–E

| 영역 | 상태 |
|---|---|
| B allowlist·배너 (code) | PASS; 라이브 allowlist NOT_PROVEN |
| C Android/iOS TEST identity (code) | PASS; 실기기 NOT_PROVEN |
| D 기능 매트릭스 | NOT_PROVEN |
| E Web promote | code PASS; 토큰/실측 BLOCKED |

## 종료 조건

라이브 배포·스키마·allowlist·실기기·승격 실측 전 → **전체 완료 아님**
