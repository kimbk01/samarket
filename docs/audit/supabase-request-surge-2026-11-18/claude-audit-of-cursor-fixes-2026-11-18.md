# Supabase 일 25만 급증 — Cursor 수정(A1·B1·B2·B3·C·B4) 독립 감사

- 지시: 「커서에서 수정한 부분을 감사 · 기능·속도·누수·누락 없이 진행 여부 확인 · 레거시는 어떻게 관리되고 왜 DIBAY 구조 결함인지」 (Owner 2026-11-18)
- 성격: **감사만. 코드·DB·설정 변경 0건.**
- 조회 시각: 2026-11-18 19:52 PHT (11:52Z). main HEAD 에 #473~#478 모두 병합됨 (#477 은 auto-merge 로 병합).
- 증거 표기: CODE(병합된 diff 직접 확인) · PROD(운영 DB 읽기 전용 조회 / Supabase edge 로그 / Vercel 환경변수 이름 목록) · NOT_PROVEN

---

## 0. 결론 (먼저)

| # | 판정 | 내용 |
|---|---|---|
| 1 | **FAIL — 운영 기능 결함 (지금 열려 있음)** | **B3**: 운영 DB 에 B3 마이그레이션이 **없다**. 그런데 코드는 이전 함수가 주는 `group_participant.id` 로 「참가자 확인 완료」로 처리하고 `cleared_at = null` 로 넘긴다 → **「대화 내용 지우기」를 한 사용자에게 지운 메시지가 다시 보인다.** 현재 해당 행 2건 (PROD). |
| 2 | **FAIL — 효과 0 + 오히려 요청 1건 추가** | **B1**: 운영 DB 에 `get_store_discovery_shadow_waves_batch` **없음** (PROD). 코드는 매 순위 계산마다 batch 를 먼저 부르고 실패하면 기존 방식으로 돌아간다 → wave 왕복은 그대로 + **실패 요청 1건 추가**. 또 설정 묶음(`admin_settings`)을 **캐시 없이 매번** 읽어, 이전 15초 메모리 캐시가 맞던 경우에는 오히려 늘어난다. |
| 3 | **FAIL — 운영에서 동작 안 함** | **B4 D-3**(회원 상태 인스턴스 간 공유): Upstash Redis 전제. 운영 Vercel 환경변수 51개 중 `UPSTASH_*`·`KV_REST_*` **없음** (PROD) → 이전 5초 로컬 캐시 그대로. Cursor 자기 문서(A1)에도 「운영 Redis 없음」이라 적혀 있었다. |
| 4 | **위험 (CODE·실기 NOT_PROVEN)** | **A1**: 정리(reconcile) 전에 목록을 읽고, 정리 후 다시 읽지 않는다 → 만료된 울림 행이 한 번 응답에 실려 **유령 벨** 가능. 이전에는 목록 조회 직전에 만료 정리를 했다. |
| 5 | **규정 위반** | **C**: 부재중 통화 푸시를 포함한 「푸시 인계」를 매장 주문 cron 과 한 틱으로 합침 → 통화 변경 규정 4번(통화만 단독 커밋)·3번(영향 분석·승인) 위반. 푸시 인계가 예외로 실패하면 같은 틱의 주문 자동 취소·리마인더도 멈춘다. |
| 6 | **누락** | 하루 1위·3위 경로가 계획에 없거나 효과 없음: `profiles` 25,779/일(1위), `presence_snapshots` 11,391/일(3위·**유휴 시간 1위**). badge-count·room bootstrap·neighborhood-feed·trade-chat-list-meta 도 손대지 않음. |
| 7 | **보고 부정확** | Cursor 보고의 「B1 미적용 시 폴백/부분 효과」는 틀렸다(효과 0, 요청 +1). B3 마이그레이션은 보고에 **아예 없다**. 「C OPEN」은 조회 시점 기준 이미 MERGED. |
| 8 | **감소 원인 착오 주의** | 지금 시간당 2~5천 건으로 내려간 것은 **시험 기기 반복 실행이 멈췄기 때문**이지 수정 효과가 아니다. A1 이후 `call_sessions` 시간당 ~60건 = cron(stale-cleanup) 바닥값뿐이라 A1 효과는 **측정 자체가 안 된 상태** (NOT_PROVEN). |

**요약: 6개 PR 중 운영에서 의도대로 효과를 내는 것이 증거로 확인된 것은 0개.** 기능을 깨뜨린 것 1개(B3), 효과 없이 비용만 늘린 것 1개(B1), 운영에서 꺼져 있는 것 1개(B4 D-3).

---

## 1. 25만은 어디서 나왔나 (PROD · Supabase edge 로그 24h, 11-17 19:50 ~ 11-18 19:50 PHT)

- 합계 **247,889** = 서버(Vercel `node`) **224,969 (91%)** + 앱 직접 23,073.
- 시간당: 11-17 23:00 ~ 11-18 11:00 PHT 구간 10k~20k/시 (시험 기기 반복 실행 시간대, 기존 `root-cause-design.md` §3 과 일치) → 11-18 16:00 PHT 이후 **2.1k~5.1k/시**.
- 경로 상위 (24h):

| 순위 | 경로 | 건수 | 이번 수정이 다룬 것 |
|---|---|---|---|
| 1 | `profiles` | 25,779 | B4 일부(가입 게이트). 회원 상태(D-3)는 Redis 없어 **0** |
| 2 | `community_messenger_call_sessions` | 14,515 | A1 |
| 3 | `community_messenger_presence_snapshots` | 11,391 | **없음** (12초 heartbeat, 통화 규정 대상으로 보류) |
| 4 | `admin_settings` | 7,986 | B1 (캐시 제거로 반대 효과 가능) |
| 5 | `stores` | 7,614 | 일부 |
| 6 | `community_messenger_participants` | 7,359 | B3 (마이그레이션 미적용 → 결함) |
| 7 | `store_orders` | 6,216 | C (분당 probe 로 일부) |
| 8 | `notification_events` | 5,972 | B2 |
| … | `rpc/get_store_discovery_shadow_wave` | 3,002 | B1 (batch 미적용 → 그대로) |

- 유휴 시간(11-18 18:00~19:00 PHT, 합계 3,053) 1위: `presence_snapshots` 346, 2위 `profiles` 242, 3위 `store_orders` 155(cron). → **사용자 0명이어도 하루 약 5~7만 건 바닥.**

---

## 2. PR 별 감사

### A1 — #473 수신 목록 reconcile 30초 묶기 (통화 · MERGED 15:30 PHT)
- CODE: 매 폴링 `reconcile 전체 + 만료 정리 재호출 + 목록` → `목록 1회` + 사용자당 30초에 정리 1회(서버 인스턴스 메모리 기준).
- 결함 위험: 목록 SELECT 가 정리보다 **먼저**. 실제 울림 행이 있으면 `force` 정리를 돌리지만, 이미 읽은 행을 다시 읽지 않고 그대로 응답 → 만료된 ringing 행이 응답에 1회 실릴 수 있다. 클라이언트 `call-v4-incoming-discovery.ts` 는 시작 시각으로 거르지 않는다(지표용만). → 「무응답 타임아웃」「취소 후 재울림 없음」 행렬 항목에 직접 걸림. **실기 NOT_PROVEN**.
- 인스턴스 메모리 게이트: 서버리스 인스턴스가 여러 개면 인스턴스마다 30초 1회 → 상한은 지켜지나 전역 1회 아님(문서에 명시됨).
- 효과: PROD 에서 A1 이후 `call_sessions` 시간당 53~63건 = cron 바닥값. 맥/웹 수신 폴링이 돌지 않아 **효과 측정 불가 (NOT_PROVEN)**.

### B1 — #474 home-feed (MERGED 19:13 PHT)
- PROD: `get_store_discovery_shadow_waves_batch` 함수 **없음** (`pg_proc` 조회). 마이그레이션 `20261118160000_…_b1.sql` 미적용.
- CODE: batch 호출 실패 → 메시지에 함수 이름이 있으면 기존 wave 방식으로 다시 수행. **순위 계산 1회당 실패 요청 +1, 절감 0.**
- CODE: `loadHomeFeedAdminSettingsBundle` 은 메모리 캐시가 없다. 이전 `loadDeliveryRideTimeSource`·`loadDeliveryDistanceSettings` 는 15초 메모리 캐시가 있었다 → 바쁜 인스턴스에서는 `admin_settings` 가 **늘 수 있다.**
- CODE: 읽기 오류 시 이전엔 마지막 정상값(`distancePolicyLastGood`), 이제는 바로 fail-closed 거리 정책 → 일시 오류 때 매장 목록이 비는 쪽으로 동작 변경.
- 효과 있는 부분: 같은 요청 안 commerce 설정 중복 읽기 제거, 30일 인기 카운트 재사용(CODE). 운영 전후 측정 NOT_PROVEN.

### B2 — #475 방 진입 mark_read (MERGED 19:19 PHT)
- CODE: 원자 읽음 RPC 가 성공하면 서버가 배지 ACK 를 같이 주고 클라이언트가 `POST room-read`(~19 SB) 를 생략. ACK 실패 시 room-read 로 폴백 — **안전장치 있음**. 스크롤 ACK 경로 한 곳만 바뀜(다른 읽음 경로는 그대로).
- 판정: 코드 결함 발견 못 함. 배지 숫자 실기·운영 측정 NOT_PROVEN.

### B3 — #476 GET messages participants 재조회 제거 (MERGED 19:31 PHT)
- PROD: 운영 `community_messenger_room_access` 정의에 `participant_id`·`cleared_at` **없음** (`pg_get_functiondef`). 마이그레이션 `20261118180000_…_b3.sql` 미적용. Cursor 보고에 이 마이그레이션 언급 없음.
- CODE `viewerParticipantPreflightFromAccess`: `participantId` 가 비면 `groupParticipant.id` 로 채움 → 운영 이전 함수도 `group_participant.id` 를 주므로 preflight = `{id, cleared_at: null}` → participants 재조회 **생략** → `participantHistoryFloorIso` 하한 없음.
- 코드 주석 「미적용 DB면 null → 기존 조회」는 **사실과 다르다**.
- 영향: 「대화 내용 지우기」 후 그 방을 열면 지운 메시지가 다시 보인다. PROD: `cleared_at` 있는 활성 참가 행 **2건** (전체 3,249). 화면 재현은 하지 않음(운영 계정 조작 필요) → 화면 FAIL 은 NOT_PROVEN, 코드·DB 조건은 확인.
- 고치는 방법(Owner 결정): ① B3 마이그레이션 운영 적용(운영 DB 적용 승인 필요) 또는 ② 폴백을 `participantId` 가 있을 때만 쓰도록 되돌리기. ①만 하면 해소되나, 승인 전까지는 결함이 열린 상태.

### C — #477 cron 분당 틱 · 광고 probe (MERGED)
- CODE: 1분 cron 3개(푸시 인계·접수 리마인더·접수 타임아웃) → 1개. 주문 대기 없으면 probe 1회로 끝. 광고 promoter 는 due 없으면 6스캔 생략. 방향은 맞다.
- 규정: 푸시 인계(`claimChatPushHandoffEvents` — 채팅·**부재중 통화** 푸시)를 매장 cron 과 묶음 → 통화 변경 규정 1·3·4번 대상인데 단독 PR·영향 분석 없음.
- 결합 위험: 푸시 인계가 예외를 던지면 같은 틱의 주문 자동 취소·리마인더가 실행되지 않는다(이전엔 별도 cron).
- 감소량: 바닥 부하 중 cron 분은 시간당 수백 건 수준 → 25만 대비 영향 작음.

### B4 — #478 Auth (MERGED 19:46 PHT)
- D-2(가입 완료 기억·prefetch 생략): 운영에서 동작. 가입 게이트 `profiles`·동의 버전 조회 감소 기대(측정 NOT_PROVEN).
  - 주의: prefetch 에서 게이트를 건너뛰므로, 가입 미완료 사용자가 prefetch 된 화면 데이터를 받는 경우가 생긴다. 실제 이동 때 다시 확인한다는 전제는 Next 라우터가 prefetch 결과를 그대로 쓰는 경우 성립하지 않을 수 있음 (CODE·PLAUSIBLE).
- D-3(회원 상태 Redis 공유): 운영 Redis 없음 → **미동작**(이전 5초 로컬 그대로). 하루 1.1만 건 이상 회원 상태 조회 그대로.
- 나중에 Redis 를 켜면 생기는 위험: 키에 만료가 없고, 무효화가 `void`(기다리지 않음)이며, DB 읽기→Redis 쓰기 사이에 차단이 일어나면 **차단 전 상태가 무기한 남을 수 있다**. 또 매 API 마다 Redis 왕복이 추가된다(로컬 캐시를 먼저 보지 않음 → 지연 증가). Redis 를 켜기 전에 재설계 필요.

---

## 3. 레거시는 어떻게 관리됐고, 왜 DIBAY 구조 결함인가

### 3-1. 레거시 (수신 통화) — CODE `lib/community-messenger/incoming-call-ui-policy.ts:21`
`shouldRunIncomingCallBackupHttpRequest`:
- 울리는 중 → HTTP 백업 허용
- 창이 뒤에 있으면 → **HTTP 0**
- Realtime 정상(`realtimeOk`) → **HTTP 0**
- Realtime 비정상일 때만 ~2.4초 백업

즉 **Realtime 이 주 경로, HTTP 는 고장 났을 때만**. 사용자가 늘어도 HTTP 는 늘지 않는다.

### 3-2. 현재 DIBAY V4 — CODE `call-v4-incoming-discovery.ts:47` `CALL_V4_INCOMING_POLL_REALTIME_HEALTHY_MS = 10_000`
- Realtime 이 정상이어도 **10초마다 HTTP** (11-08 Owner S4: 「SUBSCRIBED 만으로 폴링 0 불승인」)
- 그 HTTP 1회가 서버에서 `call_sessions` **5회**(A1 이전) — 정리 작업을 조회 API 에 붙여 둔 구조
- 맥 iOS 앱은 PushKit 이 없어 이 폴링이 유일한 벨 → 켜 두면 1대당 시간 ~1,800 SB(A1 이전)

### 3-3. 왜 「구조」 결함인가 (테스트라서가 아니라)
같은 패턴이 앱 전체에 반복된다 — **화면/요청 1번 = Supabase 여러 번**, **상시 주기 호출**, **서버 인스턴스마다 따로인 캐시**.

| 구조 | 근거 | 사용자 수에 대한 증가 |
|---|---|---|
| 조회 API 안에 정리·쓰기 작업 | incoming 1회 = 5 | 기기 × 시간 |
| 요청 1회당 다중 왕복 | home-feed 16.6 · room-read 19 · rooms 15.4 · trade-chat-list-meta 14.9 (기존 측정) | 화면 이동 × 배수 |
| 상시 주기 | presence 12초 · cron 23개 | 켜 둔 기기 × 시간 + 고정 바닥 |
| 서버리스 인스턴스 메모리 캐시 | 회원 상태 5초 · A1 게이트 | 인스턴스 수만큼 무력화 |
| 앱 실행 1회 비용 | 약 195 SB (기존 측정) | 실행 횟수 |

오늘 25만의 89% 는 시험 기기 2대의 677회 반복 실행이지만, **실행 1회 = 195건**이라는 단가가 구조다. 실사용자 1,000명이 하루 3번 앱을 열면 시험 없이도 약 58만 건이다(산술, 측정 아님).

---

## 4. 남은 위험·Owner 결정 필요 (규정상 작업자가 정할 수 없는 것만)

1. **B3 결함 해소** — 운영 DB 마이그레이션 `20261118180000_community_messenger_room_access_cleared_at_b3.sql` 적용 승인, 또는 코드 폴백 되돌림. **지금 열린 기능 결함이라 1순위.**
2. **B1** — 마이그레이션 `20261118160000_store_discovery_shadow_waves_batch_b1.sql` 적용 승인 + 설정 묶음에 캐시 복원(코드). 적용 전까지는 B1 이 요청을 늘린다.
3. **B4 D-3** — Redis 를 운영에 붙일지(설정 변경 승인). 붙이기 전에 만료·경합 재설계 필요.
4. **A1** — 실기 행렬(V-5 무응답·취소 후 재울림) 확인. 유령 벨 위험은 코드로 확인됨.
5. **C** — 통화 푸시 인계를 매장 cron 과 묶은 것: 통화 규정에 따라 분리 여부 결정.
6. **누락** — presence 12초(유휴 1위)·badge-count·bootstrap 은 이번 계획 밖. 다룰지 결정.

## 5. 이번 감사에서 확인 못 한 것 (NOT_PROVEN)
- 각 PR 의 운영 전후 「요청 1회당 SB」 — 배포 직후이고 유입이 적어 측정 불가.
- B3 화면 재현, A1 유령 벨 실기 재현 (운영 계정·실기기 조작 필요, 지시 범위 밖).
- B2 배지 숫자 실기.
- 앱 직접 호출 23,073건의 경로별 분해.

## 6. 조회 기록 (작업자 운영 조회)
- 운영 DB(읽기 전용, `begin read only … rollback`): `pg_proc` 함수 존재 1회, `pg_get_functiondef` 1회, participants `cleared_at` 집계 1회.
- Supabase edge 로그 6회, Vercel 환경변수 **이름** 목록 1회(값 미열람).
- 운영 사이트·앱 실행 0회.
