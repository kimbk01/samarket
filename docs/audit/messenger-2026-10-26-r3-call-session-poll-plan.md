# R3 통화 세션 조회 정리 — 측정·영향 분석·계획 (2026-10-26 PHT)

> 상태: **설계만 · 구현 전 · Owner 승인 대기**. 통화 변경 규정(AGENTS.md「통화 변경 규정」) 적용 대상.
> 기준 코드: `origin/main` `7250c5c2a` (설치 바이너리 iOS 1.2 (15) · Android 1.2.4 (12) Samsung, 1.2.4 (11) Xiaomi).

## 1. 측정 (운영, 읽기 전용)

Vercel observability `vercel.function_invocation.count`, `request_path` 기준. 모든 메서드 포함(GET 폴링 + PATCH 하트비트·동작).

| callId | 종류 | 시각 (PHT) | 길이 | `/calls/sessions/{id}` 호출 | 초당 |
|---|---|---|---|---|---|
| `0435ac5d` | iPhone→Samsung 영상, 무응답 → missed | 20:04:41–20:05:14 | 33초 (벨) | **57** | 1.7 |
| `53f93578` | iPhone↔Samsung 음성, 연결 후 종료 | 20:07:31–20:08:26 | 55초 (벨+연결) | **84** | 1.5 |

10초 구간별 호출 수: `0435ac5d` 13 / 17 / 17 / 10, `53f93578` 10 / 21 / 13 / 13 / 13 / 14.
비교: 통화 1건에 꼭 필요한 호출은 생성 POST(다른 경로), 수락 또는 거절 PATCH 1회, 종료 PATCH 1회, 토큰 1회뿐입니다.
**호출의 약 95%는 상태 확인 반복 호출입니다.**

**측정 한계 (NOT_PROVEN)**: 서버 측정으로는 어느 기기·어느 코드가 호출했는지 나눌 수 없습니다. observability 에 user-agent·method 차원이 없고, GET 경로는 로그를 남기지 않습니다.
아래 §2 의 출처별 배분은 **코드로 확인한 이론값**입니다. 실제 배분은 §6-0 측정으로 확정합니다.

## 2. 반복 조회 출처 (코드 확인)

| # | 위치 | 주기 | 시작 조건 | 종료 조건 | 동작 기기 |
|---|---|---|---|---|---|
| W1 | `lib/community-messenger/call-v4/call-v4-caller-active.ts` `startCallV4CallerActivePoll` (`CallV4Screen.tsx:301`) | **500ms** GET | 웹 발신 화면, phase `creating`/`outgoing_ringing` | active·종료 감지, 네이티브 소유 확인 시 정지 | 웹 발신 (Android 앱은 `isLegacyWebCallEstablishmentRemoved` 로 시작 안 함) |
| W2 | `call-v4/native-outgoing-terminal-sync.ts` `startNativeOutgoingTerminalSync` (`call-v4-actions.ts:854·876·901`) | **500ms** GET | 네이티브 소유 발신 (iOS·Android 앱) | active·종료 감지 | iPhone·Samsung·Xiaomi WebView, **발신 중 내내** |
| W3 | `call-v4/call-v4-connected-terminal-watch.ts` `startCallV4ConnectedTerminalWatch` (`call-v4-phase-bridge.ts:47·115`) | **1s** GET | 연결 진입 (`markCallV4MediaConnected` / `markCallV4NativeConnectedOps`) | 종료 | 연결된 **양쪽 기기 WebView, 통화 내내 (상한 없음)** |
| W4 | `CommunityMessengerCallClient.tsx:4388` `getCallSessionClientPollIntervalMs` | 등급별 | 구 `/calls/[sessionId]` 화면 | 화면 이탈 | 구 화면 진입 시만 (v4 경로에서는 미사용 추정, §6-0 에서 확인) |
| N1 | iOS `NativeVoiceCallApi.swift:405~` `NativeOutgoingTerminalWatch` (음성·영상 발신 코디네이터 공용) | **1s** GET | iOS 네이티브 발신 | active·종료 감지, 최대 35초 | iPhone 발신 |
| H1 | `lib/call/native/call-heartbeat-watchdog.ts` | 10s PATCH | 연결 진입 | 종료 | 웹 |
| H2 | Android `NativeActiveCallHeartbeatOwner` | 10s PATCH | 네이티브 연결 | 종료 | Android |

Android 네이티브에는 상태 반복 조회가 없습니다.
- `IncomingCallSessionStatusProbe` 는 푸시 수신 시 1회만 조회합니다.
- `NativeVoice/VideoCallActivity` 의 1초 루프는 통화 시간 표시용이며 서버를 호출하지 않습니다.

이론값은 다음과 같습니다.
- iPhone 네이티브 발신 중: W2 2회/s + N1 1회/s = **3회/s**. 측정값 1.7회/s 보다 높아서, 일부 tick 이 건너뛰어지는 것으로 보입니다. 원인 후보는 `isNativeEstablishmentOwned` 브리지 대기와 WebView 타이머 지연이며, §6-0 에서 확정합니다.
- 연결 중: W3 1회/s × 양쪽 기기 + 하트비트 2개 = **약 2.2회/s**. 측정값은 1.3회/s 입니다.

## 3. 중복의 근거 (이미 있는 이벤트 경로)

- **네이티브 → 웹 연결 통지가 이미 있음**: `lib/call/native/native-connected-sync.ts` 가 `NATIVE_CALL_CONNECTED_EVENT` 를 받아 `markCallV4NativeConnectedOps` 를 호출합니다. W2 가 `active` 를 감지해 연결로 올리는 동작(`native-outgoing-terminal-sync.ts:91-96`)은 이 이벤트와 같은 일을 HTTP 로 한 번 더 하는 것입니다.
- **네이티브 → 웹 종료 통지가 이미 있음**:
  - `lib/call/native/native-terminal-sync.ts` 가 종료 이벤트를 웹에 전달합니다.
  - iOS 는 N1 이 서버 종료를 감지해 네이티브 화면을 닫고, 웹은 W2 의 `finalizeAfterNativeReleased` 가 소유 해제를 확인한 뒤 1회 GET 으로 마감합니다.
  - 따라서 **네이티브 소유 중인 W2 의 HTTP 반복은 N1·이벤트와 중복**입니다. 소유 여부 확인은 HTTP 가 아니라 브리지 호출입니다.
- **연결 중 종료 감지 경로가 이미 3개 있음**: Realtime hangup broadcast (`startCallV4TerminalRealtimeWatch`), Agora remote-left (`triggerCallV4RemoteTerminalCheckFromAgora`), 네이티브 종료 이벤트. W3 의 1초 GET 은 이 셋이 모두 빠졌을 때만 필요한 보조 경로인데, 지금은 주 경로처럼 매초 돕니다.

## 4. 계획 (근본: 통화 1건 = 기기당 상태 조회 소유자 1개)

임계값만 늘리는 조치가 아니라, **조회 소유권을 하나로 정하는 계약 변경**입니다.

| 단계 | 바꾸는 파일·함수 | 바뀌는 동작 |
|---|---|---|
| R3-a | `native-outgoing-terminal-sync.ts` `tickOutgoingTerminalSync` | 네이티브 소유 중에는 **HTTP GET 하지 않음**. tick 은 `isNativeEstablishmentOwned` 브리지 확인만 하고, 소유가 풀리면 기존 `finalizeAfterNativeReleased` 로 1회 GET 합니다. 연결 승격은 `native-connected-sync` 이벤트가 단일 경로가 됩니다. |
| R3-b | `call-v4-connected-terminal-watch.ts` | 매초 GET 을 **이벤트 우선 + 보조 조회**로 바꿉니다. Realtime·Agora·네이티브 종료 이벤트가 오면 즉시 1회 확인합니다(현행 유지). 보조 주기 조회는 Realtime 채널이 끊겼을 때와 앱 복귀 시에만 합니다. 구체 주기는 §6-0 측정 후 문서에 확정 값으로 적습니다. |
| R3-c | W1 `call-v4-caller-active.ts` | 웹 발신(브라우저)에만 남습니다. Android·iOS 앱에서는 이미 비활성(W2 경로)이라 앱 영향은 없습니다. 이번 범위에서는 **변경 없음**. |
| 유지 | N1 (iOS 네이티브 감시) | **변경 없음**. WebKit 이 멈춰도 동작하는 유일한 iPhone 발신 종료 감지이고, 9단계에서 PASS 한 경로입니다. 네이티브 수정이 필요 없으므로 재빌드도 필요 없습니다. |

변경 분류는 **웹만**입니다(`lib/community-messenger/call-v4/**`). 네이티브·DB 변경과 앱 재빌드는 없습니다.
R3-a 와 R3-b 는 **각각 단독 커밋**으로 하고 한 번에 한 원인만 고칩니다. R3-a 의 실기기 PASS 뒤에 R3-b 를 진행합니다.

## 5. 영향받는 경로와 위험

| 경로 | R3-a 영향 | R3-b 영향 | 위험·대응 |
|---|---|---|---|
| 발신 시작·세션 생성·VoIP/FCM 발송 | 없음 | 없음 | — |
| iOS 발신 → 상대 수락 (연결 승격) | 승격 경로가 W2 GET 에서 `NATIVE_CALL_CONNECTED_EVENT` 로 바뀜 | — | 이벤트가 누락되면 웹 store 가 `outgoing_ringing` 에 남습니다. 대응: 앱 복귀(`use-call-v4-foreground-resume`) 시 1회 GET 확인. 검증 항목 1·2. |
| Android 발신 → 수락 | 같음 (Android 네이티브도 connected 이벤트 발행) | — | 같음 |
| 상대 거절·벨 중 취소·무응답 missed | iOS 는 N1 감지 → 네이티브 해제 → `finalizeAfterNativeReleased` (현행 경로). Android 는 네이티브 종료 이벤트 | — | Android 에 N1 같은 네이티브 감시가 없어서, 종료 이벤트가 없으면 웹 30초 missed 타이머에 의존하게 됩니다. **§6-0 에서 Android 네이티브 발신의 거절·취소 감지 출처를 먼저 확인하고, W2 GET 이 유일한 경로라면 Android 에서는 R3-a 를 적용하지 않습니다.** |
| 연결 중 상대 종료 | — | 이벤트 3종이 주 경로, 보조 조회 축소 | 세 이벤트가 모두 빠지면 종료 감지가 보조 주기만큼 늦어집니다. 검증 항목 6. |
| 통화 중(busy)·재발신 | 없음 (서버 판정) | 없음 | — |
| iOS CallKit 종료 신호·통화 기록·팝업 | 마감 경로 동일 (`callV4HandleRemoteTerminal`) | 동일 | — |
| 설치된 구 바이너리 | 웹만 변경이고, 웹이 쓰는 이벤트(`NATIVE_CALL_CONNECTED_EVENT`)의 지원 버전을 §6-0 에서 `user_devices.app_version` 과 대조합니다. 지원하지 않는 버전이면 R3-a 를 버전 분기 없이 적용하지 않습니다. | 동일 | Xiaomi 1.2.4 (11) 포함 |

**롤백**: 각 커밋을 단독 `git revert` → main 푸시. 웹만 바뀌므로 앱을 다시 시작하면 복구됩니다.

## 6. 구현 전·후 검증

### 6-0. 구현 전 측정 (읽기 전용·실기기, 코드 변경 없음)
1. Samsung `adb logcat` (WebView 콘솔 `logCallV4`)에서 W2 `outgoing_terminal_sync_poll`·W3 tick 횟수를 셉니다.
2. iPhone 은 idevicesyslog `DIBAY_NATIVE` 로 N1 시작·종료를 봅니다.
3. 통화 2건(무응답·연결 후 종료)의 출처별 횟수를 서버 합계와 맞춥니다.
4. Android 네이티브 발신의 거절·취소가 무엇으로 감지되는지(W2 GET 인지 네이티브 이벤트인지) 확인합니다.
5. `NATIVE_CALL_CONNECTED_EVENT` 를 발행하는 바이너리 버전을 확인합니다.
→ 결과를 이 문서에 추가합니다. 결과가 §4 계획과 다르면 계획을 고친 뒤 **다시 승인을 받습니다**.

### 6-1. 코드
`npm run typecheck:build`, 변경 파일 vitest(기존 `call-v4` 테스트 + 신규 계약 테스트), eslint.

### 6-2. 실기기 행렬 (Production SHA 를 매 테스트마다 기록)
1. iPhone→Samsung 음성: 수락·연결·종료
2. iPhone→Samsung 영상: 수락·연결·종료
3. Samsung→iPhone 음성·영상: 수락
4. 거절 (양방향)
5. 벨 중 취소, 이후 지연 푸시 시 재울림 없음
6. 연결 중 상대 종료 (양방향): 종료 감지 시각
7. 통화 중(busy, Xiaomi→Samsung)
8. 무응답 missed 타임아웃
9. 정상 종료 직후 재발신

각 테스트에는 발신·세션 생성·VoIP/FCM 발송·수신 화면·연결·종료 시각을 기록합니다(서버 시각은 운영 DB 로 대조).
**성공 기준**: 기능 행렬 전부 PASS, 그리고 같은 2개 시나리오에서 `/calls/sessions/{id}` 호출 수가 §1 대비 감소(측정값 기록). 실기기에서 FAIL 이 하나라도 나오면 즉시 중단하고 revert 합니다.

## 7. 범위 밖 (보고만)

- Supabase Observability(최근 24시간)에서 **DB 오류 7.9%**: `duplicate key … notification_events_user_dedupe_uidx` 32건이 대부분입니다. 알림 중복 방지 인덱스 충돌로 통화 조회와는 무관합니다. → 추가 목록 A-12.
- 같은 화면의 Realtime 오류 7.6%는 원인을 조사하지 않았습니다(NOT_PROVEN). → 추가 목록 A-12 에 함께 적습니다.

## 8. 6-0 구현 전 측정 결과 (2026-10-26 20:18~20:30 PHT · Production `7250c5c2a` · iPhone 1.2 (15) · Samsung 1.2.4 (12))

수집 방법: 서버 합계(Vercel observability, 10초 단위), iPhone WebView 네트워크 기록(WebKit 원격 디버그, 웹 요청만 잡힘), iPhone 네이티브 로그(idevicesyslog), Samsung logcat(WebView 콘솔 포함). 코드·DB 변경 없음.

| 시험 | callId | 내용 | 서버 합계 | 출처별 (측정) |
|---|---|---|---|---|
| 1 | `72e5bd60` | iPhone→Samsung 음성, 무응답 31초 → missed | 62 | Samsung 1 · iPhone 약 60 (웹/네이티브 분리 실패: iPhone 로그 수집기 충돌) |
| 1 재 | `87984bcb` | 같은 시험 | 32 | **iPhone 웹 W2 8** (20:24:54.3~57.8 에 6회, 이후 WebView 정지 29초, 재개 후 2회) · **iPhone 네이티브 N1 약 23** (시작 54.18 → missed 감지 25:25.75, `source=native_watch`) · Samsung 1 |
| 3 | `41317181` | Samsung→iPhone 음성, iPhone 거절 | 9 | Samsung 웹 W2 8 (실측 1초에 1회꼴) · iPhone 거절 PATCH 1 |
| 2 | `59a3909d` | iPhone→Samsung 음성, 수락·연결 22초·iPhone 종료 | 56 | 벨 5.6초: iPhone W2 8 · N1 약 5 (`session_active` 로 정지) · Samsung 수락 등 2 / 연결 22초: **Samsung 웹 W3 25** · iPhone 웹 W3 2 (WebView 정지) · 하트비트·종료 PATCH 약 9 |

### 8-1. 확인된 사실

1. **iPhone 웹 W2 는 횟수가 들쭉날쭉하고 종료 감지에 쓰이지 않았다.** 같은 시험에서 8~38회로 달랐다. WebView 가 멈추는 동안 부재중 감지는 네이티브 N1 이 했고(`ios_native_voice_outgoing_remote_terminal source=native_watch`), 웹은 깨어난 뒤 마감만 했다.
2. **Android 발신의 거절은 FCM 이 먼저 전달했다.** `fcm:call_rejected` 가 20:27:34.626 에 도착해 네이티브 정리를 했고(`native_end_dispatch source=terminal_handler:fcm:call_rejected`), 웹은 34.828 에 네이티브 주입으로 받았다. W2 는 36.225 에 같은 결과를 다시 확인했고 이미 처리된 뒤라 무시됐다. 그러나 **Android 에는 iPhone N1 같은 네이티브 감시가 없어서, FCM 이 늦거나 안 오면 W2 가 유일한 보조 경로**다(A-11 에서 25.8초 지연 실례 있음).
3. **연결 중 Samsung 웹 W3 는 22초 동안 25회 조회했지만 종료를 한 번도 먼저 감지하지 못했다.** 종료 감지 순서: Agora 상대 이탈(네이티브, 27.706) → FCM `call_ended`(28.585) → 웹 주입(28.631). W3 의 마지막 조회(29.426)까지 모두 `remote_terminal_ignored` 였다.
4. **연결 이벤트 `nativeCallConnected` 는 설치된 모든 빌드에 있다.** Android 는 06-27(`6ef7cfaf3`), iOS 는 07-11(`36d65579c`)에 들어갔고, 현재 설치는 Samsung 12·Xiaomi 11·iPhone 15 다. iOS 발신 측도 연결될 때 발행하는 것을 실기기로 확인했다(`native_connected_emit direction=outgoing`, 시험 2).
5. **네이티브 하트비트(10초 PATCH)는 응답의 세션 상태로 종료를 처리하지 않는다.** iOS·Android 모두 성공·실패 로그만 남긴다. 따라서 웹 W3 를 없애면 하트비트가 그 역할을 대신하지 못한다(네이티브 수정 없이는).
6. W4(구 `CommunityMessengerCallClient`)는 이번 4건에서 별도로 구분해 확인하지 않았다(NOT_PROVEN). 다만 출처별 합계가 서버 합계와 맞아서, 남는 호출은 없다.

### 8-2. 측정에 따른 계획 수정 (§4·§5 대체 — 재승인 대상)

| 단계 | 수정 전 | 수정 후 | 근거 |
|---|---|---|---|
| R3-a | iOS·Android 네이티브 소유 발신에서 W2 HTTP 중단 | **iOS 만** 중단(네이티브 소유 확인만 계속, 소유 해제 시 기존 1회 GET 마감). **Android 는 현행 유지** | 8-1 ①②: iOS 는 N1 이 감지 주체, Android 는 W2 가 FCM 보조의 유일 경로 |
| R3-b | 이벤트 우선 + 보조 조회(주기 미정) | **네이티브 소유 연결 통화**: 1초 주기 조회를 멈추고, 이벤트(네이티브 종료 주입·Realtime hangup·Agora 이탈·앱 복귀)마다 1회 확인만 한다. **Realtime 통화 채널이 구독 상태가 아닐 때만** 보조 주기 조회를 하며, 주기는 서버 하트비트 주기와 같은 10초(`CALL_HEARTBEAT_INTERVAL_MS`)로 한다. 브라우저(네이티브 아님) 통화는 현행 1초 유지 | 8-1 ③⑤ |
| 유지 | N1 | 변경 없음 | 8-1 ① |

변경 파일: `lib/community-messenger/call-v4/native-outgoing-terminal-sync.ts`(R3-a), `lib/community-messenger/call-v4/call-v4-connected-terminal-watch.ts`(R3-b). 웹만 바뀌고 네이티브는 바뀌지 않아 재빌드가 필요 없다.

### 8-3. 예상 효과 (같은 시험 기준, 측정값에서 산출)

| 시험 | 현재 | 수정 후 예상 | 줄어드는 것 |
|---|---|---|---|
| iPhone 발신 무응답 31초 | 32~62 | 약 25 | W2 8~38 → 0 (N1 23 + 수신 1 + 마감 1 남음) |
| iPhone↔Samsung 연결 22초 | 56 | 약 20 | iPhone W2 8 → 0, Samsung W3 25 → 0 (확인 1~2회만) |
| Samsung 발신 거절 | 9 | 9 | 변경 없음 (Android W2 유지) |

### 8-4. 수정 후 위험 (추가)

- R3-b: 네이티브 종료 주입·Agora 이탈·FCM·Realtime 이 **모두** 빠지면 상대 종료 감지가 늦어진다. Realtime 이 끊긴 경우에는 10초 보조 조회가 잡는다. Realtime 이 살아 있는데 hangup 이 안 오고, FCM·Agora 도 모두 실패하는 경우는 보조 조회가 없다. 이번 측정에서는 Agora 이탈이 항상 가장 먼저 왔다(시험 2).
- 실기기 행렬(§6-2)에 **「연결 중 상대 앱 강제 종료」**를 추가한다(Agora 이탈 감지 시각 기록).

## 9. R3-a 실기기 행렬 결과 (`1451cbae3` · Production 확인 20:41 PHT · iPhone 1.2 (15) · Samsung 1.2.4 (12) · Xiaomi 1.2.4 (11))

| # | callId | 시험 | 결과 | iPhone 벨 중 웹 조회 | 서버 세션 호출 |
|---|---|---|---|---|---|
| 1 | `bac6bc92` | iPhone→Samsung 음성 수락·iPhone 종료 | PASS | **0** | 42 |
| 2 | `9cda6151` | iPhone→Samsung 영상 수락·iPhone 종료 | PASS (종료 시 A-10 기존 이중 정리) | **0** | 63 |
| 3 | `74a03848` | iPhone→Samsung, Samsung 거절 | PASS — N1 감지 1.6초, 웹은 해제 후 1회 | **0** (마감 1) | 7 |
| 4 | `ef05a5bf` | 벨 중 iPhone 취소 · 이후 재울림 없음 | PASS | 0 | 6 |
| 5 | `93117faa` | 무응답 → missed | PASS — N1 `native_watch` 감지 | 0 (마감 1) | **26** (수정 전 32~62) |
| 6 | `e302f9cd`→`e8516a45` | 정상 종료 직후 재발신 | PASS (재발신 시 iPhone 발신 화면 4.6초 지연 → A-14, R3-a 코드 실행 전 구간) | 0 | — |
| 7 | `345bdaab` · `e6278456` | Samsung→iPhone 음성·영상 수락·종료 | PASS (Android W2 현행 0.5초 유지 확인) | — | — |
| 8 | `e604d069` · `b98a54f1` | 통화 중: Xiaomi→Samsung | PASS — Xiaomi 「상대방 통화 중」, 기존 통화 20:55:20 정상 종료까지 유지 | — | — |

남은 몫: 연결 중 양쪽 웹 W3 1초 조회(행렬 1·2 의 대부분) → R3-b.

## 10. R3-b 구현 (`f537e735a`, 10-26 PHT)

- `call-v4-connected-terminal-watch.ts`
  - `startCallV4ConnectedTerminalWatch(callId, { nativeOwned })` 로 바꿨다. 네이티브 연결(`markCallV4NativeConnectedOps`)만 `nativeOwned: true` 로 시작한다.
  - 네이티브 소유 통화는 1초마다 `isNativeEstablishmentOwned` 브리지 확인만 하고 HTTP 는 하지 않는다.
  - 소유가 풀리면 GET 1회로 확인하고 마감한다(`source=native_released`).
  - Realtime 종료 채널이 `SUBSCRIBED` 가 아닐 때만 10초(`CALL_HEARTBEAT_INTERVAL_MS`)마다 보조 GET 한다.
- §8-2 대비 추가한 점: 네이티브 소유 확인을 넣었다. 웹 상태가 「연결」에 남아 재발신이 막히는 경우를, 웹 → 서버 조회 없이 네이티브 소유 해제로 잡기 위해서다. 추가되는 HTTP 는 없다.
- 그대로인 것: Realtime hangup·Agora 이탈 이벤트의 확인 GET, 웹(JS Agora) 통화의 1초 조회.
- `call-invite-realtime-broadcast.ts` 에 선택 인자 `onStatus` 를 추가했다. 기존 호출부는 영향이 없다.
- 로컬 검증 PASS: `typecheck:build`, vitest(신규 4건 포함), eslint.
- 같은 범위의 vitest 에서 `attachment/messenger-image-auto-save*` 15건이 실패한다. 수정 전 `origin/main` 에서도 같은 15건이 실패하므로 이번 변경과 무관하다(보고만).

## 11. R3-b 실기기 행렬 결과 (10-27 PHT · Production `f537e735a` → 보정 `5d9c475e6`)

| # | callId | 시험 | 결과 | 연결 중 웹 세션 조회 | 서버 세션 호출 |
|---|---|---|---|---|---|
| 1 | `aec4ba8b` | iPhone→Samsung 음성, iPhone 종료 | PASS | 양쪽 0 | **26** (R3-a 후 42 · 수정 전 56) |
| 2 | `4bc7d05b` | iPhone→Samsung 음성, **Samsung 종료** | PASS — iPhone Agora 이탈 감지 5ms | 0 | — |
| 3 | `3b8a875e` | iPhone→Samsung 영상, iPhone 종료 | PASS (A-10 기존 이중 정리) | 0 | — |
| 4 | `99e3838f` | Samsung→iPhone 음성, **연결 중 Samsung 앱 강제 종료** | PASS — iPhone 22초 뒤 Agora 끊김(`reason=1`)으로 정리·서버 `ended`. 서버는 강제 종료를 알 수 없어 1초 조회가 있어도 더 빨리 알 수 없음 | **iPhone 1초마다 GET 발견** → 보정 | — |
| 4' | `66ffaf5f` | 보정 후 Samsung→iPhone 음성 | PASS | **0** | 27 (18 은 Android 발신 벨 중 — 유지 대상) |
| 5 | `0a16c54d` · `82c66058` | 통화 중: Xiaomi→Samsung | PASS — 「상대방 통화 중」, 기존 통화 유지 | — | — |
| 6 | `15303205` → `22b883d9` | 정상 종료 직후 재발신 | PASS — 이번엔 재발신 화면 지연 없음(A-14 재현 안 됨) | 0 | — |

보정 원인: iOS 네이티브 음성 *수신*은 `NativeVoiceCallOwner` 를 claim 하지 않음(발신에서만). 보정 `5d9c475e6` 에서 iOS 는 `getActiveCallId`(음성 런타임 세션, 정리 시 reset)도 보유로 판정.

**R3 결론**
- 같은 시험(iPhone↔Samsung 연결 약 20초) 기준 통화 1건의 세션 호출이 56회에서 26~27회로 줄었다(약 52% 감소).
- 기능 회귀는 없다(행렬 R3-a 8종 + R3-b 7종 PASS).
- 남은 호출은 벨이 울리는 동안의 iPhone 네이티브 감시(1초)와 Android 발신 W2(FCM 보조, 유지), 10초 하트비트, 수락·종료 요청이다.
