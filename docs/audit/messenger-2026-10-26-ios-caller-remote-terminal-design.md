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
| `NativeOutgoingTerminalWatch` (구현: `NativeVoiceCallApi.swift` 안 — 새 파일은 Xcode 프로젝트 파일 수정이 필요해 기존 파일에 둠) | 발신 감시: 1초 간격·최대 35초·세대 번호·429 대기. 종료 상태면 1회만 콜백 |
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

## 10. 구현 기록 (2026-10-26 PHT)

- `34883b2a2` fix(call) — 위 §5 그대로. iOS 시뮬레이터 Debug 컴파일 PASS(`xcodebuild` BUILD SUCCEEDED, 변경 파일 경고 0).
- `388f1a79d` chore(ios) — `CURRENT_PROJECT_VERSION` 11 → 12 (4곳). `verify:native-version-bump --release` iOS PASS.
- 실기기: NOT_PROVEN (빌드 설치 전).

## 11. 실기기 FAIL · 되돌림 (2026-10-26 PHT)

- 설치 iPhone `1.2 (12)` 확인 10:50:58. 음성 거절 시험 2차례(10:52~10:53 `c98a`·`671b`·`fb96`, 10:56~10:57 `6370`·`582f`·`935b`·`fca7`).
- **FAIL:** 네이티브 감시가 웹보다 먼저 화면을 닫은 회차(`fb96`·`fca7`) 뒤 「거절」 팝업 없음 + 다음 발신이 「통화 연결 실패」.
- **되돌림:** `2e841599f` revert(call) — main 반영. 설치된 빌드 12에는 남아 있음(재빌드 전).

### 11-1. FAIL 원인 (웹 기록·iPhone 로그로 확정, `fca7150e`)

| 시각 | 기록 |
|---|---|
| 10:56:57.73 | 웹 `outgoing_terminal_sync_start` (0.5초 조회 시작) — 이후 웹 타이머 멈춤(화면 숨김) |
| 10:57:01.37 | iOS 웹 프로세스 정지 |
| 10:57:02.04 | 서버 거절 |
| 10:57:02.93 | 네이티브 감시 감지 → `handleRemoteTerminal` → 네이티브 소유 해제 |
| 10:57:03.95 | 웹 재개 후 첫 조회 전 `isNativeEstablishmentOwned` = false → **`outgoing_terminal_sync_skipped reason=not_native_owned` → 조회 중지, 종료 처리 안 함** |
| 10:57:11.17 | Owner 재발신 탭 — 웹은 아직 `fca7` 를 「벨 울리는 중」으로 들고 있어 발신 진행 안 됨 |
| 10:57:27.34 | 웹 30초 부재중 타이머로 겨우 종료 처리 |

- 코드: `lib/community-messenger/call-v4/native-outgoing-terminal-sync.ts:51-54` — 네이티브가 소유를 놓았으면 웹은 「네이티브가 끝냈다」고 보고 조회만 멈춘다. 지금까지 네이티브가 먼저 끝내는 경우는 사용자 종료뿐이라 웹이 별도 신호(`native_local_terminal_received`)로 정리했지만, **상대 거절을 네이티브가 먼저 처리하면 웹에 알리는 신호가 없다.**
- 결론: 수정 설계 §4-3 의 「웹이 먼저 닫아도/네이티브가 먼저 닫아도 안전」 판단이 틀렸다(네이티브 먼저 → 웹 상태 미정리). 설계 결함.

### 11-2. 「3번째부터 거절 팝업 느려짐」 (`935b98f4`)

- 서버 거절 10:56:46.55 → 웹 처리 10:56:48.86 (2.3초). 웹 조회가 10:56:42.2 이후 10:56:48.5 까지 0건 → 몰려서 처리.
- WebKit 로그: 10:56:42.74 `removed from a window` → 0.5~1초마다 `processDidResume` 직후 `ready to suspend` 반복 → 10:56:48.95 `added to a window`. 숨겨진 웹이 거의 정지 상태라 거절 처리가 늦음 — §2-2 와 같은 구조. 이 회차는 네이티브 감시가 아니라 웹이 닫음(감시는 10:56:50.29 늦게 감지 후 건너뜀).
- 네이티브 감시 감지가 이 회차에만 3.7초 걸린 이유: NOT_PROVEN (429 기록 없음). 감시가 쿠키를 WebKit 쿠키 저장소(`WKHTTPCookieStore`)에서 읽는데, 그 저장소를 가진 WebKit 네트워크 프로세스도 화면 숨김 때 백그라운드 상태가 됨(§2-2 로그 `Networking for background view(s)`) — 지연 원인인지 미확인.

### 11-3. 재설계 전 확인할 것 (구현 금지)

1. 네이티브가 상대 종료로 화면을 닫을 때 웹에 알리는 기존 경로가 있는지(영상은 `ios_native_video_local_terminal_publish reason=remote_ended` 로그 있음, 음성은 없음) — 웹이 그 신호로 종료 처리·팝업을 띄우는지 코드로 확인.
2. 네이티브 감시의 쿠키 읽기가 WebKit 프로세스 상태에 묶이는지.

## 12. 재수정 설계 (2026-10-26 PHT · Owner 승인 전 구현 금지)

### 12-1. 확인된 코드 사실

| 경로 | 웹 「대기」 복귀 | 「거절」 팝업 | 근거 |
|---|---|---|---|
| 웹이 거절을 먼저 받음 | O | O | `callV4HandleRemoteTerminal` → `finalizeCallV4Terminal` → `showCallInAppNoticeFromTerminalReason` (`call-v4-actions.ts:422-470, 1243-1270`) |
| 네이티브가 먼저 닫고 웹이 깨어남 (빌드 12) | **X** (30초 부재중 타이머까지) | **X** | `native-outgoing-terminal-sync.ts:51-54` — 네이티브 소유 없음이면 조회만 멈추고 종료 처리 안 함 |
| 네이티브 종료 신호(`publishLocalTerminal`)를 쓰는 경우 | O | **X** | `native-terminal-sync.ts` `onNativeCallLocalTerminal` — 대기 복귀·정리만, 팝업 호출 없음 |

→ 네이티브 종료 신호만 보내면 재발신은 되지만 팝업이 안 뜬다. 팝업까지 맞추려면 웹이 기존 종료 처리(`callV4HandleRemoteTerminal`)를 타야 한다.

### 12-2. 수정 (2개 커밋 · 통화만)

| 순서 | 커밋 | 내용 |
|---|---|---|
| W | 웹 `native-outgoing-terminal-sync.ts` | 네이티브 소유가 없어졌을 때 바로 멈추지 않고 **서버 세션을 1회 조회** — 종료 상태면 `callV4HandleRemoteTerminal(sid, status, …, "outgoing_terminal_sync_native_released")` (웹이 먼저 받은 경우와 같은 처리: 대기 복귀 + 「거절」 팝업). 종료 상태가 아니면 지금처럼 멈춤 |
| N | iOS 네이티브 | `34883b2a2` 재적용 (네이티브 감시로 화면 닫기 — 실기기에서 거절 후 약 1초 안에 닫힘 확인됨) |

- 순서: W 먼저 main 반영(웹 배포) → N 재적용 + iOS 빌드 13.
- W 는 구 바이너리(빌드 11·12)에서도 안전: 네이티브 소유가 없어진 뒤 1회 조회일 뿐. 빌드 12 에서는 W 만으로 이번 FAIL(팝업 없음·재발신 차단)이 해소되는지 먼저 실기기로 확인 가능.
- 사용자가 직접 끊은 경우: 네이티브가 `publishLocalTerminal` 로 먼저 웹을 대기로 돌림 → 웹 조회 대상이 아니게 되어(`shouldPollForCall` false) W 경로를 타지 않음 — 기존 동작 그대로.

### 12-3. 실기기 검증

1. 빌드 12 + W: 음성·영상 거절 각 5회 — 매회 화면 닫힘 + 「거절」 팝업 + 바로 재발신 성공. 네이티브가 먼저 닫은 회차(`source=native_watch`)가 최소 1회 포함돼야 PASS
2. 빌드 13: 같은 시험 + 설계서 §6 행렬 전체

## 13. W 실기기 결과 · 영상 「거절」 팝업 누락 (2026-10-26 PHT)

### 13-1. 음성 거절 10회 (11:18~11:19, Production `d6b76b886`, iOS 1.2 (12)) — PASS
- 10/10 화면 닫힘·재발신 정상. 네이티브 선종료 3회(`ca85`·`81db`·`3829`) 모두 W 경로(`outgoing_terminal_sync_detected reason=native_released` → `callV4HandleRemoteTerminal`)로 정리. 30초 대기(`missed_timer_fire`) 0건.
- `9d69b2622` — N 재적용. ios/ 코드가 빌드 12(`388f1a79d`)와 동일(차이 0줄) → 새 빌드 불필요.

### 13-2. 영상 거절 10회 (11:24~11:26) — 화면 닫힘·재발신 10/10, **「거절」 팝업 5회 누락 (1·2·8·9·10번째, Owner 확인)**

| 회차 | 통화 | 먼저 처리한 쪽 | 웹 기록 | 팝업 |
|---|---|---|---|---|
| 1 | `40c7` | 네이티브 | `native_local_terminal_received reason=remote_ended` → `idle_immediate status=ended` → W 조회 `not_current_call` 무시 | 없음 |
| 2 | `b805` | 네이티브 | 같음 | 없음 |
| 3 | `74e1` | 웹 | `remote_terminal_received status=rejected` | 있음 |
| 4 | `e252` | 웹(네이티브 감지 0.25초 뒤) | `remote_terminal_received` 먼저 | 있음 |
| 5~7 | `5cb0`·`b0d6`·`5f72` | 웹 | 같음 | 있음 |
| 8~10 | `43bc`·`99d1`·`c93c` | 네이티브 | 1회차와 같음 | 없음 |

- 원인(코드·기록 일치): 영상 네이티브의 상대 종료 처리(`NativeVideoIncomingCallCoordinator.handleRemoteTerminal`, `:299-300`)는 기존부터 웹에 종료 신호(`reason=remote_ended source=remote_terminal`)를 보낸다. 웹(`lib/call/native/native-terminal-sync.ts` `onNativeCallLocalTerminal`)은 이를 「사용자가 직접 끊음」과 똑같이 처리 — 즉시 대기(`ended`)로 돌리고 안내 팝업을 띄우지 않는다. 그 뒤 W 조회는 이미 다른 통화 상태가 아니라서(`not_current_call`) 무시.
- 음성은 상대 종료 때 이 신호를 보내지 않아 W 경로로 가고 팝업이 뜸 — 음성·영상 차이의 이유.

### 13-3. 재수정 (웹 1곳 · 통화만 · 빌드 불필요)

| 파일 | 변경 |
|---|---|
| `lib/call/native/native-terminal-sync.ts` `onNativeCallLocalTerminal` | 신호 출처가 `remote_terminal`(네이티브가 본 **상대** 종료)이고 현재 웹 통화가 **발신**이면: 즉시 대기 처리 대신 서버 세션 1회 조회 → 종료 상태면 `callV4HandleRemoteTerminal(sid, status, …, "native_remote_terminal")` (웹이 먼저 받은 경우와 같은 처리: 대기 복귀 + 「거절」 안내). 조회 실패·비종료면 지금처럼 즉시 대기 |

- 수신 쪽(상대가 건 통화를 상대가 취소)·사용자 직접 종료(`local_end`·`local_reject`)는 지금과 동일.
- 재발신 지연: 서버 조회 1회(실측 웹 조회 0.2~0.5초)만큼.

### 13-4. 검증
1. 영상 거절 10회: 매회 화면 닫힘 + 「거절」 팝업 + 재발신. 네이티브 선종료 회차 포함 필수
2. 음성 거절 5회(회귀 없음)
3. 이후 §6 행렬 나머지

### 13-5. 재수정 결과 — `ca1d92b50` (Production READY 확인 후 시험) · 영상 거절 10회 PASS (11:37~11:39)

- 10/10 화면 닫힘 + 「거절」 팝업(Owner 확인) + 재발신. 서버 10건 모두 `rejected`.
- 웹 종료 처리 경로: 네이티브 선종료 회차 `6fa0`·`3d7e`·`71f8`·`7b57` 은 새 경로(`native_remote_terminal_server_finalize` → `remote_terminal_received source=native_remote_terminal`), 나머지는 웹 조회·W 경로. 10회 모두 `remote_terminal_received status=rejected` → 안내 경로. `native_local_terminal_idle_immediate`(안내 없는 대기) 0건, 30초 대기 0건.
- 남은 검증: 설계서 §6 행렬(취소·수신·busy·무응답·연결 유지·연속 발신·벨 중 홈 이동).

## 14. §6 행렬 진행 (2026-10-26 11:41~11:54 PHT · Production `ca1d92b50` · iOS 1.2 (12) · Android 1.2.4 (11))

| 항목 | 결과 | 근거 |
|---|---|---|
| iPhone 벨 중 본인 취소 음성 5·영상 5 | PASS | 서버 `cancelled` 10/10, Samsung 취소 푸시 10/10, Samsung 벨 종료 서버 취소 후 0.3~0.8초, 재울림 0 |
| Samsung→iPhone 음성·영상 거절 각 2, 받고 종료 각 2 | PASS | iPhone VoIP 도착·CallKit 보고 성공 8/8, 거절·종료 기록 정상 |
| iPhone→Samsung 음성 연결 10초 이상 유지·종료·즉시 재발신 | PASS | `c05c`·`e3ed` — 수락 시 감시 중지(`session_active`·`call_connected`), 연결 중 종료 0 |
| 통화 중(busy) | PASS | `4c5d` `peer_busy` 즉시 종료 |
| 감시 조회 429 | 0건 (오늘 전체) | iPhone 로그 `terminal_watch_rate_limited` 0 |
| 무응답 음성 (`7b51`·`960d`) | 서버 PASS / **Samsung 부재중 알림 없음** | 31초 `missed`, Samsung FCM `missed_call` sent. Samsung 로그 `[fcm] foreground_skip_system_notification type=missed_call` — Samsung 앱이 화면에 떠 있으면 시스템 알림을 띄우지 않는 기존 Android 규칙(`DibayFirebaseMessagingService.handleMissedCallNotificationOnly`) |
| 무응답 영상 (`bef2`·`a813`) | **FAIL — 30초 전에 끝남** | iPhone 네이티브 영상 12초 연결 대기 한도(`ios_native_video_outgoing_join_hang timeout_s=12`, 2026-07-12 O4 부터)로 약 13초에 `cancelled` → Samsung 은 부재중이 아니라 취소. 이번 수정과 무관한 기존 동작 |

- 무응답 2건(영상 12초 한도, Android 앱 화면 중 부재중 알림 생략)은 이번 거절 수정 범위 밖 — 별도 설계 필요(보고만).
- 남은 행렬: 벨 중 iPhone 홈 이동 상태 거절, iPhone→Samsung 영상 연결 유지.

## 15. 행렬 마무리 (2026-10-26 11:58~12:03 PHT)

| 항목 | 결과 | 근거 |
|---|---|---|
| 벨 중 iPhone 홈 이동 상태 거절 — 음성 2 | PASS | `a86e`·`09f7`: 앱 백그라운드(`NonUserInteractive`)에서 네이티브 감시가 서버 거절 0.2~0.3초 뒤 감지·종료 → §4-1 백그라운드 조건 실측 |
| 같은 조건 영상 3 | 2 PASS / 1 별도 결함 | `0b33`(웹 0.7초)·`1bb6`(감시 0.8초) PASS. `0080` — 발신 직후 홈 이동 → `ios_audio_session_gate_timeout`(12:00:07.69)로 iPhone 이 9초 만에 스스로 취소. 발신 준비 단계 기존 동작, 이번 수정 무관(보고만) |
| iPhone→Samsung 영상 연결 10초 유지·종료·재발신 2회 | PASS | `4603`·`a8b2`: 수락 시 감시 중지(`call_connected`), 원격 영상 렌더, 11~12초 유지 후 iPhone 종료 |

### 15-1. 최종 상태
- 결함(iPhone 발신 중 상대 거절 후 화면 미종료): 음성·영상 각 10회 + 백그라운드 포함 실기기 PASS.
- 반영: `d6b76b886`(웹 W) · `9d69b2622`(iOS N 재적용 = 빌드 12) · `ca1d92b50`(웹 영상 안내). iOS 설치 `1.2 (12)` = main.
- 범위 밖 결함(보고만, 별도 설계 필요): ① 영상 무응답이 iPhone 12초 연결 대기 한도로 30초 전에 취소(§14) ② Samsung 앱 화면 중 부재중 시스템 알림 생략(§14) ③ 영상 발신 직후 홈 이동 시 오디오 준비 한도로 자동 취소(§15) ④ Samsung→iPhone 수신 화면 미표시 4건(오전, §7) ⑤ Realtime presence 한도 초과 로그(서버 점검).
