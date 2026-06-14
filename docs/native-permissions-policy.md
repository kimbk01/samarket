# Native permissions policy (DIBAY)

## 원칙

- **최종 판단은 OS permission 상태** (`checkPermissions` / Permissions API / native bridge).
- 앱 localStorage 캐시(`device-permission-manager`)는 UI·온보딩 재노출 억제용이며, OS와 충돌 시 **OS가 우선**.
- **허용된 권한은 재요청하지 않는다** (`prompt`/`prompt-with-rationale`일 때만 `requestPermissions`).
- **거부(`denied`) 시 반복 시스템 팝업 금지** — 설정 화면 안내 + OS 설정 이동 버튼.
- **로그아웃해도 OS 권한은 유지** — 재로그인 시 `checkPermissions`만 수행.
- **앱 삭제·재설치** 시 OS 정책에 따라 권한 초기화 가능 (문서·QA에 명시).

## 구현 위치

| 권한 | Native | Web/PWA |
|------|--------|---------|
| 알림 | `@capacitor/push-notifications` + `lib/push/native/check-native-notification-permission.ts` | `device-permission-manager` · Web Push |
| 카메라·마이크 | `call-permission.ts` · `android-native-device-permissions` · getUserMedia gate | `device-permission-manager` |
| 위치 | Geolocation gate (화면 진입 시) | `requestLocationWithDiBaYGate` |
| 설정 이동 | `lib/push/native/open-native-settings.ts` | `DevicePermissionsSettingsContent` |

## AndroidManifest (선언)

`POST_NOTIFICATIONS`, `CAMERA`, `RECORD_AUDIO`, `ACCESS_FINE/COARSE_LOCATION`, `USE_FULL_SCREEN_INTENT` — `android/app/src/main/AndroidManifest.xml`

## iOS Info.plist (Usage Description)

`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription` — 배달·추적 등 **항상 위치**가 필요해지면 별도 제품 정책·App Store 심사 전제.

## Xcode capability (수동)

- Push Notifications
- Background Modes: `remote-notification`, `voip`
- `App.entitlements`: `aps-environment` (development/production)

## 계정 전환

- `disconnectNativeDevicesOnAccountSwitch()` — 동일 `device_id`의 **모든 user** push row `is_active=false`
- 새 계정 로그인 후 `NativePushRegistration`이 **userId 변경 시** token 재등록
