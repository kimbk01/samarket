# A-10 수정 계획 — iPhone 에서 직접 끊을 때 웹이 네이티브로 종료를 되돌려 보내는 문제 (2026-10-27 PHT)

> 상태: **계획 · Owner 승인 대기** (통화 변경 규정 3번).
> 증거: `messenger-2026-10-27-call-addlist-evidence.md` §A-10. 같은 순서가 3건 기록돼 있다: `9cda6151` · `e6278456` · `3b8a875e`.

## 1. 원인 (코드로 확정)

1. iPhone 에서 끊기를 누르면, 네이티브가 먼저 종료를 시작한다(`beginEnd`, 상태 `ending`).
   - 그리고 웹에 「직접 종료」를 알린다: `publishLocalTerminal(reason "ended", source "local_end_begin")`.
   - 위치: `NativeVideoIncomingCallCoordinator.swift:252`, 음성은 `NativeVoiceIncomingCallCoordinator.swift:295`.
2. 웹 `onNativeCallLocalTerminal`(`lib/call/native/native-terminal-sync.ts:85`)은 화면을 바로 대기 상태로 돌린다.
   - 이어서 `cleanupCallV4(sid, "ended")` 를 실행한다.
3. `cleanupCallV4`(`lib/community-messenger/call-v4/call-v4-cleanup.ts:71`)는 마지막에 `stopCallV4NativeActiveSessionWithTimeout` 을 부른다.
   - 이 함수는 `stopCallV4AndroidNativeActiveSession` 을 거쳐 `endNativeCallService(sid, "ended")`, 즉 **네이티브 `endCall(reason "ended")`** 을 호출한다.
   - 이름은 Android 용이지만 플랫폼 구분이 없어서 **iOS 에서도 호출된다.**
4. iOS 플러그인(`NativeCallServicePlugin.swift:193`)은 `ended` 를 「상대 종료 정리」로 분류한다.
   - 그래서 `handleRemoteTerminal` 을 실행한다.
   - 이미 `ending` 이라 `beginEnd` 가 실패하고, `markFailed(.ended)` 가 호출된다.
   - 로그에 `error_terminal`, `owner_released reason=failed` 가 남고, 정리·CallKit 종료가 2회 실행된다.

즉, **네이티브가 이미 끝내고 있는 통화에 대해 웹이 종료를 다시 보내는 것**이 원인이다.

## 2. 변경 (웹만 · 1개 원인)

| 파일 | 변경 |
|---|---|
| `lib/community-messenger/call-v4/call-v4-cleanup.ts` | `cleanupCallV4(callId, reason, options?)` 에 `{ nativeAlreadyTerminal?: boolean }` 를 추가한다. `true` 면 마지막 네이티브 종료 호출(`stopCallV4NativeActiveSessionWithTimeout`)을 건너뛴다. 나머지 정리(Agora 퇴장·오디오·상태·감시 해제)는 그대로 한다. |
| `lib/call/native/native-terminal-sync.ts` `onNativeCallLocalTerminal` | 네이티브가 알린 종료(`nativeOwned === true`, 현재 통화)를 정리할 때 `cleanupCallV4(sid, terminalStatus, { nativeAlreadyTerminal: true })` 로 부른다. |
| 테스트 (신규) | 네이티브 종료 알림으로 정리할 때 `endNativeCallService` 가 불리지 않는지, 일반 정리는 지금처럼 부르는지 검사한다. |

- **바뀌지 않는 것:**
  - iOS·Android 네이티브 코드 → 재빌드 없음.
  - 서버 API.
  - 상대가 끊었을 때 웹이 네이티브에 정리를 보내는 경로(웹 감시·실시간 신호로 끝나는 경우).
  - 현재 통화가 아닐 때의 `native_stale_terminal` 정리.
  - Android 전체 — `onNativeCallLocalTerminal` 구독(`startNativeTerminalSync`)은 iOS 에서만 켜진다.

## 3. 영향받는 경로

| 경로 | 변경 후 |
|---|---|
| iPhone 영상: 직접 끊기 | 네이티브 정리 1회 · `error_terminal`/`failed` 없음 (이것이 목적) |
| iPhone 음성: 직접 끊기 | 같은 경로다. 지금은 `callkit_end_idempotent` 만 남는데, 그 중복 호출도 사라진다 |
| iPhone: 상대가 끊음·거절·취소·부재중·busy | 변경 없음 (웹 감시·실시간·네이티브 감시 경로) |
| iPhone: 웹 화면에서 끊기 버튼 | 변경 없음 (`call-end-guard` → `endNativeCallService`) |
| 종료 직후 재발신 | 변경 없음 — 화면은 지금처럼 즉시 대기 상태 |
| Android | 변경 없음 |

## 4. 설치된 구 바이너리 호환

- 현재 설치본은 iPhone 1.2 (15), Samsung 1.2.4 (13).
- 네이티브는 이미 직접 종료를 스스로 끝까지 정리한다: `local_end` 정리와 CallKit 종료(`end_idempotent`) 기록이 있다.
- 그래서 웹이 다시 보내지 않아도 통화는 끝난다. 웹만 바뀌므로 모든 설치본에 바로 적용된다.

## 5. 회귀 위험과 대응

- **위험:** 네이티브가 종료를 알렸지만 실제로는 정리하지 못한 경우, 웹의 두 번째 종료가 안전망 역할을 하고 있었을 수 있다.
- **대응:**
  - 기록 3건 모두 네이티브 `local_end` 정리가 따로 끝났다.
  - 실기기에서 직접 끊기 뒤 CallKit 통화 표시가 남지 않는지 확인한다.
  - iOS `NativeOutgoingTerminalWatch`, 네이티브 감시는 그대로다.

## 6. 롤백

- 커밋을 되돌린다. 웹만 바뀌므로 배포만 하면 되고, 앱 재빌드는 없다.

## 7. 배포

- `[배포 구분]` 웹만 — 통화 단독 커밋 → main.

## 8. 실기기 검증 (Production SHA 확인 후)

| # | 시험 | 판정 |
|---|---|---|
| 1 | Samsung→iPhone 영상, iPhone 에서 끊기 | iPhone 로그에 `error_terminal`·`owner_released reason=failed` 없음, `ios_native_video_end_call reason=ended` 재호출 없음, CallKit 표시 남지 않음 |
| 2 | Samsung→iPhone 음성, iPhone 에서 끊기 | 같은 판정 (`callkit_end_idempotent` 없음) |
| 3 | iPhone→Samsung 영상·음성, iPhone 에서 끊기 | 같은 판정 |
| 4 | 상대(Samsung)가 끊기 | iPhone 화면이 정상으로 닫힘 (변경 없음 확인) |
| 5 | 통화 규정 최소 행렬 | 거절, 벨 중 취소(재울림 없음), 부재중, 종료 후 즉시 재발신 |

## 9. 결과 (10-27 PHT, Production `bf66921d3` READY 확인 후, iPhone 1.2 (15) · Samsung 1.2.4 (13))

| # | 시험 | callId | 서버(운영 DB) | 결과 |
|---|---|---|---|---|
| 1 | Samsung→iPhone 영상, iPhone 직접 끊기 | `7d0d3596` | 응답 08:51:58.58 · 종료 08:52:10.71 | PASS — `ios_native_video_end_call`·`error_terminal`·`owner_released reason=failed`·상대 종료 정리 0건, CallKit 종료 보고 1회 |
| 2 | Samsung→iPhone 음성, iPhone 직접 끊기 | `a764b675` | 응답 08:53:13.65 · 종료 :25.59 | PASS — 웹 재호출·`end_idempotent`·실패 0건 |
| 3 | iPhone→Samsung 영상, iPhone 직접 끊기 | `02de4118` | 응답 08:54:41.67 · 종료 :54.42 | PASS — 같은 판정 |
| 4 | iPhone→Samsung 음성, Samsung 이 끊기 | `a433f588` | 종료 08:56:07.42 | PASS — iPhone 상대 종료 정리 0.5초 |
| 5 | 거절 | `b0886adb` | rejected 08:56:50.45 | PASS |
| 6 | 벨 중 취소 ×2 | `0397a9eb`·`332d96ea` | cancelled 08:57:47.05 · 08:58:07.51 | PASS — Samsung 벨 멈춤, 재울림 없음 |
| 7 | 무응답 → 부재중 | `1432bf84` | missed 08:59:31.63 | PASS |
| 8 | iPhone 직접 끊기 직후 재발신 | `badc4185` → `e4defa2a` | 종료 09:00:27.55 → 재생성 :31.70 · 응답 :37.20 · 종료 :41.78 | PASS — 두 통화 모두 웹 재호출·실패 0건 |

- Android 는 변경 없음(구독 자체가 iOS 전용) — 이번 행렬에서 Samsung 쪽 정상.
- busy(3번째 기기) 시험은 하지 않음 — NOT_PROVEN (이번 변경은 종료 정리 경로만).
