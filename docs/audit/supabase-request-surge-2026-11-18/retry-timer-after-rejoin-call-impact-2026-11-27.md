# 실시간 재시도 타이머 — 라이브러리 재가입 성공 뒤 중복 재가입 막기 · 통화 영향 분석서 (2026-11-27 PHT)

- **지시**: PR #652 실기 T1 FAIL 보고 뒤 Owner 「영향 분석서 작성」(2026-11-27).
- **규정**: 「통화 변경 규정」 §1 대상이다.
  - 바꾸는 파일 `lib/community-messenger/realtime/subscribe-with-retry.ts`를 통화 채널 5곳이 쓴다(§3-1).
  - 규정 §3: **이 문서 = 구현 전 단계. Owner 승인 전 구현하지 않는다.**
  - 규정 §4: 통화에 닿으므로 **단독 커밋·단독 PR**로 반영한다.
- **근거**
  - 코드: `origin/main` `9c5dcd6`, `@supabase/realtime-js` 2.99.2(`node_modules`)
  - 실기: 11-27 12:41~12:48 PHT Samsung SM-M156S
    - 운영 `9c5dcd6`, 앱 1.2.7 (85), 계정 광수, 앱 실행 1회
    - 앱 웹 화면 디버그 연결로 WebSocket 보낸·받은 메시지(`phx_join`·`phx_leave`·`phx_reply`·`phx_close`)와 `fetch` 호출 경로를 기록

## 1. 왜 (증거)

### 1-1. 실기 기록 — 다시 열기 1번 (12:42~12:43 PHT, 보임 = 0초)

| 시각 | 일 |
|---|---|
| 숨김 +4.9초 | 소켓 `close 1006` (숨김 중) |
| 보임 +2.3초 | 라이브러리 재연결 → 4개 채널 `phx_join` → 모두 `ok` |
| | └ `cm-call-invite`(일반 채널) · `community-messenger-unread-sound` · `notifications-rt` · `cm-room-friendship:…:friend-requests-global` |
| 보임 +2.6초 | 재동기화 1번째 → 친구요청 1·배지 1 |
| 보임 +4.7~4.8초 | **감독 채널 3개만** `phx_leave` → `phx_join` → `phx_close`(옛 채널) → 새 채널 `ok` |
| 보임 +5.0초 | 재동기화 2번째 → 친구요청 1·배지 1 |

- 10번 다시 열기(T1) 모두 같은 모양이었다. 다시 열기마다 친구요청·배지가 각 2번 나갔다.
- **대조군**: `cm-call-invite`는 일반 채널(`call-invite-realtime-broadcast.ts:225` `sb.channel().subscribe()`)이라 재시도 래퍼가 없다. 이 채널은 **1번만** 가입했다. 래퍼를 쓰는 채널만 2번 가입했다.
- 이 중복 가입 때문에 PR #652의 재동기화 1묶음(「모든 채널 연결 순간 1번」)이 2번이 된다. 첫 연결 순간에 이미 모두 연결이고, 그 뒤 다시 붙는 것은 새 재가입으로 세지기 때문이다.

### 1-2. 코드 경로 (확인)

1. 소켓이 닫히면 라이브러리가 모든 채널에 오류를 낸다.
   - `RealtimeClient._onConnClose` → `_triggerChanError`(`RealtimeClient.js:651·673`)
   - 각 채널: `state = errored` + **라이브러리 자체 재가입 타이머** `rejoinTimer.scheduleTimeout()`(`RealtimeChannel.js:87-93`)
   - 구독 콜백 `CHANNEL_ERROR`(`:143`)
2. 래퍼가 `CHANNEL_ERROR`를 받으면 **래퍼 재시도 타이머**를 건다(`subscribe-with-retry.ts` `scheduleRetry`).
   - 숨김 중이면 먼저 지연 분기 타이머(`subscribe-with-retry.ts` 실패 처리 끝 `cmRtShouldDeferRetries()` 분기, 최소 5초)를 건다. 그 뒤 `scheduleRetry`가 한 번 더 기다린다(`cmRtComputeRetryDelayMs`, 350ms~ + 흔들림 0~0.22초)
3. 다시 보이면 라이브러리가 소켓을 다시 열고, 오류 상태 채널을 스스로 다시 가입시킨다.
   - `_rejoinUntilConnected` → `_rejoin`(`RealtimeChannel.js:590·620`)
   - → `SUBSCRIBED`
   - 가입 시 토큰은 연결 때 새 값으로 바꿔 넣는다(`RealtimeClient.js:578` `updateJoinPayload({access_token})`)
4. **래퍼는 `SUBSCRIBED`를 받아도 2번에서 건 타이머를 지우지 않는다.**
   - `subscribe-with-retry.ts` `SUBSCRIBED` 분기: `attempt = 0`·성공 기록만, `clearTimer()` 없음
   - 타이머가 이어서 돌아 `resubscribe()` → `removeChannel`(옛 채널 떠남) + 새 채널 가입 → 두 번째 `SUBSCRIBED`
5. 실측 간격이 맞는다.
   - 소켓 닫힘(숨김 +4.9초)부터 두 번째 가입까지 = 약 5.4초
   - 지연 분기 최소 5초 + `scheduleRetry` 대기 350ms~ + 흔들림 + 인증 확인

## 2. 바꾸는 것

### 2-1. 파일·함수

| 파일 | 바꾸는 것 |
|---|---|
| `lib/community-messenger/realtime/subscribe-with-retry.ts` `createInternalSubscribeWithRetry` → `attachSubscribe`의 구독 콜백 | `status === "SUBSCRIBED"` 분기에서 **기다리는 래퍼 재시도 타이머를 지운다**(`clearTimer()`) |
| 같은 파일 `scheduleRetry`·숨김 지연 분기 | 새 타이머를 걸기 전 `clearTimer()` — **구현 중 보정(독립 재감사 2026-11-27)**: realtime-js 는 소켓 error 와 close 가 각각 채널 오류를 내(`RealtimeClient.js:651·663·673`) `CHANNEL_ERROR` 가 연달아 2번 올 수 있다. 지금은 두 번째 타이머가 첫 타이머 핸들을 덮어써 첫 타이머가 남고, `SUBSCRIBED` 에서 지워도 남은 타이머가 중복 재가입을 낸다. 기다리는 재시도를 항상 1개로 둔다 |
| 같은 폴더 `__tests__/` | 시험 추가(§6) |
| `docs/messenger-realtime-policy.md` | 재시도 행에 「라이브러리 재가입이 먼저 성공하면 래퍼 재시도는 취소」 한 줄 |

- 바꾸지 않는 것
  - 재시도 간격(`cmRtComputeRetryDelayMs`)·쉼(cooldown)·감독(D1 R1)·재동기화(R2)·다시 열기(R5)
  - `CLOSED`·`TIMED_OUT`·`CHANNEL_ERROR` 처리
  - 통화 신호·세션 API·푸시·네이티브

### 2-2. 바뀌는 동작

| 경우 | 지금 | 바뀐 뒤 |
|---|---|---|
| 소켓 끊김 → 라이브러리가 래퍼 타이머보다 **먼저** 다시 가입 (Samsung 다시 열기 실측) | `SUBSCRIBED` 뒤 수 초 안에 채널을 지우고 새로 가입 → `CLOSED`(내부)·`SUBSCRIBED` 한 번 더 | 라이브러리 재가입 1번으로 끝. 래퍼 타이머 취소 |
| 래퍼 타이머가 **먼저** 돈다 (라이브러리 재가입 전) | 옛 채널을 지우고 새로 가입 | 같음 (옛 채널은 지워져 `SUBSCRIBED`가 오지 않는다) |
| `CLOSED`(서버가 채널 닫음) | 라이브러리는 다시 가입하지 않음(`RealtimeChannel.js:81` `socket._remove`) → 래퍼 타이머가 새로 가입 | 같음 (`SUBSCRIBED`가 오지 않으니 타이머 유지) |
| 라이브러리 재가입이 실패 (`CHANNEL_ERROR` 다시) | 래퍼 타이머가 새로 가입 | 같음 — 실패할 때마다 래퍼가 새 타이머를 건다(`scheduleRetry`) |
| 처음 가입 | 타이머 없음 | 같음 |
| `CHANNEL_ERROR`가 연달아 2번 (소켓 error 뒤 close) | 래퍼 타이머 2개(첫 것은 핸들 잃음) → 재가입이 없으면 새 가입 2번, 재가입이 있어도 1번 남음 | 기다리는 타이머 1개. 재가입 있으면 0번, 없으면 새 가입 1번 |

## 3. 영향받는 경로 (규정 §3 항목별)

### 3-1. 이 래퍼를 쓰는 통화 채널 (코드 조회 `git grep subscribeWithRetry(`)

| 채널 | 파일 | 언제 켜짐 |
|---|---|---|
| `community-messenger-call-session:<sessionId>` | `CommunityMessengerCallClient.tsx:4160` | 1:1 통화 화면 (모든 기기) |
| `community-messenger-call-signal-hangup:<sessionId>` | `CommunityMessengerCallClient.tsx:4256` | 1:1 통화 화면 (모든 기기) |
| `community-messenger-group-call-session:<sessionId>` | `use-community-messenger-group-call.ts:227` | 그룹 통화 화면 |
| `community-messenger-incoming-call:<uid>` | `call-v4-incoming-realtime-feed.ts:111` · `cm-incoming-call-realtime-holder.ts:58` | 수신 발견. 네이티브 앱(Android·iPhone)에서는 꺼짐 — `realtimeFeedActive = !isCapacitorNativePlatform() \|\| macIosApp`(`call-v4-incoming-discovery.ts:287`). 웹·Mac 앱만. 실기 기록에도 이 채널 가입 없음 |
| `community-messenger:call-logs:<uid>` | `use-community-call-history-realtime-sync.ts:181` | 통화 기록 화면 |

`cm-call-invite:<uid>`(울림·끊김 방송)는 일반 채널이라 **이 변경과 무관**하다.

### 3-2. 경로별

| 경로 | 영향 | 근거 |
|---|---|---|
| 발신 시작·세션 생성 | 없음 | 세션 API(`calls/sessions/**`)·`call-v4-actions` 무변경. 이 래퍼는 가입만 한다 |
| VoIP·FCM 발송 · iOS CallKit/PushKit · Android 수신 화면 | 없음 | 서버(`lib/push/**`)·네이티브(`android/**`·`ios/**`) 무변경. 네이티브 수신은 푸시 경로이고, 앱 안 수신 실시간 채널은 네이티브에서 꺼져 있다(§3-1) |
| 취소·거절·종료·부재중 | 없음 (끊김 복구 때 신호 공백 줄어듦) | 통화 중 소켓이 끊겼다 붙으면 지금은 라이브러리 재가입 뒤 수 초 안에 세션·끊기 채널을 **지우고 새로 가입**한다. 그 사이(`phx_leave`~새 `ok`, 실측 약 0.1~0.3초) 오는 세션 변경·끊기 방송은 받지 못한다. 바뀐 뒤에는 이 공백이 없다 |
| 상태 폴링(R3·E7) | 줄어들 수 있음 (늘지 않음) | 통화 화면 `setSessionRealtimeSubscribed(status === "SUBSCRIBED")`(`CommunityMessengerCallClient.tsx:4166`). 래퍼는 내부 `CLOSED`에도 `onStatus`를 먼저 부르므로, 지금은 중복 재가입 때 잠깐 「미구독」으로 바뀐다. 수신 발견은 `SUBSCRIBED` 5초 유지 전까지 2초 조회(`call-v4-incoming-discovery.ts:43·580`)라, 지금은 중복 재가입마다 2초 조회 구간이 다시 시작된다. 바뀐 뒤에는 이 깜빡임이 없다. 폴링 규칙 자체는 무변경 |
| CallKit 종료 신호 | 없음 | 네이티브·`call-v4-connected-terminal-watch`(일반 채널) 무변경 |
| 통화 기록 | 없음 | 쓰기 경로 무변경. 기록 화면 채널은 중복 재가입 1번이 빠질 뿐 |
| 팝업 | 없음 | 팝업은 이 래퍼를 쓰지 않는다 |
| 설치된 구 바이너리 | 없음 | 웹만. 앱 안 WebView가 운영 웹을 받는다. 네이티브 경로·버전 무관 |

### 3-3. 통화 밖 영향 (감독 채널 전부)

- 감독 대상 채널 전부가 다시 열기·끊김 복구 때 가입 1번이 줄어든다.
  - 알림, 친구요청, 안읽음 소리, 방 묶음, 홈 목록, 입력 중, 거래 등 16개 파일
- 실측 Samsung 다시 열기 1번당 줄어드는 것
  - 실시간 가입 3번 + `phx_leave` 3번
  - 재동기화 1묶음: 친구요청 1·배지 1, 열린 방이 있으면 `after=` 1·홈 목록 확인 1
- PR #652 목표(다시 열기 1번에 친구요청·배지 각 1번)는 이 변경이 들어가야 성립한다.

## 4. 회귀 위험과 같은 단계 처리

1. **라이브러리 재가입이 「겉으로만」 성공하는 경우** (`SUBSCRIBED`인데 실제 변경이 안 옴)
   - 지금의 중복 재가입이 우연히 이것을 가려 왔을 가능성이 있다.
   - 근거상 위험은 낮다.
     - 라이브러리는 연결 때 토큰을 새 값으로 바꿔 가입한다(`RealtimeClient.js:578`).
     - 래퍼는 `SUBSCRIBED`마다 `syncSupabaseRealtimeAuthFromSession`으로 토큰을 다시 맞춘다(그대로).
     - `postgres_changes` 바인딩이 서버와 다르면 라이브러리가 `CHANNEL_ERROR`를 낸다(`RealtimeChannel.js:177`) → 래퍼 재시도.
   - **실기에서 직접 확인한다**(§6 R2·R3: 다시 열기 뒤 상대 메시지·통화 상태가 실시간으로 오는지).
2. **타이머를 지운 뒤 같은 채널이 곧 다시 실패**
   - 새 `CHANNEL_ERROR`가 새 타이머를 건다. 지금과 같다.
3. **연속 실패 쉼(cooldown)**
   - `SUBSCRIBED`에서 이미 `cmRtRecordSubscribeSuccess`로 실패 기록을 지운다(그대로).
   - 타이머만 추가로 지우므로 쉼 계산은 바뀌지 않는다.
4. **`resubscribe` 진행 중 경합**
   - `resubscribe`의 `removeChannel`은 첫 단계로 `unsubscribe()`를 동기로 실행해 옛 채널을 `leaving`으로 바꾸고 가입 응답을 끊는다(`RealtimeClient.js:213-214`, `RealtimeChannel.js:364·369`). `leaving`이면 라이브러리 재가입도 바로 끝난다(`:621`). 그래서 옛 채널에서 늦은 `SUBSCRIBED`는 오지 않는다.
5. **연달아 오는 실패에서 재시도 횟수 변화**
   - 기다리는 재시도를 1개로 줄인다. 실패 기록(`cmRtRecordSubscribeFailure`)·`attempt` 증가는 실패마다 그대로라 쉼·간격 계산은 같다.

## 5. 롤백

- PR 되돌리기 1번(웹만). 즉시 복구가 필요하면 Vercel Instant Rollback(개발 프로세스 2번).
- DB 변경 없음.

## 6. 검증

### 코드

- 단위 시험(가짜 채널)
  - `CHANNEL_ERROR` → 라이브러리 재가입 `SUBSCRIBED` → 타이머 시간 경과: `removeChannel` 0번·새 채널 0개
  - `CHANNEL_ERROR` → `SUBSCRIBED` 없음 → 타이머가 새로 가입(지금과 같음)
  - `CLOSED`(서버) → 새로 가입(지금과 같음)
  - `SUBSCRIBED` 뒤 다시 `CHANNEL_ERROR` → 새 타이머가 걸림
  - 숨김 중(지연 분기) `CHANNEL_ERROR` → 보임 뒤 재가입 → 새 가입 0 (실기 시나리오)
  - `CHANNEL_ERROR` 2번 → 재가입 → 새 가입 0 · 재가입 없음 → 새 가입 1번만
  - 수정 전 코드에서는 「재가입 뒤 새 가입 0」 3건이 실패한다(확인)
- `test:ci` 전체, 타입검사 2종, eslint

### 실기 (운영 SHA 매 시험 확인 · 앱 실행 상한 10회 · 각 시험 시각·세션 생성·푸시 발송·수신 화면·연결·종료 기록, 서버 시각은 운영 DB 대조)

- R1: Samsung 다시 열기 10번 — 친구요청·배지 각 1번/회, 감독 채널 가입 1번/회(소켓 기록)
- R2: 다시 열기 직후 상대가 보낸 메시지가 홈·열린 방에 실시간으로 오는지 (겉으로만 성공 위험 확인)
- R3: **통화 중 앱 백그라운드 약 10초 → 복귀**
  - 통화 유지
  - 상대 종료 시 즉시 종료 화면
  - 세션 채널 가입 1번(소켓 기록)
- 통화 행렬(규정 §5): Android↔iPhone 음성·영상 발신·수신, 거절, 벨 중 취소, 취소 후 지연 푸시(재울림 없음), 통화 중(busy), 무응답 타임아웃, 정상 종료 후 즉시 재발신
  - 이 변경은 신호·세션·발송·네이티브를 바꾸지 않는다(§3-2). 그래도 규정상 대상이다.

## 7. Owner 결정 필요

1. 이 분석대로 구현 승인 여부
2. 실기 범위: R1~R3 + 통화 행렬 전체 / R1~R3 + 행렬 축소(Android↔iPhone 음성 발신·수신·종료만)
3. R2·통화 행렬에 필요한 시험 메시지·통화 횟수 (시험 계정 q테스트1↔zxzx11, 또는 Owner 지정)
