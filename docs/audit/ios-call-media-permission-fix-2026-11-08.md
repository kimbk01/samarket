# iOS 통화 권한(마이크·카메라) — 수신 수락 시 시간초과 거절 제거 + 로그인 직후 OS 창 (2026-11-08 PHT · Owner 「A·B 둘 다 승인」)

## 0. 작업자 잘못 (먼저)
- 원래 OS 권한 흐름을 감사하지 않고 앱 자체 안내 팝업을 2회 추가(b7d3b3c77, 780e992a8) → Owner 지시로 전부 되돌림(df8fa91a8, 추가 전과 차이 0).

## 1. 증거
| 세션 | 기록 (PHT, 운영 DB `community_messenger_call_events`) |
|---|---|
| `20f28db1-361d-49e9-bbd2-a09308448129` | 01:47:29.765 ringing(qqqq) → 01:47:50.430 declined(dibay_778d44) — accepted 없음, 20초 제한과 일치 |
| `b6919e70-1c1a-464e-878c-3214d5e80e4d` | 01:49:15 ringing → 01:49:21 accepted → 01:49:22 connected → 01:49:43 ended (권한 허용 후) |
- Owner 관찰: 받는 순간 마이크 허용 창이 보였고 거절됨 · 영상은 카메라 창이 안 뜸(마이크만).

## 2. 원래 흐름 감사 (코드)
| 권한 | OS 창 시점 | 위치 |
|---|---|---|
| 알림 | 로그인 직후(동의·주소 완료 후), 앱 화면 없음 | `DiBaYDevicePermissionOnboardingGate` → `runNotificationGuideFlow("first_login")` → `requestNotificationFromGuide` |
| 마이크 | 통화 걸기·받기 순간 | `DibayVoiceMicrophonePermission.ensureGranted` (앱 화면 20초 · 잠금 3초 제한) |
| 카메라 | 영상 걸기·받기 순간, **마이크 허용 후에만** | `DibayVideoMediaPermission.ensureGranted` |
- 2026-07-11 ef2633578: 로그인 직후 마이크·카메라 안내 화면(`DiBaYCallMediaOnboardingGate`) 삭제 → 통화 순간만 묻게 됨.

## 3. 원인
1. 수신 수락 경로가 권한 미허용(시간초과 포함) 시 서버 reject — 정책 「Media tier … must not block receive」(`.cursor/rules/dibay-notification-permission-ssot.mdc`) 위반.
   - 음성: `NativeVoiceIncomingCallCoordinator.handleAnswer` → `failMicrophoneBeforeAccept`(reject)
   - 영상: `NativeVideoIncomingCallCoordinator` → `failBeforeFulfill(.missingCameraOrMicrophonePermission, reject)` · `NativeVideoCallViewController.performAccept` → decline
2. 카메라 요청이 마이크 허용에 묶여 있음 → 마이크가 시간초과·거부면 카메라 창 없음.

## 4. 수정
### A. 네이티브 (iOS 빌드 25)
| 파일 | 변경 |
|---|---|
| `Call/DibayVoiceMicrophonePermission.swift` | `requestIfNeededWithoutBlocking` 추가 — 아직 안 물었으면 OS 창만 띄우고(제한 시간 없음) 바로 반환 |
| `Call/DibayVideoMediaPermission.swift` | 카메라를 마이크 결과와 무관하게 요청(순서: 마이크 → 카메라), 결과 = 둘 다 허용 · `requestIfNeededWithoutBlocking` 추가 |
| `Call/NativeVoiceIncomingCallCoordinator.swift` | 수락 시 권한으로 막지 않음 — 비차단 요청 후 바로 수락 진행(미허용이면 마이크 없이 연결) |
| `Call/Video/NativeVideoIncomingCallCoordinator.swift` | 동일(미허용이면 마이크·카메라 없이 연결) |
| `Call/Video/NativeVideoCallViewController.swift` | 받기 버튼 — 권한으로 거절하지 않음, 비차단 요청 후 받기 |
- 바뀌지 않음: 발신(걸기)은 기존대로 권한 확인 후 시작 · VoIP/FCM 발송 · CallKit 종료 신호 · 서버 API · Android.
- 미허용 상태 연결: Agora 는 로컬 장치 없이 입장(상대 소리·영상 수신), 사용자가 허용하면 다음 통화부터 정상.

### B. 웹 (재빌드 없음, 빌드 24 에도 적용)
| 파일 | 변경 |
|---|---|
| `lib/permissions/post-login-call-media-os-request.ts` (신규) | iOS 앱 · 마이크/카메라 「아직 안 물어봄」일 때만 기존 `requestNativeCallMediaPermissions("video")` → OS 창(마이크 → 카메라) |
| `components/permissions/DiBaYDevicePermissionOnboardingGate.tsx` | 로그인 직후 알림 OS 창 다음에 위 함수 1회 — 앱 자체 화면 없음 |
| `.cursor/rules/dibay-notification-permission-ssot.mdc` | Media tier 문구에 「iOS 로그인 직후 OS 창 1회 · 수신은 권한으로 막지 않음」 반영 |
- Android·웹 브라우저 무변경.

## 5. 구 바이너리 호환
- 설치된 iOS 빌드 24: B 만 적용(로그인 직후 OS 창) — A 의 수락 경로 수정은 빌드 25 부터.
- 심사 중 빌드 24 → 빌드 25 로 교체 제출.

## 6. 위험·롤백
- 위험: 권한 없이 연결된 통화는 상대가 내 소리를 못 들음(설정 안내 필요). Apple: 맥락 없는 사전 권한 요청 지적 가능성(문구 명확·거부해도 사용 가능 → 낮음).
- 롤백: 이 커밋 revert(웹 즉시) + 빌드 24 재선택.

## 7. 실기기 행렬 (빌드 25 · 매 시험 Production SHA 확인)
| # | 시험 | 기대 |
|---|---|---|
| 1 | 새 설치 → 로그인 | 알림 → 마이크 → 카메라 OS 창 순서 |
| 2 | 권한 미정 상태(설정에서 재설정) 잠금 화면 음성 받기 | 거절 없이 연결(accepted/connected) |
| 3 | 마이크 거부 상태 음성 받기 | 연결됨(내 소리 없음), 거절 없음 |
| 4 | 영상 받기 · 카메라 미정 | 마이크·카메라 창 둘 다, 연결 |
| 5 | Android↔iPhone 음성·영상 발신·수신·거절·취소·통화 중·무응답·종료 후 재발신 | 기존과 동일 |

## 8. 변경 (2026-11-08 · Owner 「텔레그램 방식으로 맞춰」) — 빌드 26 · 위 A·B 대체
비교 근거(Telegram-iOS 공개 소스, GitHub master 2026-11-08): 마이크·카메라는 걸기/받기 때만 요청(`PresentationCallManager.swift` startCall, `PresentationCall.swift` answer), 미결정은 OS 답 대기, 거부 → 걸기 시작 안 함 / 받기 `hangUp()`, 「설정」 안내창(`DeviceAccess.swift`, 백그라운드는 알림). 카카오톡·Viber: 공개 자료로 확인 못 함(NOT_PROVEN). Apple HIG: 필요할 때 요청, 실행 직후 요청 피함.
| 항목 | 빌드 25(A·B) | 빌드 26(텔레그램 방식) |
|---|---|---|
| 로그인 직후 마이크·카메라 OS 창(B) | 있음 | **제거**(알림만 로그인 직후) |
| 받을 때 미결정 | OS 창, 바로 연결 | **OS 창, 답 대기(시간 제한 없음)** → 허용 연결 / 거부 끊기 |
| 받을 때 거부 | 마이크 없이 연결 | **끊기 + 「설정」 안내** |
| 걸 때 미결정 | 20초 제한 | **답 대기(시간 제한 없음)** |
| 걸 때 거부 | 시작 안 함 | 시작 안 함 **+ 「설정」 안내** |
| 영상 카메라 | 마이크 무관 요청 | 마이크 허용 뒤 요청(텔레그램 동일 · 시간 제한 없음이라 마이크 답 후 바로 뜸) |
- 파일: `DibayVoiceMicrophonePermission.swift`(시간 제한 제거 · `DibayCallPermissionSettingsPrompt` 추가), `DibayVideoMediaPermission.swift`(카메라 시간 제한 제거), 수신·발신 코디네이터 5곳 거부 시 안내 호출. 웹 B 파일 삭제·게이트 원복.
- Android(APK 1.2.5 (37)): 받기 때 OS 창 답 대기·거부 시 계속 울림+설정 열기 — 변경 없음.
- NOT_PROVEN: 잠금 화면 CallKit 받기에서 OS 권한 창이 보이는 모습(실기기 확인 대상).
