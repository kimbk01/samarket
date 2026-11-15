# iOS 대기 통화 — 전 경로 결함 확정·한 번에 고치는 계획 (2026-11-16)

> 통화 변경 규정 2·3번 문서. **Owner 승인 전 구현하지 않는다.**
> 목표: 수정 → 실기 → 또 수정 반복 없이, iOS 대기 통화 경로(CW7~13)의 결함을 **코드·로그로 전부 확정**해 한 PR·한 빌드로 고치고,
> **대기 통화가 아닌 통화(일반 수신·발신·거절·종료·취소·무응답·통화 중)는 동작이 바뀌지 않게** 한다.
> 기준: 운영 main(e3417dae5 이후) · iPhone 13 mini TestFlight 1.2.3 (44) 실기 2026-11-16 01:55~02:09 PHT · 운영 DB·Vercel 로그.

## 0. 작업자 잘못 (먼저)

- 2단계 설계는 「진행 중 통화 정리가 **끝난 뒤** 새 통화 등록·수락」인데, 구현은 「진행 중 단계가 아님」으로 판정했다(D1). 구현자 결함.
- 「진행 중 통화가 먼저 끝나 일반 수신으로 전환」(CW12)에서 남은 울림 시간을 넘기지 않았다(D2). Android 는 생성 기준 30초인데 iOS 는 빠뜨렸다.
- 이전 통화 화면이 닫히는 중에 새 통화 화면을 띄우는 경우(D3)를 확인하지 않고 실기로 넘겼다.

## 1. 경로별 확인 결과 (iOS, CW7~13)

| 시험 | 경로 | 판정 근거 | 결과 |
|---|---|---|---|
| CW7 대기 표시 | VoIP `waiting` → `reportIncomingCall` 대기 분기 → `registerPending` → CallKit 정상 보고 | 실기 01:57:50 보고·표시(서버 presented 01:57:50.878) | 표시 동작 확인. 대기음 소리는 NOT_PROVEN |
| CW8 거절 | 대기 UUID `CXEndCallAction` → `decline` → reject API, 진행 중 통화 유지 | 운영 DB 680e5da3 `rejected/declined` 17:57:16 | 서버 기록 확인(화면은 Owner 조작) |
| CW9 종료 및 수락 | 진행 중 End + 대기 Answer | §2 | **FAIL — D1·D3** |
| CW10 무응답 | 대기 30초 → CallKit `.unanswered`, 서버 울림 만료 missed | 코드: 대기 타이머 30초(보고 기준), 서버 30초(생성 기준) — 차이 1초 이내 | 결함 없음(실기 NOT_PROVEN) |
| CW11 발신자 취소 | `call_canceled` VoIP → 대기 UUID 는 CallKit 표(map)에 있고 발신 아님 → `reportCallEnded` → 대기 정리 | 코드 경로 확인 | 결함 없음(실기 NOT_PROVEN) |
| CW12 진행 중 통화가 먼저 끝남 | `onCallCleanedUp` → 승격 → 일반 수신 | 코드 | **결함 — D2** (+ 수락 시 D3) |
| CW13 영상 조합 | 같은 대기 처리, 영상 런타임·영상 화면 | 코드 | **D1·D2·D3 같은 구조로 해당** |
| 02:06:57 무벨 | 서버 VoIP 발송 APNs 200 | iPhone apsd 02:05~02:09:10 수신 0건(일반 부재중 알림 푸시 포함), Wi-Fi 품질 bad↔poor, 셀룰러 푸시 연결 실패 | 기기에 푸시가 오지 않음 — 앱 코드 진입 전. 앱 결함 증거 없음, 전달 실패 원인 NOT_PROVEN. 수정 대상 아님 |

## 2. 결함 확정

### D1 — 「종료 및 수락」이 진행 중 통화 정리 전에 수락 (CW9 FAIL 직접 원인)

증거(PHT):

| 시각 | 출처 | 내용 |
|---|---|---|
| 01:58:00.354 | callservicesd | 「Performing end active calls and answer ringing call」 |
| 01:58:00.361/.363 | 앱 CallKit | End, Answer 를 2ms 간격으로 앱에 전달 |
| 01:58:00.414 | 앱 CFNetwork | 종료 요청(Task 17)·수락 요청(Task 18) **동시 전송** |
| 01:58:00.417 | 앱 UIKit | 「Attempt to present NativeVoiceCallViewController on NativeVoiceCallViewController whose view is not in the window hierarchy」 (D3) |
| 01:58:00.903 | Vercel | `accept` → `accept_blocked_other_active` → `other_call_active` |
| 01:58:00.943 | 앱 | 수락 응답 400 |
| 01:58:00.947 | 앱 → callservicesd | 통화 종료 보고 reason 1(`.failed`) → 수락 동작 실패 처리 |
| 01:58:01.010 / 01:58:01.958 | DB / 앱 | 진행 중 통화 종료 확정 / 종료 응답 200 |
| 01:58:20.617 | DB | 대기 통화 b7942d37 `missed` |

코드 경로:
1. `handleRejectOrEnd`(진행 중 통화) → `beginEnd` → 단계 `.ending`, 서버 종료 요청(1.5초).
2. `prepareAnswer` 가 `CallTerminationPolicy.liveCallSessionId(excluding:)` 로 판정 — 이 함수는 `.ending` 을 「끝남」으로 본다 → 기다리지 않고 승격.
3. `NativeVoiceCallRuntime.registerLocked` 는 `.ending` 세션을 새 통화로 **덮어쓸 수 있다**(`canReplaceActiveSessionForNewCall` — 「끊자마자 재발신」용 기존 규칙) → 대기 통화가 진행 중 통화의 런타임 자리를 차지한 채 수락 요청.
4. 서버 WS5(같은 사람 1:1 통화 동시 연결 금지)가 400 → `failBeforeFulfill` → CallKit `.failed` → 서버는 계속 울리다 missed.

서버 WS5·런타임 덮어쓰기 규칙은 각각 맞는 동작이다. 잘못은 대기 수락이 「정리 끝남」을 기다리지 않은 것 하나.

### D2 — 진행 중 통화가 먼저 끝난 뒤 울림 시간이 30초 새로 시작 (CW12)

- 승격(`promote`) → `NativeVoiceCallRuntime.registerIncomingSession` / 영상 `registerIncomingSession` → 무응답 타이머 **30초를 새로** 건다(`missedTimeoutSeconds = 30`).
- 서버는 생성 시각 기준 30초에 missed 확정. iOS 에는 부재중 VoIP 를 보내지 않는다(`ios_voip_missed_call_local_ring_timeout` — 기기 타이머 담당).
- 예: 대기 20초째 진행 중 통화가 끝나면 iPhone 은 최대 50초까지 울리고, 서버 마감(30초) 뒤에 받으면 서버가 수락 거부(울림 마감) → 수락 실패.
- Android 는 승격 세션을 생성 기준 30초로 처리(11-15 확인) — iOS 만 빠짐.

### D3 — 이전 통화 화면이 닫히는 중에 새 통화 화면 표시 실패 (CW9·CW12·CW13 공통)

- 진행 중 통화가 끝나면 `.ended` → `finishIfActive` 가 이전 화면에 「통화 종료」 안내 후 닫기(애니메이션). 정리 직후 새 통화 수락 → `ensurePresented`(영상 `ensureIncomingPresented`) → `dismissStaleControllers` 로 이전 화면 닫기를 **시작만** 하고, 같은 순간 `topPresenter()` 가 아직 닫히는 중인 이전 화면을 골라 그 위에 `present` → UIKit 거부(01:58:00.417 기록과 같은 오류) → 새 통화 화면이 안 뜬다(소리·CallKit 은 진행).
- D1 을 고쳐 순서가 맞아도 정리 직후 바로 수락하므로 이 겹침은 그대로 남는다 → D1 만 고치면 CW9 가 다시 FAIL 할 수 있음. 같이 고친다.
- 일반 통화에서는 이전 화면이 이미 닫힌 뒤 새 통화가 오므로 이 분기에 들어가지 않는다.

## 3. 수정 (한 PR · iOS 빌드 45)

| # | 파일 | 바꿀 내용 | 대기 통화가 아닌 통화에 미치는 영향 |
|---|---|---|---|
| D1 | `Call/NativeCallWaitingCoordinator.swift` | 기다림 판정을 「음성·영상 런타임이 진행 중 통화(`pending.liveSessionId`)를 **아직 갖고 있음**」으로 교체(`prepareAnswer`·8초 제한 검사·`onCallCleanedUp`). 런타임은 정리 마지막에만 비워지므로 = 「정리 끝남」 | 없음 — 이 파일은 대기 1건이 있을 때만 동작 |
| D2 | `NativeCallWaitingCoordinator.swift` + `NativeVoiceCallRuntime.registerIncomingSession` · `NativeVideoCallRuntime.registerIncomingSession` | 런타임 등록 함수에 「무응답 제한(초)」 선택 인자 추가, **기본값 = 지금 30초**. 대기 승격만 「30초 − 대기 보고 후 지난 시간」(최소 1초)을 넘김 | 없음 — 일반 수신 호출부는 인자를 안 넘겨 30초 그대로(계약 시험으로 고정) |
| D3 | `Call/NativeVoiceCallUiHost.swift` · `Call/Video/NativeVideoCallUiHost.swift` | 새 통화 화면을 띄울 때 **다른 통화의 화면(음성·영상)이 아직 떠 있거나 닫히는 중이면** 그 화면을 「통화 종료」 안내 없이 닫고, **닫힘이 끝난 뒤** 새 화면을 띄운다(Android 이어받기 B 와 같은 결과: 이전 화면 → 새 화면, 홈·안내 없음) | 다른 통화의 화면이 남아 있을 때만 들어가는 분기. 단일 통화의 표시·닫기·줄이기·PiP·잠금 화면 지연 표시 경로는 그대로(계약 시험으로 고정) |

바꾸지 않는 것: 서버(WS5 포함)·웹·Android·CallKit 보고·VoIP 처리·거절·무응답·취소 경로·`CallTerminationPolicy`·런타임 덮어쓰기 규칙.

### 바뀐 뒤 「종료 및 수락」 순서

진행 중 통화 서버 종료 200 → Agora 나가기 → 오디오 세션 해제 → 런타임 비움 → 대기 통화 런타임 등록 → 수락 요청 → 토큰·참가 → 이전 화면 닫힘 끝 → 새 통화 화면. CW9 실측 기준 수락 시작이 약 1.5~2.5초 늦어진다.

## 4. 영향 경로 전수

| 경로 | 바뀌나 | 근거 |
|---|---|---|
| 일반 음성·영상 수신·수락·거절 | 아니오 | D1 은 대기 1건일 때만, D2 기본값 30초, D3 는 다른 통화 화면이 남을 때만 |
| 발신·발신음·발신 취소 | 아니오 | 발신 경로 함수 무변경 |
| 통화 중 종료·상대 종료·서버 종료 VoIP | 아니오 | 종료·정리 함수 무변경(정리 끝 알림 `onCallCleanedUp` 호출 위치 그대로) |
| 무응답·벨 중 취소·지연 푸시 재울림 방지 | 아니오 | 런타임 타이머 기본값·terminal 억제 무변경 |
| 통화 중 수신(대기 조건 아님 — 구빌드 섞임·울리는 중·대기 1건 중) | 아니오 | `reportIncomingCall` 무변경 |
| 끊자마자 재발신 | D3 분기에 들어갈 수 있음 | 지금은 이전 화면 닫힘 중이면 새 화면 표시 실패 → 바뀐 뒤 닫힘 후 표시. 정상 경로 동작은 같음 |
| 맥(Designed for iPad) | 아니오 | 대기 통화 미지원(`supportsCallKitCallUi`), D3 는 같은 조건에서만 |

## 5. 구 바이너리·롤백

- 대기 통화는 서버 조건(iOS 최소 빌드 41 + voip_apns + 활성 기기 1대)에서만 온다. 이번 수정은 iOS 네이티브만 → 45 설치 전 기기는 지금 동작 그대로, 다른 설치본·Android 영향 없음.
- 롤백: 이 커밋 되돌림 + iOS 재빌드. 서버 조치 없음.
- 측정 못 한 위험: CallKit 수락 동작을 약 2초 더 보류한다. 일반 수락도 수락·토큰·참가(1~2초) 동안 보류하므로 같은 방식이지만 합계 약 4초 보류 시 iOS 가 동작을 실패 처리하는지는 문서·실측 없음 → 실기 항목 V3 로 확인.

## 6. 검증

코드(최종 HEAD 1회):
- 계약 시험 추가: D1(`prepareAnswer`·`onCallCleanedUp` 이 런타임 보유 판정 사용, `liveCallSessionId` 미사용) · D2(런타임 등록 기본 30초 유지, 일반 수신 호출부 인자 없음, 승격만 남은 시간 전달) · D3(다른 통화 화면 닫힘 완료 뒤 표시, 단일 통화 표시 경로 문자열 유지).
- `npm run typecheck:build` · 관련 vitest · eslint · `verify:call-surface-cta-ssot` · iOS 시뮬레이터 빌드.

실기(iPhone 13 mini 45, 상대 Samsung·Xiaomi, 매 시험 Production SHA·시각·운영 DB 세션·`sudo log collect` 를 시험 직후 즉시 — 앱 기록은 몇 분만 남음):

| # | 항목 | 기대 |
|---|---|---|
| V1 | CW9 음성 「종료 및 수락」 | 종료 200 → 수락 200 순서, 새 통화 연결·소리, 새 통화 화면 표시, 이전 상대 「통화 종료」 |
| V2 | CW13 영상 중 음성 대기 / 음성 중 영상 대기 「종료 및 수락」 | V1 과 같음 + 카메라 |
| V3 | V1·V2 의 CallKit 수락 보류 시간 | 실패 처리 없음(시스템 로그 「Failing action」 0건) |
| V4 | CW12 대기 20초째 진행 중 통화 종료 → 받기 / 그대로 둠 | 받기 = 연결 · 그대로 = 생성 기준 30초 근처에 울림 끝·부재중 |
| V5 | CW10 무응답 · CW11 발신자 취소 · CW8 거절 | 설계 행렬대로 |
| V6 | CW18 기본 행렬(iPhone): 발신·수신·거절·벨 중 취소·지연 푸시·무응답·통화 중·종료 후 즉시 재발신 | 지금과 같음(회귀 없음) |

## 7. 반영

통화 변경 규정 4번: 이 수정만 단독 PR·단독 main 반영(웹 무변경이라 운영 웹 영향 없음). iOS 빌드 번호 44 → 45, TestFlight 업로드는 Owner 승인 범위 안에서. 실기는 V1~V6 를 한 번에 진행하고 FAIL 이면 즉시 중단·보고.
