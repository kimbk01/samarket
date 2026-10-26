# iPhone 발신 — 상대 거절·취소 뒤 통화 화면이 안 닫힘: 원인·수정 설계 (2026-10-26 10:40 PHT)

> 통화 변경 규정 적용 (AGENTS.md「통화 변경 규정」). **Owner 승인 전 구현하지 않는다.**
> 이 문서는 확인된 사실만 쓴다. 확인 못 한 것은 §6 에 NOT_PROVEN 으로 따로 둔다.

## 1. 결함 (실기기 재현)

iPhone(w, iOS 앱 `1.2 (11)`)이 발신 → Samsung(q, Android `1.2.4 (11)`)이 거절하면, iPhone 통화 화면이 닫히지 않는 경우가 있다.

| 통화 | 종류 | Samsung 거절(서버 시각) | iPhone 화면 | 닫힌 이유 |
|---|---|---|---|---|
| `f7ee8452` | 음성 | 09:47:17.94 | 「연결 중」 28초 | Owner 가 종료 누름 09:47:45 |
| `2bed8b1f` | 영상 | 10:08:52.65 | 9초 더 남음 | 네이티브 12초 연결 대기 한도 10:09:01 |
| `cbdd6000` | 영상 | 10:10:54.99 | 9초 더 남음 | 같은 12초 한도 10:11:03.95 |

같은 조건에서 정상으로 즉시 닫힌 통화: `2380b2be`·`e84ffef9`·`0e52d8e4`·`3c91536f`(음성), `5de83021`·`bb1e70b3`(영상).

## 2. 확인된 사실 (증거)

### 2-1. iPhone 발신 화면은 상대 거절을 웹 화면을 통해서만 받는다 (코드)

- iPhone 통화 화면을 닫는 함수: `NativeVoiceIncomingCallCoordinator.handleRemoteTerminal` · `NativeVideoIncomingCallCoordinator.handleRemoteTerminal`.
- 이 함수를 상대 거절로 부르는 곳은 웹뿐이다: 웹이 세션 상태 `rejected` 를 보면 `NativeCallService.endCall(reason)` 호출 → `NativeCallServicePlugin.swift:173-216` 이 `handleRemoteTerminal` 실행. (정상 통화 로그 `ios_native_voice_end_call reason=rejected path=native_voice_runtime` 가 이 경로.)
- 서버는 발신한 iPhone 에 거절 푸시를 보내지 않는다(설계): `lib/push/dispatch/push-payload-types.ts` `resolveCallPushProviderPolicy` — `voip_apns` `call_rejected` 는 제외 기기 목록 없으면 차단(`ios_voip_terminal_actor_device_unknown`), `apns` 는 CallKit 기기라 차단(`ios_call_alert_callkit_owned`). 운영 `notification_deliveries` 에 `cbdd6000` 두 건 모두 `skipped` 로 기록.
- 비교: Samsung 이 발신일 때(`a3ad4f3f`)는 거절 시 Samsung 기기에 FCM `call_terminal_data` 가 `sent` — Android 발신 화면은 웹 없이 거절을 받는다. **iPhone 만 웹에 의존한다.**
- iPhone 네이티브 발신 코드(`NativeVoiceOutgoingCallCoordinator.swift`, `Video/NativeVideoOutgoingCallCoordinator.swift`)에는 벨 울리는 동안 서버 세션 상태를 확인하는 코드가 없다. 영상만 12초 연결 대기 한도가 있고 음성은 없다.

### 2-2. 실패 3건은 모두 거절 직전에 iPhone 이 웹 화면 처리를 정지시켰다 (iPhone 시스템 로그)

`runningboardd` 의 `com.apple.WebKit.WebContent` (DIBAY 앱의 웹 화면 프로세스) 기록:

| 통화 | 웹 정지(Suspending task) | 서버 거절 | 웹 재개(Resuming task) |
|---|---|---|---|
| `f7ee8452` | 09:47:17.08 | 09:47:17.94 | 09:47:45.37 |
| `2bed8b1f` | 10:08:52.34 | 10:08:52.65 | 10:09:01.96 |
| `cbdd6000` | 10:10:54.36 | 10:10:54.99 | 10:11:04.01 |

- 정상 6건은 거절 시점까지 정지 기록이 없다.
- `cbdd6000` 은 웹 기록(읽기 전용 inspector)도 있다: 10:10:54.24 이후 10:11:03.99 까지 웹 로그·서버 조회·실시간 수신이 **0건**. 10:10:55 에 서버가 보낸 방 갱신이 10:11:04.03 에야 처리됨.
- 재개 시각은 iPhone 통화 화면이 닫힌 직후다(네이티브 종료 → 웹 화면이 다시 보임).

### 2-3. 영상 통화를 걸면 웹 화면은 「숨김」이 된다 (웹 기록)

- Agora 웹 SDK 로그 `current web page is hidden`: 10:10:51.26(`cbdd`), 10:11:09.50(`5de8`), 10:11:20.66(`bb1e`) — 실패·정상 모두 통화 시작 직후 숨김.

## 3. 원인 (위 사실로 확정되는 범위)

**iPhone 발신 화면이 상대 거절·취소를 알 수 있는 경로가 웹 화면 하나뿐인데, 그 웹 화면은 iOS 가 정지시킬 수 있다.** 정지된 동안 거절이 오면 화면을 닫을 주체가 없다 (§2-1 + §2-2, 실패 3/3 일치).

- 서버 처리는 정상(거절 기록·시각 정상).
- Android 는 FCM 종료 신호를 받으므로 해당 없음.

## 4. 수정 (iOS 네이티브 1건 · 단독 커밋)

### 4-1. 바꾸는 것

| 파일 | 변경 |
|---|---|
| `ios/App/App/Call/NativeVoiceCallApi.swift` | `fetchSessionStatusAsync(callId:)` 추가 — 기존 `fetchTokenAsync` 와 같은 쿠키 인증·타임아웃으로 `GET /api/community-messenger/calls/sessions/{id}` (웹이 0.5초마다 부르는 같은 API, 응답 `{ ok, session: { status } }`) |
| `ios/App/App/Call/NativeOutgoingTerminalWatch.swift` (신규) | 발신 벨 동안 1초 간격으로 위 조회. 상태가 `rejected`·`cancelled`·`missed`·`ended` 면 1회만 종료 실행 후 중지. 연결됨·화면 종료·35초 경과 시 중지 |
| `NativeVoiceOutgoingCallCoordinator.swift` | 발신 세션 등록 직후 감시 시작, 연결(`onConnected`)·실패(`fail`) 때 중지. 종료 실행 = `NativeVoiceIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId:)` (지금 웹이 부르는 것과 같은 함수) |
| `Video/NativeVideoOutgoingCallCoordinator.swift` | 같은 방식. 종료 실행 = `NativeVideoIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId:)`. 12초 한도는 그대로 |

- 서버·웹·Android **무변경**. 웹의 기존 경로도 그대로 둔다 — 같은 함수가 두 번 불려도 이미 끝난 세션은 무시된다(`handleRemoteTerminal` 의 `snap.session?.sessionId == sid` 확인, CallKit 종료 중복 방지 `isCallKitEndCompleted`).
- 「거절」 안내 팝업: 웹이 띄운다. 네이티브가 화면을 닫으면 웹이 다시 보이고(§2-2 재개 시각) 웹이 세션 상태를 보고 띄운다 — 팝업 코드는 무변경.

### 4-2. 바뀌는 동작

- iPhone 발신 중 상대 거절·취소·부재중·종료 → 웹 상태와 관계없이 **최대 약 1초 + 요청 시간** 안에 통화 화면 닫힘.
- 웹이 살아 있는 경우는 지금과 같이 웹이 먼저 닫는다(먼저 온 쪽 1회).

### 4-3. 영향 경로 점검

| 경로 | 영향 |
|---|---|
| 발신 시작·세션 생성 | 없음 (세션 생성 뒤 조회만 추가) |
| VoIP/FCM 발송 | 없음 (서버 무변경) |
| iOS 수신(CallKit)·Android 수신 | 없음 (발신 코드에만 추가) |
| 취소(발신자 본인)·거절·종료·부재중 | 발신자 화면 닫힘이 웹 없이도 동작. 본인 취소는 로컬 종료 경로라 감시 중지 |
| 상태 폴링 | iPhone 발신 1건당 서버 GET 최대 35회(벨 최대 30초). 웹 0.5초 조회(벨 30초 동안 최대 60회)와 별개. 서버 조회 한도는 사용자당 **분당 120회**(`calls/sessions/[sessionId]/route.ts` `enforceRateLimit`) — 통화 1건이 1분 안에 쓰는 양은 웹 60 + 네이티브 30 = 90. 1분 안에 연속 발신하면 한도에 닿을 수 있음(웹만으로도 2건이면 120 — 지금도 같은 위험). 한도 초과(429)는 네이티브가 실패로 보고 다음 주기 재시도 |
| CallKit 종료 신호 | 기존 `handleRemoteTerminal` 그대로 사용 |
| 통화 기록·팝업 | 무변경 |

### 4-4. 설치된 구 바이너리 호환

- 현재 설치: iPhone `1.2 (11)`, Samsung `1.2.4 (11)` (`user_devices.app_version`).
- 네이티브 변경이므로 **새 iOS 빌드 설치 전에는 동작 변화 없음**. 서버·웹 무변경이라 구 바이너리에 영향 없음.
- iOS `CURRENT_PROJECT_VERSION` 1회 증가 (`npm run native:prepare`).

### 4-5. 회귀 위험·롤백

| 위험 | 대응 |
|---|---|
| 조회 실패(네트워크) | 실패는 무시하고 다음 주기 재시도. 지금 동작(웹 경로·영상 12초 한도) 유지 |
| 연결 직후 늦게 온 `ended` 로 연결된 통화를 닫음 | 연결되면 감시 중지. 종료 전 「현재 발신 세션이고 아직 연결 전」 확인 |
| 이전 통화 응답이 다음 통화를 닫음 | 응답 처리 때 세션 ID·세대 확인 (기존 `isCurrentOutgoing` 와 같은 방식) |

- 롤백: 커밋 되돌리기 + iOS 재빌드. 데이터 변경 없음.

## 5. 실기기 검증 (규정 행렬 · 각 통화 시각을 운영 DB 와 대조)

1. iPhone→Samsung 음성 거절 5회 · 영상 거절 5회: 매회 거절 뒤 1.5초 안에 iPhone 화면 닫힘 + 「거절」 팝업 (웹 정지 발생 회차를 시스템 로그로 표시)
2. iPhone 벨 중 본인 취소 (음성·영상)
3. Samsung→iPhone 음성·영상 수신 / 거절 / 받고 종료 (회귀 없음)
4. 취소 후 지연 푸시로 다시 울림 없음
5. 통화 중(busy) · 무응답 30초 · 종료 직후 재발신
6. Android↔iPhone 연결 통화 10초 유지 후 종료 (연결된 통화가 감시 때문에 끊기지 않음)

## 6. 확인 못 한 것 (NOT_PROVEN — 이 수정 범위 밖, 보고만)

- 같은 「숨김」 상태인데 어떤 통화는 웹이 정지되고 어떤 통화는 안 되는 이유.
- 09:37~09:40 실패 3건(`70ed0238`·`ce749a2d`·`26936995`)이 같은 원인인지 — 그 시각 시스템 로그 없음.
- Samsung→iPhone 수신 화면이 안 뜬 4건: `2b526209`·`ee205145`(09:54, 서버→Apple 200 이지만 iPhone 앱에 푸시 도착 기록 없음), `6e89e121`(09:55:46, 앱이 CallKit 보고 성공했으나 화면 미표시), `2758fd82`(09:57:16, 웹 정지 구간 09:56:01~09:57:20 안). 원인 미확정 — 이 수정과 별개로 증거 수집 계속.
- 이 결함이 원래 있던 구조인지, 최근 변경 이후 생긴 것인지.
