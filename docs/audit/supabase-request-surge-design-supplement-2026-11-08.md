# Supabase 요청 폭증 — 설계 보완 · 안전성 검증 (구현 0건)

- 작성: 2026-11-08 PHT · 기준 코드: `origin/main` · 기준 문서: `docs/audit/supabase-request-surge-root-cause-design-2026-11-08.md` (이하 「원 설계서」)
- 이번 단계: 설계 보완과 검증만 한다. **운영 코드·DB·설정·Production 배포 변경 0건.** 운영 DB 는 읽기 전용으로만 조회했다.
- 우선순위(Owner): 기존 통화·메신저·친구·알림·인증 기능의 정합성이 서버 요청량 감소보다 우선이다.
- 판정 표기:
  - **CODE**: 코드로 확인한 사실
  - **PROD**: 운영 데이터로 확인한 사실
  - **NOT_PROVEN**: 실행·실기로 확인하지 않은 것
  - **BLOCKED**: 동등성이 깨져서 진행할 수 없는 것

## 0. 정정 (작업자 잘못 · 먼저 보고)

| # | 앞 보고·원 설계서 | 사실 | 근거 |
|---|---|---|---|
| E4 | 모니터링 폭주 때 권한 검사 RPC 「약 1.8만 건」 | **34,400건** (11-08 16:00~18:40 PHT). 429 로 거절된 요청도 라우트보다 먼저 proxy 권한 검사를 거친다 | PROD `edge_logs` `member_write_gate_snapshot` 구간 집계 |
| E5 | 원 설계서 §3-B: 3번 조회(`getUserLiveDirectCallSessionId`)는 「결과를 쓰지 않는 읽기」 | 최신 live 세션이 만료 울림이면 **정리(쓰기)를 한 번 더 실행한다** → 순수 읽기가 아니다 | CODE `service.ts` `getUserLiveDirectCallSessionId` (`mode==="live"` 분기) |
| E6 | 원 설계서 §3-B: 「쿼리 5→1, 사용자에게 보이는 차이는 발신 앱 강제 종료 시 missed 최대 2분 지연뿐」 | 동등하지 않은 상태가 그보다 많다(§6). **§3-B 는 BLOCKED** | 아래 §6 |
| E7 | 원 설계서 §3-A: 실시간 구독이 붙으면 HTTP 폴링을 멈춘다 | Owner 불승인 사항이다. 이번 보완안은 **폴링을 그대로 두고 실시간을 병행**한다 | Owner 지시 §2 |

「기존 M2 테스트에서 발견된 비동등성 2건」의 원문은 이 세션, 저장소(`origin/main`), 다른 Claude 세션 기록 어디에서도 **찾지 못했다**. 이 문서에서는 지시서 §3 의 「첫 정리 실패 후 재시도 성공」과 「두 정리 호출 사이 만료」를 그 2건으로 보고 §6 에서 코드로 검증했다. 원문이 따로 있다면 대조가 필요하다.

---

## 1. 확정된 요청 폭증 원인과 비중

조건: PROD `edge_logs` · 고정 24시간 창 2026-11-07 19:00 ~ 11-08 19:00 PHT · 전체 338,228건

| 원인 | 건수 | 비중 | 증거 수준 |
|---|---|---|---|
| A. V4 웹 수신 탐색 2초 폴링 → `GET community_messenger_call_sessions` | 172,112 | **50.9%** | PROD + CODE |
| └ 관리자 맥 Chrome 메신저 방 탭(숨김) | 144,487 | 42.7% | PROD (방 열기 로그 11-07 19:24:34 → 35초 뒤 시작, Chrome 세션 `79f74363` 만 밤새 갱신) |
| └ `edc8c2f0` Windows Chrome | 25,037 | 7.4% | PROD (인증 기록). 화면은 NOT_PROVEN |
| B. 모니터링 전송 폭주 → proxy `member_write_gate_snapshot` | 34,400 | **10.2%** | PROD (Vercel observability `POST /api/community-messenger/monitoring/events` 분당 약 225회) |
| 나머지(정상 사용·cron 등) | 약 13.2만 | 약 39% | 분해하지 않음 |

- A 의 증폭 구조(CODE): 클라이언트가 2초 주기로 조회하고, 탭 숨김·Realtime·실패 응답을 보지 않는다. 서버는 조회 1회에 쿼리 5개를 쓴다. 근본 원인은 **V4 웹에 수신 실시간 경로가 없다는 것**이다.
  - PROD `realtime.subscription`(현재 활성 구독) 기준: `community_messenger_call_sessions` 구독은 `room_id in` 1건뿐이고 **`recipient_user_id` 구독은 0건**이다.
- B 에서 어떤 이벤트가 폭주했는지: **NOT_PROVEN** (서버가 내용을 남기지 않음).

---

## 2. 현재 설계에서 기능이 깨질 수 있는 지점

| # | 지점 | 깨지는 것 | 근거 |
|---|---|---|---|
| K1 | 원 설계서 §3-B 수신 API 5→1 쿼리 | missed 확정 횟수·시점·주체, 오래된 active 통화 종료, 응답 내용 (§6 표 10건 중 5건 비동등) | CODE |
| K2 | 원 설계서 §3-A 「SUBSCRIBED 면 폴링 0」 | 숨김 탭·Windows 백그라운드에서 연결이 끊기면 수신 누락 | PROD: 관리자 계정의 현재 Realtime 구독 생성 시각이 11-08 15:21·18:52 PHT 뿐이다. 11-07 19:24 에 연 탭이 있는데도 그 시각 구독이 없다 → 그 사이 재연결이 있었다. 어느 클라이언트의 재연결인지는 NOT_PROVEN |
| K3 | Legacy 구독 함수 `acquireIncomingCallRealtimeSubscription` 재사용 | 같은 사용자로 두 번 획득하면, **두 번째 호출자의 `build`(이벤트 핸들러)가 붙지 않는다**. 첫 채널을 그대로 돌려준다 | CODE `cm-incoming-call-realtime-holder.ts:34-56`. `holderByUserId` 는 userId 만 키로 쓰고, 기존 채널이 있으면 `existing.sub.channel` 을 반환한다 |
| K4 | iOS 앱 웹 계층에서 실시간 수신 | 웹 탐색이 빨라져 CallKit 과 웹 수신 시트의 순서가 바뀔 수 있다 | CODE (`CallV4WebEstablishmentHost` 는 iOS 에서도 마운트). 실제 순서 변화는 NOT_PROVEN |
| K5 | 실시간 UPDATE(종료) 이벤트로 수신 화면 종료 처리 | 기존 종료 경로(FCM·bus·hangup broadcast)와 겹쳐 종료가 두 번 처리될 위험 | CODE `CallV4Provider.tsx` 의 `onFcmTerminal`·`onCommunityMessengerBusEvent` |
| K6 | 모니터링 경로를 권한 예외(EXEMPT)로 바꾸기 | 권한 계약 위반(EXEMPT 목록 개수는 Owner 계약) | CODE `member-action-policy.ts` `MEMBER_MUTATION_EXEMPT_INVENTORY_COUNT = 16` |

---

## 3. 함수별 안전한 수정 순서 (최소 변경 단위 = §8)

각 단계는 단독 커밋으로 하고, 앞 단계의 증명이 끝난 뒤에만 다음 단계로 간다.

1. **S1 모니터링 집계 보존**(§7) — 통화와 무관하다. S2 의 수신률을 재는 도구가 된다.
2. **S2 V4 웹 수신 실시간 병행**(§5) — 통화 단독. 폴링·서버 쿼리는 그대로 둔다. 브라우저·PWA 에만 적용하고 iOS 앱 셸은 제외한다.
3. **S3 수신률·복구율 측정** — S2 를 운영에 둔 뒤 실기 행렬과 운영 집계로 증명한다.
4. **S4 폴링 축소안 제시** — S3 결과가 기준을 넘을 때만 별도 설계서로 제시한다. 이번 승인 대상이 아니다.
5. **S5 수신 API 쿼리 축소** — §6 이 BLOCKED 이므로 진행하지 않는다. 동등성을 지키는 대안(§6 끝)을 따로 설계한다.
6. 통화·인증·거래의 다른 반복 조회(§9)는 위와 묶지 않고 영역별로 설계한다.

---

## 4. 기존 테스트로 증명된 것 / 추가 증명이 필요한 것

| 대상 | 기존 테스트가 증명하는 것 (CODE) | 증명 안 됨 → 추가 필요 |
|---|---|---|
| `call-v4-incoming-discovery.ts` | `__tests__/call-v4-incoming-discovery.test.ts` 3건: web_in_app 소유자일 때만 발견, `/philife` 에서 폴링 생략 | 숨김·Realtime·실패 응답 처리, 실시간 병행, 중복 신호 |
| `listIncomingCommunityMessengerCallSessions` | **테스트 0건** | §6 의 10개 상황 전부 |
| `reconcileUserLiveCallSessions` | 세션 GET 라우트 테스트(`call-session-get-route.test.ts`)에서 `?reconcile=1` 호출 여부만 확인 | 수신 API 경로에서의 효과 |
| `cm-incoming-call-realtime-holder.ts` | `call-logout-teardown.test.ts`(로그아웃 시 해제) | 두 번째 획득 시 핸들러 미부착(K3) |
| `monitoring/client.ts` | **테스트 0건** | 상한·숨김·합치기 |
| `AuthSessionBoundary.tsx` | `auth-session-boundary-probe-stops.test.tsx`: 「확인 전에는 1초마다 확인한다」(**명시 계약**), 로그인 확인 후 멈춤 | — (인증 HARD LOCK 대상) |
| `call-v4-connected-terminal-watch.ts` | `__tests__/call-v4-connected-terminal-watch.test.ts` 외 3건 | 웹 모드 동시 요청 겹침 |
| 숨김 탭·Windows 백그라운드 수신 | 없음 | 실기 W3·W4 |
| iOS CallKit·웹 시트 중복 | 없음 | 실기 I1~I3 |

---

## 5. Realtime 병행 수신 (S2) — 설계와 실패 복구 계약

### 5-1. 범위
- 적용: V4 웹 수립 경로 중 **Capacitor 네이티브가 아닌 브라우저·PWA** 만(`!isCapacitorNativePlatform()`).
  - iOS 앱 셸은 K4 때문에 제외한다.
  - Android 앱은 원래 sync-only 라 해당 없다.
- **HTTP 2초 폴링·서버 수신 API 는 한 줄도 바꾸지 않는다.**

### 5-2. 구독
- 채널: `community-messenger-incoming-call:<uid>`, 옵션 `messengerPrivateBroadcastChannelOptions()`
- 받는 변경: `postgres_changes` `event:"*"` `table:"community_messenger_call_sessions"` `filter:"recipient_user_id=eq.<uid>"`
- K3 대응: Legacy holder 를 그대로 쓰지 않는다. holder 에 **핸들러 등록 목록(fan-out)** 을 추가해, 두 번째 획득자의 핸들러도 같은 채널 이벤트를 받게 한다. Legacy 동작은 획득자가 1명이므로 바뀌지 않는다.
- 운영 사전 조건(PROD, 변경 불필요):
  - `realtime.messages` 정책 → `internal.cm_realtime_can_read_topic` 이 이 채널을 허용한다.
  - 테이블이 `supabase_realtime` publication 에 포함돼 있다.
  - RLS `auth.uid() = recipient_user_id` 로 수신자가 읽을 수 있다.

### 5-3. 이벤트 처리 (기존 판단 경로만 호출)
- `new.status === "ringing"` 이고 `new.recipient_user_id === uid` 이면 → 기존 `tick()` 1회.
  - `tick` 은 HTTP 로 다시 조회한 뒤 기존 판단(`pickIncomingRingingCallee` → `isIncomingDiscoveryDuplicateSkip` → owner gate → `callV4IncomingDiscovered`)을 그대로 거친다. 실시간 페이로드로 화면을 직접 띄우지 않는다.
- **종료 UPDATE(cancelled/missed/ended/rejected)는 무시한다.** 종료 처리는 기존 경로(FCM·bus·hangup broadcast·기존 감시)만 쓴다 → K5 회피.
- 동시 도착: `tick` 은 `inFlight` 로 1개만 돈다. 진행 중에 들어온 신호는 끝난 뒤 1회만 다시 실행한다.

### 5-4. 실패 복구 계약 (S2 기준 — 폴링이 남아 있으므로 계약은 「현재보다 나빠지지 않음」)

| 상황 | 동작 | 최악 결과 |
|---|---|---|
| 구독 실패·끊김(CHANNEL_ERROR/TIMED_OUT/CLOSED) | 기존 `subscribeWithRetry` 재시도. 폴링은 계속 돈다 | 지금과 같다(폴링으로 발견) |
| 이벤트 누락 | 폴링이 2초 안에 발견한다 | 지금과 같다 |
| 이벤트 중복(재연결 재전송 등) | `inFlight` + `callV4IncomingDiscovered` 의 같은 callId 차단(CODE `call-v4-actions.ts:1100`) | 화면 1개 |
| 이벤트 지연(폴링보다 늦게 옴) | 이미 발견된 callId 라 차단된다 | 지금과 같다 |
| 이벤트가 폴링보다 먼저 옴 | 같은 판단 경로로 0~2초 먼저 발견한다 | 브라우저에서는 소유자 판정이 `pure_web_owner_claimed` 로 같다(CODE `O()`). 영향은 실기 W1·W2 로 확인 |
| 이벤트와 폴링이 동시에 옴 | 둘 다 같은 `tick` 을 호출하고 `inFlight` 가 1개로 줄인다 | 상태 일치(같은 HTTP 응답 사용) |
| 로그아웃 | holder 해제(기존 `call-logout-teardown` 계약 유지) | — |

### 5-5. 측정 (S3 의 증명 수단 — S1 집계로 보낸다)
- 수신 callId 별로 「먼저 발견한 경로」를 센다:
  - `incoming_found_realtime_first` / `incoming_found_poll_first`
  - `incoming_realtime_never`: 폴링으로 발견했는데 10초 안에 실시간 이벤트가 오지 않음
  - 발견 지연(세션 `started_at` 기준 ms)
  - 탭 상태(보임/숨김)
- 폴링 축소안(S4)을 제시하는 기준(Owner 확인 필요, 제안값): 숨김·보임 각각 7일간 `incoming_realtime_never` 비율이 0%, 재연결 후 놓친 울림 복구 100%(W4). 이 기준을 만족하기 전에는 축소안을 내지 않는다.

### 5-6. 지시서 §2 의 6개 검증 항목 — 현재 판정

| # | 항목 | 판정 | 근거·남은 증명 |
|---|---|---|---|
| 1 | 서버의 통화 생성 이벤트가 Realtime 으로 전달되는가 | 경로 존재 PROD / 실제 전달 **NOT_PROVEN** | publication·RLS·채널 권한 확인. 실제 수신은 S2 배포 후 W1 과 운영 집계로 확인 |
| 2 | Legacy 구독 함수 재사용 시 채널 충돌 | **충돌 위험 있음(K3) → 설계로 해소** | Legacy 와 V4 는 동시에 마운트되지 않는다(CODE `CallIncomingChrome.tsx:84-96` 배타 분기). 그래도 holder 의 핸들러 미부착 결함은 fan-out 으로 막는다 |
| 3 | 누락·중복·지연·재연결 시 화면 정확성 | 설계상 「현재보다 나빠지지 않음」 CODE / 실기 **NOT_PROVEN** | §5-4, 실기 W1~W4, M6·M7 |
| 4 | 숨김 탭·Windows 백그라운드 수신 | **NOT_PROVEN** | K2 관찰. 실기 W3(숨김 10분), W5(Windows 최소화·다른 창 작업 10분) |
| 5 | iOS CallKit 과 웹 시트 중복 | S2 에서 iOS 셸 **제외**로 회피 / iOS 적용은 **NOT_PROVEN** | 실기 I1~I3 PASS 후 별도 단계 |
| 6 | 폴링과 이벤트 동시 도착 시 상태 일치 | 설계상 일치 CODE / 실기 **NOT_PROVEN** | 둘 다 같은 `tick`·같은 HTTP 응답·`inFlight` 1개 |

---

## 6. 수신 API 쿼리 축소 — 상태 동등성 결과 → **BLOCKED**

### 비교 대상
- **현재(C)**, 조회 1회의 실행 순서:
  - R1 `terminalStaleRingingDirectSessionsForUser`: 사용자의 발신·수신 양쪽 ringing ≤20건 중 만료분 → missed. actor = 수신자, 사유 `stale_ringing_expired`
  - R2 reconcile 조회: ringing·active ≤20건. 만료 울림 → missed (actor = **조회한 사용자**, 사유 `reconcile_stale_ringing`). 양쪽 하트비트가 끊긴 active → end (사유 `reconcile_stale_active` → `heartbeat_timeout`)
  - R3 `getUserLiveDirectCallSessionId`: 최신 live 가 만료 울림이면 R1 과 같은 정리를 **한 번 더**
  - L1 R1 과 같은 정리 **한 번 더**
  - L2 수신 목록(recipient·ringing ≤10건). **만료 여부로 걸러내지 않는다**
- **원 설계서 §3-B(P)**: L2 → 만료 행은 응답에서 빼고 → 그 행만 missed 1회 (actor = 수신자)

### 상황별 비교 (CODE 분석. 실제 DB 실행 비교는 테스트 DB 사용 금지·운영 쓰기 금지로 **실행하지 않음**)

| # | 상황 | 응답 | DB 최종 상태 | 부작용(통화 기록·부재중 알림·종료 신호·이벤트 actor) | 판정 |
|---|---|---|---|---|---|
| 1 | 정상 수신 | 같음 | 같음(쓰기 없음) | 없음 | 동등 |
| 2 | 벨 중 취소 | 같음(양쪽 다 목록에서 빠짐) | 같음 | 같음 | 동등 |
| 3 | 수신 만료(정리 성공) | 같음(C 는 R1 이 먼저 missed, P 는 걸러냄) | missed 로 같음 | actor 수신자로 같음 | 동등 |
| 4 | **첫 정리 실패 후 재시도 성공** | C: R2·R3·L1 에서 최대 3번 더 시도해 missed 확정 후 제외 / P: 1회 실패하면 응답에서만 빠지고 DB 는 ringing 유지 | **다름** | missed 기록·알림·종료 신호 시점이 다음 조회 또는 cron(2분)으로 밀림 | **비동등** |
| 5 | **두 정리 호출 사이 만료** | C: L1 과 L2 사이에 만료되면 ringing 그대로 반환, 쓰기 없음 / P: 걸러내고 missed 확정 | **다름** | 다름 | **비동등** |
| 6 | 발신자 강제 종료(수신자가 조회 중) | 정리가 성공하면 3번과 같음 | 같음 | R1 이 실패하고 R2 가 처리하면 C 의 actor = 조회자, 사유 `reconcile_stale_ringing`(wire 는 둘 다 `missed`) | 성공 시 동등 / 실패 경로는 4번과 같은 **비동등** |
| 7 | **active 통화 하트비트 만료** | 같음(목록 무관) | C: 다음 조회(≤3초)에 `heartbeat_timeout` 으로 종료 / P: cron(≤2분)·다음 발신 가드까지 active 유지 | 종료 신호·통화 기록 시점 다름 | **비동등** |
| 8 | busy 판정 | 발신 시점 판정은 같음(`create_guard`·`peer_create_guard` reconcile 유지) | 7번 상태가 남아 있는 동안 다른 화면의 「통화 중」 표시 | NOT_PROVEN | 발신 판정은 동등 / 표시는 NOT_PROVEN |
| 9 | 종료 직후 재발신 | 같음 | 같음(`create_guard` 유지) | 같음 | 동등 |
| 10 | **동시 수락·거절·종료** | 마감 직전 수락과 겹칠 때 C 는 missed 시도가 최대 4번, P 는 1번 | 조건부 업데이트(`eq status ringing`)라 먼저 쓴 쪽이 이김. 결과 분포가 다름 | 다름 | **비동등**(경합 구간) |
| + | 조회한 사용자가 **발신자**인 만료 울림 | 같음 | C: R1·R2 가 missed 확정 / P: 건드리지 않음(cron·발신자 타이머) | 확정 시점 다름 | **비동등** |

**결론: 원 설계서 §3-B 는 BLOCKED.** 10개 중 4·5·7·10번과 추가 항목이 다르다. E5 때문에 R3 하나만 빼도 4·5번이 달라지므로, 「동등하게 뺄 수 있는 쿼리」는 현재 구조에 **없다.**

**동등성을 지키는 대안(별도 설계 · 이번 승인 대상 아님)**: 서버 쿼리를 줄이는 대신 **호출 횟수를 줄인다**. 같은 사용자의 정리(R1~R3·L1)를 「사용자당 N초에 1회」로 묶으면 정리 결과는 같고 시점만 N초 안에서 달라진다. 이것도 시점이 바뀌는 변경이므로 S3 측정 이후에 설계한다.

---

## 7. 모니터링 집계 보존 (S1) — 비용·쓰기 상한

### 7-1. 구조
- **클라이언트**(`monitoring/client.ts`): 원시 이벤트를 보내지 않는다. 탭 메모리에 `(category, metric, platform)` 별로 `count·sum·max·dropped` 를 집계한다.
  - 보내는 시점: **5분에 1회**(+ `pagehide` 때 `keepalive` 1회).
  - 숨김 탭: 집계만 하고, 보이게 되거나 `pagehide` 때 보낸다.
  - 키 상한: 탭당 64개. 넘친 키는 `dropped` 로 센다.
  - 공개 함수 시그니처는 그대로라 호출처 수정이 없다.
- **저장하지 않는 것**: 방·세션 ID 끝자리(`roomIdSuffix`·`sessionIdSuffix`), 사용자 ID, 토큰, 메시지 본문, 자유 문자열 라벨. 라벨은 허용 목록(`platform`, `scope`, `outcome`, `status` 열거값)만 남긴다.
- **서버**(`monitoring/events/route.ts`): 검증·절단 후 DB 함수 1회 `cm_monitoring_rollup_add(p_rows jsonb)` → `cm_monitoring_rollup_hourly(bucket_hour, category, metric, platform, count, sum, max, dropped)` 에 `ON CONFLICT` 로 더한다(신규 테이블·함수 = DB 변경, Owner 승인).
  - 실패 처리: 예외를 삼키고 204 를 돌려준다. UI 는 응답을 기다리지 않는다(기존 fire-and-forget) → **모니터링 장애가 메신저·통화에 영향을 주지 않는다.**
- **보존**: 14일. 같은 DB 함수가 실행될 때 `bucket_hour < now()-14d` 를 최대 500행씩 지운다. 새 cron 은 없다.
- **서버 메모리 소실**: 영향 없다(집계가 DB 에 있다). 요약 API 는 DB 를 읽도록 바꾼다(관리자 화면 2곳: `/api/admin/community-messenger/monitoring/summary`, `/api/system/messenger-monitoring-summary`).

### 7-2. 비용·쓰기 상한 (산술)
| 항목 | 상한 |
|---|---|
| 탭당 POST | 시간당 12회 + `pagehide` 1회 (현재 폭주 시 분당 225회) |
| 탭당 DB 쓰기 | POST 1회당 RPC 1회 → 시간당 최대 13회 |
| 탭당 proxy 권한 검사 | POST 와 같음 → 시간당 최대 13회 |
| 열린 탭 100개 | 시간당 RPC 1,300회 + 권한 검사 1,300회 |
| 행 수 | 허용 `category×metric`(코드 기준 약 40개, 구현 시 확정) × platform 3 × 24시간 = 하루 최대 약 2,900행. 14일 약 4만 행 |
| 서버 rate limit | 사용자당 분당 60회 → 5분당 3회로 낮춘다(429 는 클라이언트가 다음 주기까지 대기) |

### 7-3. proxy 권한 RPC 재검증 (권한 계약 기준)
- 현재 분류(CODE):
  - 동의 정책: `telemetry_or_removed`(동의 예외)
  - 회원 행위 분류: PRODUCT_WRITE → 요청마다 `member_write_gate_snapshot`
- 선례(CODE):
  - presence 하트비트: EXEMPT. 근거는 `member-action-policy.ts` 주석(「Owner 승인 2026-11-01」)과 `docs/auth-hard-lock.md` 기록이다. 주석이 가리키는 `presence-write-gate-exempt-design-2026-11-01.md` 는 저장소에 **없다**
  - `/api/telemetry/*`: NON_MEMBER(「회원 행위 아님, DB 미사용」)
- 판단: S1 이후 이 경로는 **DB 에 쓴다**(집계). 따라서 「DB 미사용」 근거의 NON_MEMBER 는 해당하지 않는다. EXEMPT 는 Owner 계약 개수(16) 변경이 필요하다(K6).
- **결정: 분류를 바꾸지 않는다(PRODUCT_WRITE 유지).** S1 의 전송 상한으로 권한 검사도 탭당 시간당 13회로 줄어든다. 보안 검사를 우회할 이유가 없다.

---

## 8. Owner 가 승인해야 할 최소 변경 단위

| 단위 | 내용 | 영역 | 승인 형태 |
|---|---|---|---|
| U1 | S1 모니터링 집계 보존: 클라이언트 집계·전송 상한 + 서버 RPC + 신규 테이블·함수 + 요약 API 의 DB 읽기 | 메신저 모니터링 + **운영 DB 적용** | 구현 승인 + DB 적용 승인 |
| U2 | S2 V4 웹 수신 실시간 병행(브라우저·PWA 만, 폴링·서버 무변경, holder fan-out, 종료 UPDATE 무시) + §5-5 측정 | **통화(단독 커밋)** | 구현 승인 · 실기 행렬 M1~M10·W1~W5 |
| U3 | S3 측정 기준값(§5-5 제안: 7일 `incoming_realtime_never` 0%, W4 복구 100%) | 기준 | 값 승인 |
| — | 수신 API 쿼리 축소 | **BLOCKED** | 승인 요청 안 함 |
| — | 다른 반복 조회 6곳(§9) | 영역별 별도 | 이번 요청 안 함 |

U1 이 먼저다. U2 의 증명 수단이 U1 이기 때문이다.

---

## 9. 다른 반복 조회 6곳 — 영역별 구분 (이번 변경과 묶지 않음)

| # | 위치 | 호출 주체 | 기능상 필요 | 종료 조건 | 중복 | 기존 테스트 계약 | 절차 |
|---|---|---|---|---|---|---|---|
| P1 | `call-v4-caller-active.ts:116` (0.5초) | 발신자 V4 통화 화면 | 수신자의 수락·거절을 발신자가 알아야 함 | active·종료·404·울림 단계 이탈 | P2 와 같은 GET(플랫폼별 배타 — Android 네이티브는 P2) | `call-v4-cleanup-heartbeat.test.ts` | 통화 규정 |
| P2 | `native-outgoing-terminal-sync.ts:129` (0.5초) | Android 네이티브 발신 | 같음 | 단계 변경·active·종료 | P1 | `native-outgoing-terminal-sync.test.ts` 외 3건 | 통화 규정 |
| P3 | `call-v4-connected-terminal-watch.ts:127` (웹 1초, 통화 내내) | 웹 연결 통화 | 상대 종료 감지 | 통화 종료 | 종료 신호 구독(`realtimeHangupSubscribed`)과 중복. 네이티브 모드(117행)는 구독 정상이면 HTTP 생략 | `call-v4-connected-terminal-watch.test.ts` 외 3건 | 통화 규정 |
| P4 | `AuthSessionBoundary.tsx:96` (1초 × 2요청) | 전역 인증 경계 | 로그인 완료 감지 | 로그인 확인 시 멈춤(2-C) | — | `auth-session-boundary-probe-stops.test.tsx` **「확인 전에는 1초마다 확인한다」 명시 계약** | **인증 HARD LOCK** (`docs/auth-hard-lock.md` 재개 절차) |
| P5 | `ChatDetailView.tsx:1249` (거래 5초) | 거래 채팅방 | 메시지 동기화 | 방 나가기 | Realtime 정상이어도 실행(다른 채팅은 Realtime 시 25초) | 주기를 다루는 테스트 없음(스크롤·뒤로가기·알림 계약 4건) | 거래 |
| P6 | `TradePresenceActivityContext.tsx:75` (15초) | 거래 대표 탭 | 거래 접속 표시 | 없음(마운트 내내) | — | 테스트 없음 | 거래 |

「기능상 필요」 칸은 코드 주석·호출 구조 기준이다(CODE). 실제로 기능에 필요한지(예: P3 웹 1초 HTTP 를 줄여도 종료 감지가 같은지)는 **NOT_PROVEN** 이며, 각 영역 설계에서 증명한다.
