# iOS 첫 수신 통화 「거절」 — 마이크 권한 미리 묻기 (2026-11-08 PHT · Owner 승인 「수정안 승인」)

## 1. 증거 (운영 DB · 빌드 1.2 (24) · 아이폰 dibay_778d44 ↔ Samsung qqqq 1.2.5 (37))
| 세션 | 기록 (PHT) |
|---|---|
| `20f28db1-361d-49e9-bbd2-a09308448129` | 01:47:29.765 ringing(qqqq) → **01:47:50.430 declined(dibay_778d44, next_status=rejected)**, accepted 없음 |
| `b6919e70-1c1a-464e-878c-3214d5e80e4d` | 01:49:15 ringing → 01:49:21 accepted → 01:49:22 connected(양쪽) → 01:49:43 ended |

Owner 관찰: 받았는데 거절됨, 받는 순간 마이크 허용 창이 보임.

## 2. 원인 (코드)
- `ios/App/App/Call/NativeVoiceIncomingCallCoordinator.swift` 수락 → `DibayVoiceMicrophonePermission.ensureGranted`
- 권한 `notDetermined` 이면 그때 OS 창 요청, 제한 시간 **앱 화면 20초 · 잠금/백그라운드 3초** (`DibayVoiceMicrophonePermission.swift`)
- 시간 안에 허용 없음 → `failMicrophoneBeforeAccept` → 서버 `reject` (declined)
- 20f28db1 의 ringing→declined 20.7초 = 20초 제한과 일치. 기기 로그(DibayCallLog)는 미확인 — 시각·코드로 판단.

## 3. 수정 (웹만 · 네이티브·서버 통화 경로 무변경)
| 파일 | 변경 |
|---|---|
| `lib/community-messenger/ios-mic-preask.ts` (신규) | iOS 셸 + 마이크 `prompt_available` + 이번 실행 첫 회 → 안내 표시 판단 · 「계속」 = 기존 `requestNativeCallMediaPermissions("voice", "mic_preask_messenger_entry")` |
| `components/community-messenger/IosMicPreaskOnMessengerEntry.tsx` (신규) | `DibayInfoDialog` 단일 「계속」 버튼(App Store 5.1.1 — 시스템 창 앞 건너뛰기 버튼 없음) |
| `app/(main)/community-messenger/layout.tsx` | 회원 게이트 안쪽에 1줄 추가(비회원 미표시) |
| `lib/i18n/catalog/community-messenger-ui.ts` | 문구 3개 ko/en |
| `lib/community-messenger/__tests__/ios-mic-preask.test.ts` (신규) | 6건 |

- 쓰는 네이티브 메서드: `NativeCallService.requestCallMediaPermissions` / `checkCallMediaPermissions` — 빌드 24 에 이미 있음(재빌드 불필요).
- 바뀌지 않는 것: 수신 수락 순서·20초/3초 제한·발신·VoIP/FCM 발송·CallKit·Android·웹 브라우저.

## 4. 영향·위험
- 영향 화면: iOS 앱 채팅(`/community-messenger/*`) 첫 진입 1회. 권한이 이미 정해졌으면 아무것도 안 뜸.
- 위험: 사용자가 거부하면 통화 시 기존 「설정에서 허용」 안내 경로(무변경).
- 롤백: layout 1줄 제거 후 main 반영.

## 5. 실기기 확인 (반영 후)
1. 아이폰 새 앱 삭제 → TestFlight 재설치 → 로그인 → 채팅 진입 → 안내 → 계속 → iOS 마이크 창 → 허용
2. Android(qqqq) → 아이폰 음성 통화 → 수락 → 바로 연결(accepted/connected) 확인
3. 결과는 이 문서 아래에 기록

## 6. 확장 (Owner 2026-11-08 「마이크·알림·영상 통화 카메라 승인 요청 화면이 나와야」)
- 같은 안내 한 번에 **알림 · 마이크 · 카메라** 중 아직 묻지 않은 것만 줄로 표시 → 「계속」 → 알림(단일 경로 `requestNotificationFromGuide`, LOCK 준수) → 마이크+카메라(`requestNativeCallMediaPermissions("video")`, 카메라 불필요 시 "voice").
- 알림이 이미 로그인 때 정해졌으면 알림 줄은 안 나온다. 거부된 권한은 다시 묻지 않는다(기존 설정 안내 경로).
- 시험 8건(새 설치 3종·남은 것만·모두 정해짐·Android/웹 제외·1회·순서·voice/video·iOS 외 무요청).
