# iPhone 발신 — 상대 거절 뒤 통화 화면이 안 닫힘: 원인·수정 설계 (2026-10-26, 개정 11:20 PHT)

> 통화 변경 규정 적용 (AGENTS.md「통화 변경 규정」). **Owner 승인 전 구현하지 않는다.**
> 확인된 사실만 쓴다. 확인 못 한 것은 §7 NOT_PROVEN.
> 개정: 웹 정지 이유를 WebKit 로그로 확정(§2-3), 검토 3항목(네이티브 실행·요청량/429·세션 검증) 코드·로그 근거 추가(§4).

## 1. 결함 (실기기 재현)

iPhone(w, iOS `1.2 (11)`) 발신 → Samsung(q, Android `1.2.4 (11)`) 거절 → iPhone 통화 화면이 닫히지 않음.

| 통화 | 종류 | Samsung 거절(서버) | iPhone 화면이 닫힌 시각·이유 |
|---|---|---|---|
| `f7ee8452` | 음성 | 09:47:17.94 | 09:47:45 — Owner 종료 누름 (음성은 대기 한도 없음) |
| `2bed8b1f` | 영상 | 10:08:52.65 | 10:09:01 — 네이티브 영상 12초 연결 대기 한도 |
| `cbdd6000` | 영상 | 10:10:54.99 | 10:11:03.95 — 같은 12초 한도 |

같은 조건 정상(즉시 닫힘): `2380b2be`·`e84ffef9`·`0e52d8e4`·`3c91536f`(음성), `5de83021`·`bb1e70b3`(영상).

## 2. 원인 — 확정 (코드 + iPhone 시스템 로그)

### 2-1. iPhone 발신 화면은 상대 거절을 웹 화면에서만 받는다 (코드)

- 발신 화면을 닫는 함수: `NativeVoiceIncomingCallCoordinator.handleRemoteTerminal` · `NativeVideoIncomingCallCoordinator.handleRemoteTerminal`.
- 거절로 이 함수를 부르는 곳은 웹뿐: `lib/community-messenger/call-v4/native-outgoing-terminal-sync.ts` 가 0.5초마다 `GET /api/community-messenger/calls/sessions/{id}` → 종료 상태면 웹 종료 처리 → `NativeCallService.endCall` → `NativeCallServicePlugin.swift:173-216` → `handleRemoteTerminal`.
- 서버는 발신 iPhone 에 거절 푸시를 보내지 않는다(설계): `lib/push/dispatch/push-payload-types.ts` `resolveCallPushProviderPolicy` — `voip_apns`·`call_rejected` 차단(`ios_voip_terminal_actor_device_unknown`), `apns` 차단(`ios_call_alert_callkit_owned`). 운영 `notification_deliveries`(`cbdd6000`) 두 건 `skipped`.
- 비교: Samsung 발신(`a3ad4f3f`)은 거절 때 FCM `call_terminal_data` `sent` — Android 는 웹 없이 받음.
- iPhone 네이티브 발신 코드(`NativeVoiceOutgoingCallCoordinator.swift`, `Video/NativeVideoOutgoingCallCoordinator.swift`)에는 벨 동안 서버 상태 확인이 없다.

### 2-2. 네이티브 통화 화면이 뜨면 WebKit 이 웹 화면 처리를 멈춘다 (WebKit 로그, `App(WebKit)`)

통화 시작 때마다(실패·정상 모두) 같은 순서가 기록됨:

1. `WKApplicationStateTrackingView: View with page ... was removed from a window` — 네이티브 통화 화면이 앱 웹 화면을 창에서 뗌 (`f7ee` 09:47:13.95, `2bed` 10:08:49.13, `cbdd` 10:10:51.24, `5de8` 10:11:09.51)
2. `WebPageProxy::updateActivityState: view visibility state changed 1 -> 0`
3. `UIProcess is releasing a foreground assertion because the view is no longer visible`
4. 이후 웹 프로세스는 `prepareToSuspend: Process is ready to suspend` 상태로 있다가, 네이티브→웹 호출(`WebPageProxy::runJavaScriptInFrameInScriptWorld` = Capacitor 플러그인 응답 전달)이 올 때만 잠깐 깨어남(`processDidResume`).
5. 깨우는 호출이 약 1초 없으면 WebKit 이 남은 보증(`WebProcess Foreground/Background Assertion`)을 모두 놓고 iOS 가 웹 프로세스를 정지(`Suspending task`).
6. 정지된 동안 웹은 타이머·서버 조회·실시간 수신 모두 0건. 다시 깨는 시점 = 네이티브 화면이 닫혀 웹 화면이 창에 다시 붙을 때(`was added to a window`).

### 2-3. 실패·정상을 가른 것 = 거절이 웹 정지 전에 왔는지

| 통화 | 웹 보증 해제 | iOS 웹 정지 | 서버 거절 | 웹 재개 | 결과 |
|---|---|---|---|---|---|
| `f7ee8452` | 09:47:16.96 | 09:47:17.08 | 09:47:17.94 | 09:47:45.37 | 실패 |
| `2bed8b1f` | 10:08:52.23 | 10:08:52.34 | 10:08:52.65 | 10:09:01.96 | 실패 |
| `cbdd6000` | 10:10:54.24 | 10:10:54.36 | 10:10:54.99 | 10:11:04.01 | 실패 |
| `5de83021` | 10:11:13.41 | (정지 전 10:11:13.45 재개) | 10:11:12.87 | — | 정상 |

- 실패 3/3: 거절이 웹 정지 **뒤**. 정상: 거절이 정지 **전**(웹이 깨어 있을 때 처리).
- `cbdd6000` 웹 기록(읽기 전용 inspector): 10:10:54.24~10:11:03.99 로그·조회·실시간 0건, 10:10:55 서버 방 갱신이 10:11:04.03 에 처리.

**원인 확정:** 네이티브 통화 화면이 웹 화면을 창에서 떼면 WebKit·iOS 가 웹을 정지시킨다(§2-2, 정상 동작). 그런데 iPhone 발신 화면의 거절·취소 수신은 그 웹에만 있다(§2-1). 그래서 거절이 웹 정지 뒤에 오면 닫을 주체가 없다. 서버 처리는 정상.

## 3. 수정 방향

웹이 정지돼도 동작하도록 **iPhone 네이티브 발신 화면이 직접 서버 상태를 확인**한다. 서버·웹·Android 무변경.

## 4. 검토 3항목 — 코드·로그 근거

### 4-1. 웹 정지 중 네이티브가 실행되는가 → 실행됨 (로그 확인)

- 웹이 정지된 구간에 앱 본체(DIBAY 프로세스)는 계속 `running-active (role: UserInteractiveFocal)` — `runningboardd` 상태 기록(09:47:13.86 → 09:47:46.39, 10:10:51.20 → 10:11:04.17 사이 다른 상태 없음).
- 같은 구간 네이티브 코드 실행 증거: `cbdd6000` 네이티브 12초 타이머(`DispatchQueue.main.asyncAfter`)가 10:11:03.95 에 정상 실행(`ios_native_video_outgoing_join_hang`) → 네이티브 종료 → 웹 재개. `f7ee8452` 구간에도 앱 본체 네트워크 기록(`App(Network)[3451]` 15건).
- 네이티브 HTTP 는 웹과 별개 `URLSession`(쿠키만 웹 저장소에서 읽음, `NativeVoiceCallApi.swift` `resolveCookieHeader`) — 웹 프로세스 정지와 무관.
- **조건:** 앱이 화면 앞에 있을 때(위 실측). 벨 도중 사용자가 홈으로 나가 앱이 백그라운드가 되는 경우는 실측 없음 → §7 NOT_PROVEN, §6 검증 항목에 포함.

### 4-2. 요청량·429 → 상한 계산 + 429 때 멈춤

- 서버 한도: `calls/sessions/[sessionId]/route.ts` GET — `enforceRateLimit` 키 `community-messenger:call-session-get:user:{userId}`, **60초에 120회**(사용자 단위, 웹·네이티브·모든 기기 합산). 초과 시 429 + `Retry-After` 헤더(`lib/http/api-route.ts:192-237`).
- 현재 웹: 벨 동안 0.5초 간격(실측 `cbdd6000` 10:10:50.74·51.24·51.82·52.29·52.73·53.21), 웹이 정지되면 0회.
- 네이티브 추가: **1초 간격, 벨 최대 30초 + 여유 → 통화 1건 최대 35회**. 웹 최대 60회와 합쳐 1건 ≤ 95회 < 120.
- 1분 안 연속 발신 2건 이상이면 합계가 120을 넘을 수 있음(웹만으로도 2건 = 120). → 네이티브는 **429 를 받으면 `Retry-After` 초만큼 쉬고**(헤더 없으면 5초) 재개. 재시도 폭주 없음. 그 사이 웹·12초 한도는 지금과 같음.
- 웹은 429 를 `session: null` 로 받고 다음 주기 계속(`call-v4-api.ts:76-89`) — 기존 동작, 무변경.
- 실제 429 발생 빈도: 운영 로그에 별도 기록 없음 → 측정 못 함(§7).

### 4-3. 연결된 통화·다음 통화를 잘못 닫지 않는가 → 3중 확인

네이티브가 화면을 닫기 전에 **모두** 만족해야 함:

1. 응답 `session.id` == 감시 중인 `callId`.
2. 감시 세대 번호 일치 — 감시 시작마다 새 번호, 중지·새 발신 시 이전 감시 무효(늦게 온 응답 버림). 기존 `isCurrentOutgoing(sessionId:generation:)` 와 같은 방식.
3. 네이티브 런타임이 그 세션의 **연결 전 발신 상태**: 음성 `phase ∈ {outgoingStarting, tokenPending, joining}` (기존 `NativeVoiceOutgoingCallCoordinator.isCurrentOutgoing`), 영상 `initiator && state == .connecting` (기존 `NativeVideoOutgoingCallCoordinator.isCurrentOutgoing`).

- 종료로 보는 상태: 웹과 같은 목록 `rejected·cancelled·canceled·ended·missed·failed` (`native-outgoing-terminal-sync.ts` `TERMINAL_SESSION_STATUSES`).
- `active`(상대 수락) 받으면 감시 중지(닫지 않음). 연결(`onConnected`)·본인 종료·실패 때도 중지.
- 웹이 먼저 닫아도 안전: `handleRemoteTerminal` 은 런타임 세션이 다르거나 없으면 아무것도 안 함(음성 `NativeVoiceIncomingCallCoordinator.swift:317-333`, 영상 `NativeVideoIncomingCallCoordinator.swift:284-288`), CallKit 종료 중복 방지(`isCallKitEndCompleted`).

## 5. 바꾸는 것 (iOS 네이티브 · 통화만 단독 커밋)

| 파일 | 변경 |
|---|---|
| `ios/App/App/Call/NativeVoiceCallApi.swift` | `fetchSessionStatusAsync(callId:)` — 기존 `fetchTokenAsync` 와 같은 쿠키·8초 타임아웃으로 `GET .../calls/sessions/{id}` → `(id, status, httpStatus, retryAfterSec)` |
| `ios/App/App/Call/NativeOutgoingTerminalWatch.swift` (신규) | 발신 감시: 1초 간격·최대 35초·세대 번호·429 대기. 종료 상태면 1회만 콜백 |
| `NativeVoiceOutgoingCallCoordinator.swift` | 발신 세션 등록 직후 감시 시작, `onConnected`·`fail` 때 중지. 종료 콜백 = §4-3 확인 후 `NativeVoiceIncomingCallCoordinator.shared.handleRemoteTerminal` |
| `Video/NativeVideoOutgoingCallCoordinator.swift` | 같은 방식. 종료 콜백 = `NativeVideoIncomingCallCoordinator.shared.handleRemoteTerminal`. 12초 한도 유지 |

- 「거절」 팝업: 웹이 띄움. 네이티브가 화면을 닫으면 웹이 창에 다시 붙어 재개(§2-2 6번)하고 세션 상태를 보고 띄움 — 팝업 코드 무변경.
- 영향 경로: 발신 시작·세션 생성·VoIP/FCM 발송·iOS/Android 수신·통화 기록 무변경. 바뀌는 것은 iPhone 발신 벨 동안의 종료 감지뿐.
- 구 바이너리: 설치 iPhone `1.2 (11)`·Samsung `1.2.4 (11)` 은 새 iOS 빌드 설치 전까지 동작 변화 없음. iOS `CURRENT_PROJECT_VERSION` 1회 증가(`npm run native:prepare`).
- 롤백: 커밋 되돌리기 + iOS 재빌드. 데이터 변경 없음.

## 6. 실기기 검증 (규정 행렬 · Production SHA·iOS 빌드 번호 매회 기록 · 서버 시각은 운영 DB 대조)

1. iPhone→Samsung 음성 거절 5회 · 영상 거절 5회: 거절 뒤 1.5초 안에 iPhone 화면 닫힘 + 「거절」 팝업. 회차마다 웹 정지 여부를 시스템 로그로 표시(정지 뒤 거절된 회차가 최소 1회 포함돼야 PASS 인정)
2. 벨 도중 iPhone 홈으로 나간 상태에서 Samsung 거절 (§4-1 백그라운드 조건)
3. iPhone 벨 중 본인 취소 (음성·영상)
4. Samsung→iPhone 음성·영상 수신 / 거절 / 받고 종료 (회귀 없음)
5. 취소 후 지연 푸시로 다시 울림 없음
6. 통화 중(busy) · 무응답 30초 · 종료 직후 재발신
7. iPhone→Samsung 연결 후 10초 유지·종료 — 감시가 연결된 통화를 끊지 않음
8. 1분 안 연속 발신 3회 — 429 발생 시 네이티브 대기 로그 확인, 통화 동작 이상 없음

## 7. NOT_PROVEN (이 수정 범위 밖 · 보고만)

- 벨 도중 앱이 백그라운드일 때 네이티브 감시 실행 여부 — §6-2 로 실측.
- 운영 429 실제 발생 빈도 — 기록 없음.
- 09:37~09:40 실패 3건(`70ed0238`·`ce749a2d`·`26936995`) — 그 시각 시스템 로그 없음.
- Samsung→iPhone 수신 화면 미표시 4건(`2b526209`·`ee205145` 09:54 푸시 앱 미도착, `6e89e121` 09:55:46 CallKit 보고 성공·화면 미표시, `2758fd82` 09:57:16) — 원인 미확정, 별도 증거 수집.
- 이 구조가 원래부터였는지, 최근 변경 이후인지.

## 8. 구조 문제인지 · 일시 현상인지 (Owner 질문 11:25 PHT)

**구조 문제다.** 근거:

| 항목 | 확인 내용 |
|---|---|
| 웹 정지는 매번 일어나는가 | 기록된 iPhone 발신 4건(`f7ee`·`2bed`·`cbdd`·`5de8`) 모두 통화 화면이 뜨는 순간 `was removed from a window` → 웹 보증 해제. 실패·정상 구분 없이 같은 순서(§2-2) |
| 실패가 「가끔」인 이유 | 웹이 완전히 정지되는 시점(통화 시작 후 약 3~4초)과 상대 거절 시점의 선후. 거절이 먼저면 정상, 정지가 먼저면 실패(§2-3). 원인을 모르는 일시 현상이 아니라 시점 경쟁 |
| 언제부터 이 구조인가 | iPhone 네이티브 발신 화면: 음성 `36d65579c`(07-11), 영상 `521edf3a3`(07-12). 거절을 웹이 서버 조회로 받아 네이티브에 넘기는 구조: `a3961c658`(07-04 `native-outgoing-terminal-sync`). 그 뒤 계속 유지 — 오늘 변경으로 생긴 것 아님 |
| 오늘 변경과 관계 | 오늘 통화 관련 커밋은 S1(`e6ad4e060`, 서버 목록 캐시 무효화)뿐. 발신 종료 경로와 무관 |

## 9. 카카오톡·텔레그램·바이버와 구조 차이

| 앱 | 통화 상태(거절·취소·종료)를 누가 받나 | 확인 근거 |
|---|---|---|
| 텔레그램 iOS | **네이티브 코드**: `TelegramCore` 의 `callSessionManager.callState` 를 구독해 `updateSessionState` 에서 `.terminated` 처리 (`TelegramCallsUI/Sources/PresentationCall.swift`). 웹 화면 없음 | 공개 소스 [Telegram-iOS](https://github.com/TelegramMessenger/Telegram-iOS/blob/master/submodules/TelegramCallsUI/Sources/PresentationCall.swift), 프로토콜 [phoneCallDiscarded](https://core.telegram.org/constructor/phoneCallDiscarded) |
| 카카오톡·바이버 | 소스 비공개 — 내부 구조 **확인 불가(NOT_PROVEN)**. 추정으로 적지 않음 | — |
| DIBAY Android | 네이티브: 서버가 발신 기기에 FCM `call_terminal_data` 전송(`a3ad4f3f` `sent`) | 운영 DB |
| **DIBAY iPhone** | **웹 화면만** (서버 푸시 차단 §2-1, 네이티브 조회 없음) | 코드·운영 DB |

- 차이: 텔레그램(공개 확인)과 DIBAY Android 는 통화 상태를 네이티브가 직접 받는다. DIBAY iPhone 만 통화 화면에 가려 정지될 수 있는 웹 화면에 맡긴다.
- WebKit 이 창에서 떨어진 웹 화면을 정지시키는 것은 DIBAY 기기 로그로 확인(§2-2). 같은 동작이 WebKit 공개 버그에도 기록됨: [WebKit 133713](https://bugs.webkit.org/show_bug.cgi?id=133713)(창에서 떼면 iOS 웹 프로세스 정지).
- §5 수정은 iPhone 을 텔레그램·DIBAY Android 와 같은 구조(네이티브가 직접 상태 수신)로 맞추는 것.
