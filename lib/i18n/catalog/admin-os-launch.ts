/**
 * R17-OS — Admin "OS 시작 화면" (build-time TRUE OS start visual) i18n.
 * Spread into runtime MESSAGES + MessageKey only — NOT into adminMessages
 * (avoids TS7056 declaration emit growth on the giant admin catalog).
 */

export const adminOsLaunchMessages = {
  ko: {
    admin_menu_settings_startup_group: "시작 화면",
    admin_menu_settings_os_start: "OS 시작 화면",
    admin_os_launch_title: "OS 시작 화면",
    admin_os_launch_desc:
      "앱 아이콘을 누르면 Android·iOS가 가장 먼저 보여주는 화면입니다. 배경색과 가운데 로고만 바꿀 수 있습니다.",
    admin_os_launch_apply_note:
      "OS 화면은 앱 설치 파일에 들어갑니다. 여기서 저장한 값은 다음 앱 빌드부터 적용되고, 이미 설치된 앱은 스토어 업데이트 후 바뀝니다.",
    admin_os_launch_unsupported:
      "텍스트, 위치·크기 자유 조정, 표시 시간, 즉시 반영은 OS가 지원하지 않아 제공하지 않습니다.",
    admin_os_launch_current_title: "빌드 스냅샷 (저장소)",
    admin_os_launch_snapshot_logo: "로고 SHA",
    admin_os_launch_snapshot_source: "Admin 값 반영",
    admin_os_launch_snapshot_source_repo: "없음 (저장소 기본값)",
    admin_os_launch_deployed_title: "스토어 배포 앱",
    admin_os_launch_deployed_unknown: "확인 불가 (출시 기록 연동 전 · NOT_PROVEN)",
    admin_os_launch_pending_title: "다음 빌드 (대기)",
    admin_os_launch_background: "배경색",
    admin_os_launch_logo: "로고",
    admin_os_launch_logo_hint:
      "투명 배경 PNG, 짧은 변 512px 이상, 5MB 이하. 화면 가운데에 고정 크기로 표시됩니다.",
    admin_os_launch_logo_current_build: "빌드 스냅샷 로고 사용 중",
    admin_os_launch_upload: "로고 업로드",
    admin_os_launch_uploading: "업로드 중…",
    admin_os_launch_reset_logo: "빌드 스냅샷 로고로 되돌리기",
    admin_os_launch_save: "배경색 저장",
    admin_os_launch_saving: "저장 중…",
    admin_os_launch_saved: "저장했습니다. 다음 앱 빌드부터 적용됩니다.",
    admin_os_launch_status_changed: "빌드 스냅샷과 다름 · 다음 빌드 반영 대기",
    admin_os_launch_status_same: "빌드 스냅샷과 같음",
    admin_os_launch_preview: "미리보기",
    admin_os_launch_preview_note:
      "실제 기기에서는 OS 규격에 따라 로고 크기가 조금 다를 수 있습니다.",
    admin_os_launch_last_saved: "마지막 저장",
    admin_os_launch_dev_title: "다음 빌드에 반영하는 방법 (개발)",
    admin_os_launch_dev_step1: "저장소 루트에서 npm run os-launch:pull 실행 (대기 값으로 Android·iOS 리소스 생성)",
    admin_os_launch_dev_step2: "생성된 파일 커밋 후 npx cap sync",
    admin_os_launch_dev_step3: "Android Studio·Xcode로 빌드해 스토어에 업데이트",
    admin_os_launch_error: "처리하지 못했습니다: {error}",
  },
  en: {
    admin_menu_settings_startup_group: "Startup",
    admin_menu_settings_os_start: "OS start screen",
    admin_os_launch_title: "OS start screen",
    admin_os_launch_desc:
      "The first screen Android and iOS show when the app icon is tapped. Only the background color and the centered logo can change.",
    admin_os_launch_apply_note:
      "The OS screen is part of the app binary. Values saved here apply from the next app build; installed apps change after a store update.",
    admin_os_launch_unsupported:
      "Text, free position or size, display duration and instant apply are not supported by the OS, so they are not offered.",
    admin_os_launch_current_title: "Build snapshot (repository)",
    admin_os_launch_snapshot_logo: "Logo SHA",
    admin_os_launch_snapshot_source: "Admin values applied",
    admin_os_launch_snapshot_source_repo: "None (repository default)",
    admin_os_launch_deployed_title: "Store-released app",
    admin_os_launch_deployed_unknown: "Unknown (no release record yet · NOT_PROVEN)",
    admin_os_launch_pending_title: "Next build (pending)",
    admin_os_launch_background: "Background color",
    admin_os_launch_logo: "Logo",
    admin_os_launch_logo_hint:
      "Transparent PNG, at least 512 px on the short edge, up to 5 MB. Shown centered at a fixed size.",
    admin_os_launch_logo_current_build: "Using the build snapshot logo",
    admin_os_launch_upload: "Upload logo",
    admin_os_launch_uploading: "Uploading…",
    admin_os_launch_reset_logo: "Use build snapshot logo",
    admin_os_launch_save: "Save background",
    admin_os_launch_saving: "Saving…",
    admin_os_launch_saved: "Saved. Applies from the next app build.",
    admin_os_launch_status_changed: "Differs from build snapshot · pending next build",
    admin_os_launch_status_same: "Same as build snapshot",
    admin_os_launch_preview: "Preview",
    admin_os_launch_preview_note: "On devices the logo size can differ slightly per OS rules.",
    admin_os_launch_last_saved: "Last saved",
    admin_os_launch_dev_title: "How to ship it in the next build (dev)",
    admin_os_launch_dev_step1: "Run npm run os-launch:pull at the repo root (generates Android/iOS resources from pending values)",
    admin_os_launch_dev_step2: "Commit the generated files, then npx cap sync",
    admin_os_launch_dev_step3: "Build with Android Studio / Xcode and publish a store update",
    admin_os_launch_error: "Could not complete: {error}",
  },
} as const;
