# DIBAY 통화 정상화 계획 v2 (2026-10-22 · 처음부터 재작성 · Owner 승인 대기)

이 문서가 통화 정상화의 **유일한 기준**이다. 이전 계획·초안(`call-recovery-master-plan` §4·§8, `call-integrated-design`)은 이 문서로 대체한다. 이 문서에 없는 통화 변경은 하지 않는다.
근거: 실기기 관찰 REPORT 묶음 A·B(`docs/audit/call-scenarios-2026-10-22/REPORT.md`, iPhone 콘솔·Samsung logcat 원문) + 운영 DB(세션·이벤트·`notification_deliveries`) + 코드 감사 3건.

## 1. 확정 원인 (증거 있는 것만)

### C1. iPhone 이 앱 꺼짐·잠금 상태에서 전화를 못 받는다 — iOS 가 앱의 VoIP 를 차단
**증거 사슬 (A1 시도 1, callId `c8f5d827`, iPhone 콘솔 원문):**
1. `19:07:31` 수신 VoIP → `reportNewIncomingCall_ok` (정상 수신)
2. `19:08:02.705` 앱 자체 벨 타임아웃이 CallKit 통화 종료 (`privateEndedReason: 3` = 응답 없음)
3. `19:08:03.205` 서버가 보낸 **`missed_call` VoIP 수신** → `ios_voip_terminal_already_suppressed ... reason=completion_only` → **CallKit 보고 없이 완료**
4. `19:08:03.213` **iOS 가 앱을 강제 종료 (SIGABRT)** · `19:08:10` `terminate ... 0xBAADCA11`
5. 이후 모든 통화: `will not be launched because it failed to report an incoming call too many times` + `VoIP push ... dropped on the floor` (A1 시도2~B1, 9회 연속). 앱이 **화면에 켜져 있을 때만** 전달(A4·B3).

**iOS 규칙:** VoIP 를 받은 앱은 매번 CallKit 에 새 통화를 보고해야 한다. 안 하면 앱을 강제 종료하고, 반복되면 그 앱의 VoIP 를 버린다. 앱을 지웠다 다시 설치하기 전까지 풀리지 않는다.

**위반을 만드는 두 원인 (둘 다 고쳐야 재발하지 않는다):**
- **C1-서버**: 이미 끝난 통화의 iPhone 에 VoIP 를 보낸다.
  | 서버 발송 | 받는 iPhone 상태 | 실기기·DB 증거 |
  |---|---|---|
  | `missed_call` VoIP | 앱 벨 타임아웃으로 이미 종료 | 위 증거 사슬 (강제 종료 유발) |
  | `call_ended` VoIP | 받은 iPhone 이 미디어로 이미 종료 | A4 `527c59ed` · B3 `6df9a162` `already_terminal_suppressed ... call_ended` |
  | `call_answered_elsewhere` VoIP | 받은 그 iPhone | 오전 3건 (**`a077795` 로 수정됨**) |
  | `call_rejected` VoIP | 거절한 그 iPhone · 발신자 iPhone | 코드(서버 감사) |
  | `call_canceled`/`call_ended` VoIP | 벨이 간 적 없는 iPhone(발신자·옛 설치 기기) | 코드·DB |
- **C1-앱**: iPhone 앱(`VoIPPushRegistry.swift`)이 이미 끝난 통화의 VoIP 를 **보고 없이 완료**하는 분기 4개(받은 기기·terminal_suppressed·stale_terminal_suppressed·already_suppressed) + 상태에 따라 그렇게 되는 분기 4개.

### C2. 벨과 함께 「전화 왔다」 배너·끊은 뒤 「띵」
- 서버가 매 통화 이벤트(수신·취소·거절·종료·다른 기기 받음)마다 iPhone 에 **일반 알림(소리 있음)** 을 VoIP 와 별도로 보낸다. 콘솔: 매 통화 `Received remote notification ... hasAlertContent: 1, hasSound: 1` · `Adding notification ... shouldPresentAlert: 1 shouldPlaySound: 1`.

### C3. 음성 통화 중 상대가 끊으면 iPhone 에 「통화를 시작하지 못했습니다」 빨간 배너
- A4 `527c59ed`: Samsung 종료 `19:19:38.43` → 0.06s 뒤 iPhone `ios_native_voice_cleanup_started reason=mediaFailed` → `fail_after_fulfill` → 빨간 배너(Owner 확인).
- 같은 상황의 영상(B3)은 `reason=remote_terminal` = 정상 종료. **음성만 상대 퇴장을 「실패」로 처리**한다.

### C4. iPhone 음성 통화 스피커·음소거 버튼이 동작하지 않음
- `NativeVoiceCallViewController.swift` `onSpeakerTapped`·`onMuteTapped` 가 버튼 모양만 바꾸고 출력 경로·마이크를 바꾸지 않는다(코드). Android 는 실제 전환(Owner).

### C5. VoIP 토큰이 서버에 늦게 올라감 (재설치 직후)
- 앱→웹 토큰 전달 재시도가 15초 후 멈추고, 재전달 함수가 쓰이지 않는다(코드). 오늘 재설치 후 실제로 지연.

### 원인 아님 (증거로 배제)
- 오늘 웹 통화 변경(05:49·06:57): iPhone 차단·빨간 배너·스피커 모두 네이티브·서버 발송 경로에서 발생. 빨간 배너는 웹이 아닌 네이티브 화면.
- `cf12ba2a`(일반 알림 생략): 되돌린 상태에서도 벨 없음이었음.
- 잠금 화면에 거절 버튼 없음: iOS CallKit 표준(측면 버튼 2회 = 거절).

### 별도 조사 (이번 수정 범위 밖, 측정만)
- Samsung 발신 → 서버 세션 생성 약 3초(A1: 다이얼 19:07:26 → 세션 19:07:29.4). 서버 VoIP 발송은 세션 후 0.4~0.7s. 원인 미확정 → 수정 후 시나리오에서 재측정.
- A7: Samsung 취소 후 Samsung 앱 내부 정리 로그가 약 27초 뒤(서버 취소는 4초에 반영). 화면 영향 미확인.

## 2. 수정 원칙
1. **서버**: iPhone VoIP 는 그 iPhone 에 **지금 CallKit 벨이 살아 있을 때만** 보낸다. (수신 = 항상 / 종료류 = 이번 통화 벨이 간 기기 중 행동·받은 기기 제외 / 부재중 = 보내지 않음)
2. **앱**: 어떤 VoIP 가 와도 **반드시 CallKit 에 보고**한다(살아 있는 통화면 그 통화 종료, 아니면 무음 보고 후 즉시 종료). 서버 규칙이 틀려도 차단되지 않는 이중 방어.
3. iPhone 은 CallKit 이 통화를 표시하므로 **통화 일반 알림을 보내지 않는다**(부재중 알림만 유지).
4. Android·웹 동작은 바꾸지 않는다(결함 증거 없음).

## 3. 수정 범위 (정확히 이것만)
### 3-1. 서버 — 커밋 1개, 단독 main 반영 (재빌드 없음)
- `lib/push/dispatch/dispatch-push-for-user.ts`: iPhone 통화 채널 판단 `decideIosCallTarget` (원칙 1·3) + 이번 세션 벨 VoIP 발송 기록 조회.
- `lib/push/dispatch/push-payload-types.ts`: `ios_call_exclude_device_ids` 옵션.
- `lib/push/send-community-messenger-call-canceled-push.ts` · `lib/community-messenger/service.ts` 종료 발송 2곳: 행동 기기(요청 `deviceId`, iOS·Android 네이티브가 이미 보냄)·받은 기기 전달.
- 영향: 설치된 iOS 1.2 (7) 에서도 C1-서버 위반 발송이 사라지고 C2 배너가 사라진다. Android(fcm)·웹 푸시 불변.
### 3-2. iOS 네이티브 — 새 빌드 1개 (iOS 빌드 번호 +1)
- `ios/App/App/Push/VoIPPushRegistry.swift` · `CallKitProvider.swift`: 보고 없이 완료하는 모든 분기 → 「살아 있는 통화면 종료 / 아니면 무음 보고 후 즉시 종료」 공통 처리. 살아 있는지는 앱 내부 맵이 아닌 CallKit 실제 상태(`CXCallObserver`)로 판단. 이미 끝난 통화에 늦게 온 수신이 무음 화면을 남기는 결함도 함께.
- `ios/App/App/Call/NativeVoiceIncomingCallCoordinator.swift`(+발신 코디네이터 동일 경로): 연결 후 상대 퇴장 = 정상 종료(영상과 동일). 연결 후 끊김 = 「통화 연결이 끊어졌습니다」. 「통화를 시작하지 못했습니다」는 연결 전 실패만.
- `ios/App/App/Call/NativeVoiceCallViewController.swift` + 오디오 세션 컨트롤러: 스피커 = 실제 출력 전환, 음소거 = 실제 마이크 음소거(상대에게 반영), CallKit 시스템 화면 버튼과 상태 일치. 블루투스·유선 연결 시 기존 「외부 장치 유지」 유지.
- `ios/App/App/Push/DibayPushTokenBridge.swift` + 웹 리스너 연결 후 토큰 재전달 호출.
### 3-3. 하지 않는 것
Android 네이티브 · 웹 통화 화면 · DB 마이그레이션 · 친구·메신저 기능 · 「별도 조사」 항목 수정.

## 4. 진행 순서와 게이트
1. **이 문서 승인.**
2. 서버(3-1) 구현 → 로컬 검증(통화·푸시 테스트 전체, 타입, lint) → **단독 main 반영** → SHA 보고. (이 시점부터 새 위반 발송 중단)
3. iOS(3-2) 구현 → 로컬 검증(Swift 빌드는 로컬 Mac 세션) → 커밋 → 로컬 세션이 `npm run native:prepare`(iOS 빌드 번호 +1) → **iPhone 앱 삭제 후 Xcode 설치**(iOS 차단 해제) → `w테스트1` 로그인 → 통화 토큰 등록 확인(운영 DB).
4. **시나리오 A1~G2 전체 1회** (로컬 세션 진행·Owner 는 iPhone 받기·거절·소리만). 게이트: iPhone 콘솔 `dropped on the floor`·`will not be launched` **0건**, `completion_only` **0건**, E4(받기 3회 연속) 후에도 수신 유지, 빨간 배너 0건, 스피커·음소거 실제 동작, iPhone 통화 일반 알림 0건(부재중 1건만).
5. FAIL → 그 자리에서 중단 → 증거로 이 문서에 추가 → 승인 → 그 건만 수정.

## 5. 위험·롤백
- iPhone 통화 일반 알림 제거: VoIP 발송 실패 시(토큰 무효 등)에만 배너 대체 유지. VoIP 는 성공했는데 iPhone 이 표시 못 하는 경우는 3-2 로 원인 제거.
- 종료 VoIP 축소: 벨 기록 조회 실패 시 기존대로 발송(안전 쪽). 다른 기기 벨은 그 기기의 벨 기록이 있으므로 종료 VoIP 를 받는다.
- 받은 iPhone 은 종료 VoIP 를 받지 않음: 상대 퇴장은 미디어(Agora)로 감지 — 3-2 로 정상 종료 처리.
- 롤백: 서버 = 커밋 revert(즉시) · iOS = 이전 빌드 재설치.
