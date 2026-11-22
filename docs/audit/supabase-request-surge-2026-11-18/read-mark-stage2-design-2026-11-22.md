# 읽음 2단계 — 방 종류·끝 메시지를 읽음 DB 함수 안에서 · 설계 (2026-11-22 PHT)

- 지시: Owner 「다음으로 넘어 가자」 → 재감사 §8 남은 부분 첫 항목 「읽음 2·3단계」(`read-mark-legacy-design-2026-11-19.md` §3).
- 근거: 코드(main `78f80ba`) · 운영 함수 정의(읽기 전용) · Vercel 관측 2026-11-20 00:00 ~ 11-22 02:00 UTC(1단계 #523 반영 뒤). 운영 변경 없음.
- 확인: #553 은 이 시각(10:16 PHT) 아직 병합 전 · 운영 `78f80ba`.

## 1. 지금 읽음 1번 (Vercel 실측 · 읽음 PATCH 498번)
| 호출 | 1번당 | 무엇 | 단계 |
|---|---|---|---|
| `rpc/community_messenger_room_access` | 0.94 | 권한 | 유지(보안) |
| `community_messenger_rooms` | **0.89** | 방 종류·식별 키 `loadRoomDomainForUnreadAuthority` | **2단계** |
| `community_messenger_messages` | **0.87** | 끝 메시지 `resolveRoomReadableTipMessageId`(중복 방지 키용) | **2단계** |
| `rpc/dibay_mark_room_read_atomic` | 0.87 | 읽음 기록 | 유지 |
| `notification_events`·`stores`·`rpc/get_member_unread_room_inputs`·`count_notification_events_badge` | 0.96+0.87+0.87+0.09 | 응답 배지 다시 계산 | 3단계 |
| 홈 사본 2·워터마크·방송·허브 사본·허브 카운터 | 각 약 0.4 (바뀐 읽음만) | 사본 재생성 | 3단계 |
| `profiles` 0.35 · `user_sessions` 0.24 · 참가자 0.08 · 기타 | 0.7 | 인증·방 확인 | 범위 밖 |
| **합계** | **9.4** | | |
- 1단계(#523) 전 7일 평균은 13.2 였다(같은 방식 · 11-16~).

## 2. 확인한 사실
| 사실 | 근거 |
|---|---|
| 서버가 방 종류·식별 키를 따로 읽어 넘기고, 읽음 함수는 같은 방 행을 **다시 읽어(FOR UPDATE) 같은지 비교**만 한다 | `service.ts` `markCommunityMessengerRoomAsRead` · 운영 `dibay_mark_room_read_atomic` 정의(`domain_mismatch`·`identity_mismatch` 검사) |
| 끝 메시지는 중복 방지 키 `cm_mark_read:<사용자>:<방>:open:<끝 메시지 id>` 를 만드는 데만 쓴다(방 열기·커서 없음일 때) | `room-unread-authority-rpc.ts` `buildCmMarkReadIdempotencyKey` |
| 서버는 서비스 권한 클라이언트로 부른다 | `lib/chat/supabase-server.ts` `getSupabaseServer`(service key) |
| 배달·매장 주문(`store_order`)·식별 키 없는 방은 이 함수를 쓰지 않고 이전 경로로 간다 | `service.ts` (`domainMeta` null 또는 `store_order`) |

## 3. 설계
| 항목 | 내용 | 파일 |
|---|---|---|
| R2-1 새 DB 함수 | `dibay_mark_room_read_atomic_auto(p_viewer_id, p_room_id, p_read_through_message_id)` — ① 방 행에서 종류·식별 키 ② 종류가 일반 1:1·그룹·거래가 아니거나 식별 키 없음 → `{ok:false, error:'unsupported_domain'}`(아무것도 안 씀) ③ 커서 없음이면 끝 메시지 id(같은 조건: 삭제 안 됨 · `created_at desc, id desc` · 없으면 `empty`) ④ **같은 형식의 중복 방지 키** ⑤ 기존 `dibay_mark_room_read_atomic` 을 그대로 부름(역할 `member`) · 결과 그대로 반환. 서비스 권한 전용 · SECURITY INVOKER | `supabase/migrations/…_dibay_mark_room_read_atomic_auto.sql` |
| R2-2 서버 | 읽음에서 새 함수 1번. `unsupported_domain` → 지금 이전 경로 그대로 · 함수 없음(DB 적용 전) → 지금 3번 경로 그대로 | `lib/community-messenger/service.ts` · `room-unread-authority-rpc.ts` |
| 유지 | 권한 RPC · 읽음 기록 함수 본문 · 응답·사본·방송(3단계) | — |
- 효과(실측 기준): 읽음 1번 **9.4 → 약 7.6**(−1.76). 하루 읽음 약 230~450번 → 하루 약 400~800 호출 감소.
- 3단계(응답 배지·사본 약 5.2)가 더 크다 — 2단계 뒤 별도 설계(P3-a LOCK 재개봉 대상).

## 4. 영향·위험
| 항목 | 내용 |
|---|---|
| 영향받는 화면·호출처 | 방 들어가기·읽음(1:1·그룹·거래). 응답 모양·숫자·방송 무변경. 배달 주문 채팅 무관(이전 경로) |
| 바뀌는 동작 | 방 종류·끝 메시지를 DB 안에서 읽음. 끝 메시지 읽는 시점이 서버 조회 → 함수 안(같은 요청 안, 잠금 전 — 지금과 같은 순서) |
| 중복 방지 키 | 같은 형식 → 배포 전후 같은 읽음은 같은 키(재생 동작 유지). 클라이언트가 대문자 id 를 보내면 키 글자가 달라질 수 있음(새 키로 1번 더 기록 — 결과 같음, 화면 영향 없음) |
| 통화 | 무관(통화·푸시 코드 무변경) |
| 운영 DB | 함수 1개 추가(Owner 승인) · 기존 함수 무변경 |
| 롤백 | Instant Rollback(서버는 함수 없으면 지금 경로). DB 함수는 안 써도 무해 |
| 검증 | 단위: 키 형식 동일 · unsupported/함수 없음 폴백 · 결과 매핑. 운영 되돌림 시험: 실제 방 몇 개로 「서버 3번 경로」와 「새 함수」의 키·결과 대조(트랜잭션 rollback). 실기: 방 들어가기(안 읽음 → 0) · 다시 들어가기 · 목록·배지 숫자 |
| 반영 | 메신저 PR — 배포 전 보고, Owner 병합 지시 뒤 · DB 함수는 병합 전에 적용(승인) |

## 5. NOT_PROVEN
- 하루 읽음 수는 주말·평일 차이가 커서(11-20 450번 · 11-21 48번) 감소량은 범위로만 적음.
- `profiles`·`user_sessions`(0.6/번) 호출 위치 — 이번 범위 밖.

## 6. 구현·검증 (2026-11-22 · Owner 「구현 승인」)
- 새 DB 함수 `supabase/migrations/20271122100000_dibay_mark_room_read_atomic_auto.sql` · 서버 `markRoomReadAtomicAuto`(`room-unread-authority-rpc.ts`) · 읽음 경로(`service.ts`)는 새 함수 먼저, `missing` 일 때만 지금 3번 경로, `unsupported` 면 이전 경로.
- **운영 되돌림 시험**(함수 생성·호출 뒤 rollback, 서비스 권한): ① 방 열기 — 최근 방 참가자 40쌍, 지금 서버 3번 경로 결과 vs 새 함수 결과 **40/40 같음** ② 커서 — 안 읽음 있는 20쌍 + 배달 주문 5쌍, **25/25 같음**(실제 읽음 진행 20 · 배달 주문 5 → `unsupported_domain`).
- 반영: 메신저 PR — 자동 병합 등록 안 함. 병합 전 DB 함수 운영 적용(Owner 승인).
