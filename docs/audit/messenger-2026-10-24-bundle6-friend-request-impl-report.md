# §2 묶음 6 친구 요청 — 구현 보고 (로컬·마이그레이션 파일만)

- 작성: 2026-10-24 ~03:00 PHT
- Owner: G1·G2 승인 후 웹 코드·DB 마이그레이션 파일·격리 검증만 · **운영 DB 적용·main·Prod·네이티브 금지**

`[배포 구분] 웹만 — Vercel 배포 후 앱 재시작만 하면 반영 (재빌드 불필요)` — 단, 본 작업은 **main 미반영** (Owner 별도 승인 후).

---

## 원인

Contact LOCK이 단방향 즉시 저장이었고, 수락/거절 API는 `friend_request_retired` 410, GET 요청 목록은 빈 배열이라 §5-6 상호 요청 모델이 불가능했다.

## 수정 (범위)

| 영역 | 내용 |
|---|---|
| DB 파일 | `supabase/migrations/20270625120000_cm_mutual_friend_request_atomic.sql` — `cm_send/accept/reject/cancel_friend_request` (accept = FOR UPDATE + 양쪽 friend upsert + accepted, 실패 시 RAISE 롤백) |
| API | `friend-requests` GET/POST·PATCH/DELETE·respond-incoming·cancel-outgoing 재활성 · `relations/friend` POST → send request |
| Service | `send/list/respond/cancel` 복구 · 수락 전 friend 행 생성 금지 |
| LOCK | `friend-contact-ssot-lock.md` + vitest 최소 개정 |
| UI | CTA「친구 요청 보내기」/「수락 대기 중」·중앙 팝업·받은 요청 진입점+뱃지 · 닫기≠거절 |
| Sync | home realtime `community_friend_requests` · 친구 탭 hydrate 시 GET 재조회 |

## DB 원자성 실측

| 항목 | 결과 |
|---|---|
| 마이그레이션 SQL 계약 (양쪽 INSERT + accepted + EXCEPTION RAISE) | **CODE PASS** (vitest marker) |
| 운영/격리 DB에서 실제 txn 롤백 실행 | **NOT_PROVEN** (운영 적용 금지 · dibay-test 미사용) |

## 테스트

| 게이트 | 결과 |
|---|---|
| vitest (lock + rpc parser + CTA + client) | **PASS** (27) |
| eslint (신규/핵심 변경 파일) | **PASS** (error 0) |
| `typecheck:build` | **PASS** |
| `npm run build` | **PASS** |
| `verify:i18n-key-exposure` | (실행) |

## 미검증 (NOT_PROVEN)

- 운영 DB 마이그레이션 적용 · RPC 실기기 호출
- Realtime 팝업 실기기 · 다중 기기 동시 수락
- 푸시(네이티브 미변경 · 의도적)
- 거래·주문·배달 런타임 회귀 실측 (코드 경로 INSERT 금지 계약만 PASS)
- main / Production

## 명시적 비수행

운영 DB 적용 · main 병합 · Production · 네이티브 · 백필 · 묶음 1~5/7/SIDE/통화

**STOP.** 운영 반영은 Owner 별도 승인 후.
