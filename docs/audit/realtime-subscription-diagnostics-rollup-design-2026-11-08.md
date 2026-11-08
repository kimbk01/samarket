# 실시간 구독 실패 진단 보강 설계 (D1) — 2026-11-08

> 상태: **설계만** · 구현·배포 전 Owner 승인 필요 (Owner 「설계 작성」 2026-11-08 23:3x PHT)
> 관련: `docs/audit/supabase-request-surge-design-supplement-2026-11-08.md` §7 (U1 집계 보존)

## 0. 왜 필요한가 (확인된 사실만)

| # | 사실 | 증거 (2026-11-08) |
|---|---|---|
| F1 | Android 앱에서 실시간 구독 실패가 계속 집계된다 (E2) | `cm_monitoring_rollup_hourly`: android `channel_subscribe/error` 20시대 61건(+버린 38) · 23시대 6건 |
| F2 | 아이폰(iOS 18.7)이 16:02:28~18:38:33 PHT 동안 초당 87건 이상의 이벤트를 만들었다 | Vercel 요청 기록: `monitoring/events` POST 분당 217~232회 × 당시 24개 단위 전송 |
| F3 | 폭주 중 아이폰은 서버 요청이 없었다(접속 상태 신호만). 코드 31곳 추적 결과 이 조건을 만족하는 1순위 후보 = 실시간 구독 결과 이벤트 | 요청 기록 + 코드 추적(94c563a80) |
| F4 | 실시간 서버 오류: 18:38:38 「구독 연결 풀 DB 시간 초과」 4건, 21:34 DB 연결 끊김 1건, 21:51·23:01·23:12 「Presence 요청 한도 초과」 3건 | Supabase realtime_logs |
| F5 | **원인을 못 찾는 이유:** 집계 키가 `(category, metric, outcome, platform)` 뿐이라 어느 채널이 어떤 상태(오류·시간 초과·끊김)로 실패했는지 남지 않는다. 버린 이벤트도 `category:metric` 으로만 센다. Android·iOS 배포판은 화면 로그를 읽을 수 없다 | `monitoring-rollup.ts`, `client.ts` bumpDropped, adb(devtools 없음) |

E2 원인과 아이폰 폭주 원인은 모두 **NOT_PROVEN**. 이 설계는 원인을 고치는 것이 아니라 **원인을 증거로 확정하기 위한 진단 보강**이다.

## 1. 변경 내용

### 1-1. 실시간 구독 결과 이벤트의 집계 키 세분화

- 대상 이벤트: `category = realtime.subscription`, `metric = channel_subscribe` (발생원은 `subscribe-with-retry.ts` 2곳뿐 — 성공 1·실패 1).
- 이벤트 자체(라벨 포함)와 메모리 집계·SLO 계산은 **그대로 둔다**. DB 집계 행의 `metric` 만 아래 형식으로 세분화한다.

```
channel_subscribe.<채널 종류>.<상태>.<단계>
  채널 종류: 아래 고정 표 (ID 없음)
  상태: subscribed | channel_error | timed_out | closed | unknown
  단계: initial | retry
예) channel_subscribe.presence.channel_error.retry
```

- 채널 종류는 `labels.scope` 를 **접두어 고정 표**로 바꾼다. 표에 없으면 `other`. 사용자 ID·글 ID·방 ID 는 절대 키에 들어가지 않는다.

| scope 접두어 (운영 코드 전수 19종 — 2026-11-09 정정) | 채널 종류 |
|---|---|
| `community-messenger:presence-runtime` | `presence` |
| `call_v4_incoming` | `call_incoming` |
| `community-messenger-incoming-call` (`GlobalCommunityMessengerIncomingCall` → 수신 전화 holder 경유) | `call_incoming_legacy` |
| `community-messenger-call-client:session` | `call_session` |
| `community-messenger-call-client:hangup-signal` | `call_hangup` |
| `community-messenger-group-call:session` | `group_call` |
| `community-messenger:call-logs` | `call_logs` |
| `community-messenger-home:meta` | `home_meta` |
| `community-messenger-home:rooms-in` | `home_rooms` |
| `community-messenger-room:global-bundle` | `room_bundle` |
| `community-messenger-unread-sound:` | `unread_sound` |
| `cm-room-friendship:friend-requests-global` | `friend_requests` |
| `cm-home:posts-trade-meta:` | `home_trade_meta` |
| `chat-list:posts-listing:` | `chat_post_listing` |
| `post-seller-listing:` | `post_seller_listing` |
| `trade-chat-presence:` | `trade_presence` |
| `trade-post-listing:` | `trade_post_listing` |
| `trade-listing-visibility` | `trade_listing_visibility` |
| `notifications-rt:` (`hooks/useSupabaseNotificationsRealtime.ts`) | `notifications` |
| (그 외) | `other` |

- 최대 종류 수: 20 × 5 × 2 = 200. 실제로 한 기기 5분 배치에 나오는 조합은 수 개 수준이고, 배치당 행 상한(128)과 DB 함수 상한(128)은 그대로다.

### 1-2. 버린 이벤트도 같은 세분 키로 센다

- 지금: 5분 64개를 넘긴 이벤트는 `category:metric` 으로만 센다 → 폭주가 다시 나도 「channel_subscribe 가 많이 버려졌다」까지만 보인다.
- 변경: 버린 수의 키를 1-1과 **같은 함수**로 만든다(`channel_subscribe.presence.closed.retry` 처럼). 다른 이벤트는 지금과 같다.
- 버린 수 키 상한(64)과 넘침 키(`monitoring:dropped_key_overflow`)는 그대로다.

### 1-3. 서버는 클라이언트 값을 믿지 않는다

- 이벤트: 서버가 `labels.scope/status/attemptPhase` 로 **같은 공용 함수**를 다시 돌려 키를 만든다(클라이언트가 보낸 metric 문자열을 쓰지 않음).
- 버린 수: `metric` 이 세분 형식이면 **허용 표(종류·상태·단계)와 정확히 일치할 때만** 받는다. 아니면 `channel_subscribe` 로 되돌린다 → 임의 문자열로 행을 늘리는 공격 불가.

## 2. 바뀌는 파일 · 바뀌지 않는 파일

| 구분 | 파일 | 내용 |
|---|---|---|
| 새 파일 | `lib/community-messenger/monitoring/realtime-subscription-rollup-key.ts` | 순수 함수 1개(scope·status·phase → 세분 metric), 허용 표, 검증 함수. 클라이언트·서버 공용 |
| 수정 | `lib/community-messenger/monitoring/client.ts` | `bumpDropped` 의 키만 공용 함수로 생성. 전송 형식·주기·상한 무변경 |
| 수정 | `lib/community-messenger/monitoring/monitoring-rollup.ts` | `realtime.subscription/channel_subscribe` 이벤트·버린 수의 metric 을 공용 함수로 세분화·검증 |
| 테스트 | `monitoring/__tests__/realtime-subscription-rollup-key.test.ts` 신규, `monitoring-rollup.test.ts`·`monitoring-client-send-cap.test.ts` 보강 | 19개 scope 전수 매핑 + 저장소 전체 누락 자동 검사, ID 미포함, 미등록 → other, 위조 metric 거부, 상한 유지 |
| **무변경** | `subscribe-with-retry.ts`·모든 실시간 채널·통화 코드(`call-v4/**`·`CommunityMessengerCallClient`)·DB 표·DB 함수·RLS·모니터링 API 라우트·관리자 화면 코드 | 동작·연결·재시도·통화 흐름 그대로 |

DB 변경 없음: 표의 `metric` 검사 `^[a-z0-9_.:-]{1,96}$` 를 세분 키(최장 `channel_subscribe.trade_listing_visibility.channel_error.initial` = 61자)가 통과한다.

## 3. 영향 · 위험 · 같은 단계에서 처리할 것

| 영향받는 곳 | 바뀌는 점 | 깨질 수 있는 것 | 처리 |
|---|---|---|---|
| 관리자 메신저 모니터링 「DB 집계」 카드 | `channel_subscribe` 1행 → 종류·상태별 여러 행 | 행 수 증가로 표가 길어짐 | 읽기 상한 10,000행 안. 카드 코드 무변경으로 표시만 늘어남 — 구현 후 화면 캡처로 확인 |
| 메모리 집계·SLO(`channel_subscribe_callback_failure_ratio`) | 없음 | — | 이벤트 원본 무변경 |
| 통화 수신·통화 세션 채널 | 상태 콜백 안에서 부르는 기록 함수의 **버린 수 키 생성**만 달라짐 | 매핑 함수 예외 → 콜백 중단 | 순수 문자열 처리 + `try/catch` 로 실패 시 기존 키 사용. 통화 동작 경로 무변경 |
| 구 버전 탭·앱 | 새로고침 전에는 기존 `channel_subscribe` 행으로 계속 기록 | 신·구 행 공존 | 집계는 키가 달라 섞이지 않음. 판정 때 세분 행만 사용 |
| DB 부담 | 행 수 소폭 증가(기기당 5분 1회 전송은 그대로) | — | 14일 보존·자동 삭제 그대로 |

**통화 규정 적용 판단:** 이 변경은 통화 동작(발신·수신·푸시·CallKit·종료)을 바꾸지 않는 **모니터링 집계 변경**이다. 다만 통화 채널 상태 콜백이 부르는 모니터링 함수를 건드리므로, 통화 규정 4번(분리 반영)에 따라 **이 변경만 단독 커밋·단독 main 반영**하고, 실기기 통화 확인은 아래 V5의 최소 확인으로 한다. 통화 전체 행렬이 필요하다고 보시면 그 지시를 따른다.

## 4. 롤백

- 커밋 1개 되돌리기(웹만). DB·네이티브 변경이 없으므로 앱 재빌드·DB 작업 불필요.
- 이미 쌓인 세분 행은 14일 뒤 자동 삭제(기존 U1 정리 규칙).

## 5. 검증 계획

| # | 항목 | 방법 | 판정 기준 |
|---|---|---|---|
| V1 | 코드 | `typecheck:build` · `typecheck:test` · 관련 vitest · 변경 파일 eslint | 전부 PASS (= 코드 PASS 일 뿐) |
| V2 | 매핑 정확성 | 단위 테스트: 운영 scope 19종 전수 → 표의 종류, ID 문자열 미포함 | 19/19 |
| V3 | 위조 방어 | 단위 테스트: 허용 표 밖 metric 의 버린 수 → `channel_subscribe` 로 되돌림 | 통과 |
| V4 | 운영 기록 | 배포 후 웹 탭 새로고침 → 5분 뒤 `cm_monitoring_rollup_hourly` 에 `channel_subscribe.<종류>...` 행 생성 | 행 확인(Production SHA·시각 기록) |
| V5 | 통화 회귀 최소 확인 | Android 실기 ↔ 웹: 음성 수신 벨 표시 → 벨 중 취소 1회. 발신·세션 생성·수신 화면·종료 시각 기록 | 기존과 같음 |
| V6 | Android·iOS 기록 | 두 Android 폰 앱 재시작(웹 반영만으로 적용) → 다음 실패 발생 시 종류·상태 행 생성 | 실패가 날 때까지 NOT_PROVEN — 반복 확인하지 않고 다음 정기 조회에 포함 |

## 6. 이 설계가 하지 않는 것

- E2·아이폰 폭주의 **수정**은 하지 않는다. 세분 기록으로 원인이 확정된 뒤 원인별 설계를 따로 올린다.
- 오류 메시지 본문(예: Presence 한도 초과 사유)은 저장하지 않는다. 상태 4종으로 부족하면 그때 별도 설계.
- 다른 이벤트 종류의 세분화, 다른 반복 조회(P1~P6)는 범위 밖.

## 7. 정정 기록

- 2026-11-08 23:55 PHT: 처음 구현(`16b3f03fa`)의 표가 17종이었다. 수신 전화 holder(`cm-incoming-call-realtime-holder.ts`)를 거쳐 `subscribeWithRetry` 를 부르는 `community-messenger-incoming-call` 이 빠져 운영에서 `other` 로 집계됨(Android 5건, 23:53 PHT). 표에 `call_incoming_legacy` 로 추가.
- 2026-11-09 00:1x PHT: 정정 ① 뒤에도 운영 새 코드 탭이 `other` 를 보냄 → 실제 전송 내용 확인 결과 `notifications-rt:<사용자ID>`(최상위 `hooks/useSupabaseNotificationsRealtime.ts`). 처음 검색 범위가 `lib`·`components`·`app` 뿐이라 `hooks/` 를 빠뜨림. 표에 `notifications` 추가 + `realtime-subscription-scope-coverage.test.ts`(저장소 전체에서 구독 scope 를 찾아 표에 없으면 실패, 매핑을 빼면 실패하는 것 확인) 추가.
