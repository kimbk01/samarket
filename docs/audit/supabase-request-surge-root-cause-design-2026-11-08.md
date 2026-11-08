# Supabase 요청 폭증 — 원인 확정 · 정확한 수정안 (구현 0건)

- 작성: 2026-11-08 PHT · 기준 코드: `origin/main` `b8786710f`
- 상태: **설계만. 코드·DB·설정 변경 0건.**
- Owner 지시 원문:
  - 「실제 서비스도 안하는 부분에 서버 불필요 한 요청도 많다 정확한 원인을 끝까지 확인 해서 터지는 부분인지?? 뭐가 문제 인지」
  - 「추측으로 하지 말고 끝까지 정확히 확인 해라 … 수정후 다른 가능에 또 터지는 부분인지?? 정확한 그본 해결책인지??? 땜빵으로 하지 말고」
  - 「근본 적인 문제를 해굘 해야 한다, 단순하게 어드민 열어 둔다고, 터지면 이게 뭐하는 짓이냐고?? 아울러 통화 부분을 수정을 안하는 부분이 아니다. 수정 하면 터지는 부분때문에 주의 해서 수정 하자는 부분이다 … 정확한 수정안과 정확한 결과 다른 기능에 영향이 없는지??? 땜빵이 아니라 정확한 수정이면 수정도 가능한 하드락인 부분이다」

## 통화 코드에 대한 입장 (Owner 지시 그대로)

통화 코드는 **고치지 않는 곳이 아니다.** 고치다 깨지기 쉬우니 **정확히 고치는 곳**이다. 이 설계서는 통화 코드를 고친다. AGENTS.md 「통화 변경 규정」이 요구하는 것을 모두 이 문서에 적는다: 바뀌는 함수, 그 함수를 부르는 모든 곳, 바뀌는 동작과 바뀌지 않는 동작, 설치된 구 버전 앱 호환, 롤백, 실기기 검증 행렬. Owner 가 승인하면 그대로 구현하고, 통화 변경만 따로 커밋해 main 에 반영한다.

---

## 0. 앞 보고 정정 (작업자 잘못)

| # | 앞 보고 | 사실 | 증거 |
|---|---|---|---|
| E1 | `member_write_gate_snapshot` 1.8만 건 = 싱가포르 AWS 의 **외부 node 프로세스** | **운영 `proxy.ts`** 가 보낸 것. proxy(Vercel 라우팅 미들웨어)는 사용자 근처 엣지 **sin1** 에서 실행된다(함수는 `bom1`) | Vercel observability `vercel.middleware_invocation.count`: `POST /api/community-messenger/monitoring/events` 31,114회(11-08 16:10~18:30 PHT). `proxy.ts:131` → `enforceApiMemberMutationPolicy` → `loadMemberWriteGateSnapshot` |
| E2 | 반복 조회 원인 = `GlobalCommunityMessengerIncomingCall` 2.5초 폴링 | 운영은 V4 경로라 그 컴포넌트는 **마운트되지 않는다**. 실제 원인은 `call-v4-incoming-discovery.ts` 2초 폴링 | 운영 번들 `8db1ba3858fdcbdb.js`: `isCallV4TelegramLaneEnabled(){return!0}` · `CallIncomingChrome.tsx:85` |
| E3 | (설계서 초안) `GET /calls/sessions/:id` 마다 reconcile 이 붙어 있다 | `?reconcile=1` 일 때만 실행한다(`[sessionId]/route.ts:43`). 수정 대상에서 뺐다 | 코드 |

---

## 1. 측정 사실 (운영 · 2026-11-08 기준 직전 24시간)

조건: Production `samarket.vercel.app` · Supabase `ckdosyydvgzqwpbwuhon`. 운영 데이터는 모두 읽기 전용으로 조회했다(`edge_logs`, Vercel observability, `auth.refresh_tokens`, `user_sessions`, `pg_policies`, `pg_publication_tables`).

| 항목 | 값 |
|---|---|
| 24시간 API 요청 | 341,079 (대시보드) |
| 평소(사용자 거의 없음) 시간당 | 600~1,000 (11-06 기준) |
| 현재 무사용 시간당 | 약 8,000 |
| `GET community_messenger_call_sessions` | **171,617 (50.3%)** — 관리자(`11111111-…`) 144,239 · `edc8c2f0-…` 25,032 |
| `POST rpc/member_write_gate_snapshot` | 36,052 — 그중 11-08 16:02~18:38 PHT 구간 약 1.8만 |
| DB 상태 | CPU 5% · RAM 53% · 연결 18/60 → 지금 장애는 아니다. 사용자 수에 비례해 그대로 늘어나는 구조가 문제다(§2-4) |

---

## 2. 원인 확정

### 2-1. 원인 A — V4 수신 통화 탐색 폴링 (요청의 50%)

**보낸 화면 (확정)**
- 맥 Chrome 탭 `samarket.vercel.app/community-messenger/rooms/3e92fa77-…`. AppleScript 로 탭 목록을 확인했다.
- 11-07 19:24:34 PHT 관리자가 이 방을 열었다(Vercel 로그 `[notify-open] room_opened {"userId":"11111111-…","roomId":"3e92fa77-…"}`). 35초 뒤인 19:25:09부터 반복 조회가 시작됐다.
- 밤새(04:12~15:54 PHT) 매시간 토큰이 갱신된 관리자 세션은 Chrome 세션 `79f74363` 1개뿐이다. 같은 시간 반복 조회는 끊기지 않았다.
- 이 탭은 어느 창에서도 활성 탭이 아니다(숨겨진 상태). 그런데도 주기가 유지됐다.

**코드 (확정)**
- 탐색 시작: `CallV4Provider.tsx:248` → `call-v4-incoming-discovery.ts:114` `startCallV4IncomingDiscovery`
- 주기: `INCOMING_POLL_MS = 2_000`. 메신저·채팅 경로에서 `GET /api/community-messenger/calls/sessions/incoming?directOnly=1` 를 보낸다.
- 확인하지 않는 것: **탭 숨김 여부, Realtime 상태.**
- 실패 처리: `callV4FetchIncomingSessions`(`call-v4-api.ts:168`)가 실패 응답을 `[]`(성공 0건)로 바꾼다. 그래서 401·429 가 나도 간격이 늘지 않는다.
- 실제 주기: 운영 DB 로그에서 3.0초마다 쿼리 5개 묶음(2초 대기 + 요청 왕복 약 1초). 코드와 일치한다.

**근본 원인 (확정)**
**V4 웹에는 수신 울림을 실시간으로 받는 구독이 없다. 2초 폴링이 유일한 수신 경로다.**
- 실시간 구독은 Legacy `GlobalCommunityMessengerIncomingCall.tsx:1467-1500` 에만 있다. 구독 내용은 `acquireIncomingCallRealtimeSubscription` + `postgres_changes`(`community_messenger_call_sessions`, `recipient_user_id=eq.<uid>`)이다. 이 컴포넌트는 운영에서 마운트되지 않는다.
- V4 발신(`callV4CreateSession` → `startCommunityMessengerRoomCall` → `POST /rooms/:id/calls`)은 울림 broadcast 를 보내지 않는다. 서버는 VoIP/FCM(네이티브 앱용)만 보낸다.
- 그래서 「숨김 탭에서 폴링 끄기」만 하면 데스크톱 웹 수신이 끊긴다. 땜빵으로는 막을 수 없다. **실시간 수신 경로를 V4 에 넣는 것이 근본 수정이다.**

**서버에서 요청이 불어나는 구조 (확정)**
`GET /incoming?directOnly=1` 1회에 DB 쿼리 5개가 나간다(`service.ts:22499` `listIncomingCommunityMessengerCallSessions`).
1. `reconcileUserLiveCallSessions` 안의 `terminalStaleRingingDirectSessionsForUser`
2. `reconcileUserLiveCallSessions` 의 ringing/active 조회
3. `getUserLiveDirectCallSessionId` — 결과를 수신 목록에서 쓰지 않는다
4. `terminalStaleRingingDirectSessionsForUser` 다시 실행 — 1번과 같은 쿼리
5. 실제 수신 목록 조회

만료 울림·만료 통화 정리는 cron `/api/community-messenger/calls/sessions/stale-cleanup`(`vercel.json` `*/2 * * * *`, observability 로 실행 확인)이 이미 한다. 읽기 API 가 정리를 매번 두 번씩 중복하는 것이 증폭 원인이다.

**다른 사용자에게도 같은 일 (인증 기록 기준)**
- `edc8c2f0-…` 25,032건(11-07 22:23~02:08 PHT).
- 그 시간에 매시간 갱신된 세션은 Windows Chrome `1c808451` 1개뿐이다. 화면은 직접 보지 못했다(NOT_PROVEN).

### 2-2. 원인 B — 메신저 모니터링 전송 폭주 (11-08 16:10~18:38 PHT)

**확정**
- 호출 수: `POST /api/community-messenger/monitoring/events` 분당 약 225회, 합계 34,513회(200 응답 17,945 · 429 응답 16,568).
- DB 증폭: 이 경로는 회원 쓰기 분류라서 요청마다 proxy 가 `member_write_gate_snapshot` 을 1회 실행한다 → 약 1.8만 건.
- 보낸 계정: 관리자(proxy 신원 조회 중 관리자 1,363건, 다른 계정 22건 이하).
- 클라이언트 구조(`monitoring/client.ts`): 큐에 24개가 쌓이면 즉시 보낸다. 전송 횟수 상한, 숨김 탭 정지, 이벤트 종류별 상한이 **없다.** 분당 225회는 초당 약 90개 이벤트가 쌓였다는 뜻이다.
- 서버 저장(`server-store-root.ts:71`): `globalThis` 메모리에만 저장한다. 인스턴스마다 따로 쌓이고 재시작하면 사라진다.

**NOT_PROVEN (이유)**
- 어떤 이벤트가 초당 90개씩 생겼는지: 서버가 내용을 기록하지 않았고, 그 화면은 닫혔다. 같은 시간 Realtime 웹소켓 접속 기록에는 재연결 폭주가 없다. 코드상 후보는 `subscribe-with-retry.ts:597/669` 구독 결과 이벤트와 `messengerMonitorRealtimeMessageInsertDelay` 이다.
- 어느 화면인지: 시작 시각(16:02)이 Claude 앱 내장 브라우저의 관리자 세션 `e667d3ae` 토큰 갱신 재개(16:04)와 맞지만, 화면 증거는 없다.
- 해소 방법: §3-C 의 「버린 이벤트 종류 기록」. 같은 폭주가 다시 나면 원인 이벤트 이름이 남는다.

### 2-3. 원인 C — 드문 채널의 「정상」 판정이 깨짐 (설계 전제 결함)

`community-messenger-realtime-health.ts:112-117` 의 판정 방식:
- 채널에 신호가 한 번이라도 오면(`lastSignalAt` 설정), 그 뒤 `silentAfterMs` 동안 신호가 없을 때 **비정상**으로 판정한다.
- 수신 통화처럼 평소 신호가 거의 없는 채널은 첫 통화 12초 뒤부터 계속 「비정상」이 된다.
- 결과: 「비정상일 때만 폴링」이 상시 폴링이 된다. §3-A 는 이 판정을 쓰지 않는다.

### 2-4. 사용자가 늘면 터지는가 (산술)

- 메신저·채팅 화면을 열어 둔 V4 웹 탭 1개(숨김 여부 무관): DB 6,000회/시간, Vercel 함수 1,200회/시간.
- 동시 100명이면: DB 60만/시간(초당 약 167).
- 서버의 사용자별 제한(분당 120회)보다 낮은 빈도라 막히지 않는다.
- 비교: DB 연결 한도는 60개다.

---

## 3. 정확한 수정안

### 공통 원칙 (§3-D 검사로 고정한다)
1. 상태 변화는 서버가 밀어 준다(Realtime). HTTP 반복 조회는 실시간 경로가 실제로 끊겼을 때만 쓴다.
2. 숨겨진 탭에서는 HTTP 반복 조회를 하지 않는다.
3. 401·429·5xx 는 실패로 처리하고 간격을 늘린다. 앞 요청이 끝나기 전에는 다음 요청을 보내지 않는다.
4. 읽기 API 는 정상 경로에서 쓰기를 하지 않는다. 정리는 cron 과 상태 전이 시점에 한다.

### 3-A. V4 수신 통화: 폴링 → 실시간 구독 [통화 · 단독 커밋 ①]

**A1. 실시간 구독 추가** — `lib/community-messenger/call-v4/call-v4-incoming-discovery.ts` `startCallV4IncomingDiscovery(userId)` 안
- 구독: `acquireIncomingCallRealtimeSubscription` 을 쓴다. 인자는 Legacy(`GlobalCommunityMessengerIncomingCall.tsx:1467-1500`)와 같다.
  - 채널 이름: `community-messenger-incoming-call:<userId>`
  - 채널 옵션: `messengerPrivateBroadcastChannelOptions()`
  - 받는 변경: `postgres_changes` `event:"*"` `table:"community_messenger_call_sessions"` `filter:"recipient_user_id=eq.<userId>"`
- 같은 함수를 쓰므로 같은 사용자 채널은 탭 안에서 1개만 유지된다(참조 카운트).
- 신호를 받으면: 기존 `tick()` 을 1회 실행한다. 수신 시트를 띄울지 판단하는 로직(`pickIncomingRingingCallee` → `isIncomingDiscoveryDuplicateSkip` → `shouldDiscoverCallV4IncomingForWebSheet` → `tryPrimeCallV4WebIncomingOwner`)은 **한 줄도 바꾸지 않는다.**
- 신호 빈도 제어: 같은 순간 여러 변경이 와도 `tick` 은 `inFlight` 로 1개만 돈다. 끝난 직후 1회만 다시 돈다(trailing).
- 운영 DB 사전 확인(변경 불필요):
  - Realtime 권한: `realtime.messages` 정책 `cm_realtime_private_broadcast_select` → `internal.cm_realtime_can_read_topic` 이 `community-messenger-incoming-call` 채널을 허용한다.
  - 테이블 권한: `community_messenger_call_sessions` 가 `supabase_realtime` publication 에 들어 있고, RLS `auth.uid() = recipient_user_id` 로 수신자가 읽을 수 있다.

**A2. HTTP 폴링은 끊겼을 때만** — 같은 함수의 `scheduleNextPoll`
- HTTP 조회 조건(모두 만족할 때만):
  - 기존 경로 조건 `shouldRunCallV4IncomingDiscoveryHttpPoll()`
  - 탭이 보임(`document.visibilityState === "visible"`)
  - 구독 상태가 `SUBSCRIBED` 가 아님
- 간격: 2초에서 시작해 실패할 때마다 두 배, 최대 30초.
- 구독이 `SUBSCRIBED` 가 되면 즉시 멈춘다.
- 1회 맞춤 조회(놓친 울림 복구): 탭이 다시 보일 때(`visibilitychange`), `online`, 구독이 `SUBSCRIBED` 로 돌아올 때.
- 「정상」 판정은 채널 상태(`SUBSCRIBED`)만 본다. `silentAfterMs` 를 주지 않는다(§2-3 대응).

**A3. 실패를 숨기지 않기** — `lib/community-messenger/call-v4/call-v4-api.ts:163` `callV4FetchIncomingSessions`
- 반환 형태: `CommunityMessengerCallSession[]` → `{ ok: true, sessions } | { ok: false, status, retryAfterMs }`
- 처리:
  - 429: `Retry-After` 를 따른다.
  - 401: 폴링을 멈춘다(재로그인은 로그인 경로가 처리한다).
  - 그 밖의 실패: 지수 간격을 늘린다.
- 이 함수를 부르는 곳은 `call-v4-incoming-discovery.ts:138` 1곳뿐이다(전수 grep).

**A4. 적용 플랫폼과 순서**
- 데스크톱·모바일 브라우저, Windows PWA: 커밋 ①에 포함한다.
- iOS 앱 웹 계층: 커밋 ①에 포함하되, 아래 iOS 행렬(I1~I3)이 PASS 일 때만 main 에 반영한다. FAIL 이면 iOS 셸 분기(`isCapacitorNativePlatform() && resolveCapacitorShellPlatform()==="ios"`)만 현재 동작을 유지하는 상태로 반영한다.
  - 이유: 실시간 신호로 웹 수신 탐색이 0~2초 빨라진다. 그러면 CallKit 과 웹 수신 시트 중 누가 먼저 뜨는지가 바뀔 수 있다.
  - 판정 로직(`ios_shell_owner_claim`)은 그대로지만, 순서가 바뀌는지는 실기기로만 확인할 수 있다.
- Android 앱: V4 sync-only 라 이 함수가 마운트되지 않는다(`CallV4Provider.tsx` `syncOnly` 분기) → 영향 없음.

### 3-B. 수신 목록 API: 읽기 전용 [통화 · 단독 커밋 ①에 함께]

**B1. 정상 경로에서 쓰기 제거** — `lib/community-messenger/service.ts:22499` `listIncomingCommunityMessengerCallSessions`
- 뺀다:
  - `reconcileUserLiveCallSessions(userId, "incoming_api")` 호출
  - 두 번째 `terminalStaleRingingDirectSessionsForUser` 호출
- 넣는다: 수신 목록 조회(쿼리 5번)에서 받은 행 중 `isStaleRingingRow(row, policy)`(순수 함수)에 해당하는 행은 응답에서 뺀다. 그 행들만 `terminalOneExpiredRingingAsMissed` 로 missed 확정한다. 이 함수는 지금 비공개라서 export 만 추가하고 내용은 바꾸지 않는다.
- 결과:
  - 정상(만료 울림 없음): 쿼리 5 → **1**
  - 만료 울림 있음: 1 + 해당 행 쓰기
- `getMessengerCallAdminPolicyCached()` 는 그대로 둔다(캐시).

**B2. 바뀌는 동작과 그 영향 (전수)**
`reconcileUserLiveCallSessions` 가 수신 목록 조회 때 하던 일과, 그 일을 계속 맡는 곳:

| 하던 일 | 앞으로 맡는 곳 | 사용자에게 보이는 차이 |
|---|---|---|
| 내가 **수신자**인 만료 울림 → missed | B1 의 해당 행 확정(같은 요청 안) | 없음 |
| 내가 **발신자**인 만료 울림 → missed | 발신자 클라이언트 무응답 타이머 · cron(2분) · 다음 발신 `create_guard` | 발신 앱이 죽은 경우에만 missed 기록이 최대 2분 늦게 확정된다. 수신자 화면에는 이미 B1 로 사라져 있다 |
| 양쪽 하트비트가 끊긴 active 통화 → end | cron(2분) · 다음 발신 `create_guard`·`peer_create_guard`(`service.ts:20397/20399`) · `calls/sessions/active`(`active/route.ts:23`) | 다음 발신·통화중 판정은 생성 가드가 즉시 정리하므로 차이가 없다 |
| 내 live 세션 id 조회 | 수신 목록에서 쓰지 않음 | 없음 |

- `reconcileUserLiveCallSessions` 를 부르는 다른 7곳(`service.ts:1169/1346/20397/20399`, `[sessionId]/route.ts:44`(`?reconcile=1`), `active/route.ts:23`, `rooms/[roomId]/calls/route.ts:55`)은 **바꾸지 않는다.**
- `GET /incoming` 을 부르는 곳(전수): V4 `call-v4-api.ts:164` · V3 `call-v3-api.ts`(운영 미마운트) · Legacy `GlobalCommunityMessengerIncomingCall.tsx:475`(운영 미마운트). 셋 다 「울리는 수신 세션 목록」만 쓰므로 응답 의미가 같다.

### 3-C. 메신저 모니터링 전송: 상한 + 원인 기록 [통화 아님 · 단독 커밋 ②]

`lib/community-messenger/monitoring/client.ts`

- **C1. 전송 상한:** 탭당 1분에 최대 2회(배치 24개)만 보낸다. 넘친 이벤트는 버리고 `category:metric` 별 개수를 센다. 다음 전송에 `monitoring_dropped` 요약 이벤트 1개(상위 5개 종류와 개수)를 넣는다 → §2-2 의 NOT_PROVEN 을 다음 발생 때 해소한다.
- **C2. 숨김 탭:** 숨김 탭에서는 보내지 않고 큐만 유지한다(상한 동일). `pagehide` 때 1회만 `keepalive` 로 보낸다.
- **C3. 합치기:** 같은 `category:metric:scope` 가 1초 안에 반복되면 1개로 합치고 개수만 올린다.
- **C4. 바꾸지 않는 것:** 서버 `monitoring/events/route.ts` 와 회원 권한 분류. 서버 메모리 저장 문제는 §6 Owner 결정 항목이다.
- **영향:** 이 파일의 공개 함수 시그니처는 바꾸지 않는다. 호출처(`messengerMonitor*` 전부)는 수정할 필요가 없다. 받는 쪽(요약 화면)에 도착하는 이벤트 수가 줄어든다.

### 3-D. 재발 방지 검사 [단독 커밋 ③]

- **D1. 공용 도구:** `lib/net/visibility-aware-poller.ts` 신규. 공통 원칙 1~3을 한 곳에 둔다. §3-A·§4 의 수정이 이 도구를 쓴다.
- **D2. 검사 스크립트:** `npm run verify:client-polling` 신규.
  - 찾는 것: 클라이언트 코드에서 `setInterval` 또는 재귀 `setTimeout` 안의 `fetch(` / `.from(` / `.rpc(`
  - 허용 목록: 파일·사유·최대 회/분. 목록에 없으면 실패한다.
  - CI(`npm run ci`)에 넣는다. 허용 목록 초기값은 §4 표다.

---

## 4. 같은 구조의 다른 반복 요청 — 같은 원칙으로 수정 (전수 조사 결과)

운영 V4 기준, 탭 1개의 최악 순서. 「숨김」 = 숨김 탭에서 멈추는가, 「RT」 = Realtime 정상 시 멈추는가, 「실패」 = 실패에 간격을 늘리는가.

| # | 위치 | 대상 | 주기 | 숨김 | RT | 실패 | 수정안 | 구분 |
|---|---|---|---|---|---|---|---|---|
| P1 | `call-v4-caller-active.ts:116` | GET `/calls/sessions/:id` | 0.5초 | 아니오 | 아니오 | 아니오 | 앞 요청이 끝나기 전 다음 요청 금지 · 실패 간격 증가. 주기는 유지(울림 중 종료 체감) | 통화 ④ |
| P2 | `native-outgoing-terminal-sync.ts:129` | 같은 GET | 0.5초 | 아니오 | 아니오 | 아니오 | P1 과 같음 | 통화 ④ |
| P3 | `call-v4-connected-terminal-watch.ts:127`(웹) | 같은 GET | 1초, 통화 내내 | 아니오 | 아니오 | 아니오 | 이미 있는 종료 신호 구독(`cm-call-invite` hangup·terminal, 183행 `realtimeHangupSubscribed`)이 `SUBSCRIBED` 이면 HTTP 조회 안 함, 아니면 1초 + 앞 요청 끝나기 전 다음 요청 금지 — 네이티브 모드(117행)가 이미 쓰는 규칙을 웹에도 적용 | 통화 ④ |
| P4 | `AuthSessionBoundary.tsx:96` | `/api/auth/session` + `getSession()` | 1초 × 2요청 | 아니오 | — | 아니오 | 숨김 시 정지 · 실패 간격 증가(최대 30초) · 같은 화면 최대 횟수 | 인증 ⑤ (Auth HARD LOCK 절차) |
| P5 | `ChatDetailView.tsx:1249` | 거래 채팅 메시지 | 5초 | 예 | 아니오 | 아니오 | Realtime 정상 시 다른 채팅과 같은 25초 | 거래 ⑥ |
| P6 | `TradePresenceActivityContext.tsx:75` | trade-presence heartbeat | 15초 | 아니오 | — | 아니오 | 숨김 시 정지 | 거래 ⑥ |

- 범위 밖: Legacy·V3 폴링(`GlobalCommunityMessengerIncomingCall`, `call-v3-incoming-discovery.ts:176`)은 운영 미마운트라 고치지 않는다. 대신 §3-D2 허용 목록에 넣지 않아서, 플래그를 되돌리면 검사가 실패하게 한다.
- 진행 순서: ① → ② → ③ → ④ → ⑤ → ⑥. 각 단계는 따로 커밋하고, 앞 단계 실기 PASS 후에 다음 단계로 간다.

---

## 5. 통화 변경 규정 이행 (커밋 ①·④)

### 5-1. 바뀌지 않는 것
발신 생성 API, VoIP/FCM 발송(`incoming-call-voip-dispatch`), CallKit·Android 수신 화면, 수락·거절·취소·종료 PATCH, 통화 기록, 네이티브 파일 전부, DB(마이그레이션·RLS·함수) 전부.

### 5-2. 설치된 구 바이너리 호환 (`user_devices.app_version`, 최근 14일)
- Android: 1.2.5 (37) 16대 · (20) 7대 · (24) 2대 · (32) 1대 · 1.2.4 (18) 2대 · (11) 1대 · 1.2.1 (4) 1대
- iOS: 1.2 (21) 3대 · (22) 9대 · (23) 2대 · (24) 3대 · (26) 1대 · (27) 3대 · (16) 2대
- 네이티브 브리지 계약을 바꾸지 않는다 → 재설치 없이 웹 배포로 적용된다. Android 는 V4 sync-only 라 §3-A 영향이 없다.

### 5-3. 회귀 위험과 대응
| 위험 | 대응 |
|---|---|
| 숨김 탭에서 Realtime 연결이 끊겨 울림을 놓침 | W3·W4 실측. 재연결·탭 복귀 때 1회 조회로 맞춘다. W3 FAIL 이면 supabase-js Realtime `worker: true`(하트비트를 Web Worker 로) 적용을 같은 커밋에 포함한다(구현 전 설치 버전 문서 확인) |
| iOS 에서 CallKit 과 웹 시트 순서가 바뀜 | §3-A4. I1~I3 PASS 전에는 iOS 셸 분기만 현재 동작 유지 |
| 같은 울림이 구독과 1회 조회로 두 번 들어옴 | 기존 `isIncomingDiscoveryDuplicateSkip` 를 그대로 거친다 |
| 만료 울림이 목록에 남음 | B1 에서 읽을 때 걸러낸다 |
| 통화중 판정 오류 | 생성 가드 reconcile 유지(B2 표) |

### 5-4. 롤백
웹 전용이다. 해당 커밋 revert → main 반영 → 앱·브라우저 재시작. DB·네이티브 변경 없음.

### 5-5. 실기기 검증 행렬
- 매 회 기록: Production SHA, 시각(PHT), 발신 시각, 세션 생성(`created_at`), VoIP/FCM 발송(`notification_deliveries`), 수신 화면 표시, 연결, 종료 시각.
- 서버 시각은 운영 DB 로 대조한다.

| # | 발신 → 수신 | 항목 |
|---|---|---|
| M1~M4 | Android → iPhone, iPhone → Android | 음성·영상 각각 발신·수신·연결 |
| M5 | 양방향 | 거절 |
| M6 | 양방향 | 울림 중 취소 |
| M7 | 양방향 | 취소 후 늦게 온 푸시(다시 울리지 않아야 함) |
| M8 | 양방향 | 통화 중(busy) |
| M9 | 양방향 | 무응답 타임아웃 → missed (발신 앱 강제 종료 경우 포함: missed 확정 시각 기록) |
| M10 | 양방향 | 정상 종료 후 즉시 재발신 |
| W1·W2 | Android·iPhone → 데스크톱 Chrome(탭 보임) | 수신 시트 표시까지 걸린 시간 |
| W3 | Android → 데스크톱 Chrome(메신저 탭 **숨김 10분 후**) | 울림 도착·소리 |
| W4 | 같은 조건, 네트워크 끊었다 연결 | 재연결 후 놓친 울림 복구 |
| I1 | Android → iPhone(앱 앞, 메신저 화면) | CallKit 과 웹 시트 중 하나만 뜬다 |
| I2 | Android → iPhone(앱 뒤) | CallKit 수신(현재와 같음) |
| I3 | I1 상태에서 수락·거절 | 화면 1개, 통화 정상 |
| R1 | 메신저 탭 30분(보임·숨김 각각) | 운영 `edge_logs` 에서 해당 사용자 `community_messenger_call_sessions` 요청 = 0 (Realtime 정상 시) |
| R2 | 수신 목록 1회 | DB 쿼리 1개(만료 울림 없을 때) |

### 5-6. 코드 검증 (실기 전)
- `npm run typecheck:build` · `npm run typecheck:test`
- 변경 파일 eslint
- vitest:
  - 기존 `call-v4-*` · `call-active-presence` · `call-engine-*` 테스트
  - 신규: A2 조건표(보임/숨김 × SUBSCRIBED/아님 × 경로), A3 응답 형태(200/401/429/500), B1(만료 울림 행 걸러내기와 그 행만 확정)

---

## 6. Owner 결정 필요 (계약·지시 없음 → 비워 둠)

1. 메신저 모니터링 서버 저장: 지금은 인스턴스 메모리라 데이터가 남지 않는다. (a) DB 에 집계 저장 (b) 운영 수집 중단 중 무엇으로 할지.

## 7. 지금 바로 멈추는 방법 (코드 변경 아님)
맥 Chrome 의 `samarket.vercel.app/community-messenger/rooms/3e92fa77-…` 탭을 닫으면 원인 A 의 현재 반복 조회는 즉시 멈춘다. 코드 결함은 §3 수정 전까지 남는다.
