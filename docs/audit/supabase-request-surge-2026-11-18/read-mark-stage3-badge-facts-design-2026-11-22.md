# 읽음 3단계 — 배지 계산 입력 3번 → DB 함수 1번 · 설계 (2026-11-22 PHT)

- 지시: Owner 「다음으로 넘어 가자」 → 재감사 §8 「읽음 2·3단계」의 3단계(`read-mark-legacy-design-2026-11-19.md` §3).
- 근거: 코드(main `d83e768`) · Vercel 관측 2026-11-20 00:00 ~ 11-22 02:00 UTC · 운영 함수(읽기 전용). 운영 변경 없음.
- 확인: #554 병합 2026-11-22 10:43 PHT · 운영 `/api/app/web-version` = `d83e768` (10:46 PHT 1회) — #553·#554 포함.

## 0. 규정 충돌 (먼저 보고 — 허위 보고 금지 7번)
- 이 설계는 배지 **계산기(Builder)의 입력 읽기**를 바꾼다. 코드 잠금 두 곳과 충돌한다:
  - `lib/notifications/pipeline/domain-badge-read-ack.ts` 머리말 **P3-a LOCK** 「DO NOT: change Builder / Projection Authority / Boot / Poll / Engine」
  - `build-domain-badge-authority-http.ts` 머리말 P2 「RoomUnread writer 재개봉 금지」(이 설계는 writer 를 바꾸지 않음 — 읽기만)
- D2 2-c(11-19)도 같은 계산기의 입력을 바꿨다(그때 Owner 승인). 이번에도 **잠금 재개봉 승인이 필요**하다. 승인 없이는 구현하지 않는다.
- 계산식·응답 필드·숫자는 바꾸지 않는다(입력을 1번에 받아 같은 로더·같은 계산 함수에 넣음).

## 1. 원래 3단계 계획과 다른 점
| 원래 계획(11-19) | 이번 설계 | 이유 |
|---|---|---|
| ① 읽음 응답 배지를 읽음 RPC 가 함께 돌려줌 | **배지 계산 입력 3번을 함수 1번으로** — 읽음 응답만이 아니라 배지를 계산하는 모든 곳(배지 숫자 API·읽음 응답·보내기·사진·부재중 통화)이 함께 줄어든다 | 응답 배지는 필드가 많아(분류 수·부재중 방·설명 행렬…) 읽음 RPC 가 대신 만들면 계산기를 SQL 로 다시 짜야 함 → 두 곳 갈라짐 위험 |
| ② 홈·허브 사본을 그 방 숫자만 갱신 | **이번에 하지 않음**(측정 먼저) | 읽음 뒤 사본 재생성(실측 읽음 1번당 약 2.0)은 「바뀜 표시」로 미뤄도 사용자가 곧 홈을 열면 그때 다시 만든다 — 줄어드는 양을 증거로 말할 수 없음(NOT_PROVEN) |

## 2. 실측 (Vercel · 11-20 하루 · 평일)
| 배지 계산 입력 | 무엇 | 11-20 호출 |
|---|---|---|
| `rpc/get_member_unread_room_inputs` | 안 읽은 방 입력(D2 표) | 배지 숫자 API 856 · 읽음 388 · 보내기 181 · 사진 25 · 스티커 15 · 기타 |
| `notification_events` | 안 읽은 알림 행(최대 2000) | 같은 수(배지 숫자 API 937 — 일부 다른 조회 포함) |
| `stores` (`owner_user_id`) | 소유 매장 id | 같은 수 |
- 배지 계산 1번 = 입력 3번(+ 사장님이면 매장마다 RPC · 상한에 닿으면 추가 조회). 11-20 계산 약 **1,500번 → 입력 약 4,500 호출**.
- 읽음 1번(2단계 뒤 예상 7.6) 중 응답 배지 입력이 약 2.6.

## 3. 설계
| 항목 | 내용 | 파일 |
|---|---|---|
| B-1 새 DB 함수 | `get_member_badge_facts(p_user_id uuid, p_bell_limit int default 2000)` → jsonb `{inputs, bell_rows, owned_store_ids}` — ① `member_unread_room_inputs` 그 사람 행 전부(지금 RPC `select *` 와 같음) ② 안 읽은 알림 행: 같은 조건·같은 열·`created_at desc`·상한 1~2000 ③ `stores.id where owner_user_id = 사람 limit 50`(지금과 같음). `stable` · SECURITY INVOKER · service_role 전용 | `supabase/migrations/…_get_member_badge_facts.sql` |
| B-2 계산기 | 시작할 때 B-1 을 1번 부르고, 세 결과를 **지금 로더 자리에 그대로** 넣는다(안 읽은 방 → `memberUnreadRoomInputsToLoaderInput` → 기존 로더 · 알림 행 → `deriveBellBadgeFactsFromRows` · 매장 id → `loadOwnerOperationOFacts` 의 매장 목록). 함수 없음·오류 → 지금 3번 경로 | `build-domain-badge-authority-http.ts` · `load-owner-operation-o-facts.ts`(매장 목록을 받는 인자 추가) |
| 유지 | 계산식(`computeMemberAppIconFromFacts` 등) · 응답 필드 · 사장님 매장별 RPC · 알림 행 상한 초과 시 추가 조회 · 10% 표본 감시 | — |
- 효과: 배지 계산 1번당 −2 → 11-20 기준 하루 약 **−3,000 호출**. 읽음 1번 약 7.6 → **약 5.6**. 배지 숫자 API 1회당 약 3.4 → 약 1.4.

## 4. 영향·위험
| 항목 | 내용 |
|---|---|
| 영향받는 화면·호출처 | 배지를 계산하는 모든 곳(`fetchDomainBadgeAuthorityPayload` 를 부르는 곳: 배지 숫자 API·읽음 응답 5개 라우트·메시지 보내기·사진·스티커·부재중 통화 푸시·관리자 감시). 응답 모양·숫자 무변경이어야 함 |
| 통화 | 부재중 통화 푸시 배지가 같은 계산기를 쓴다 → **통화 변경 규정 대상**(규정 1번 「서버 통화·푸시 코드」). 계산식·푸시 페이로드 불변 · 단독 PR · 실기 항목에 부재중 통화 배지 포함 |
| 회귀 위험 | ① 함수가 사람별 쿼리와 다른 행을 돌려주면 모든 배지 숫자가 바뀜 → 운영 되돌림 시험: 사용자 수백 명으로 세 결과를 사람별 쿼리와 행 단위 대조 + TS 단위: 같은 입력이면 같은 응답 ② 응답 크기(알림 행 최대 2000) — 지금도 같은 양을 읽음 |
| 운영 DB | 함수 1개 추가(Owner 승인) |
| 롤백 | Instant Rollback(함수 없으면 지금 경로) · 함수는 안 써도 무해 |
| 실기 | 배지 숫자(앱 아이콘·종·메신저 탭) 반영 전후 같음 · 읽음 뒤 감소 · 부재중 통화 뒤 배지 · 사장님 계정 운영 수 |
| 반영 | 메신저·알림 공용 + 통화 규정 → 단독 PR · 배포 전 보고 · Owner 병합 지시 뒤 · DB 함수 병합 전 적용 |

## 5. Owner 승인 필요
1. P3-a LOCK(계산기 입력 읽기) 재개봉.
2. 설계 B-1·B-2 구현.

## 6. NOT_PROVEN
- 사본 재생성(§1 ②)을 미뤘을 때 실제 감소량.
- 주말·평일 차이(11-21 은 11-20 의 약 20%) — 하루 감소량은 평일 기준.

## 7. 구현·검증 (2026-11-22 · Owner 「LOCK 재개봉·구현 승인」)
- DB 함수 `supabase/migrations/20271122110000_get_member_badge_facts.sql` · 로더 `lib/notifications/badge-authority-rebuild/load-member-badge-facts.ts`(함수 없음이면 5분 동안 지금 경로) · 계산기 3곳 연결 · `loadOwnerOperationOFacts` 매장 목록 인자 · P3-a LOCK 머리말에 재개봉 기록.
- **운영 되돌림 시험**(함수 생성 뒤 rollback · 읽기만): 사용자 134명(입력 많은 사람·알림 많은 사람·사장님·무작위) — 지금 사람별 쿼리 3개와 함수 결과 **불일치 0**(입력 0 · 알림 행 0 · 매장 0). 사장님 17명 · 입력 있는 사람 36명 · 알림 행 있는 사람 127명.
- DB 안 실행 시간: 함수 1번 평균 약 4ms(첫 호출 포함) vs 사람별 쿼리 3개 합 평균 약 0.6ms — 대신 서버↔DB 왕복이 3번 → 1번.
- 반영: 통화 규정 대상(부재중 통화 배지) · 메신저·알림 → 자동 병합 등록 안 함. 병합 전 DB 함수 적용(Owner 승인).
