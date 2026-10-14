# DIBAY TEST → PRODUCTION — 누적 실행 상태

최종 완료(종료 조건 1–10)가 충족되기 전까지 **전체 완료로 표시하지 않는다.**

## A. P0 라이브 격리 (2026-10-14 실측)

| 항목 | 상태 | 증거 |
|---|---|---|
| TEST Supabase ref | PASS | `tcwnueuzuxftyomttdyu` |
| Vercel Custom Environment `test` | PASS | target=`test` |
| service_role JWT ref | **PASS** | live probe `serviceRoleMatchesUrl: true` |
| anon JWT ref | PASS | 동일 |
| Production ref 미사용 | PASS | `isProductionRef: false` |
| Agora/FCM/APNs/SMS 자격 부재 | PASS | probe `outboundCredentialsPresent` 전부 false |
| PUSH/WEB_PUSH | PASS | `0` / `0` |
| side-effect gate (isolated TEST DB) | PASS | `isolated_non_production_database` |
| TEST 배포 Ready | PASS | `dpl_8D2NW4cTcfsTv8n93uTs3QWCapMB` |
| TEST URL | PASS | https://samarket-env-test-kimbk01s-projects.vercel.app |
| Git 브랜치 `dibay-test` | PASS | `origin/dibay-test` @ `7963d49f7` |
| Branch tracking (push→auto deploy) | NOT_PROVEN | Owner 콘솔 설정 필요 |
| TEST DB 스키마/RLS 적용 | **BLOCKED** | `SUPABASE_DB_PASSWORD` 없음 |

### Live probe (발췌)

`GET /api/runtime/test-isolation-probe` → `ok:true`, `projectRef=tcwnueuzuxftyomttdyu`, `bannerVariant=test`, `testAllowlistEmptyDenies=true`.

## B–E

| 영역 | 상태 |
|---|---|
| B 배너·allowlist empty deny | PASS (live); 승인 테스터 등록 후 실사용 NOT_PROVEN |
| C 네이티브 TEST identity | PASS (code); 실기기 NOT_PROVEN |
| D 기능 매트릭스 | BLOCKED (스키마 미적용) |
| E Web promote | code PASS; 토큰/실측 BLOCKED |

## F. Area A — TEST 관리자 배포 UI/매트릭스 (2026-10-15 코드)

| 항목 | 상태 | 증거 |
|---|---|---|
| `/admin/system/deploy` UI·CTA | PASS (code) | 매트릭스·검증완료/취소·A/B/C/D 모의·운영적용·복구 |
| 증거 기반 게이트 | PASS (unit) | `deploy-evidence-gates` — 수동 PASS 불가 |
| Owner 게이트 | PASS (unit) | `DIBAY_DEPLOY_OWNER_IDS` fail-closed |
| 운영 promote/rollback API | **BLOCKED** | `DIBAY_PROMOTE_EXECUTION_UNLOCKED` 없으면 503 |
| Cursor≠Owner 권한 분리 | **BLOCKED** | 공유 자격 — 기술 차단 NOT_PROVEN |
| TEST ledger SQL | code only | `scripts/sql/test-dibay-deploy-promotion-ledger.sql` (TEST 전용 적용) |
| main / Production / 운영 DB | **변경 없음** | 작업 브랜치 `dibay-test` only |

## 종료 조건

Area B 권한 분리·실측·Owner 승인 전 → **전체 완료 아님**
