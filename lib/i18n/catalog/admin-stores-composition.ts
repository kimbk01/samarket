/** Admin Stores Composition Policy — C2 UI copy */
export const adminStoresCompositionMessages = {
  ko: {
    admin_menu_stores_composition_policy: "Composition 정책",
    admin_stores_composition_title: "스토어 Composition 정책",
    admin_stores_composition_desc:
      "HOME/BROWSE 노출 구성 정책을 저장합니다. Discovery 순위는 여기서 편집할 수 없습니다. 엔진 cutover 전까지 사용자 화면에는 적용되지 않습니다.",
    admin_stores_composition_surface_home: "HOME",
    admin_stores_composition_surface_browse: "BROWSE",
    admin_stores_composition_ranking_lock:
      "순위는 Discovery에서 관리되며 이 화면에서 편집할 수 없습니다.",
    admin_stores_composition_engine_notice:
      "저장된 정책은 Composition 엔진 cutover(C3+) 전까지 사용자 HOME/BROWSE에 적용되지 않습니다.",
    admin_stores_composition_interval_not_consumed: "NOT_CONSUMED (저장만)",
    admin_stores_composition_future_slot_notice:
      "엔진 cutover 전까지 실제 Browse 삽입은 비활성입니다.",
    admin_stores_composition_col_slot: "Slot",
    admin_stores_composition_col_content_type: "Content type",
    admin_stores_composition_col_enabled: "Enabled",
    admin_stores_composition_col_order: "Order",
    admin_stores_composition_col_max: "Max",
    admin_stores_composition_col_interval: "Interval",
    admin_stores_composition_col_override: "Override",
    admin_stores_composition_override_yes: "저장됨",
    admin_stores_composition_override_no: "기본값",
    admin_stores_composition_save: "저장",
    admin_stores_composition_reload: "새로고침",
    admin_stores_composition_loading: "불러오는 중…",
    admin_stores_composition_load_fail: "정책을 불러오지 못했습니다.",
    admin_stores_composition_save_ok: "저장되었습니다.",
    admin_stores_composition_save_fail: "저장에 실패했습니다.",
    admin_stores_composition_stale_revision:
      "정책이 다른 관리자에 의해 변경되었습니다. 새로고침 후 다시 시도하세요.",
    admin_stores_composition_unbounded: "무제한",
    admin_stores_composition_title_editability: "Title 편집: DEFERRED (Presentation i18n authority)",
  },
  en: {
    admin_menu_stores_composition_policy: "Composition policy",
    admin_stores_composition_title: "Store composition policy",
    admin_stores_composition_desc:
      "Persist HOME/BROWSE exposure composition policy. Discovery ranking cannot be edited here. Not applied to user surfaces until engine cutover.",
    admin_stores_composition_surface_home: "HOME",
    admin_stores_composition_surface_browse: "BROWSE",
    admin_stores_composition_ranking_lock:
      "Ranking is managed by Discovery and cannot be edited here.",
    admin_stores_composition_engine_notice:
      "Saved policy is not applied to user HOME/BROWSE until composition engine cutover (C3+).",
    admin_stores_composition_interval_not_consumed: "NOT_CONSUMED (stored only)",
    admin_stores_composition_future_slot_notice:
      "Browse insertion slots are inactive until engine cutover.",
    admin_stores_composition_col_slot: "Slot",
    admin_stores_composition_col_content_type: "Content type",
    admin_stores_composition_col_enabled: "Enabled",
    admin_stores_composition_col_order: "Order",
    admin_stores_composition_col_max: "Max",
    admin_stores_composition_col_interval: "Interval",
    admin_stores_composition_col_override: "Override",
    admin_stores_composition_override_yes: "Saved",
    admin_stores_composition_override_no: "Default",
    admin_stores_composition_save: "Save",
    admin_stores_composition_reload: "Reload",
    admin_stores_composition_loading: "Loading…",
    admin_stores_composition_load_fail: "Failed to load policy.",
    admin_stores_composition_save_ok: "Saved.",
    admin_stores_composition_save_fail: "Failed to save.",
    admin_stores_composition_stale_revision:
      "Policy was changed by another admin. Refresh and try again.",
    admin_stores_composition_unbounded: "Unbounded",
    admin_stores_composition_title_editability: "Title edit: DEFERRED (Presentation i18n authority)",
  },
} as const;
