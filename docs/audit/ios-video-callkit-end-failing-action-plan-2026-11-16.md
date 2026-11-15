# iOS 영상 통화 CallKit 종료 동작 「Failing action」 — 원인·설계안 (2026-11-16)

> 통화 변경 규정 2·3번 문서. **Owner 승인 전 구현하지 않는다.**
> 발견: 대기 통화 45 추가 실기 T1(영상 통화 중 음성 대기 「종료 및 수락」, 2026-11-16 03:20 PHT, iPhone 13 mini 1.2.3 (45)).

## 1. 증거 (iPhone 로그, PHT)

| 시각 | 출처 | 내용 |
|---|---|---|
| 03:20:44.336 | 앱 CallKit | 「종료 및 수락」 묶음을 동작별로 앱에 전달 → 영상 통화 `CXEndCallAction` 처리 시작(`ios_native_video_local_end`) |
| 03:20:45.760 | 앱 | 서버 종료 200 → 영상 정리 시작(`cleanup reason=local_end`) |
| 03:20:46.367 | callservicesd | 앱이 영상 통화를 **종료 보고**(`reportCallWithUUID:endedAtDate`, reason 2 = `.remoteEnded`) |
| 03:20:46.368 | callservicesd | 「Failing action by system request」 — 아직 완료 전인 영상 통화 **종료 동작이 시스템에 의해 실패 처리** |
| 03:20:46.370 | callservicesd | 앱의 종료 동작 완료(fulfill) 거부 — 「no call was found」 |
| 03:20:47.285 | 앱 | 새(대기) 통화 수락 동작은 정상 완료 |

## 2. 원인 (코드)

CallKit 의 종료 동작(`CXEndCallAction`)을 처리할 때, 동작을 완료(fulfill)하기 **전에** 앱이 같은 통화를 「끝났다」고 따로 보고한다.

1. `CallKitProvider.provider(_:perform: CXEndCallAction)` 영상 분기 → `NativeVideoIncomingCallCoordinator.handleRejectOrEnd` → 서버 종료 응답 뒤 `cleanup(reportCallKitEnded: false)` → `completion()`.
2. 영상 `cleanup` 은 `reportCallKitEnded == false` 여도 **항상** `CallKitProvider.endCallKitSession(reason: .remoteEnded)` 를 메인 큐에 넣는다 → `provider.reportCall(with:endedAt:reason:)`.
3. `completion()` 의 `action.fulfill()` 도 메인 큐에 들어가지만 2번보다 **뒤** → 시스템이 통화가 이미 끝났다고 보고 종료 동작을 실패 처리, 이어진 fulfill 은 「통화 없음」으로 거부.

음성은 같은 자리에서 `markTerminalSuppressed(reason: "callkit_end_action")` + `callKitEndCompletedSessionIds.insert` 를 먼저 하고 `handleRejectOrEnd(fromCallKitEndAction: true)` 로 넘긴다 — 주석 그대로 「CXEnd 가 CallKit 종료 기록자, `provider.reportCall(ended:)` 를 또 부르지 않는다」. **영상 분기에만 이 두 줄이 빠져 있다.** 그래서 영상 정리의 `endCallKitSession` 이 멱등 처리되지 않고 종료를 보고한다. (실기 V1 음성 「종료 및 수락」에서는 같은 실패 0건 — 차이 확인됨.)

이번 대기 통화 수정(PR #343)이 만든 결함이 아니다 — 영상 CallKit 종료 경로의 기존 동작이다.

## 3. 영향

| 경로 | CallKit 종료 동작을 거치나 | 현재 결과 |
|---|---|---|
| 영상 통화 중 「종료 및 수락」(대기 통화) | 예 | 실패 처리 1건(T1 실측). 새 통화 수락은 정상 |
| 잠금 화면 등 CallKit 화면에서 **영상 수신 거절** | 예(같은 `CXEndCallAction` 영상 분기 → reject 분기 → 같은 정리) | 코드상 같은 실패 — **실측 안 함(NOT_PROVEN)** |
| 측면 버튼으로 통화 끊기(iOS 「통화 종료 시 잠금」 설정) 등 시스템 종료 | 예 | 코드상 같은 실패 — 실측 안 함 |
| 앱 영상 화면의 종료 버튼 | 아니오(`handleRejectOrEnd` 직접 호출) | 정리에서 종료 보고 = 올바른 방식, 실패 없음 |
| 상대 종료·서버 종료·무응답·취소 | 아니오 | 영향 없음 |

화면에 보이는 영향: 통화는 어느 경우든 끝난다(보고된 종료로 끝남). 차이는 ① CallKit 이 동작을 「실패」로 기록 ② 직접 끊은 통화가 「상대가 끊음(.remoteEnded)」으로 보고됨(iPhone 최근 통화 기록 표기에 영향 가능 — 미확인). 「종료 및 수락」 묶음에서 종료 동작 실패가 수락까지 막는지는 iOS 버전에 따라 다를 수 있으나 문서·실측 없음(이번 iOS 실측에서는 막지 않음).

## 4. 설계안

**바꾸는 곳: `ios/App/App/Push/CallKitProvider.swift` `provider(_:perform: CXEndCallAction)` 영상 분기 한 곳.**

```swift
if isVideo {
  if NativeVideoCallLane.isEnabled() {
    // 음성 분기와 같은 규칙: CXEnd 가 CallKit 종료 기록자 — 정리에서 reportCall(ended:) 를 또 보내지 않는다.
    markTerminalSuppressed(sessionId: sessionId, reason: "callkit_end_action")
    callKitEndCompletedSessionIds.insert(sessionId)
    NativeVideoIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: sessionId) { ... action.fulfill() ... }  // 그대로
    return
  }
  ...
}
```

- 효과: 영상 정리의 `endCallKitSession` 이 「이미 끝남」으로 멱등 반환(종료 보고 안 함) → `action.fulfill()` 이 CallKit 종료를 기록(로컬 종료로 정상 기록).
- 영상 코디네이터(`NativeVideoIncomingCallCoordinator`)·영상 정리·앱 종료 버튼·상대 종료 경로는 **변경 없음**. 두 표시(`terminalSuppressed`·`callKitEndCompleted`)는 영상 코드에서 읽지 않고 `CallKitProvider` 안(종료 보고 멱등, 늦은 VoIP 재보고 방지, 종료 요청 중복 방지)에서만 쓰인다 — 음성과 같은 의미.
- `endCallKitSession` 이 먼저 부르는 `NativeCallWaitingCoordinator.onCallKitSessionEnded` 는 그대로 불린다(대기 통화가 아니면 무동작).

**채택하지 않은 안:** 영상 `cleanup` 에서 `endCallKitSession` 을 빼는 안 — 앱 종료 버튼·상대 종료 경로는 CallKit 종료 동작이 없어 그 보고가 필요하다(빼면 CallKit 화면이 남음). 영상 코디네이터에 `fromCallKitEndAction` 인자를 새로 넣는 안 — 같은 효과를 호출부 한 곳 변경보다 넓게 바꾼다.

## 5. 회귀 위험·구 바이너리·롤백

- 회귀 위험: 종료 동작 처리 중 정리가 실패해 `completion` 이 안 불리면 종료 동작이 완료되지 않음 — 지금도 같은 구조(변경 없음). 늦게 온 같은 통화의 수신 VoIP 는 「종료 억제」로 울리지 않음(음성과 같은 의도된 동작).
- iOS 네이티브만 → 새 빌드(46) 설치 전 기기는 지금 동작 그대로. 서버·웹·Android 영향 없음.
- 롤백: 이 커밋 되돌림 + iOS 재빌드.

## 6. 검증

코드: 계약 시험 — 영상 분기에서 `handleRejectOrEnd` 호출 전 두 표시를 넣는지, 음성 분기와 같은 문자열인지, 영상 정리의 `endCallKitSession` 호출은 그대로인지. `typecheck`·관련 vitest·eslint·iOS 시뮬레이터 빌드.

실기(iPhone 13 mini 46, 매 시험 직후 iPhone 로그 수집):

| # | 항목 | 기대 |
|---|---|---|
| E1 | 영상 통화 중 음성 대기 「종료 및 수락」 | 「Failing action」 0건, 새 통화 연결·화면·소리 |
| E2 | 잠금 화면에서 영상 수신 「거절」 | 「Failing action」 0건, 상대 「거절」, 서버 rejected |
| E3 | 앱 영상 화면 종료 버튼 · 상대 종료 · 영상 무응답 · 벨 중 취소 | 지금과 같음(회귀 없음) |
| E4 | 음성 「종료 및 수락」·일반 음성 통화 | 지금과 같음 |

## 7. 반영

통화 변경 규정 4번: 이 수정만 단독 PR·단독 main 반영, iOS 빌드 45 → 46, TestFlight 는 Owner 승인 범위 안에서.
