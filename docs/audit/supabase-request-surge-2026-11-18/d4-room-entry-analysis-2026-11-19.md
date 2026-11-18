# D4 — 메신저 방 진입 · 구조 분석 (2026-11-19)

- Owner 「D4 먼저」(2026-11-19, D6 측정 13건 보고 뒤). 상위: `structural-defects-vs-legacy-2026-11-19.md` D4.
- 상태: **분석만 · 구현 없음.** 메신저 hard-lock · 운영 DB 적용(RPC) 승인 대상.
- 측정 창: Vercel **11-18 00:00~18:00 UTC (08:00~02:00 PHT, 조회 시각까지)**. 하루 전체 아님.
  B2(#475 방 진입 mark_read)는 11:19 UTC 병합 → 이 창의 대부분은 B2 **이전**. B2 이후(12~18 UTC)는 표본이 작아 판정 못 함(§5).

## 1. 결론

방에 1번 들어가면 서버 API 3~5개, Supabase 약 **25~42건**. 가장 큰 덩어리는 **화면 데이터가 아니라 「읽음 처리 + 배지 재계산」** 이다.

| 방 진입 때 부르는 API | 호출 | Supabase | 1회당 | 하는 일 |
|---|---|---|---|---|
| `GET rooms/[roomId]/bootstrap` | 1,128 | 4,304 | **3.8** | 권한·방 스냅샷·1:1 관계·그룹 차단·접속 |
| `GET rooms/[roomId]/messages` (+ POST 전송 섞임) | 612 GET · 101 POST | 10,008 | GET·POST 분리 불가 | 메시지 목록·이어받기 / 전송 |
| `PATCH rooms/[roomId]` (mark_read) | 202 | 3,158 | **15.6** | 읽음 + **배지 전체 재계산** |
| `POST me/notifications/room-read` | 200 | 3,831 | **19.2** | 읽음 + **배지 전체 재계산** (PATCH 뒤 폴백) |
| `GET rooms/[roomId]/peer-relation` | 233 | 700 | 3.0 | 1:1 상대 관계 (bootstrap 과 같은 RPC 재호출) |
| `.rsc` 페이지 | 1,369 | ≈0 | 0 | Supabase 없음 — 결함 아님 |

## 2. 결함 (코드·측정 근거)

### D4-a. 읽음 1번 = 배지 전체 재계산 2번 (가장 큼)
- `PATCH` mark_read 성공 후 `issueDomainBadgeAuthorityForAck` — 배지 로더 전부(허브 카운터·사장님 허브·거래 스냅샷·홈 동기 스냅샷·주문·매장) 재실행 (`app/api/community-messenger/rooms/[roomId]/route.ts:319-324`).
- 클라는 `roomReadFollowUp==="skip"` 이고 ACK 적용 성공일 때만 `room-read` 를 건너뛴다(`use-messenger-room-open-mark-read-effect.ts:818-826`). 아니면 `room-read` 가 **같은 재계산을 한 번 더**(`app/api/me/notifications/room-read/route.ts:37-38`).
- 측정: PATCH 202 ↔ room-read 200 (거의 1:1) → B2 이전엔 거의 항상 2번. 합계 **약 35건/읽음**.
- 레거시: 읽음 = 서버에 읽은 위치 1건 + 응답에 새 안 읽음 수(카운터). 배지를 원본에서 다시 세지 않는다.
- **D2 와 같은 뿌리.** D2 2단계(카운터 읽기)가 되면 ACK = `get_member_badge_counters` 1건.

### D4-b. 권한을 API 마다 다시 확인
- `community_messenger_room_access` RPC: bootstrap 1,120 · messages 707 · PATCH 192 — 방 1번 들어가는데 2~3번.
- `community_messenger_participants` 직접 조회: bootstrap 880 · messages 713 · peer-relation 233 · room-read 200.
- `community_messenger_direct_pair_facts`: bootstrap 683 + peer-relation 233 (같은 값 두 번).

### D4-c. 메시지 목록 = 표마다 따로 조회
- messages 라우트 안에서 `profiles` 779 · `message_user_hides` 618 · `rooms` 606 · `room_messages_after` 390 · `messages` 324 · `reactions` 227 · `user_settings` 296 · `user_social_relations` 295 를 따로 읽는다.
- 같은 라우트에 전송(POST)의 알림 경로(`notification_events` 594 · `user_sessions` 352 · `notification_deliveries` · `user_devices` · 허브 배지 · 스냅샷 무효화)도 섞여 있다 — **GET/POST 분리 실측 NOT_PROVEN** (Vercel 지표가 바깥 호출을 메서드별로 못 나눔). 전송 1건 단가는 별도 측정 필요.

## 3. 목표 구조 (레거시와 같은 형태)

| # | 바꿀 것 | 지금 → 목표 (1회당 Supabase) | 의존 |
|---|---|---|---|
| ① | 읽음 ACK 의 배지 = 카운터 1건 (`get_member_badge_counters`) · room-read 폴백 제거 | 15.6 + 19.2 → **≈2** | **D2 2단계**(그림자 불일치 0 확인 뒤) |
| ② | `room_entry` RPC 1개: 권한 + 방 스냅샷 + 1:1 관계 + 그룹 차단 + 접속 + 첫 메시지 페이지(숨김·반응·보낸 사람 이름 포함) | bootstrap 3.8 + peer-relation 3.0 + 첫 messages GET → **1** | 운영 DB 적용 승인 → 적용 확인 → 코드 병합 |
| ③ | `room_messages_page` RPC 1개: 이전 대화·이어받기 (권한 포함) | 표 8개 → **1** | ② 와 같은 마이그레이션 |
| ④ | 전송 경로 단가 실측 후 별도 판단 | NOT_PROVEN | 전송 = 알림·푸시 → 통화 공유 파이프라인 확인 필요 |

목표 합: 방 진입 1회 **약 25~42 → 약 3** (②1 + ①2). 산술 — 구현 후 같은 지표로 전후 비교해야 완료.

## 4. 순서 · 영향

1. **② ③ 먼저** (D2 와 독립). 마이그레이션 → 운영 적용(승인) → RPC 결과가 지금 라우트 응답과 같은지 운영에서 그림자 비교(D2 와 같은 방식) → 라우트 전환.
   - 영향 화면: 1:1·그룹·거래·주문 채팅방 진입, 이전 대화 불러오기, 방 목록에서 미리 받기(prewarm).
   - 응답 모양은 지금 그대로 유지 → 클라 변경 최소. 응답 계약 테스트로 고정.
2. **①** 은 D2 그림자 로그에서 불일치 0 확인 뒤(D2 2단계와 같은 PR).
3. 메신저 hard-lock: `docs/community-messenger-mobile-room-viewport.md`·방 메시지 기본 계약은 건드리지 않음(데이터 경로만).

## 5. NOT_PROVEN

- B2 이후 PATCH↔room-read 비율: 12~18 UTC 창에 PATCH 1 · room-read 0 — 표본 부족.
- messages 라우트 GET/POST 각각의 단가.
- 하루 전체(24시간) 값, 회원별 방 진입 횟수.
