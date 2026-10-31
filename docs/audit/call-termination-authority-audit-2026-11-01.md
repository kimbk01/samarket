# 통화 종료·리소스 정리 구조 — 전수 재검증 · 최종 구현 계획 v2 (2026-11-01 PHT)

> 상태: **구현·main 반영 완료 (2026-11-01)** — 1 Android `589c6d071`(+`6ec11ee77`) · 2 iOS `1b7776cf8` · 3 웹 `59e2d4db9` · 4 서버 `0056be06d`. 실기: Android 16건·iPhone 6건·웹 재로드·구형 앱 호환·busy PASS. NOT_PROVEN: I1·W1~W5·A10(경합 재현 불가)·W6 실동작(앱 경로로 도달 불가). 사용자 반영은 Android 24·iOS 20 스토어 출시 후(Owner 승인 필요).
> 기준: main `f35009171`. 26건 전부 작업자가 코드를 직접 열어 호출 경로를 확인했다(서브 조사 결과를 그대로 쓰지 않음).
> 운영 DB 는 읽기 전용 조회 2회만 했다(설치 버전 분포, 최근 30일 종료 사유).
> v1(같은 파일 이전 판)의 「관문 하나」 설계는 Owner 지적 4가지(종료 판단과 정리의 분리·소유권·권한 표·배포 순서)를 반영해 이 판으로 대체한다.

## 0. 내 잘못 먼저
- S2 영향 분석에서 「통화 화면 파괴 → 통화 종료」 코드를 PiP 닫기 한 경우만 막고 나머지(최근 앱·OS 정리·Dock)를 빠뜨렸다. 그 결과 실기 G1-3b FAIL(callId `d6b2988b`)이 났다.
- 그 뒤 한 줄 수정안(계획서 §10-2)을 올렸다. 땜빵이었고 폐기했다.

## 1. 26건 검증 결과
분류:
- **확정** = 코드에서 호출 경로와 발생 조건을 확인했고 일반 사용 중에 일어날 수 있음
- **잠복** = 코드는 확인했지만 다른 방어(서버 busy 등)가 있어 특수 조건에서만 일어남
- **한계** = 플랫폼 제약이라 코드로 해결할 수 없음

| # | 항목 (근거 코드) | 실제 호출 경로·조건 | 현재 통화 영향 | 분류 | 수정 |
|---|---|---|---|---|---|
| A1 | Android 통화 화면 파괴 → 종료 (`NativeVoiceCallActivity.onDestroy:279-299`→`endLiveSessionIfSurfaceDestroyed:423-435`, 영상 `:649-689`) | 최근 앱에서 통화 카드 제거·OS/OEM 정리·Dock 모드 중 정리·onCreate 자격 실패 `finish()`(:202-209). PiP 정지 상태만 예외 | 연결 중·연결됨 → 서버 end, 수신 벨 → 서버 reject | **확정 + 실기 재현** | 대상 |
| A2 | 발신 준비 중 뒤로·파괴 → 발신 취소 (`:382-387`, `:290-292` → `abandonPreparingFromUi` → JS `abandonCallV4OutgoingAttempt`) | 세션 생성 전 1~2초 구간 | 발신이 시작되지 않음 | 확정(영향 구간 짧음) | 대상 |
| A3 | 새 수신 시 「받은 지 120초 이내 통화」 정리 (`NativeVoiceCallRuntime.reclaimConsumedLiveSessions:274-289`, 수락 시 consumed 표시 :650, TTL 120s) | 통화 중 다른 통화의 수신 FCM 도착. 서버는 상대가 통화 중이면 busy 로 막아 푸시를 보내지 않음(`service.ts:20078-20123`) → 경합·지연 푸시에서만 | 서버 PATCH 없이 로컬 종료 → 상대는 유령 통화 | 잠복 | 대상 |
| A4 | 새 발신 시 진행 중 음성 통화 종료 (`releasePriorLiveSessionsForOutgoing:296-305`) | 웹이 새 발신 시작. 웹 store 가 통화를 알면 웹 가드가 막음 → 웹 화면 새로고침 뒤에만 | 연결된 통화 end | 잠복 | 대상 |
| A5 | 다른 통화 정리가 현재 통화 서비스 정지 (`NativeVoiceCallService.stop:50-58` 알림 ID 하나 + `ACTION_STOP:90-94` callId 무시, 영상 동일. `cleanup` → `DibayActiveCallSessionManager.clearSession()` 전역) | `prepareJoin` 오래된 엔진 점유 정리(`NativeCallEngineOwnership:125-129`)·stale reclaim 이 새 통화 시작 뒤 실행될 때 | 현재 통화의 FGS·알림·활성 기록 상실 → 백그라운드 마이크 보호 상실, 통화 바 사라짐 | 확정(조건부 도달) | 대상 |
| A6 | 영상 정리가 소유자 확인 없이 Agora 이탈 (`NativeVideoCallRuntime.cleanup:756`, `terminalPatch:793` → `NativeVideoCallAgoraEngine.leave(reason):487`) | 다른 영상 callId 정리. 음성은 `leave(sid,…)` 로 소유자 확인함 | 현재 영상 통화 미디어 끊김(상태는 CONNECTED 로 남음) | 확정(조건부 도달) | 대상 |
| A7 | Agora 모든 오류 → 종료 (음성 `AgoraEngine:461-471`→Runtime `:635`,`:705` `fail`, 영상 `:895-904`) | 오류 코드 구분 없음(경고성 오류 포함) | 연결된 통화 종료 | 확정 | 대상 |
| A8 | 영상 원격 화면 연결 예외 → 종료 (`NativeVideoCallAgoraEngine:719-726`) | 화면 재생성 후 영상 재연결 중 예외 | 통화 종료 | 확정 | 대상 |
| A9 | 웹 `endCall` 이 금지 사유 검사 없이 정리 (`call/NativeCallServicePlugin.endCall:199-219` → `NativeCallRuntimeEndDispatcher:22-33` → `onRemoteTerminal`) | 웹 정리(`cleanupCallV4`)가 보내는 모든 사유 | 로컬 정리(서버는 active 로 남을 수 있음) | 확정 | 대상 |
| A10 | push ack 응답이 `active` 면 「다른 기기에서 받음」 처리 (`IncomingCallPushAckHelper:86-97`) | 같은 기기에서 수락이 ack 응답보다 먼저 서버에 반영된 경합 | 내 통화 정리 | 잠복(경합) | 대상 |
| A11 | 영상 수락 시 권한 없으면 조용히 거절 (`NativeVideoCallRuntime.accept:589-591`) | 알림·잠금화면 수락 경로(통화 화면 권한 요청을 거치지 않음) | 상대에게 거절로 전달 | 확정 | 대상 |
| A12 | 프로세스 종료 시 복구 없음 (서비스 `START_NOT_STICKY`, 세션 메모리 보관) | OS 메모리 회수·강제 종료 | 통화 소실 | 한계 | 제외(기록) |
| I1 | 새 수신 보고 시 모든 CallKit 통화 `.failed` 종료 (`CallKitProvider.reconcileStaleSessionsBeforeIncoming:556-595`) | 다른 sessionId 의 VoIP 수신 보고. 서버 busy 로 일반 수신은 막힘 → 고아 terminal 보고·게스트 무음 보고·경합에서 | CallKit 만 종료, Runtime·Agora 남음(좀비) | 잠복 | 대상 |
| I2 | 웹 `endCall` 이 사용자 종료처럼 처리 (`NativeCallServicePlugin.swift:165-222`, 정리 목록 :231-239 밖 사유 → `handleRejectOrEnd`) | 웹 정리 사유가 목록 밖일 때 | 서버 end | 확정 | 대상 |
| I3 | Agora 모든 오류 → 종료 (`NativeVoiceCallAgoraEngine.swift:371-385` → coordinator `onError` → `fail(.joinFailed)`, 영상 동일) | 오류 코드 구분 없음 | 연결된 통화 종료 | 확정 | 대상 |
| I4 | 웹 「상대 종료」 알림을 서버 확인 없이 수용 (`reportRemoteEnded`, `DibayVoipCallPlugin.reportCallEnded`) | 웹 판단이 틀릴 때(W3 등) | 통화 종료 | 확정(웹 오판 전달 통로) | 대상 |
| I5 | 음성 발신 실패 시 서버 end 누락 (`NativeVoiceOutgoingCallCoordinator.fail:192-200` → `markPipelineFailed` 후 `performLocalRejectOrEnd` 가 `default` 분기 → `serverAction: nil`) | 토큰·참가·오디오 준비 실패 | 상대는 서버 30초 만료까지 계속 울림 | 확정 | 대상 |
| I6 | 앱 강제 종료 | iOS 가 CallKit·Agora 를 앱과 함께 종료 | 통화 소실. 상대에게는 서버 heartbeat 만료로 전달 | 한계 | 제외(기록) |
| I7 | iOS 측면 버튼 (실기 2026-11-01 05:15:55, callId `d36ee497`) | 수화부 통화 중 측면 버튼 → iOS 가 CallKit 종료 요청(`USER_END … callkit_system_button`). 앱은 측면 버튼과 잠금화면 종료 버튼을 구분할 수 없음 | 통화 종료(iOS 규칙, 기본 전화 앱 동일). 스피커 통화·「설정 → 손쉬운 사용 → 터치 → 통화 종료 시 잠금 방지」 켜면 유지 | 한계 | 제외(기록) |
| W1 | 웹 감시 타이머가 서버 end (`call-heartbeat-watchdog.ts:86-114`) | 백그라운드에서 웹 타이머 정지 후 복귀. 예외 조건이 `getActiveCallId()`(Android 는 `DibayActiveCallSessionManager` 값, `NativeCallServicePlugin.java:94-100`)인데 A5 로 비면 통과 | 서버 end | 확정(조건부) | 대상 |
| W2 | 「수락」 이벤트를 「ended」로 매핑 (`CallV4Provider.tsx:415-428`) | 같은 WebView 의 `incoming_consumed`(reason accept) | 네이티브 종료 | 잠복(현재 발생 경로 좁음) | 대상 |
| W3 | 세션 조회 404 → 「failed」 (`call-v4-connected-terminal-watch.ts:59`) | 서버 일시 오류도 404 가 될 수 있음 | 네이티브 종료 | 확정 | 대상 |
| W4 | 거절 PATCH 실패해도 로컬 종료 (`callV4Reject:1228-1243`, iOS `CallV4Screen.tsx:183-185` `?action=reject`) | iOS 에서 거절 주소 화면이 새로고침·복원 | 네이티브 종료 | 잠복 | 대상 |
| W5 | missed PATCH 실패 + 재조회 애매 → 로컬 `no_answer` (`call-v4-actions.ts:1365-1377`) | 수락 순간 네트워크 오류 | 네이티브 종료 | 잠복(좁음) | 대상 |
| W6 | 같은 방 새 발신이 진행 중 통화 종료 (`service.ts:20034-20072` `terminateLive…`/`forceEndLive…`) | 통화 중 같은 방에서 통화 버튼(웹 store 가 비어 있을 때) | 진행 중 통화 ended | 잠복 | 대상 |
| W7 | 네이티브 heartbeat 가 WebView 쿠키만 사용, 갱신 쿠키 저장 안 함 (`NativeVoiceCallApi.open:527-541`) | 앱 최소화 상태로 토큰 수명 초과 | heartbeat 401 → 양쪽 모두면 서버 90초 정리로 종료. **운영 DB: 최근 30일 `heartbeat_timeout` 4건(영상, 마지막 10/14)** — 원인 미확정 | 위험(실기 확인 필요) | 실기로 401 확인 후 결정 |
| W8 | `runCallEndGuardFromAppSwipe` (`call-end-guard.ts:51`) | 호출처 없음 | 없음 | 죽은 코드 | 제거 |

합계: 확정 15 · 잠복 8 · 한계 2 · 죽은 코드 1. **수정 대상 23건**. W7 은 실기 측정 후 결정한다.

## 2. 최종 구조 — 「종료 판단」과 「리소스 정리」 분리
### 2-1 단계 정의
한 통화의 끝은 다음 단계를 **순서대로** 거친다. 단계마다 책임자가 하나다.
| 단계 | 하는 일 | 책임자 |
|---|---|---|
| ① 종료 요청 | 「끝내자」는 신호. 사유(종류)와 출처를 함께 보냄 | 버튼·푸시·서버 조회·Agora·웹 |
| ② **종료 판단** | 살아 있는 통화를 이 사유로 끝내도 되는지 결정 | 플랫폼별 **판단 함수 1개** (`CallTerminationPolicy`) |
| ③ 서버 확정 | 서버 세션 상태를 terminal 로 변경 | 사용자 종료일 때만 네이티브가 PATCH. 상대 종료·무응답은 서버가 이미 확정 |
| ④ Runtime 종료 | 세션 상태 → ENDING → 제거 | Runtime |
| ⑤ **리소스 정리** | Agora 이탈·FGS/알림·CallKit·활성 기록·벨/발신음·heartbeat | 플랫폼별 **정리 함수 1개** (`releaseCallResources(callId)`) — 그 callId 가 소유한 것만 |
| ⑥ 잔여 회수 | 살아 있는 세션 없이 남은 리소스 회수 | 정리 함수의 「고아 회수」 모드 |

### 2-2 종료 판단 (② · 차단은 여기서만)
판단 결과는 세 가지다:
- `TERMINATE` — ③~⑤ 진행
- `CONVERGE` — 서버·상대가 이미 끝냄. ③ 생략하고 ④⑤ 진행
- `KEEP` — 아무것도 바꾸지 않고 기록만 남김

| 사유(종류) | 출처 예 | 벨(수신/발신) | 연결 중·연결됨 | 이미 끝난 세션 |
|---|---|---|---|---|
| `USER_END` / `USER_DECLINE` / `USER_CANCEL` | 앱 버튼·Dock·PiP 버튼·알림 버튼·CallKit 시스템 버튼 | TERMINATE | TERMINATE | CONVERGE |
| `PEER_TERMINAL` (서버 상태로 확인됨) | terminal 푸시·발신 상태 조회·서버 조회로 확인된 realtime | CONVERGE | CONVERGE | CONVERGE |
| `NO_ANSWER` | 벨 30초(서버 확정 또는 네이티브 missed 타이머) | TERMINATE/CONVERGE | KEEP(연결됨이면 무시 — 기존 동작 유지) | CONVERGE |
| `BUSY` | 서버 busy 응답 | CONVERGE | — | CONVERGE |
| `MEDIA_FATAL` | 토큰·참가 실패, Agora **치명 오류 목록**(§2-4) | TERMINATE | TERMINATE | CONVERGE |
| `PERMISSION_DENIED` | 사용자가 권한 거부를 확정 | TERMINATE(거절) | — | — |
| `SURFACE_LOST` | 화면 파괴·최근 앱 제거·PiP 닫기·Dock 정리 | **KEEP** | **KEEP** | CONVERGE |
| `SUPERSEDED` / `RECLAIM` | 새 수신·새 발신·엔진 점유 정리 | **KEEP** | **KEEP** | CONVERGE |
| `WEB_REQUEST_UNCONFIRMED` | 웹 정리·웹 감시 타이머·404 | **KEEP** | **KEEP** | CONVERGE |
| 사유 없음·알 수 없음 | — | KEEP | KEEP | CONVERGE |

- **KEEP 이 좀비를 만들지 않는 근거:** KEEP 은 살아 있는 통화에만 적용된다. 살아 있는 통화는 다음 중 하나로 반드시 끝난다.
  - 사용자 종료 수단(알림 종료 버튼·통화 바 → 통화 화면). 이것이 항상 있어야 하므로 §2-3 불변식으로 보장한다.
  - 상대 종료(서버 확정)
  - 벨 30초(서버 확정)
  - 서버 heartbeat 정리(양쪽 90초)
- 「이미 끝난 세션」 열은 **항상 CONVERGE** 다. 정리를 막지 않으므로 「종료 관문 때문에 정리가 막히는」 경우가 없다.

### 2-3 리소스 정리 (⑤⑥ · 소유권 기준)
**소유권 판정:** callId 가 같을 것 **그리고** 리소스의 현재 점유 기록이 그 callId 일 것. 둘 다 맞을 때만 정리한다.

| 리소스 | 현재 | 변경 |
|---|---|---|
| Agora 음성 | `leave(sid,…)` 점유자 확인 있음 | 유지 |
| Agora 영상 | `leave(reason)` 확인 없음 | 음성과 같은 `leave(sid,…)` 로 통일(A6) |
| Android FGS·진행 중 알림 | 알림 ID 하나, `ACTION_STOP` callId 무시 | 서비스가 현재 소유 callId 를 기억하고, 같을 때만 정지·알림 제거(A5) |
| 활성 통화 기록(`DibayActiveCallSessionManager`) | `clearSession()` 전역 | `clearSession(callId)` — 같을 때만(A5·W1) |
| CallKit | UUID 별 종료 | 유지. 단 `reconcileStaleSessionsBeforeIncoming` 은 판단 함수를 거침(I1) |
| 벨·발신음·heartbeat·presence | callId 별 | 유지 |
| 영상 정리 중복 실행 | 음성만 `TerminalOnce` | 영상도 같은 1회 보장 |

**불변식(정리 함수 끝에서 검사):**
- 살아 있는 세션이 0개인데 FGS·Agora·CallKit·마이크/카메라가 남아 있으면 고아 회수(⑥)를 한다. 앱이 앞으로 올 때와 정리가 끝날 때 실행한다.
- 살아 있는 세션이 있으면 진행 중 통화 알림(Android)·CallKit 통화(iOS)가 반드시 있어야 한다. 없으면 다시 올린다. 이것이 사용자가 언제든 끊을 수 있는 수단이다.

### 2-4 서버·네이티브 권한 표 (③)
| 상황 | 서버 상태 확정 | 네이티브 동작 |
|---|---|---|
| 내가 종료·거절·취소 | 네이티브가 PATCH. 실패해도 로컬 정리는 진행하고(사용자 의사), PATCH 는 1회 재시도 | TERMINATE |
| 상대 종료·취소·거절 | 서버가 이미 확정. 네이티브는 푸시·조회의 **서버 상태**로만 수용 | CONVERGE |
| CallKit 시스템 종료 버튼(iOS) | = 내가 종료 | TERMINATE |
| CallKit 이 앱 내부 정리로 요청된 종료 | 판단 함수 통과 필요 | 사유대로 |
| 네트워크 끊김 | Agora 자동 재연결에 맡김. 끊김만으로 끝내지 않음 | KEEP → Agora 가 「연결 실패」 상태가 되면 `MEDIA_FATAL` |
| Agora 치명 오류 | — | `MEDIA_FATAL`. 목록은 토큰 무효·만료, 채널 접근 거부, 서버 차단, 연결 실패. 그 외 오류 코드는 기록만 |
| 상대가 한쪽에서 사라짐 | 서버 heartbeat 정리(양쪽 90초) 또는 Agora 상대 퇴장(QUIT) | CONVERGE (기존 유지) |

## 3. 플랫폼별 변경 파일·영향 범위
### 3-1 Android (네이티브 빌드 · versionCode 24)
| 파일 | 변경 | 영향받는 호출처 |
|---|---|---|
| `nativecall/CallTerminationPolicy.java` (신규, 음성·영상 공용) | §2-2 판단표 | Runtime 전 진입점 |
| `nativevoice/NativeVoiceCallRuntime.java` | `end`/`reject`/`fail`/`onRemoteTerminal`/`reclaim*`/`releasePrior*` 가 판단 함수를 거침. `cleanup` → 소유권 정리 | Activity·ActionReceiver·Dock·PiP 액션·FCM terminal·Plugin.endCall·EngineOwnership |
| `nativevideo/NativeVideoCallRuntime.java` | 위와 같음 + `TerminalOnce` 추가 + `leave(sid,…)` | 같음 |
| `nativevoice/NativeVoiceCallActivity.java`, `nativevideo/NativeVideoCallActivity.java` | `onDestroy`·뒤로(준비 중)는 `SURFACE_LOST` 로 요청만(판단 함수가 KEEP). 자격 실패 `finish()` 는 거절로 이어지지 않게 | 수신 화면·발신 화면·PiP·Dock |
| `nativevoice/NativeVoiceCallService.java`, `nativevideo/NativeVideoCallService.java` | 소유 callId 기억, 같을 때만 정지 | 모든 cleanup |
| `nativevideo/NativeVideoCallAgoraEngine.java`, `nativevoice/NativeVoiceCallAgoraEngine.java` | `onError` 는 치명 목록만 `MEDIA_FATAL`, `setupRemoteVideo` 예외는 재시도 후 기록 | 연결 중·연결됨 |
| `call/DibayActiveCallSessionManager.java` | `clearSession(callId)` | Runtime cleanup·Plugin |
| `call/NativeCallServicePlugin.java` | `endCall` 은 `WEB_REQUEST_UNCONFIRMED`(서버 terminal 사유만 `PEER_TERMINAL`). 기능 판별용 메서드 `getCallTerminationPolicy` 추가 | 웹 |
| `IncomingCallPushAckHelper.java` | `active` 응답은 같은 기기 수락 여부를 확인한 뒤 판단 | FCM 수신 |
| 바꾸지 않음 | FCM 수신·벨·CallKit 없는 Android 수신 화면 흐름·Agora 참가 절차·S1/S2 동작·통화 기록 | — |

### 3-2 iOS (네이티브 빌드 · build 20)
| 파일 | 변경 |
|---|---|
| `Call/CallTerminationPolicy.swift` (신규) | §2-2 판단표 (Android 와 같은 표) |
| `Push/CallKitProvider.swift` | `reconcileStaleSessionsBeforeIncoming` 이 살아 있는 통화(수락 이후·연결됨)는 건드리지 않음(I1). `CXEndCallAction` 출처 구분(시스템 버튼 = USER_END, 앱 내부 요청 = 판단 함수) |
| `Plugins/NativeCallServicePlugin.swift` | `endCall` 을 Android 와 같은 규칙으로(I2). 기능 판별 메서드 추가 |
| `Plugins/NativeCallServicePlugin.swift`·`DibayVoipCallPlugin.swift` | `reportRemoteEnded`/`reportCallEnded` 는 서버 상태 확인 후 CONVERGE(I4) |
| `Call/NativeVoiceCallAgoraEngine.swift`, `Call/Video/NativeVideoCallAgoraEngine.swift` | 치명 오류 목록만 종료(I3) |
| `Call/NativeVoiceOutgoingCallCoordinator.swift`, `Call/NativeVoiceIncomingCallCoordinator.swift` | 발신 실패 시 서버 end 보장(I5) |
| 바꾸지 않음 | PushKit 등록·CallKit 수신 보고·S3 줄이기·PiP |

### 3-3 웹 (Production 배포 · 기능 판별로 새 앱에서만 동작)
| 파일 | 변경 |
|---|---|
| `lib/call/native/native-call-service.ts` | `isNativeCallTerminationPolicySupported()` — 기존 `nativeCallServiceHeaderHasMethod` 방식 그대로 |
| `lib/call/native/call-heartbeat-watchdog.ts` | 지원 앱에서는 서버 end 하지 않음(W1) |
| `components/community-messenger/call-v4/CallV4Provider.tsx` | `incoming_consumed`(accept) → 무시(W2) — 모든 버전에 안전(수락은 종료가 아님) |
| `lib/community-messenger/call-v4/call-v4-connected-terminal-watch.ts` | 404 → 「알 수 없음」(W3) — 모든 버전에 안전(진짜 종료는 푸시·서버 상태로 별도 도달) |
| `lib/community-messenger/call-v4/call-v4-actions.ts` | 지원 앱에서 거절·missed PATCH 실패 시 로컬 종료 안 함(W4·W5) |
| `lib/community-messenger/call-v4/call-v4-cleanup.ts` | 지원 앱에 보내는 `endNativeCallService` 사유를 서버 확정 여부로 구분 |
| `lib/call/actions/call-end-guard.ts` | `runCallEndGuardFromAppSwipe` 제거(W8) |

### 3-4 서버 (Production 배포)
| 파일 | 변경 |
|---|---|
| `lib/community-messenger/service.ts` 통화 생성 | `dialFresh` 가 heartbeat 가 살아 있는(90초 이내) active 세션은 끝내지 않고 busy 응답(W6). 끊긴 세션 정리는 그대로 |
| (W7) | 실기에서 최소화 장시간 heartbeat 401 이 확인되면 별도 설계. 지금은 변경 없음 |
| 운영 DB | 변경 없음 |

## 4. 기존 정상 기능 보호
- **판단표는 「현재 정상 종료」를 모두 TERMINATE/CONVERGE 로 둔다.** 버튼·상대 종료·무응답·busy·토큰/참가 실패는 동작이 같다.
- 바뀌는 것은 표의 KEEP 칸(화면 파괴·대체·웹 미확인·비치명 오류)뿐이다.
- 기능별 변경 전후 비교(자동 테스트 + 실기 항목):

| 기능 | 변경 전 | 변경 후 |
|---|---|---|
| 음성·영상 발신·수신·수락·거절·취소·종료 | 정상 | 같음 |
| 벨 30초 무응답 | 정상 | 같음 |
| 통화 중 다른 수신 | 서버 busy(정상). 경합 시 기존 통화가 끊길 수 있음 | 서버 busy 같음. 경합 시에도 기존 통화 유지 |
| 통화 중 새 발신 | 웹 가드. 새로고침 후 기존 통화 종료 가능 | 기존 통화 유지 + busy |
| 백그라운드·PiP·Dock·통화 바·알림 복귀 | 정상(S1·S2) | 같음 |
| 뒤로·홈 | 유지 | 같음 |
| 최근 앱 통화 카드 제거·OS 화면 정리 | **통화 종료** | 유지(알림·바로 복귀) |
| iOS CallKit 시스템 종료 | 정상 | 같음 |
| PushKit 수신 | 정상 | 같음(I1 은 살아 있는 통화 제외만) |
| 네트워크 끊김·재연결 | Agora 오류 시 종료 | 치명 오류만 종료 |
| 종료 후 즉시 재발신 | 정상. 이전 통화 정리가 새 통화 FGS 를 끊을 수 있음 | 소유권 정리로 새 통화 보호 |
| 서버 heartbeat·통화 기록 | 정상 | 같음 |

- 자동 테스트: Android·iOS 판단표 단위 테스트(사유 × 상태 전 조합), 소유권 정리 테스트(다른 callId 정리 시 현재 통화 리소스 불변), 기존 통화 계약 vitest·`verify:call-*`·`verify-native-*-runtime-contract` 전부 실행.

## 5. 구형 바이너리 호환·배포 순서
- **설치 현황**(운영 DB `user_devices`, 최근 30일):
  - Android: 1.2.5 (20) 19대 · 1.0 계열 22대 · 1.2.1~1.2.4 18대 · 1.2.5 (23) 1대
  - iOS: 1.2 (7) 6대 · (16) 2대 · (19) 2대
  - 구형이 대부분이므로 **웹·서버 변경은 구형 앱에서도 안전해야 한다.**
- **호환 방식(새 시스템 아님):** 웹이 이미 쓰는 플러그인 메서드 판별(`nativeCallServiceHeaderHasMethod`, S1 `bringActiveCallToFront` 와 같은 방식)로 새 앱만 새 동작을 쓴다. 구형 앱은 지금 웹 동작 그대로다.
- **웹 변경별 구형 앱 영향:**

| 변경 | 구형 앱 | 근거 |
|---|---|---|
| W2 수락→종료 매핑 제거 | 안전(전 버전 적용) | 수락은 종료가 아님. 진짜 종료는 다른 경로로 도달 |
| W3 404→알 수 없음 | 안전(전 버전 적용) | 진짜 종료는 푸시·서버 상태로 도달. 정리 지연 최대 = 다음 확인 주기 |
| W1·W4·W5·cleanup 사유 | **새 앱만** | 구형 앱은 네이티브에 판단 함수가 없어서, 웹이 덜 끝내면 정리 누락이 생길 수 있음 |
| W8 죽은 코드 제거 | 안전 | 호출처 없음 |

- **서버 W6 구형 앱 영향:** heartbeat 가 살아 있다는 것 자체가 통화가 살아 있다는 뜻이므로 모든 버전에서 안전하다. 끊긴(heartbeat 만료) 세션 정리는 그대로다.
- **확정 순서:**
  1. **Android 네이티브**(versionCode 24) — 웹 변경 없이 단독 동작. 새 웹이 없어도 판단 함수가 웹 미확인 요청을 KEEP 한다.
  2. **iOS 네이티브**(build 20) — 같음.
  3. **웹** — W2·W3·W8(전 버전 안전) + 기능 판별 뒤 W1·W4·W5.
  4. **서버** W6.
  - 각 단계는 통화 단독 커밋 → 로컬 검증 → (Owner 실기 승인 시) 실기 PASS 후 다음 단계로 간다.
  - 네이티브 1·2 는 설치·배포용 빌드가 필요하고, 웹 3·4 는 앱 재시작만 하면 된다.

## 6. 예상 회귀 위험·방지책
| 위험 | 방지 |
|---|---|
| KEEP 때문에 끝나야 할 통화가 남음(좀비·마이크/카메라 점유) | 「이미 끝난 세션」은 항상 CONVERGE. 고아 회수 불변식. 살아 있는 통화는 알림·CallKit 종료 수단 보장. 서버 30초 벨·90초 heartbeat 정리는 그대로 |
| 소유권 정리로 진짜 고아 FGS 가 남음 | 고아 회수 모드: 살아 있는 세션이 0일 때 소유 기록과 관계없이 전부 정리 |
| Agora 치명 오류 목록 누락 → 끊긴 통화가 안 끝남 | Agora 연결 상태 「실패」를 치명으로 포함. 서버 heartbeat 정리가 최종 보장 |
| iOS CallKit 출처 구분 오판 → 시스템 종료 버튼 무시 | `requestLocalEndCallAction`(CallKitProvider.swift:478) 이 요청하는 UUID 를 새로 기록하고(현재는 기록 없음 — 코드 확인), `CXEndCallAction` 이 그 목록에 없으면 시스템 버튼으로 간주 = USER_END |
| 웹 기능 판별 오판 | 판별 실패 시 구형 동작(현재 동작) 유지 |
| 09-21 좀비(연결 중 화면 파괴 후 FGS 잔류) 재발 | 화면 파괴 시 통화는 유지하되, 통화가 끝나면 소유권 정리 + 고아 회수가 FGS 를 반드시 정리. 09-21 재현 시나리오를 자동 테스트에 포함 |

## 7. 구현 단계·자동 테스트·실기 시나리오
| 단계 | 내용 | 자동 테스트 | 실기(Owner 승인 후) |
|---|---|---|---|
| 1 Android | §3-1 | 판단표·소유권·09-21 재현·기존 계약 | Samsung·Xiaomi ↔ iPhone 음성·영상: ① 연결됨에서 최근 앱 통화 카드·메인 카드 제거, 홈, 뒤로, PiP 닫기 → 유지+알림/바 복귀+종료 버튼 정상 ② 벨 중 최근 앱 제거·뒤로 → 유지, 30초 missed, 상대 취소 ③ 통화 중 제3자 발신 → busy·기존 유지 ④ 종료 직후 재발신 → 새 통화 FGS·알림 유지 ⑤ 회귀 행렬(통화 규정 5) |
| 2 iOS | §3-2 | 판단표·CallKit 출처·발신 실패 서버 end | iPhone: 위 ①~⑤ + CallKit 시스템 종료·잠금화면 수신·S3 줄이기 |
| 3 웹 | §3-3 | 기능 판별 분기 단위 테스트, 기존 call-v4 계약 | 새 앱·구형 앱 각각: 통화 중 앱 새로고침 → 유지, 구형 앱 기존 동작 동일 |
| 4 서버 | §3-4 | 생성 경로 단위 테스트 | 통화 중 같은 방 통화 버튼 → busy·기존 유지 |
| 측정 | W7 | — | 최소화 상태로 토큰 수명 넘게 통화 → 네이티브 heartbeat 응답 코드 기록 |

## 8. Owner 승인 필요 사항
1. §2 구조(판단표·정리 소유권·권한 표)와 §1 수정 대상 23건.
2. 구현 착수(단계 1 Android → 2 iOS → 3 웹 → 4 서버, 통화 단독 커밋, main 반영은 단계마다).
3. 네이티브 빌드 번호: Android 24, iOS 20. 할로윈 아이콘 되돌림은 그다음 번호로 밀린다.
4. 단계별 실기 일정(다른 세션 종료 후, Owner 가 기기 사용을 허락할 때).
5. W7 은 실기 측정 결과를 보고 별도로 결정한다.
