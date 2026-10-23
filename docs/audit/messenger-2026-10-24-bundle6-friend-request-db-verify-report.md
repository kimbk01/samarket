# §2 묶음 6 — DB 실측·운영 반영 준비 보고

- 작성: 2026-10-24 ~03:15 PHT
- 격리 DB: Supabase **dibay-test** `tcwnueuzuxftyomttdyu` (ap-south-1)
- 운영 DB `ckdosyydvgzqwpbwuhon`: **미사용·미적용**
- 마이그레이션: `supabase/migrations/20261201120000_cm_mutual_friend_request_atomic.sql`

`[배포 구분] 웹만` — 단 **main/Prod 미반영** (이번 지시 비승인).

---

## 1. 실제 DB 원자성: **PASS**

| # | 항목 | 결과 |
|---|---|---|
| 1 | send → pending 1건 | PASS |
| 2 | 수락 전 friend 0 | PASS |
| 3 | accept → accepted + 양쪽 friend | PASS |
| 4 | 강제 오류 mid-accept → 전체 롤백 | PASS |
| 5 | reject → rejected, friend 0 | PASS |
| 6 | cancel → cancelled | PASS |
| 7 | 중복 send → pending 1 유지 | PASS |
| 8 | 중복 accept → idempotent, friend 1+1 | PASS |
| 9 | 동시 accept 2세션 → accepted 1 + idempotent 1, friend 1+1 | PASS |
| 10 | blocked → send 거부 | PASS |

근거 로그: `tmp/bundle6-db-verify-dibay-test.out`

## 2. RLS·RPC 권한: **PASS** (결함 1건 수정 후)

- 초기 실측: anon/authenticated에 EXECUTE 잔존 (**FAIL**)
- 원인: Supabase default privileges — `REVOKE PUBLIC`만으로는 부족
- 수정: 마이그레이션에 `REVOKE … FROM anon, authenticated` 추가 → 테스트 DB 재적용
- 재실측: service_role만 EXECUTE · RLS ON · 제3자 SELECT 0 · 당사자 SELECT 1 → **PASS**

## 3. 웹·서버 기능: **CODE PASS / DEVICE NOT_PROVEN**

코드·로컬 게이트 기준 요청 CTA·중앙 팝업·닫기≠거절·받은 요청 목록·Realtime 구독·DB 재조회 경로는 구현됨. 실기기 팝업/Realtime/재접속은 **DEVICE NOT_PROVEN**.

## 4. 발견한 결함과 수정

1. **RPC EXECUTE가 anon/authenticated에 열림** → 마이그레이션 REVOKE 강화 (파일 수정 + dibay-test 재적용).

## 5. 로컬 테스트·빌드

| 게이트 | 결과 |
|---|---|
| vitest (lock/rpc 관련) | PASS (재실행) |
| 이전 typecheck/build (구현 단계) | PASS — grant-only 변경으로 무효화되지 않음 |

## 6. 운영 적용에 필요한 변경 파일

- `supabase/migrations/20261201120000_cm_mutual_friend_request_atomic.sql`
- 웹/서버 Bundle6 구현 파일 일체 (service·API·UI·LOCK·i18n·realtime)
- (문서) audit/impl/본 DB verify 보고

## 7. 운영 반영 가능 여부: **READY** (적용 자체는 미승인)

준비 완료 조건 충족:
- 격리 DB에서 원자성·RLS/RPC 실측 PASS
- 기존 Contact 백필 없음
- 실패 시: 마이그레이션 미적용 상태면 웹 API만 실패(RPC 404) — Prod 미푸시 전제
- 웹만 → Prod 배포 후 앱 재시작 (네이티브 불필요)
- **단, 운영 DB 마이그레이션·main·Prod는 Owner 별도 승인 필요**

## 8. 남은 NOT_PROVEN

- 실기기 CTA/중앙 팝업/닫기·목록
- Realtime 수신·다중 기기
- 푸시 (네이티브 미변경·의도적)
- 운영 DB 적용 후 동일 시나리오 재실측
- 거래·주문·배달 런타임 회귀 실측

**STOP.** main 병합·Production·운영 마이그레이션 적용 없음.
