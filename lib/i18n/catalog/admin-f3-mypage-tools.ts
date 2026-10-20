/**
 * 설계 v4 F3 (V3-11 마이페이지 화면 · 내부 도구 모의 화면 표기) — admin.ts 와 별도(타입 직렬화 한계 회피).
 */
export const adminF3MypageToolsMessages = {
  ko: {
    admin_my_edit_unavailable_note: "편집 기능은 준비 중입니다",
    admin_app_meta_intro: "버전 화면과 Android 인앱 업데이트 정책에 쓰이는 값입니다. 빈 값으로 저장하면 기본 동작(강제 업데이트 없음)으로 돌아갑니다.",
    admin_app_meta_help_app_version: "앱 버전 표시값 (예: 1.2.3)",
    admin_app_meta_help_app_build: "빌드 번호 표시값 (숫자)",
    admin_app_meta_help_android_min_version_code: "Android 최소 versionCode — 이보다 낮은 설치본은 업데이트 안내 (숫자)",
    admin_app_meta_help_android_immediate_update: "Android 즉시(강제) 업데이트 — true 또는 false",
    admin_app_meta_empty_placeholder: "비어 있음 (기본 동작)",
    admin_app_meta_default: "기본 동작",
    admin_app_meta_invalid: "형식이 올바르지 않습니다.",
    admin_app_meta_saved: "저장했습니다.",
    admin_app_meta_save_failed: "저장하지 못했습니다.",
    admin_app_meta_load_failed: "앱 메타를 불러오지 못했습니다.",
    admin_my_ia_locked_note: "회원 메뉴 구성은 IA 계약으로 고정되어 이 목록은 회원 화면에 반영되지 않습니다.",
    admin_my_banner_placement_note: "활성 배너 1건(정렬 순서 우선)이 회원 내정보 홈 프로필 아래에 표시됩니다. 닫기 가능 배너는 회원이 닫으면 그 기기에서 숨겨집니다.",
    admin_mock_tool_notice_backup: "모의 화면 — 실제 백업/복구는 수행되지 않습니다",
    admin_mock_tool_notice_dr: "모의 화면 — 실제 재해 복구(DR) 전환·리허설은 수행되지 않습니다",
    admin_mock_tool_notice_automation: "모의 화면 — 실제 자동 실행은 수행되지 않습니다",
    admin_mock_tool_notice_production_migration:
      "모의 화면 — 실제 프로덕션 전환·마이그레이션은 수행되지 않습니다",
  },
  en: {
    admin_my_edit_unavailable_note: "Editing is not available yet",
    admin_app_meta_intro: "Values used by the version screen and the Android in-app update policy. Saving an empty value restores the default (no forced update).",
    admin_app_meta_help_app_version: "App version shown to members (e.g. 1.2.3)",
    admin_app_meta_help_app_build: "Build number shown to members (digits)",
    admin_app_meta_help_android_min_version_code: "Minimum Android versionCode — older installs are prompted to update (digits)",
    admin_app_meta_help_android_immediate_update: "Android immediate (forced) update — true or false",
    admin_app_meta_empty_placeholder: "Empty (default behavior)",
    admin_app_meta_default: "Default behavior",
    admin_app_meta_invalid: "Invalid format.",
    admin_app_meta_saved: "Saved.",
    admin_app_meta_save_failed: "Couldn't save.",
    admin_app_meta_load_failed: "Couldn't load app meta.",
    admin_my_ia_locked_note: "The member menu is fixed by the IA contract, so this list is not shown on member screens.",
    admin_my_banner_placement_note: "One active banner (lowest sort order first) is shown below the profile on the member My Info home. Dismissible banners stay hidden on a device after the member closes them.",
    admin_mock_tool_notice_backup: "Mock screen — no real backup or restore is performed",
    admin_mock_tool_notice_dr: "Mock screen — no real disaster-recovery failover or rehearsal is performed",
    admin_mock_tool_notice_automation: "Mock screen — nothing is actually executed automatically",
    admin_mock_tool_notice_production_migration:
      "Mock screen — no real production cutover or migration is performed",
  },
} as const;
