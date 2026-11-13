
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

import { catalogPair } from "@/lib/i18n/catalog-pair";/**
 * Operator-facing labels for Admin presentation.
 * Canonical enums/tables stay in backend; UI must not dump them as primary copy.
 */

export function adminOperatorLabel(
  raw: string | null | undefined,
  ko: boolean
): string {
  const key = String(raw ?? "").trim();
  if (!key) return "—";
  if (key.includes(" / ")) {
    return key
      .split(" / ")
      .map((part) => adminOperatorLabel(part.trim(), ko))
      .join(" · ");
  }
  if (key.includes(" · ")) {
    return key
      .split(" · ")
      .map((part) => adminOperatorLabel(part.trim(), ko))
      .join(" · ");
  }
  const map = OPERATOR_LABELS[key] ?? OPERATOR_LABELS[key.toUpperCase()];
  if (map) return ko ? map.ko : map.en;
  // Soften snake/screaming cases that slipped through
  if (/^[A-Z][A-Z0-9_./-]+$/.test(key) || key.includes("_") || key.includes("/")) {
    return humanizeToken(key, ko);
  }
  return key;
}

function humanizeToken(key: string, ko: boolean): string {
  const lower = key.toLowerCase().replace(/[./]/g, " ").replace(/_/g, " ");
  if (ko) return tx(true, "admin_operator_ux_token_check", { token: lower });
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Looks like UUID — never use as primary title. */
export function isAdminTechnicalId(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function adminRecentTitle(
  title: string,
  metaKo: string,
  metaEn: string,
  ko: boolean
): string {
  if (isAdminTechnicalId(title) || !title.trim()) {
    return (ko ? metaKo : metaEn) || tx(ko, "admin_operator_ux_recent_activity");
  }
  if (/^\[QA\]/i.test(title) || /__QA_/i.test(title)) {
    const bare = title.replace(/^\[QA\]\s*/i, "").replace(/^__QA_[^_]+_/i, "");
    return tx(ko, "admin_operator_ux_test", { title: String(bare.slice(0, 48)) });
  }
  return title;
}

const OPERATOR_LABELS: Record<string, { ko: string; en: string }> = {
  WAITING_ADMIN: catalogPair("admin_awaiting_admin_review"),
  SUBMITTED: catalogPair("admin_submitted_2"),
  ACTIVE: catalogPair("admin_active_2"),
  PENDING: catalogPair("admin_pending_3"),
  APPROVED: catalogPair("admin_approved"),
  REJECTED: catalogPair("admin_rejected"),
  CANCELLED: catalogPair("admin_trade_flow_status_cancelled"),
  PENDING_REVIEW: catalogPair("admin_pending_review"),
  UNDER_REVIEW: catalogPair("admin_under_review"),
  SCHEDULED: catalogPair("admin_do_ss_scheduled"),
  HELD: catalogPair("admin_trade_rep_status_held"),
  SALE_EARN: catalogPair("admin_sale_coin_credit"),
  CONVERT_TO_BUSINESS_CASH: catalogPair("admin_coin_cash_conversion"),
  ledger: catalogPair("admin_ledger_entry"),
  debit: catalogPair("admin_debit"),
  credit: catalogPair("admin_credit"),
  "SALE_FEE/debit": catalogPair("admin_sale_fee_debit"),
  "PARTNER_SPEND/debit": catalogPair("admin_partner_fee_debit"),
  "TOP_UP/credit": catalogPair("admin_cash_top_up"),
  "AD_SPEND/debit": catalogPair("admin_ad_spend_debit"),
  SALE_FEE: catalogPair("admin_sale_fee"),
  PARTNER_SPEND: catalogPair("admin_partner_spend"),
  TOP_UP: catalogPair("admin_cash_top_up"),
  AD_SPEND: catalogPair("admin_ad_spend"),
  DELIVERY: catalogPair("admin_delivery_ads"),
  FEED: catalogPair("admin_feed_ads"),
  POPUP: catalogPair("admin_ad_kind_popup_campaign"),
  store_sponsored: catalogPair("admin_store_promotion"),
  banner: catalogPair("admin_ads_target_banner"),
  general_direct: catalogPair("admin_general_1_1_chat"),
  group: catalogPair("admin_menu_chat_group"),
  community_reports: catalogPair("admin_community_reports"),
  DAILY_CRITICAL: catalogPair("admin_handle_now_2"),
  FREQUENT: catalogPair("admin_frequent_ops"),
  OCCASIONAL: catalogPair("admin_occasional"),
  CONFIGURATION: catalogPair("admin_settings"),
  ARCHIVE: catalogPair("admin_archive_2"),
  POINT_CHARGE: catalogPair("admin_point_top_up_request_2"),
  point_charge: catalogPair("admin_point_top_up_request_2"),
  community_reward: catalogPair("admin_community_reward_post_comment"),
  community_reclaim: catalogPair("admin_community_reward_reclaim"),
  gift_certificate_purchase: catalogPair("admin_gift_certificate_purchase"),
  promotion_order: catalogPair("admin_post_promotion_order"),
  feed_ad_request: catalogPair("admin_feed_ad_request"),
  admin_manual: catalogPair("admin_admin_manual_credit_debit"),
  store_order_discount: catalogPair("admin_store_order_discount"),
  trade_post_ad: catalogPair("admin_trade_post_ad"),
  ad_application: catalogPair("admin_ad_application"),
  CASH_CHARGE: catalogPair("admin_cash_top_up_request_2"),
  cash_topup: catalogPair("admin_cash_top_up_request_2"),
  SETTLEMENT: catalogPair("admin_ops_console_link_settlement"),
  settlement: catalogPair("admin_settlement_scheduled"),
  FEE_OBLIGATION: catalogPair("admin_unpaid_sale_fee"),
  /** 재무 통제판 미납 수수료 행 상태 */
  unpaid: catalogPair("admin_unpaid_2"),
  fee_obligation: catalogPair("admin_unpaid_sale_fee"),
  COIN_WITHDRAWAL: catalogPair("admin_coin_withdrawal"),
  coin_withdrawal: catalogPair("admin_coin_withdrawal"),
  refund: catalogPair("admin_refund_adjustment"),
  waiting_confirm: catalogPair("admin_awaiting_deposit_confirm"),
  scheduled: catalogPair("admin_do_ss_scheduled"),
  store_settlements: catalogPair("admin_ops_console_focus_settlements"),
  store_sale_fee_obligations: catalogPair("admin_fee_obligations_2"),
  point_charge_requests: catalogPair("admin_point_charges"),
  business_cash_charge_requests: catalogPair("admin_cash_charges"),
  delivery: catalogPair("admin_delivery_ads"),
  feed: catalogPair("admin_feed_ads"),
  popup: catalogPair("admin_ad_kind_popup_campaign"),
  trade_promote: catalogPair("admin_menu_trade_promotions"),
  active: catalogPair("admin_topics_col_active"),
  "APPLICATION REVIEW": catalogPair("admin_application_review"),
  "CREATIVE REVIEW": catalogPair("admin_creative_review"),
  "SCHEDULE / EXECUTION": catalogPair("admin_schedule_execution"),
  "ENDED / HISTORY": catalogPair("admin_ended_history"),
  STORES_HOME_FEED: catalogPair("admin_stores_home_feed"),
  reason_required: catalogPair("admin_launch_intro_err_reason_required"),
  "applied_rate=NOT_AVAILABLE": catalogPair("admin_applied_rate_not_recorded"),
  NOT_AVAILABLE: catalogPair("admin_not_available"),
};

export function adminFinanceActionTitle(type: string, ko: boolean): string {
  return adminOperatorLabel(type, ko);
}

export function adminStripTechnicalMeta(meta: string | null | undefined, ko: boolean): string {
  const m = String(meta ?? "").trim();
  if (!m) return "";
  if (/applied_rate\s*=\s*NOT_AVAILABLE/i.test(m)) {
    return tx(ko, "admin_operator_ux_applied_rate_not_recorded");
  }
  if (/^[a-z_]+:[0-9a-f-]{8,}$/i.test(m)) return "";
  return adminOperatorLabel(m, ko);
}

/** Map API/validation keys to operator-facing sentences. Never render raw keys. */
export function adminOperatorErrorMessage(
  raw: string | null | undefined,
  ko: boolean
): string {
  const key = String(raw ?? "").trim();
  if (!key) return tx(ko, "admin_operator_ux_could_not_complete_the_action");
  const known: Record<string, { ko: string; en: string }> = {
    // 재감사 S-1 (F-3): 피드 배너 풀 수용량(위치별 3)을 서버도 검사
    capacity_full: catalogPair("admin_this_ad_placement_is_full_max"),
    /** 언어 SSOT S7 — 어드민 등록 이름 영어 필수 */
    name_en_required: catalogPair("admin_name_en_required"),
    reason_required: catalogPair("admin_launch_intro_err_reason_required"),
    targetId_required: catalogPair("admin_enter_the_post_comment_id"),
    target_not_found: catalogPair("admin_post_comment_not_found_nothing_was"),
    target_author_mismatch: catalogPair("admin_the_post_comment_author_is_not"),
    target_lookup_failed: catalogPair("admin_could_not_verify_the_post_comment"),
    network_error: catalogPair("admin_network_error_please_try_again"),
    load_failed: catalogPair("admin_could_not_load_2"),
    action_failed: catalogPair("admin_action_failed"),
    update_failed: catalogPair("admin_update_failed"),
    funding_required: catalogPair("admin_cannot_approve_until_cash_funding_is"),
    period_expired: catalogPair("admin_the_requested_period_has_already_passed"),
    period_ended: catalogPair("admin_the_ad_period_has_ended_and"),
    forbidden: catalogPair("admin_you_do_not_have_permission_for"),
    forbidden_permission: catalogPair("admin_you_lack_the_admin_permission_for"),
    super_admin_only: catalogPair("admin_only_a_super_admin_can_do"),
    legacy_setting_retired: catalogPair("admin_this_setting_is_retired_fees_are"),
    auto_action_type_retired: catalogPair("admin_this_auto_action_is_retired_legacy"),
    status_changed: catalogPair("admin_another_admin_changed_the_status_first"),
    expected_status_required: catalogPair("admin_this_screen_is_out_of_date"),
    stale_lifecycle: catalogPair("admin_another_admin_acted_first_refresh_and"),
    stale_updated_at: catalogPair("admin_another_admin_edited_this_first_refresh"),
    expected_updated_at_required: catalogPair("admin_this_screen_is_out_of_date"),
    expected_version_required: catalogPair("admin_this_screen_is_out_of_date"),
    stale_policy: catalogPair("admin_another_admin_edited_this_fee_policy"),
    /** 409 충돌 후 화면이 최신 데이터를 이미 다시 불러온 경우 (adminConflictReloadedMessage). */
    stale_reloaded: catalogPair("admin_not_saved_another_admin_edited_this"),
    legacy_endpoint_disabled: catalogPair("admin_this_path_is_retired_use_admin"),
    invalid_order_id: catalogPair("admin_invalid_order_reference"),
    commission_load_failed: catalogPair("admin_could_not_load_commission_details"),
    invalid_store_transition: catalogPair("admin_this_action_is_not_allowed_for"),
    invalid_coupon_transition: catalogPair("admin_this_action_is_not_allowed_for_2"),
    reject_reason_required: catalogPair("admin_please_enter_a_rejection_reason"),
    revoke_reason_required: catalogPair("admin_please_enter_a_revoke_reason"),
    store_not_approved_for_sales: catalogPair("admin_only_approved_stores_can_change_sales"),
    store_not_approved_for_visibility: catalogPair("admin_only_approved_stores_can_be_made"),
    store_location_required: catalogPair("admin_this_delivery_store_has_no_map"),
    store_category_required: catalogPair("admin_this_store_has_no_category_so"),
    delivery_menu_required: catalogPair("admin_no_delivery_menu_choose_and_save"),
    invalid_period: catalogPair("admin_invalid_period_pick_both_start_and"),
    featured_period_invalid: catalogPair("admin_the_featured_period_date_is_invalid"),
    featured_period_order: catalogPair("admin_the_featured_end_date_must_be"),
    sample_store_cannot_sell: catalogPair("admin_sample_stores_cannot_be_approved_for"),
    // 매장 입점 계약 (2026-11-10)
    partner_agreement_required: catalogPair("admin_partner_approve_needs_agreement"),
    launch_free_policy_failed: catalogPair("admin_partner_err_launch_free_failed"),
    launch_free_until_invalid: catalogPair("admin_partner_err_free_until_invalid"),
    launch_free_until_past: catalogPair("admin_partner_err_free_until_past"),
    partner_agreement_not_real_store: catalogPair("admin_partner_err_not_real_store"),
    not_sample_store: catalogPair("admin_only_sample_stores_can_be_processed"),
    preview_changed: catalogPair("admin_data_changed_after_the_preview_run"),
    bulk_action_not_allowed: catalogPair("admin_this_field_cannot_be_changed_in"),
    would_leave_no_default_policy: catalogPair("admin_no_other_default_fee_policy_is"),
    reject_refund_failed: catalogPair("admin_the_store_cash_refund_failed_so"),
    business_cash_refund_failed: catalogPair("admin_rejected_but_the_store_cash_refund"),
    as_of_date_in_future: catalogPair("admin_the_as_of_date_cannot_be"),
    // FIN-04 Cash top-up approval guards · FIN-08 balance correction (DB RPC error codes)
    self_store_approval_forbidden: catalogPair("admin_you_cannot_approve_a_top_up"),
    payment_reference_missing: catalogPair("admin_a_request_without_a_deposit_reference"),
    admin_required: catalogPair("admin_stores_fee_err_forbidden"),
    super_admin_required: catalogPair("admin_only_a_super_admin_can_correct"),
    evidence_required: catalogPair("admin_enter_the_evidence_reference"),
    insufficient_balance: catalogPair("admin_the_correction_would_make_the_balance"),
    idempotency_key_reused: catalogPair("admin_this_request_key_was_already_used"),
    notification_failed: catalogPair("admin_could_not_send_the_notification"),
    store_not_found: catalogPair("admin_store_insertions_coupons_err_store_not_found"),
    invalid_distance_mode: catalogPair("admin_invalid_distance_policy_value"),
    invalid_store_id: catalogPair("admin_invalid_store_link"),
    order_not_found: catalogPair("admin_do_detail_not_found"),
    supabase_unconfigured: catalogPair("admin_server_configuration_error_contact_a_system"),
    db_error: catalogPair("admin_a_database_error_occurred_try_again"),
    // v4 W4 — 배달 광고·홈 구성 화면 오류 코드 (원문 노출 금지)
    stale_revision: catalogPair("admin_another_admin_saved_first_refresh_and"),
    quote_failed: catalogPair("admin_could_not_calculate_the_extension_cost"),
    extend_failed: catalogPair("admin_could_not_extend_the_period"),
    upload_failed: catalogPair("admin_could_not_upload_the_image"),
    replace_failed: catalogPair("admin_could_not_save_the_banner_creative"),
    remove_failed: catalogPair("admin_could_not_remove_the_banner_creative"),
    destination_failed: catalogPair("admin_could_not_save_the_destination"),
    create_failed: catalogPair("admin_could_not_create_the_ad"),
    not_banner: catalogPair("admin_this_is_not_a_banner_ad"),
    use_extension_flow: catalogPair("admin_to_extend_the_end_date_use"),
    // 배달 현장 (R4-D) — 자동 조치·경고·라이더
    kill_switch_off: catalogPair("admin_auto_actions_are_stopped_allow_them"),
    not_pending: catalogPair("admin_this_auto_action_was_already_handled"),
    event_not_open: catalogPair("admin_the_linked_alert_is_already_closed"),
    max_retries: catalogPair("admin_no_retries_left"),
    auto_action_effect_failed: catalogPair("admin_the_decision_was_recorded_but_the"),
    not_failed: catalogPair("admin_only_failed_auto_actions_can_be"),
    not_found: catalogPair("admin_not_found_refresh_and_check_again"),
    rpc_missing: catalogPair("admin_this_feature_is_not_ready_on"),
    schema_missing: catalogPair("admin_this_feature_is_not_ready_on"),
    bad_action: catalogPair("admin_unsupported_recovery_action"),
    concurrent_recovery: catalogPair("admin_the_same_recovery_is_already_running"),
    retype_required: catalogPair("admin_the_confirmation_text_did_not_match"),
    stale_version: catalogPair("admin_another_admin_edited_this_first_refresh"),
    dangerous_action_requires_approval: catalogPair("admin_hold_reassign_mute_auto_actions_must"),
    auto_action_requires_type_and_delay: catalogPair("admin_set_an_action_type_and_a"),
    rule_not_found: catalogPair("admin_rule_not_found_refresh"),
    event_not_found: catalogPair("admin_alert_not_found_refresh"),
    acknowledge_requires_open: catalogPair("admin_only_open_alerts_can_be_acknowledged"),
    mute_requires_open_or_ack: catalogPair("admin_only_open_or_acknowledged_alerts_can"),
    cannot_edit_resolved: catalogPair("admin_resolved_alerts_cannot_be_edited"),
    same_rider: catalogPair("admin_that_is_the_current_rider"),
    rider_changed: catalogPair("admin_the_rider_assignment_changed_meanwhile_refresh"),
    rider_already_assigned: catalogPair("admin_another_rider_is_already_assigned_use"),
    delivery_already_delivered: catalogPair("admin_this_order_is_already_delivered"),
    order_terminal_blocks_delivery: catalogPair("admin_the_order_is_closed_so_delivery"),
    order_status_blocks_dispatch: catalogPair("admin_the_current_order_status_does_not"),
    invalid_delivery_transition: catalogPair("admin_not_allowed_for_the_current_delivery"),
    release_not_applicable_for_status: catalogPair("admin_cannot_release_for_the_current_delivery"),
    rider_not_found: catalogPair("admin_rider_not_found"),
    rider_offline: catalogPair("admin_the_rider_is_offline_allow_offline"),
    rider_suspended: catalogPair("admin_suspended_riders_cannot_be_assigned"),
    rider_paused: catalogPair("admin_this_rider_s_assignments_are_paused"),
    invalid_rule_number: catalogPair("admin_minutes_levels_must_be_numbers_of"),
    invalid_price: catalogPair("admin_enter_a_price_of_0_or"),
    invalid_name: catalogPair("admin_product_name_must_be_1_120"),
    store_name_required: catalogPair("admin_store_name_must_be_at_least"),
    invalid_phone: catalogPair("admin_invalid_phone_number"),
    // 매장 주소·위치 (ADDR bundle F)
    store_location_inconsistent: catalogPair("admin_save_the_store_address_and_map"),
    store_delivery_requires_canonical_geo: catalogPair("admin_delivery_needs_the_store_location_map"),
    invalid_lat: catalogPair("admin_invalid_latitude_90_to_90"),
    invalid_lng: catalogPair("admin_invalid_longitude_180_to_180"),
    // 광고 초안 삭제 규칙 (AL-02 · 보완 설계 §4-3)
    // DS-6 (2026-11-04): 배달 자체 배너 목적지 — 매장이 있으면 그 매장 화면 3종, 없으면 이벤트·배달 안 화면만
    invalid_destination: catalogPair("admin_check_the_destination_with_a_store"),
    delete_not_allowed: catalogPair("admin_this_ad_has_exposure_payment_or"),
    delete_blocked_funding_secured: catalogPair("admin_paid_cash_is_held_for_this"),
    not_draft: catalogPair("admin_only_drafts_can_be_deleted"),
    not_admin_direct: catalogPair("admin_only_operator_registered_ads_can_be"),
    // 배달 광고 종료 (AL-04 · D-13)
    fault_required: catalogPair("admin_choose_who_is_responsible_for_ending"),
    already_ended: catalogPair("admin_this_ad_has_already_ended_refresh"),
    campaign_not_found: catalogPair("admin_ad_not_found_refresh_and_check"),
    // OS 시작 화면 로고 검사 (lib/os-launch/contract.ts checkOsLaunchLogo) — 화면이 `os_launch_logo_` 를 붙여 넘긴다
    os_launch_logo_no_alpha: catalogPair("admin_os_launch_err_no_alpha"),
    os_launch_logo_not_png: catalogPair("admin_os_launch_err_not_png"),
    os_launch_logo_too_small: catalogPair("admin_os_launch_err_too_small"),
    os_launch_logo_too_big_dimensions: catalogPair("admin_os_launch_err_too_big_dimensions"),
    os_launch_logo_too_large: catalogPair("admin_os_launch_err_too_large"),
    os_launch_logo_empty: catalogPair("admin_os_launch_err_empty"),
  };
  if (known[key]) return ko ? known[key].ko : known[key].en;
  if (OPERATOR_LABELS[key]) return adminOperatorLabel(key, ko);
  const status = ADMIN_HTTP_STATUS_CODE[key];
  if (status) return adminHttpStatusErrorMessage(status, ko);
  if (isAdminNetworkErrorText(key)) return ko ? known.network_error.ko : known.network_error.en;
  if (isAdminOperatorSentence(key)) return key;
  // 그 외(모르는 코드·DB/런타임 원문)는 화면에 그대로 보이지 않는다 — 원문은 AdminTechDetails 로만 (재설계 R3).
  // 성공·부분 성공 결과문은 이 함수에 넣지 않는다 (오류 전용).
  return tx(ko, ADMIN_GENERIC_FAILURE_KEY);
}

const ADMIN_GENERIC_FAILURE_KEY: MessageKey = "admin_operator_ux_generic_failure";

/** 오류 맵 (수정 계획 2-5) — HTTP 상태별 고정 문구. 코드가 없거나 모르는 코드일 때 상태로 문구를 정한다. */
const ADMIN_HTTP_STATUS_MESSAGES: Record<number, { ko: string; en: string }> = {
  401: catalogPair("admin_sign_in_required_sign_in_again"),
  403: catalogPair("admin_you_do_not_have_permission_for"),
  404: catalogPair("admin_not_found_refresh_and_check_again"),
  409: catalogPair("admin_another_admin_changed_this_first_refresh"),
  422: catalogPair("admin_invalid_input_check_the_values"),
  429: catalogPair("admin_too_many_requests_refresh_shortly"),
  500: catalogPair("admin_server_error_refresh_shortly_to_check"),
};

/** API 가 상태 대신 보내는 코드 → HTTP 상태 (오류 맵 공용). */
const ADMIN_HTTP_STATUS_CODE: Record<string, number> = {
  unauthorized: 401,
  login_required: 401,
  conflict: 409,
  invalid_input: 422,
  validation_failed: 422,
  rate_limited: 429,
  too_many_requests: 429,
  server_error: 500,
  internal_error: 500,
};

/** HTTP 상태 → 오류 맵 문구. 5xx 는 500 문구, 그 외 모르는 상태는 일반 실패 문구. */
export function adminHttpStatusErrorMessage(status: number | null | undefined, ko: boolean): string {
  const n = Number(status);
  const row = ADMIN_HTTP_STATUS_MESSAGES[n] ?? (n >= 500 && n < 600 ? ADMIN_HTTP_STATUS_MESSAGES[500] : null);
  if (row) return ko ? row.ko : row.en;
  return tx(ko, ADMIN_GENERIC_FAILURE_KEY);
}

/** 브라우저 네트워크 실패 원문 (fetch TypeError 등). */
export function isAdminNetworkErrorText(raw: string | null | undefined): boolean {
  return /failed to fetch|networkerror|network request failed|err_network|timed? ?out/i.test(String(raw ?? ""));
}

/**
 * 운영자용 문장(한글)으로 이미 작성된 메시지만 그대로 보인다.
 * DB·런타임 원문(영문 오류, SQL·제약 이름, 스택)은 문장으로 보지 않는다.
 */
export function isAdminOperatorSentence(raw: string | null | undefined): boolean {
  const s = String(raw ?? "").trim();
  if (!/[가-힣]/.test(s)) return false;
  return !/\b(?:violates|constraint|relation|column|syntax error|duplicate key|permission denied|PGRST\d+|JWT|TypeError|ReferenceError|undefined|null value)\b|"[a-z_]+_(?:pkey|key|fkey|check)"|\bat \S+:\d+/i.test(s);
}

/** 오류 맵에 없는 값(모르는 코드·DB/런타임 원문)인지 — 이때 화면 문구는 일반 실패 문구 또는 HTTP 상태 문구. */
export function isAdminUnmappedError(raw: string | null | undefined): boolean {
  const key = String(raw ?? "").trim();
  if (!key) return true;
  return adminOperatorErrorMessage(key, true) === tx(true, ADMIN_GENERIC_FAILURE_KEY);
}

/** 충돌 코드(stale_updated_at / stale_policy) → "stale_reloaded", 그 외는 그대로. 결과 배너처럼 코드만 받는 UI 용. */
export function adminConflictReloadedCode(raw: string | null | undefined): string {
  const key = String(raw ?? "").trim();
  return key === "stale_updated_at" || key === "stale_policy" ? "stale_reloaded" : key;
}

/**
 * 저장 충돌(409 stale_updated_at / stale_policy) 후 화면이 최신 데이터를 이미 다시 불러온 경우의 안내.
 * 그 외 코드는 adminOperatorErrorMessage 와 동일.
 */
export function adminConflictReloadedMessage(raw: string | null | undefined, ko: boolean): string {
  const key = String(raw ?? "").trim();
  return adminOperatorErrorMessage(adminConflictReloadedCode(key), ko);
}

export function adminAdsEligibilityNote(
  eligibility: string | null | undefined,
  ko: boolean
): string {
  const e = String(eligibility ?? "").trim();
  if (!e) return "";
  if (/organic ranking/i.test(e) || /store sponsored/i.test(e)) {
    return tx(ko, "admin_operator_ux_separate_from_organic_ranking_admin_review");
  }
  if (/payment\s*!=\s*approval/i.test(e) || /payment≠approval/i.test(e) || /payment != approval/i.test(e)) {
    return tx(ko, "admin_operator_ux_payment_alone_is_not_approval_admin");
  }
  if (/requires admin approval/i.test(e) || /WAITING_ADMIN/i.test(e)) {
    return tx(ko, "admin_operator_ux_admin_review_required");
  }
  if (/BANNER product/i.test(e) || /Placement Map/i.test(e)) {
    return tx(ko, "admin_operator_ux_check_banner_creative_and_placement_on");
  }
  if (/NOT_ELIGIBLE|not eligible/i.test(e)) {
    return tx(ko, "admin_operator_ux_not_currently_eligible_for_customer_exposure");
  }
  // Avoid dumping long English developer notes
  if (/[=≠>]/.test(e) || /_[A-Z]/.test(e) || e.length > 80) {
    return tx(ko, "admin_operator_ux_see_detail_for_processing_conditions");
  }
  return adminOperatorLabel(e, ko);
}

export function adminFinancePrimaryCta(
  type: string,
  ko: boolean
): string {
  switch (type) {
    case "point_charge":
      return tx(ko, "admin_operator_ux_review_point_top_up");
    case "cash_topup":
      return tx(ko, "admin_operator_ux_review_cash_top_up");
    case "settlement":
      return tx(ko, "admin_operator_ux_review_settlement");
    case "fee_obligation":
      return tx(ko, "admin_operator_ux_review_unpaid_fee");
    case "coin_withdrawal":
      return tx(ko, "admin_operator_ux_review_withdrawal");
    case "refund":
      return tx(ko, "admin_operator_ux_review_refund");
    default:
      return tx(ko, "admin_operator_ux_review");
  }
}

export function adminDisplayApplicantLabel(label: string, ko: boolean): string {
  return adminRecentTitle(label, tx(ko, "admin_operator_ux_ad_application"), "Ad application", ko);
}
