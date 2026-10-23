# §2 묶음 6 — 실측 증거 확인 (재실행 없음)

- 작성: 2026-10-24 ~03:20 PHT
- 범위: 기존 산출물·로그 대조만 · 운영/main/Prod/재테스트 **금지**

## 증거 원본

| 원본 | 내용 |
|---|---|
| `tmp/bundle6-db-verify-dibay-test.out` | mtime 로컬 03:07 · steps 01–08,10–12 PASS + JSON/카운트 detail |
| `tmp/bundle6-db-verify-dibay-test.sql` | 실행에 사용한 SQL · 대상 ref `tcwnueuzuxftyomttdyu` 명시 |
| Agent 세션 shell | 마이그레이션 apply · 동시 accept 2프로세스 결과(`.out` 미포함) |
| `impl-report.md` | CODE/vitest · 당시 DB 실측 **NOT_PROVEN** (이후 db-verify로 갱신됨) |
| git | `HEAD=9caa5d443` = `origin/main` · Bundle6 파일은 **미커밋 WT** |

## READY 정정

이전 db-verify 「READY」는 **TEST DB 원자성·권한 준비** 의미로만 유효.  
전체 제품 운영 반영 READY로 읽히면 **과대** → **READY (TEST DB only) / 제품 전체는 BLOCKED until DEVICE·main·Prod DB**.

---

## Owner 수용 판정 (2026-10-24 ~03:10 PHT)

| 구분 | 최종 판정 |
|---|---|
| 격리 DB SQL 실측 | **PASS** (제출된 실행 기록 기준) |
| DB 원자성·RLS·RPC 권한 | **PASS** |
| 웹·서버 로컬 테스트 | **PASS** |
| 실제 앱 요청→수락 | **NOT_PROVEN** |
| 중앙 팝업·Realtime·다중 기기 | **NOT_PROVEN** |
| 운영 DB·main·Production | **미반영** |
| 제품 전체 운영 준비 | **BLOCKED** |

**핵심:** DB는 실측됨 · 실제 앱 친구 요청 흐름은 미실측.

**다음 단계(미착수·별도 승인):** 운영 배포 전 격리 TEST APP(`dibay-test`, 운영 데이터 비영향)에서 요청 → 중앙 팝업 → 수락·거절 → 화면 이동 후 pending 유지. 묶음 6만.

**STOP 유지.** 묶음 1~5 CLOSED · 운영 DB·main·Production 변경 금지.

---

## TEST APP API 재확인 (2026-10-24 ~03:45 PHT · 비로그인 경로 폐기)

잘못된 접근: 쿠키 없는 curl → 401/타임아웃 (비효율).

올바른 접근: dibay-test 전용 `bundle6.a` / `bundle6.b` 로그인 → `sb-*-auth-token` 쿠키로 localhost:3010 호출.

| 항목 | 환경 | 결과 |
|---|---|---|
| isolation `supabase-project` | TEST APP | PASS → `tcwnueuzuxftyomttdyu` |
| A→B send pending | TEST APP | PASS `abd24c69-…` |
| B incoming list | TEST APP | PASS 1건 |
| B accept + 양쪽 friend | TEST APP | PASS friend rows=2 |
| 중앙 팝업·화면 UI | DEVICE | 여전히 NOT_PROVEN |

증거: `tmp/bundle6-auth-cookie-smoke.json` · 기존 `tmp/bundle6-test-app-verify.json`
