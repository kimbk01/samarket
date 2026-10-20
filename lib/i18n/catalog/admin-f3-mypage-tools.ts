/**
 * 설계 v4 F3 (V3-11 마이페이지 화면 · 내부 도구 모의 화면 표기) — admin.ts 와 별도(타입 직렬화 한계 회피).
 */
export const adminF3MypageToolsMessages = {
  ko: {
    admin_my_edit_unavailable_note: "편집 기능은 준비 중입니다",
    admin_mock_tool_notice_backup: "모의 화면 — 실제 백업/복구는 수행되지 않습니다",
    admin_mock_tool_notice_dr: "모의 화면 — 실제 재해 복구(DR) 전환·리허설은 수행되지 않습니다",
    admin_mock_tool_notice_automation: "모의 화면 — 실제 자동 실행은 수행되지 않습니다",
    admin_mock_tool_notice_production_migration:
      "모의 화면 — 실제 프로덕션 전환·마이그레이션은 수행되지 않습니다",
  },
  en: {
    admin_my_edit_unavailable_note: "Editing is not available yet",
    admin_mock_tool_notice_backup: "Mock screen — no real backup or restore is performed",
    admin_mock_tool_notice_dr: "Mock screen — no real disaster-recovery failover or rehearsal is performed",
    admin_mock_tool_notice_automation: "Mock screen — nothing is actually executed automatically",
    admin_mock_tool_notice_production_migration:
      "Mock screen — no real production cutover or migration is performed",
  },
} as const;
