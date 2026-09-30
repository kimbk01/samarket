/**
 * R16 Product OS Start + Intro stub admin i18n.
 * Spread into runtime MESSAGES + MessageKey only — NOT into adminMessages
 * (avoids TS7056 declaration emit growth on the giant admin catalog).
 */

export const adminOsEntryMessages = {
  ko: {
    admin_menu_settings_os_start: "OS 시작 화면",
    admin_menu_settings_intro: "Intro",
    admin_os_entry_title: "OS 시작 화면",
    admin_os_entry_desc:
      "OS 직후 제품 소유 시작 화면입니다. 진짜 Android/iOS OS Splash가 아닙니다. SAVE=DRAFT, 서비스 적용=LIVE.",
    admin_os_entry_edit: "편집 (DRAFT)",
    admin_os_entry_save_ok: "DRAFT 저장됨 (LIVE 미변경)",
    admin_os_entry_apply_ok: "서비스 적용됨",
    admin_os_entry_upload_ok: "이미지 DRAFT에 반영됨 (SAVE/APPLY 필요)",
    admin_intro_stub_title: "Intro",
    admin_intro_stub_desc:
      "OS 시작 화면과 완전히 분리된 메뉴입니다. 이번 단계에서는 구현되지 않습니다.",
    admin_intro_stub_usage: "Intro 사용",
    admin_intro_stub_preparing: "준비 중",
    admin_intro_stub_note:
      "기본값 OFF. Intro runtime은 구현되지 않았으며 ON으로 활성화할 수 없습니다.",
  },
  en: {
    admin_menu_settings_os_start: "OS start screen",
    admin_menu_settings_intro: "Intro",
    admin_os_entry_title: "OS start screen",
    admin_os_entry_desc:
      "Product-owned screen right after OS splash — not the real OS launch screen. SAVE=DRAFT, Service Apply=LIVE.",
    admin_os_entry_edit: "Edit (DRAFT)",
    admin_os_entry_save_ok: "DRAFT saved (LIVE unchanged)",
    admin_os_entry_apply_ok: "Service applied",
    admin_os_entry_upload_ok: "Image on DRAFT (SAVE/APPLY still required)",
    admin_intro_stub_title: "Intro",
    admin_intro_stub_desc:
      "Completely separate from OS start screen. Not implemented in this phase.",
    admin_intro_stub_usage: "Intro enabled",
    admin_intro_stub_preparing: "Preparing",
    admin_intro_stub_note:
      "Hard default OFF. Intro runtime is not implemented and cannot be activated.",
  },
} as const;
