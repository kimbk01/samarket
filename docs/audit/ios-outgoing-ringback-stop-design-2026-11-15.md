# iOS 발신음이 통화 종료 뒤 멈추지 않음 — 원인·설계안 (2026-11-15 PHT)

> 상태: **설계안 (구현 전 · 통화 변경 규정 3번 Owner 승인 대기).** 이번 #319(웹·서버)와 무관한 기존 iOS 네이티브 결함.
> 기준: `origin/main` `bb51c1265`. 분류: **네이티브(iOS)** — 반영되려면 새 iOS 빌드가 필요(빌드 시점은 Owner 일괄 결정).

## 0. Owner 지시
- 「시뮬레이터 발신음이 계속 울리는 원인이 뭐니???」 → 원인 보고 → 「설계안 작성」

## 1. 증거

### 1-1. 시뮬레이터 실측 (DIBAY-Scene iPhone 17 Pro · 앱 빌드 22 · 운영 `f5e5b1802` · 2026-11-15)
기기 로그(`log show`, 앱 `App` 프로세스):

| 통화 | 시각 | 기록 |
|---|---|---|
| `c38affb0` | 15:07:28.976 | `native_outgoing_ringback_config_fetch_ok mode=custom` |
| | 15:07:29.461 | `termination_decision cause=USER_END source=callkit_system_button` (시뮬레이터 CallKit 이 발신을 바로 끝냄) |
| | 15:07:29.466 | `ios_native_voice_local_end state=tokenPending` |
| | **15:07:29.633** | **`native_outgoing_ringback_start source=custom_url`** ← 종료 0.17초 **뒤** 시작 |
| | 15:07:30.750 | `ios_native_voice_cleanup_done reason=local_end` |
| | — | **`native_outgoing_ringback_stop` 없음** |
| `975d2267` | 15:09:33.872 | `native_outgoing_ringback_start` |
| | 15:09:34.193 | `ios_native_voice_local_end` |
| | 15:09:35.336 | `ios_native_voice_cleanup_done reason=local_end` |
| | — | **`native_outgoing_ringback_stop` 없음** |

→ 발신음(`AVAudioPlayer`, `numberOfLoops = -1`)이 계속 울림. 15:15:19 시뮬레이터 앱 종료로 멈춤.

### 1-2. 코드 (정지 호출 전수)
`NativeOutgoingRingbackOwner.shared.stop` 호출은 iOS 전체에서 **4곳뿐**:

| 위치 | 경우 |
|---|---|
| `NativeVoiceOutgoingCallCoordinator.swift` `onConnected` | 음성 연결됨 |
| 같은 파일 `fail` | 음성 실패(토큰·참가·미디어) |
| `Video/NativeVideoOutgoingCallCoordinator.swift` `onConnected` 계열 | 영상 연결됨 |
| 같은 파일 `terminateOutgoing` | 영상 실패(참가·연결 시간 초과) |

**정지가 없는 종료 경로:**

| 경로 | 함수 | 결과 |
|---|---|---|
| 발신자가 울리는 중 끊음(앱 버튼·CallKit 종료) | 음성 `NativeVoiceIncomingCallCoordinator.performLocalRejectOrEnd` → 서버 `endAsync` 응답 뒤 `cleanup(reason: "local_end")` | 정지 없음 |
| 상대 거절·무응답·통화 중·취소(서버 종료 감시) | 음성 `startRemoteTerminalWatch` → `handleRemoteTerminal` → `cleanup` | 정지 없음 |
| 영상의 같은 두 경로 | `Video/NativeVideoIncomingCallCoordinator.swift` `handleRejectOrEnd`·`handleRemoteTerminal` → `cleanup`(511줄) | 정지 없음 |

같은 정리 함수에서 서버 종료 감시(`NativeOutgoingTerminalWatch`)도 멈추지 않음 — 감시가 스스로 끝날 때까지(종료 감지 또는 최대 35초) 1초마다 서버 조회가 계속됨. 실측: `c38a` 정리 0.3초 뒤 `terminal_watch_detected … skipped reason=not_pre_connect`.

### 1-3. 실제 iPhone 에서 소리가 남는가
- 정리 함수가 마지막에 오디오 세션을 끔(`DibayCallAudioSessionController.deactivateAfterNativeVoiceCall` → `setActive(false)`).
- Apple 문서(`AVAudioSession.setActive(_:options:)`): 「실행 중인 오디오 객체가 있는 세션을 끄면 **그 객체를 멈추고**, 세션을 비활성으로 만들고 `isBusy` 오류를 돌려준다」.
- 그래서 실제 iPhone 에서는 **정리 시점에 발신음이 멈출 가능성이 높다(추론, NOT_PROVEN).** 시뮬레이터는 이 동작이 달라 계속 울렸다.
- 그래도 실제 기기에 남는 문제(코드 판정, 실측 NOT_PROVEN):
  - **P1 끊은 뒤 약 1초 더 울림:** 발신자가 「취소」를 눌러도 서버 `endAsync` 응답이 올 때까지 정리가 미뤄져, 그동안 발신음이 계속 난다(실측 간격 1.1초).
  - **P2 늦게 시작된 발신음이 끝까지 남을 수 있음:** 발신음은 설정 조회 + 음원 내려받기 뒤에 비동기로 시작한다(`c38a` 는 종료 **뒤** 시작). 정리(세션 끄기)가 **음원 재생 시작보다 먼저** 끝나면, 그 뒤 `player.play()` 가 세션을 다시 켜고 멈출 주체가 없다. 빨리 끊을수록(약 1초 이내) 일어날 수 있음.
  - **P3 맥(iPad 앱 on Mac, 빌드 37~40):** CallKit 이 없는 맥에서 세션 끄기가 재생을 멈추는지 **확인 못 함** — 시뮬레이터처럼 계속 울릴 수 있음.

## 2. 원인 (확정)
iOS 발신음 정지가 「연결됨」「실패」에만 묶여 있고, **발신자 취소·상대 종료로 끝나는 정리 경로(음성·영상 `cleanup`)에는 정지 호출이 없다.** 오디오 세션 끄기의 부수 효과에 기대고 있어, 그 효과가 없는 환경(시뮬레이터 확정, 맥 미확인)과 재생이 늦게 시작되는 경우(P2)에 발신음이 남는다.

## 3. 기준 대조
| | 종료 시 발신음 정지 | 근거 |
|---|---|---|
| Telegram Android | **모든 종료**에서 직접 정지 — `callEnded()` 안 `soundPool.stop(spPlayId)` + `onDestroy` 에서 `soundPool.release()` | `VoIPService.java` 5687~·4404~ (DrKLO/Telegram master) |
| Signal Android | 통화 정지 시 `outgoingRinger.stop()` | `SignalAudioManager.kt` 350~366 (signalapp/Signal-Android main) |
| **DIBAY Android** | 음성·영상 각각 **5곳**(연결·실패·로컬 종료·원격 종료 등)에서 `NativeOutgoingRingbackOwner.stop` | `NativeVoiceCallRuntime.java` 637·868·968·1037·1046, `NativeVideoCallRuntime.java` 614·865·963·1026·1034 |
| **DIBAY iOS** | 연결·실패 **2곳만** | §1-2 |

→ iOS 만 Android·레거시와 다르다. 이 설계는 iOS 를 Android 와 같은 규칙(「통화가 끝나는 모든 경로에서 발신음·종료 감시를 직접 멈춘다」)으로 맞춘다.

## 4. 설계 (iOS 네이티브만 · 통화 단독 PR)

| # | 변경 | 파일·함수 | 막는 문제 |
|---|---|---|---|
| R1 | 음성 정리 함수 첫머리에서 `NativeOutgoingRingbackOwner.shared.stop(callId: sid, reason: "cleanup_\(reason)")` + `NativeOutgoingTerminalWatch.shared.stop(callId: sid, reason: "cleanup_\(reason)")` | `NativeVoiceIncomingCallCoordinator.swift` `cleanup`(468줄) | 시뮬레이터·맥 잔여음, P2, 감시 잔여 |
| R2 | 음성 발신자 끊기: 서버 응답을 기다리기 **전에** 발신음 정지(`.outgoingStarting/.tokenPending/.joining` 분기의 `beginEnd` 직후) | 같은 파일 `performLocalRejectOrEnd` | P1(끊은 뒤 1초 더 울림) |
| R3 | 영상 정리 함수에 R1 과 같은 두 줄 | `Video/NativeVideoIncomingCallCoordinator.swift` `cleanup`(511줄) | 영상의 같은 문제 |
| R4 | 영상 발신자 끊기에 R2 와 같은 처리 | 같은 파일 `handleRejectOrEnd` 의 로컬 종료 분기(264줄 `endAsync` 앞) | 영상 P1 |

- 안전 근거:
  - `stop(callId:)` 는 **현재 발신음의 callId 와 다르면 아무것도 안 한다**(`active != sid → return`). 수신 통화 정리·다른 통화에는 영향 없음.
  - `stop` 은 세대값(`generation`)을 올린다 → 늦게 끝난 설정 조회·음원 내려받기의 `isStillActive` 검사가 실패해 **늦은 재생 시작이 막힌다(P2 해결).**
  - 여러 번 불러도 같다(이미 멈췄으면 무동작).
- 바꾸지 않는 것: 발신음 시작 조건·음원·음량·경로(수화기/스피커), CallKit 보고, 서버 API, 수신 벨, 연결·종료 판정, 웹 코드, 서버, DB.

## 5. 영향받는 경로 (통화 규정 3번)
| 경로 | 영향 |
|---|---|
| 발신 시작·세션 생성 | 없음 |
| VoIP/FCM 발송 | 없음(서버 무변경) |
| iOS CallKit 발신 표시·종료 | 없음(정리 순서 유지, 정지 두 줄만 앞에 추가) |
| 발신자 취소 | 발신음이 **누르는 즉시** 멈춤(지금: 서버 응답 뒤 약 1초) |
| 상대 거절·무응답·통화 중·취소 | 정리 시점에 발신음·감시 확실히 멈춤 |
| 연결 | 지금과 같음(`onConnected` 정지 유지) |
| 수신 통화(벨·수락·거절) | 없음 — callId 가 달라 무동작 |
| 통화 기록·팝업·부재중 | 없음 |
| 맥(CallKit 없음) | 같은 정리 함수를 쓰므로 함께 적용 |

## 6. 설치된 구 바이너리
- 운영 14일 활성 iOS: 1.2.2 (35)·(34), 1.2.1 (31), 1.2 (21)·(22)·(27). 발신음 코드는 2026-07-28(`cab62da9d`)부터 있어 **전 버전이 같은 동작.**
- 네이티브 변경이라 새 iOS 빌드를 설치한 기기부터 적용. 구 빌드는 지금과 같음(웹·서버 변경 없음 → 구 빌드에 새 위험 없음).

## 7. 위험 · 롤백
- 위험 W1: 연결 직전 경합에서 정리가 먼저 불리면 연결 뒤 발신음이 없다 — 의도된 동작(연결되면 발신음은 원래 멈춤).
- 위험 W2: 정리 함수가 수신 통화에도 쓰이므로 callId 검사에 기댄다 — 검사 코드가 이미 있음(§4). 시험으로 고정.
- 롤백: 커밋 되돌리기 + 다음 iOS 빌드.

## 8. 검증
### 코드
- 계약 시험(소스 읽기): 음성·영상 `cleanup` 과 로컬 종료 분기에 정지 호출이 있다 · `stop` 의 callId 검사 유지.
### 실기 (빌드 후 · Production SHA·iOS 빌드 번호 매번 기록 · 기기 로그 `native_outgoing_ringback_stop` 시각으로 판정)
| # | 상황 | 기대 |
|---|---|---|
| T1 | iPhone 음성 발신 → 0.5초 안에 취소 | 발신음 즉시 멈춤, 다시 시작 안 함(P2) |
| T2 | 음성 발신 → 3초 뒤 취소 | 누른 순간 멈춤(P1) |
| T3 | 상대 거절 / 무응답 30초 / 통화 중 | 종료 표시와 함께 멈춤 |
| T4 | 연결 | 연결 순간 멈춤(기존) |
| T5 | 영상으로 T1~T4 | 같음 |
| T6 | 맥(빌드 40 이후)에서 T1·T2 | 잔여음 없음(P3) |
| T7 | 시뮬레이터에서 T1 | 잔여음 없음(이번 재현 환경) |
| T8 | 발신 직후 다른 통화 수신·수락 / 종료 후 즉시 재발신 | 수신 벨·다음 발신음 정상 |
| T9 | 통화 기본 행렬(통화 규정 5번) | 무회귀 |

## 9. 반영 방식
- 통화 단독 PR(iOS 네이티브 4곳 + 계약 시험). 다른 작업과 묶지 않음.
- 빌드 번호 증가·설치 빌드는 Owner 일괄 빌드 시점에(네이티브 빌드 규정).
