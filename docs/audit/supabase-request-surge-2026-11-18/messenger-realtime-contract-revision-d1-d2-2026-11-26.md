# 메신저 실시간 계약 개정안 — D1 연결 감독 · D2 재동기화 단일화 (2026-11-26 PHT)

- 지시: Owner 「순서 승인」(D4 → D1·D2 → D3) 뒤 「개정안 작성」.
- 상위 설계: `structural-analysis-and-design-2026-11-26.md` §5 D1·D2.
- 사건 근거: `realtime-ios-retry-loop-2026-11-26.md`.
- 상태: **개정안 — 승인 전. 구현·운영 변경 없음.** 승인되면 `docs/messenger-realtime-policy.md` 에 §3 문구를 옮기고 코드와 함께 바꾼다(그 문서 머리말 「문서만 먼저 바꾸지 말고」).

## 0. 먼저 읽은 계약 (인용)

| 계약 | 원문 | 이 개정에 주는 제약 |
|---|---|---|
| `docs/messenger-realtime-policy.md` 원칙 1 | 「**전체 메시지 목록 재요청**은 디바운스된 `refresh` 로만」 | 유지 |
| 같은 문서 안티패턴 | 「Realtime 이벤트마다 무조건 `refresh(true)` 로 전체 부트스트랩 재호출」 · 「동일 테이블에 사용자별 중복 채널 구독」 | 지금 코드가 두 안티패턴을 다 갖고 있다(§1). 개정은 이 둘을 실제로 지키게 하는 것 |
| 같은 문서 「채널 재생성」 | 「`subscribe-with-retry.ts`(통화 공유)는 그대로」 | **`subscribe-with-retry.ts` 는 고치지 않는다.** 감독은 그 바깥에서 한다(§3 R1) |
| AGENTS 통화 변경 규정 1·3 | 통화에 닿는 웹 코드도 분석서 → Owner 승인 → 통화만 단독 반영 | 방 묶음 채널이 통화 표(`call_sessions`·`call_session_participants`)를 함께 받는다 → **§6 통화 영향 분석**을 이 문서에 포함. 통화 화면·수신·발신 채널은 대상에서 뺀다 |
| `lib/app-resume/app-resume-coordinator.ts` 머리말 · `docs/dibay-app-entry-resume-hard-lock.md` | 「기존 전역 복귀 리스너 이관(도메인별 승인)」은 하지 않음 | D2 는 **앱 복귀**가 아니라 **실시간 재연결**만 다룬다. 복귀 리스너 이관은 D3(별도 승인) |
| Supabase Realtime 한도 문서 | 가입 거절 응답 `too_many_channels`·`too_many_joins`·`too_many_connections`, 연결당 채널 100 | 운영 로그는 `SocketJoinRateLimitReached`(「Too many joins on this socket」). 소켓 단위 가입 속도 한도 값은 문서에 없다(**NOT_PROVEN**) |

## 1. 고칠 문제 (증거 요약)

1. 재시도에 끝이 없다.
   - `subscribe-with-retry.ts:474-519` · `cm-rt-loop-guard.ts:5,76-86`: 5번 실패 뒤 10~30초 쉬고 다시 끝없이 재시도한다.
   - presence·read-ack(`presence-user-broadcast-client.ts:70`, `cm-read-ack-broadcast-client.ts:101`)는 각자 1/2/5/10초 뒤 10초마다 반복한다.
2. 소켓 단위 판단이 없다.
   - 채널마다 따로 재시도하고, 서버 거절 이유를 받지 않는다(`subscribe-with-retry.ts:560`).
   - 그래서 한 기기의 거절이 스스로 유지된다. 11-26 iOS: 4시간 재시도 2,483, 서버 거절 282.
3. 실패하면 HTTP 로 번진다.
   - 방 묶음 채널은 2번째 실패부터 **실패할 때마다** 열린 방 전부에 `onRefresh` 를 건다(`global-messenger-room-bundle-channel.ts:574-579`).
   - `onRefresh` 는 메시지 `after=` GET 을 하고, 새 것이 없으면 bootstrap GET 까지 한다(`use-messenger-room-client-phase1.ts:1523-1536`). 안티패턴 1에 해당한다.
   - 11-26 방 2개(새 메시지 각 1건)에서 GET 1,707회.
4. 재연결 때마다 채널별로 따로 다시 읽는다.
   - 방 묶음 `firstSubscribeResync`, 홈 `refreshScheduler`, 친구요청 목록(`use-global-friend-request-feed.ts:180-184`), 알림 RESYNC 가 각자 HTTP 를 부른다.
5. 같은 데이터를 두 번 가입한다.
   - 참여자 `user_id=eq` 를 홈 meta(`community-messenger-home-realtime-channels.ts:156-162`)와 안읽음 소리(`use-cm-participants-hub-sync.ts:131-137`)가 각각 가입한다. 안티패턴 2에 해당한다.
   - 방 묶음은 방 목록이 바뀌면 **모든 조각**을 새 토픽으로 다시 가입한다(`:507-520,549`).

## 2. 대상 채널 분류

| 채널 (위치) | 개정 대상 | 이유 |
|---|---|---|
| 홈 meta·rooms-in (`community-messenger-home-realtime-channels.ts:135,327`) | **대상** | 메신저 |
| 방 묶음 (`global-messenger-room-bundle-channel.ts:541`) | **대상 (§6 통화 영향 포함)** | 메신저 메시지 + 통화 표 이벤트를 같이 받음 |
| 안읽음 소리 (`use-cm-participants-hub-sync.ts:122`) | **대상** | 메신저 |
| 친구요청 (`use-global-friend-request-feed.ts:174`) | **대상** | 메신저 |
| 알림 (`hooks/useSupabaseNotificationsRealtime.ts:142`) | **대상** | 알림 배지 |
| 거래 노출 (`listing-visibility-client.ts:46`) · 판매글 (`use-post-seller-listing-realtime.ts:44,116`) · 거래 글 broadcast (`use-trade-post-listing-broadcast.ts:65`) · 홈 거래글 (`use-community-messenger-trade-post-listing-realtime.ts:44`) · 거래 채팅 presence (`use-trade-chat-room-presence.ts:124`) | **대상** | 같은 소켓을 쓰는 비통화 채널 |
| presence 사용자 토픽 · read-ack (자체 재시도 루프) | **대상** | 메신저. 자체 루프를 감독 규칙으로 바꿈 |
| 통화 화면 세션·종료 (`CommunityMessengerCallClient.tsx:4158,4254`) | **제외** | 통화 |
| 수신 통화 (`call-v4-incoming-realtime-feed.ts:109`, `cm-incoming-call-realtime-holder.ts:58`) | **제외** | 통화 |
| 통화 기록 동기화 (`use-community-call-history-realtime-sync.ts:170`) · 그룹 통화 (`use-community-messenger-group-call.ts:225`) | **제외** | 통화 |
| 래퍼 없는 채널(관리자·라이더·구 채팅 `lib/chats/*`) | **이번 제외** | 메신저 밖. D3 에서 따로 |

제외 채널은 코드·동작을 바꾸지 않는다. 감독은 그 채널의 실패를 세지도 않고 멈추지도 않는다.

## 3. 개정 계약 (승인 시 `messenger-realtime-policy.md` 에 새 절로 넣을 문구)

### R1 연결 감독 — `lib/community-messenger/realtime/messenger-realtime-supervisor.ts` (새 파일)
- §2 대상 채널은 `subscribeWithRetry` 를 **직접 부르지 않고** `superviseMessengerChannel(args)` 를 부른다.
  - 감독이 안에서 `subscribeWithRetry` 를 그대로 부른다. `subscribe-with-retry.ts` 무변경.
  - 감독이 쓰는 것은 기존 공개 인터페이스뿐이다: `onStatus`(모든 상태가 온다 — `subscribe-with-retry.ts:571`), `handle.stop()`.
- 감독은 사용자 소켓 하나에 상태 1개를 둔다: `closed`(정상) / `open`(차단) / `half_open`(시험).
- **차단 조건**: 대상 채널 전체에서 60초 안에 실패(`TIMED_OUT`·`CHANNEL_ERROR`·예상 밖 `CLOSED`) **8회 이상**. ※ 구현 정정 → §9(사건 2초 묶음, 60초 6번·5분 20번, CLOSED 제외, 관찰 기간 2번)
- **차단 중 동작**
  - 대상 채널 전부 `stop()` 한다. 가입 0. 제외 채널(통화)은 건드리지 않는다.
  - 대기 30초 → 60초 → 120초 → 300초(상한)로 늘린다.
  - 화면이 숨겨져 있으면 대기가 끝나도 시험하지 않고, 보일 때·온라인이 될 때 시험한다.
- **시험(half_open)**
  - 채널 1개(홈 meta, 없으면 첫 등록 채널)만 다시 가입한다.
  - 15초 안에 `SUBSCRIBED` 면 `closed` 로 돌아가 나머지를 **300ms 간격으로 하나씩** 다시 가입한다.
  - 실패하면 다음 대기 단계로 간다.
- **채널별 상한**: 같은 채널이 연속 6번 실패하면 그 채널만 「쉼」.
  - 다음 시험·화면 복귀·온라인 때만 다시 가입한다.
  - presence·read-ack 의 자체 루프도 같은 상한을 쓴다(그 두 파일의 재시도 함수를 감독 호출로 바꿈).
- **감시**: 차단 열림·닫힘·채널 쉼을 앱 감시(`realtime.subscription`, 이미 5분 묶음 전송)에 `supervisor.open|close|park` 로 남긴다. D4 매시 감시가 같은 표를 읽는다.

### R2 재동기화 단일화 — 「재연결 1번 = 재동기화 1번」
- 감독이 「끊겼다가 다시 붙었다」를 **한 번만** 알린다(`onMessengerRealtimeResynced`).
  - 조건: 차단이 닫힐 때, 또는 실패 뒤 재가입 성공이 5초 안에 몰려 올 때 그 묶음당 1번.
- 받는 쪽(기존 채널별 SUBSCRIBED 처리를 이것으로 바꿈)

  | 받는 쪽 | 동작 |
  |---|---|
  | 열린 방 | 방당 `after=` 1번 |
  | 홈 | 목록 확인 1번(기존 gap probe) |
  | 배지 | 1번 |
  | 친구요청 | 1번 |

- **처음 가입은 지금 그대로다.** 친구요청 시작 조회(2026-10-25 iPhone 콜드 스타트 대응)·방 첫 `onRefresh` 는 유지한다. 바뀌는 것은 **재연결** 때뿐이다.
- 방 `onRefresh` 의 2단 조회 제한(안티패턴 1 준수): `after=` 에서 새 것이 없을 때 bootstrap 을 다시 받는 것은 「참여자·방 메타 변경 신호가 있었을 때」만 한다. 신호가 없으면 끝.

### R3 실패 폴백 상한
- 방 묶음 `onAfterSubscribeFailure` 의 「실패할 때마다 방별 폴백」을 없앤다.
- 대신 차단이 열려 있거나 그 방의 묶음 채널이 15초 넘게 가입되지 않았고, **화면이 보이는 동안만** 방당 **60초에 1번** `after=` 폴백을 한다.
- 화면이 숨겨지면 폴백 0.

### R4 중복 가입 제거
- 안읽음 소리 채널은 참여자 표를 따로 가입하지 않고, 홈 meta 가 받은 같은 이벤트를 앱 안에서 나눠 받는다(채널 1개 감소).
- 방 묶음 재바인드는 **바뀐 조각만** 새 토픽으로 다시 가입한다(같은 조각은 유지).

### R5 지금 계약과 같게 남는 것
- 서버 bump 발행·페이로드·수신 병합(「방 메시지 기본 계약」 표 전부)은 그대로다.
- 토픽 lease·세대 토픽·토큰 갱신 무재구독도 그대로다.
- 홈 grace keepalive·디바운스 수치도 그대로다.

## 4. 바뀌는 파일·함수와 같은 단계에서 함께 정리할 것

| PR | 파일 | 바뀌는 것 | 함께 정리(깨짐 방지) |
|---|---|---|---|
| **PR-A 감독** | 새 `messenger-realtime-supervisor.ts` · §2 대상 호출부 12곳 · presence·read-ack 재시도 함수 | R1 | 대상 호출부가 쓰던 `onStatus` SUBSCRIBED 처리는 그대로 동작해야 함 — 감독이 상태를 그대로 넘긴다. 차단 중 화면은 「연결 중」 표시가 있는 곳만 지금 표시 규칙 그대로 |
| **PR-B 재동기화·폴백** | 감독 + 방 묶음(`firstSubscribeResync`·`onAfterSubscribeFailure`) · 홈 `refreshScheduler` 재연결 경로 · 친구요청 reconnect · 알림 RESYNC · 방 `onRefresh` | R2·R3 | 방 `onRefresh` 를 쓰는 3곳(재연결·메타 신호·통화 표 신호)을 함께 바꾼다. 통화 표 신호 경로는 §6 |
| **PR-C 중복 제거** | 홈 meta·안읽음 소리 · 방 묶음 재바인드 | R4 | 안읽음 소리 재생 조건(지금 `isCancelled: () => false`)을 홈 meta 이벤트로 옮김. 홈 화면 밖(방 화면)에서도 소리가 나는지 같은 PR 에서 확인 |

- 세 PR 모두 **메신저만**이다. 통화 파일·`subscribe-with-retry.ts`·서버 코드·DB·네이티브 무변경 → [배포 구분] 웹만.
- 메신저 PR 이라 Owner 「병합」 뒤에만 병합한다(독립 감사·보고 먼저).

## 5. 기준값 (근거)

| 값 | 정한 근거 |
|---|---|
| 차단: 60초 안 실패 8회 | 11-26 iOS 4시간 재시도 2,483 = 분당 약 10. 평상시 플랫폼 전체 시간당 30~128(분당 2 이하, 여러 기기 합). 한 기기 분당 8회는 정상에서 나오지 않는 수치 |
| 대기 30→60→120→300초 | Supabase 가입 한도 회복 시간 값은 문서에 없음(NOT_PROVEN) → 짧게 시작해 늘림. 300초 상한 = 끊긴 상태가 5분 넘게 이어지지 않게 |
| 채널별 연속 6회 | 지금 쿨다운 진입(5회) 바로 뒤. 쿨다운 한 번은 지금처럼 허용 |
| 폴백 방당 60초 | 11-26 방 1개 11초마다 → 60초면 같은 4시간에 방당 최대 240회(지금 1,373회) |
| 재연결 묶음 5초 | 소켓 재연결 뒤 채널들이 몇 초 안에 차례로 SUBSCRIBED 되는 것을 한 번으로 셈 |

## 6. 통화 영향 분석 (통화 변경 규정 3)

| 항목 | 내용 |
|---|---|
| 닿는 통화 경로 | 방 묶음 채널의 `community_messenger_call_sessions`·`call_session_participants` 이벤트(`global-messenger-room-bundle-channel.ts:454-500`) → `roomCallBundle`·`openRoomTerminalCatchUp` → **열린 방**의 `onRefresh`(통화 기록 `call_stub`·통화 종료 줄 표시). 통화 발신·수신·울림·연결·종료 신호·CallKit·푸시는 이 채널을 쓰지 않는다(§2 제외 채널) |
| 바뀌는 동작 | ① 차단이 열린 동안 열린 방이 통화 표 이벤트를 받지 못한다 — **지금도 그 채널이 실패하는 동안은 못 받는다**(같음). ② 그동안 방의 통화 기록 줄은 R3 폴백(60초 1번)으로 따라잡는다. 지금은 실패할 때마다 따라잡음 → **실시간이 끊긴 동안 통화 기록 줄이 최대 60초 늦게 보일 수 있다** |
| 바뀌지 않는 것 | 통화 화면·수신 화면·울림·통화 상태 폴링·종료 감지·통화 푸시·부재중 푸시·`call_stub` 서버 생성(`replaceExisting`) — 코드 무변경. 통화 채널은 감독 밖이라 차단이 열려도 계속 가입한다 |
| 오히려 좋아질 수 있는 것 | 같은 소켓의 메신저 가입 폭주가 멈추면 통화 채널 가입이 거절될 위험이 줄어든다. 11-26 에 통화 채널이 거절됐는지는 확인 못 함(**NOT_PROVEN**) |
| 설치된 구 바이너리 | 웹 코드만 바뀜. 앱을 다시 시작하면 Android 85·iOS 62~64 모두 같은 웹 코드를 받는다. 네이티브 무변경 |
| 회귀 위험 | 감독이 「정상」 연결을 차단으로 잘못 판단 → 방 메시지가 최대 60초 늦게 보임. 대책: 기준값(§5)·실기 행렬(§7)·감시(D4) |
| 롤백 | 환경변수 `NEXT_PUBLIC_MESSENGER_RT_SUPERVISOR=0` 이면 감독이 그대로 통과시켜 지금 동작으로 돌아간다(이 값을 바꾸면 재배포 1번). 급하면 Vercel Instant Rollback |

## 7. 검증

**코드 (각 PR)**
- 감독 상태 전이 시험(가짜 시계)
  - 8회/60초 → open, 대기 단계, half_open 성공·실패, 숨김 중 시험 안 함
  - 제외 채널 실패는 세지 않음
- 재동기화 1번 시험: 채널 6개가 5초 안에 재가입 → 방·홈·배지·친구요청 각 1번.
- 폴백 상한 시험: 차단 4시간 가짜 시계 → 방당 `after=` ≤240, bootstrap 0(메타 신호 없을 때).
- 11-26 재현 시험: iOS 실패 흐름을 넣어 HTTP 수 비교(지금 1,707 → 상한 이하).

**실기 (Android 85·iPhone 64, 운영, 앱 처음 실행 합계 10회 이하 · 시작 전 Production SHA 확인)**

| # | 시나리오 | 확인 |
|---|---|---|
| 1 | 1:1 방 열어 두고 상대가 글·사진 보냄 | 지금과 같은 지연으로 표시(서버 bump 경로) |
| 2 | 방 열어 둔 채 비행기 모드 2분 → 해제 | 해제 뒤 놓친 글이 1번 따라잡기로 표시 · 그동안 GET 폭주 없음 |
| 3 | 백그라운드 10분 → 복귀 | 재가입 순서대로 · 배지·홈 목록 맞음 |
| 4 | 와이파이↔모바일 데이터 전환 | 끊김 뒤 재연결 1번 |
| 5 | 홈 화면 대기 중 새 방 생성·초대 | 홈 목록에 보임(rooms-in 재바인드) |
| 6 | 방 화면에서 안읽음 소리 | 다른 방 글에 소리(PR-C) |
| 통화 1 | 방 열어 둔 상대와 1:1 음성 통화 → 종료 | 방에 통화 기록 줄 표시 |
| 통화 2 | 부재중(무응답 타임아웃) | 방에 부재중 줄 · 부재중 푸시 |
| 통화 3 | 통화 중 다른 방 글 수신 | 통화 영향 없음 |

- 각 시험마다 운영 DB 로 서버 시각 대조, 그 시간 Vercel 방 경로 요청 수 확인.
- 비행기 모드로 「서버 거절」 자체를 재현할 수는 없다. 거절 처리는 코드 시험으로만 확인(**실기 NOT_PROVEN** 으로 표기).

## 8. Owner 결정 필요
1. 이 개정안(R1~R5) 승인 — 승인 시 PR-A → PR-B → PR-C 순서로 하나씩 만들고, 각 PR 은 보고 뒤 「병합」 지시로 병합.
2. §6: 실시간이 끊긴 동안 열린 방의 통화 기록 줄이 최대 60초 늦을 수 있음을 받아들일지(통화 신호·울림·종료는 무변경).
3. 운영 `VERCEL_OBSERVABILITY_TOKEN` 등록 — D4 「한 방 몰림」 감시가 이것 없이는 꺼져 있어, PR 반영 뒤 효과를 시간 단위로 볼 수 없다.

## 9. 구현 기록
- **PR-A (2026-11-26)**: 구현 중 기준을 정정했다.
  - 차단 = `TIMED_OUT`·`CHANNEL_ERROR` 60초 6회 **또는 5분 20회**.
  - `CLOSED` 는 세지 않는다 — `subscribe-with-retry.ts` 가 자기 재생성 때도 `onStatus("CLOSED")` 를 넘겨(`:571`, 분류 전) 실제 실패와 구분할 수 없다.
  - 11-26 iOS 시간초과만 4시간 1,602(분당 평균 6.7)여서, 8회/60초면 못 잡을 수 있어 6회와 5분 20회를 함께 둔다.
  - 재현 시험: 거절 4시간 동안 감독 없음 7,200회 → 감독 100회 미만.
- **PR-A 독립 감사 반영 (2026-11-26, 코드 감사 — 실기 아님)**

  | 지적 | 내용 | 수정 |
  |---|---|---|
  | F1 높음 | 소켓 1번 끊김에 realtime-js 가 모든 채널에 동시 오류(`RealtimeClient.js` `_triggerChanError`) → 채널 6개면 즉시 차단, 일상 끊김마다 30초 어둠 | 2초 안 실패는 소켓 사건 1번으로 센다(`RT_SUPERVISOR_FAILURE_COALESCE_MS`). 기준 = 사건 60초 6번 / 5분 20번 |
  | F2 높음 | 시험 중 시험 채널이 stop(홈 이탈·묶음 재바인드) → 복귀·온라인 전까지 영구 차단 | 보이는 중이면 곧바로 다른 채널로 시험 |
  | F3 중간 | 끄기 스위치(`=0`)에서 presence·read-ack 가 상한 뒤 영구 정지 | 끄면 상한·대기 자체를 건너뜀(이전 동작 그대로). 즉시 콜백이어도 해제 함수가 남지 않게 |
  | F4 중간 | 차단으로 멈춘 채널을 호출부가 몰라 거래 채팅 presence 가 「연결됨」으로 남아 12초마다 REST broadcast | 감독이 멈출 때(차단·쉼) 호출부에 `CLOSED` 전달. 다른 호출부는 SUBSCRIBED 외 상태를 무시함을 확인 |
  | 부수 | 대기자 300ms 타이머가 재차단 때 남음 · presence 새 세대가 이전 대기에 막힘 | 재차단 시 대기열로 되돌림 · 새 세대 가입 때 이전 대기 해제 |
- **PR-A 2차 독립 감사 반영 (2026-11-26, Owner 「더블 체크」)**

  | 지적 | 내용 | 수정 · 증거 |
  |---|---|---|
  | F-A 높음 | presence·read-ack 쉼에서 채널을 놓을 때 realtime-js 가 동기 `CLOSED` 를 다시 불러 재시도 → 놓기 → … **무한 재귀**(예외는 상태 처리기에서 삼켜져 겉으로 안 보임) | 대기를 먼저 걸고 `ch` 를 비운 뒤 놓음. 시험: 고치기 전 코드로 돌리면 놓기 **1,454번**, 고친 뒤 채널 수 이하 |
  | F-B 높음 | 시험 통과로 닫힐 때 대기 단계를 30초로 되돌려, 재가입이 다시 거절되면 30초마다 열림·닫힘 반복(감사 모의 4시간 가입 8,634) | 대기 단계는 닫힌 상태 5분 안정 뒤에만 초기화 + 관찰 기간(5분) 동안 사건 2번이면 다시 차단. 재현 시험(시험 통과·나머지 거절 4시간): 감독 없음 8,640 → **646** |
  | F-C 중간 | 시험할 채널이 없을 때 닫으면서 자체 루프 대기자를 안 깨움 | `close()` 로 닫음(대기자 깨움·감시 기록) |
  | F-D 낮음 | 차단을 만든 실패에서 호출부가 CLOSED 뒤에 원래 오류를 받음 | 호출부 먼저, 감독 나중 |
  | F-E 낮음 | 자체 루프 실패가 감독 창에 안 들어가고, 차단이 열려도 가입된 자체 루프 채널은 안 놓음 | 실패 공동 집계 + 차단 열림 알림으로 채널을 놓음 |
  | 시험 보강 | 4시간 재현이 약함(동어반복) · presence·read-ack 시험 없음 | 재현 모델 교체, presence 시험 새로, read-ack 재귀 시험, 경계 상황 3개(쉼 중 차단·시험 중 wake·재가입 예약 중 재차단) |
- D4 매시 감시는 `supervisor_*` 를 경보하지 않는다(실시간 재시도 폭주만). 차단이 열리는 것은 감시 표에 남는다.
