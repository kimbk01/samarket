# DIBAY 통화 푸시 · iOS CallKit SSOT HARD LOCK (Owner 2026-10-22)

통화 푸시 발송과 iOS CallKit 처리의 **단일 기준**. 이 문서의 불변조건을 깨는 변경은 금지한다. 바꿔야 하면 `AGENTS.md` 「통화 변경 규정」 절차(증거 → 영향·계획 문서 → Owner 승인 → 통화 단독 반영 → 실기기 행렬)를 거치고 이 문서와 잠금 테스트를 함께 고친다.
근거: `docs/audit/messenger-2026-10-22-call-fix-plan-v2.md` (실기기 증거 사슬: 이미 끝난 통화에 온 `missed_call` VoIP → CallKit 보고 없이 완료 → iOS 앱 강제 종료(SIGABRT) → 앱 VoIP 차단 `dropped on the floor`).
잠금 테스트: `lib/community-messenger/call-authority/__tests__/call-push-callkit-ssot-hard-lock.test.ts` (CI vitest).

## 왜 잠그는가
iOS 는 VoIP 를 받은 앱이 **매번** CallKit 에 새 통화를 보고하지 않으면 앱을 강제 종료하고, 반복되면 그 앱의 VoIP 를 버린다. 앱을 지우고 다시 설치하기 전까지 iPhone 은 앱이 꺼져 있거나 잠금 상태일 때 **전화를 받을 수 없다.** 서버 발송 한 줄, 앱 분기 한 줄로 전체 iPhone 수신이 멈춘다.

## 불변조건
### H1. 서버 — iPhone VoIP 는 「CallKit 벨이 살아 있는 기기」에만 (`lib/push/dispatch/dispatch-push-for-user.ts` `decideIosCallTarget`)
| 통화 푸시 | iPhone VoIP (`voip_apns`) | iPhone 일반 알림 (`apns`) |
|---|---|---|
| `incoming_call` | 보낸다 | 같은 기기 VoIP 가 `sent` 면 **보내지 않는다**(VoIP 실패 시만 대체) |
| `call_canceled` · `call_rejected` · `call_ended` · `call_answered_elsewhere` | 이번 세션 벨 VoIP 가 `sent` 된 기기에만 · **행동한 기기·받은 기기 제외** · 벨 기록 조회가 재시도 후에도 실패하면 **보내지 않는다** | 같은 기기 VoIP 대상이면 **보내지 않는다** |
| `missed_call` | **보내지 않는다**(앱 자체 벨 타임아웃이 CallKit 종료) | 보낸다(부재중 알림) |
- 종료 발송(`service.ts` → `sendWebPushForCommunityMessengerCallTerminal`)은 행동 기기(요청 `deviceId`)·받은 기기(`answered_device_id`)를 `ios_call_exclude_device_ids` 로 넘긴다. `call_answered_elsewhere` 는 받은 기기를 `exclude_device_ids` 로 넘긴다.
- 통화 푸시 대상 순서: `voip_apns` → `fcm` → 그 외 (`orderCallPushTargetsNativeFirst`).
- Android(`fcm`)·웹 푸시는 이 표의 영향을 받지 않는다.

### H2. iOS 앱 — 모든 VoIP 는 CallKit 에 보고 (`ios/App/App/Push/VoIPPushRegistry.swift`)
- `completion()` 은 (a) CallKit 보고 콜백 안, 또는 (b) **CallKit 이 실제로 들고 있는**(`CXCallObserver`, `isCallKitCallLive`) 그 통화를 끝낸 직후에만 부른다.
- 그 밖의 모든 경우(받은 기기·terminal_suppressed·stale·already_suppressed·CallKit 이 이미 끝낸 추적 세션·CallKit 종료 후 늦은 수신) → `CallKitProvider.reportComplianceIncomingThenEnd` (새 UUID · 무음 · 즉시 종료 · 세션·진행 중 통화 불변).
- 같은 세션 UUID 재보고로 통화를 되살리지 않는다(`fulfillOrphanTerminalVoipPush` 는 진짜 미추적 고아에만).
- `reportNewIncomingCall` 호출 위치는 `reportIncomingCall` 1곳 + `reportComplianceIncomingThenEnd` 1곳뿐.

### H3. iOS 음성 통화 종료 분류 (`NativeVoiceIncomingCallCoordinator` · `NativeVoiceOutgoingCallCoordinator`)
- 연결 후 상대 정상 퇴장(`remote_offline=0`) = 정상 종료(알림 없음).
- 연결 후 그 밖의 끊김 = `connectionLost` → 「통화 연결이 끊어졌습니다.」
- 「통화를 시작하지 못했습니다」는 **연결 전** 실패에만.

### H4. iOS 음성 통화 스피커·음소거 (`NativeVoiceCallViewController`)
- 스피커 버튼 = `NativeVoiceCallAgoraEngine.setSpeakerphoneEnabled` (실제 출력), 버튼 상태는 오디오 경로 변경 알림을 따른다.
- 음소거 버튼 = `CallKitProvider.requestSetMuted` → `CXSetMutedCallAction` → `setLocalAudioMuted` (실제 마이크 · 시스템 통화 화면과 동기).
- 버튼 모양만 바꾸는 처리 금지.

### H5. VoIP 토큰 전달
- 웹 리스너(`attachVoipPushTokenListener`) 부착 후 `DibayVoipCall.startVoipRegistration` 호출 → 앱이 마지막 VoIP 토큰을 재전달.

## 변경 시 필수 검증
- 잠금 테스트 + `ios-call-target-policy.test.ts` + iOS 소스 계약 테스트(`call-authority`·`call-v4-import-guard`) PASS.
- 실기기: iPhone 콘솔 `dropped on the floor` · `will not be launched` · `completion_only` **0건**, 받기·끊기 3회 연속 후에도 앱 꺼짐·잠금 상태 수신 유지, 통화 중 빨간 배너 0건, 스피커·음소거 실제 동작, iPhone 통화 일반 알림 0건(부재중 1건만).
