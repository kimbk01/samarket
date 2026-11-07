# DIBAY iOS 새 개발자 계정 전환 계획 (통화 변경 규정 적용 문서) — 2026-11-07 PHT

> Owner 결정: 새 개발자 계정(필리핀 주소·개인)으로 출시. 이 문서는 AGENTS.md 「통화 변경 규정」 3번(수정 전 영향 분석·계획 문서 → **Owner 승인 후 구현**)에 따른 계획이다. **아직 구현하지 않았다.** 새 계정 승인 후 Owner 승인을 받아 시작한다.
> 근거는 코드·운영 DB 직접 확인. 확인 못 한 것은 NOT_PROVEN.

## 1. 왜 통화 규정 대상인가
푸시·통화 발송이 **Apple 팀(키)과 번들 ID 하나**에 묶여 있다 (`lib/push/dispatch/apns-sender-impl.ts`).
- 키: `APNS_KEY_P8`·`APNS_KEY_ID`·`APNS_TEAM_ID` (팀 단위 — 다른 팀 앱에는 보낼 수 없음)
- 알림 토픽: `APNS_BUNDLE_ID` · 통화(VoIP) 토픽: `APNS_VOIP_TOPIC` 또는 `<번들>.voip`
- 기기 행 `user_devices` 에는 **번들·팀 열이 없다** (열: platform, push_token, app_version, environment, apns_environment …) → 서버는 토큰이 옛 앱 것인지 새 앱 것인지 구분 못 한다.

## 2. 전환 방식 — 권고: 한 번에 전환(하드 컷오버)
- 앱이 **한 번도 출시되지 않았다** → 옛 번들(`com.dibay.app`) iOS 설치본은 TestFlight·개발 기기뿐. 운영 DB iOS 기기 행: `1.2 (22)` 9, `1.0` 7, `1.2 (7)` 6, `1.2 (21)` 3, `1.2 (23)` 2, `1.2 (16)` 2 (2026-11-07 조회, 모두 시험 빌드).
- 그래서 두 앱을 동시에 지원(키 2벌·기기별 번들 기록)하지 않고, **새 앱 TestFlight 시작 시점에 서버 값을 새 팀으로 한 번에 바꾼다.** 그 순간부터 옛 설치본은 푸시·통화 수신이 끊긴다(시험 기기만 영향) → 옛 앱 삭제 후 새 앱 설치.
- 대안(권고 안 함): `user_devices` 에 번들 열 추가 + 키 2벌 — DB·서버·네이티브 변경이 커지고, 출시 전이라 얻는 것이 없다.

## 3. 바뀌는 것 전부 (파일·값)
| 영역 | 변경 | 누가 |
|---|---|---|
| Apple 새 계정 | App ID `com.dibay.ph`(Push·Sign in with Apple·Push 알림 확장 포함), 확장 `com.dibay.ph.DibayPushServiceExtension`, APNs 키(.p8), Sign in with Apple 키(.p8), (웹 Apple 로그인용) Services ID, 앱 등록, IAP 3종 | Owner(계정 클릭) · 작업자 안내 |
| 앱 이름 | 기존 계정이 「DiBaY - 디바이」 점유(반려 상태라 삭제 불가) → 새 앱 등록 때 같은 이름 가능 여부 먼저 확인 | Owner |
| `ios/App/App.xcodeproj/project.pbxproj` | `PRODUCT_BUNDLE_IDENTIFIER` 앱·확장, `DEVELOPMENT_TEAM` 4곳 | 작업자 |
| `ios/App/App/Info.plist` | URL scheme 의 번들 문자열(`com.dibay.app` 항목) | 작업자 |
| `capacitor.config.ts` `appId` | **바꾸지 않는다** (Android 와 공유). `cap sync` 가 iOS 번들을 덮어쓰지 않는지 전환 때 확인 | 작업자 |
| Vercel 환경변수 | `APNS_KEY_P8`·`APNS_KEY_ID`·`APNS_TEAM_ID`·`APNS_BUNDLE_ID`·`APNS_VOIP_TOPIC`, `APPLE_IAP_BUNDLE_ID`, `AUTH_APPLE_NATIVE_CLIENT_ID`/`APPLE_NATIVE_BUNDLE_ID`(또는 `AUTH_APPLE_NATIVE_AUDIENCES`), `APPLE_SIWA_TEAM_ID`·`APPLE_SIWA_KEY_ID`·`APPLE_SIWA_KEY_P8` | Owner 입력 · 작업자 목록 제공 |
| 운영 DB | `apple_iap_products.product_id` 3행 → `com.dibay.ph.point.1000/5000/10000` (마이그레이션, 승인 필요) | 작업자 |
| 카카오 개발자 콘솔 | iOS 번들 ID `com.dibay.ph` 추가 | Owner |
| Supabase Auth (웹 Apple 로그인) | 웹·Android 의 「Apple로 계속하기」가 쓰는 Services ID·키가 옛 팀이면 새 팀으로 — **현재 설정 팀 NOT_PROVEN** (Supabase 대시보드 확인 필요) | Owner 확인 |
| 웹 코드 | 변경 없음 예상 (값은 전부 환경변수) | — |

## 4. 바뀌는 동작·영향 경로 (통화 규정 3번 항목)
| 경로 | 전환 후 | 위험 |
|---|---|---|
| 발신 시작·세션 생성 | 무변경(웹·서버) | 낮음 |
| VoIP 발송 (iOS 수신) | 새 키·새 토픽 `com.dibay.ph.voip` | 값 오타 시 iOS 수신 0 → 실기기 행렬로 확인 |
| FCM (Android) | 무변경 | 없음 |
| iOS CallKit 수신 화면·종료 신호 | 네이티브 코드 무변경, 번들만 변경 | 낮음 |
| 취소/거절/종료/부재중·상태 폴링·통화 기록·팝업 | 무변경 | 낮음 |
| 일반 알림(채팅 등) | 새 토픽 `com.dibay.ph` | 확장 번들 불일치 시 알림 꾸밈 실패 |
| **설치된 구 바이너리 호환** | 옛 번들 iOS 설치본은 전환 순간부터 푸시·통화 수신 불가 (시험 기기만) | 의도된 영향 — 옛 앱 삭제 안내 |
| Apple 로그인 | 사용자 식별값이 팀별 → 기존 Apple 회원 3명(`11222`, `dibay_d7fc34` 심사관, `dibay_9d830a` 시험)은 새 앱에서 새 회원 | `11222` 실회원 여부 Owner 확인 |
| 웹·iOS Apple 로그인 팀 불일치 | 같은 사람이 회원 2명으로 갈림 → 같은 날 함께 전환 | 3절 Supabase 확인 필수 |

## 5. 순서
1. Owner: 새 계정 승인 → 계약(유료 앱)·은행·W-8BEN.
2. Owner: App ID·키·Services ID·앱 등록·IAP 3종 (작업자가 단계별 화면 안내).
3. 이 계획 Owner 승인.
4. 작업자: 번들·팀 변경 커밋(통화만 단독 커밋 원칙 — 이 전환은 번들/팀 변경 단독), IAP 상품 ID 마이그레이션(승인 후 운영 적용).
5. Owner: Vercel 환경변수 교체(한 번에), Supabase 웹 Apple 설정 교체, 카카오 콘솔 번들 추가.
6. `npm run native:prepare` → Owner 일괄 빌드 → TestFlight.
7. 실기기 행렬 (통화 규정 5번, 매 시험마다 Production SHA 기록): Android↔iPhone 음성·영상 발신·수신, 거절, 벨 중 취소, 취소 후 지연 푸시(재울림 없음), 통화 중, 무응답, 종료 후 즉시 재발신 + 일반 채팅 알림 + Apple 가입→동의 화면(iPhone·iPad)→포인트 3종 Sandbox 결제·지급→탈퇴→Apple 토큰 폐기.
8. 실기기 FAIL 시 즉시 중단 → 원인 수정 → 같은 행렬 재검증.

## 6. 롤백
- 환경변수를 옛 팀 값으로 되돌리면 옛 앱 설치본의 푸시·통화가 다시 동작한다(옛 키를 폐기하지 않는 동안).
- **옛 계정의 APNs 키는 새 앱 출시·검증 완료 전까지 폐기하지 않는다.**
- IAP 상품 ID 마이그레이션은 이전 값으로 되돌리는 역마이그레이션을 함께 준비한다.

## 7. NOT_PROVEN
- 같은 사람의 두 번째 개인 계정 허용 여부(Apple 문구 없음).
- 앱 이름 「DiBaY - 디바이」 를 새 계정에서 쓸 수 있는지.
- 웹 Apple 로그인(Supabase)이 쓰는 Services ID 의 팀.
