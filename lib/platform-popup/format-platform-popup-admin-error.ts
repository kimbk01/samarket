
import { translateBy } from "@/lib/i18n/translate-by";/**
 * Map Platform Popup Admin API error codes → operator-facing copy.
 * Never surface raw codes like `cta_invalid:internal_path_required` in UI.
 */

export function formatPlatformPopupAdminError(
  code: string | null | undefined,
  lang: "ko" | "en"
): string {
  const raw = String(code ?? "").trim();
  if (!raw) {
    return translateBy(lang, "platform_popup_something_went_wrong");
  }

  const lower = raw.toLowerCase();
  if (lower === "cta_invalid:internal_path_required" || lower.endsWith(":internal_path_required")) {
    return translateBy(lang, "platform_popup_enter_an_in_app_path_for");
  }
  if (lower === "cta_invalid:external_url_required" || lower.endsWith(":external_url_required")) {
    return translateBy(lang, "platform_popup_enter_an_https_url_for_the");
  }
  if (lower === "cta_invalid:destination_id_required" || lower.endsWith(":destination_id_required")) {
    return translateBy(lang, "platform_popup_enter_the_destination_id_store_post");
  }
  if (lower.startsWith("cta_invalid:")) {
    return translateBy(lang, "platform_popup_click_destination_is_invalid_check_the");
  }
  if (lower === "timezone_invalid" || lower === "timezone_required") {
    return translateBy(lang, "platform_popup_the_time_zone_is_invalid_use");
  }
  if (lower === "surface_required") {
    return translateBy(lang, "platform_popup_select_at_least_one_placement");
  }
  if (lower === "stale_state") {
    return translateBy(lang, "platform_popup_this_popup_was_changed_by_someone");
  }
  if (lower === "cta_target_required" || lower.endsWith(":cta_target_required")) {
    return translateBy(lang, "platform_popup_enter_where_the_button_goes_after");
  }
  if (lower === "has_exposure_history") {
    return translateBy(lang, "platform_popup_this_ad_cannot_be_deleted_it");
  }
  if (lower === "partial_delete_failed") {
    return translateBy(lang, "platform_popup_only_some_items_were_deleted_check");
  }
  if (lower === "delete_check_failed") {
    return translateBy(lang, "platform_popup_could_not_check_exposure_records_so");
  }
  if (lower === "not_draft") {
    return translateBy(lang, "platform_popup_only_draft_popups_can_be_deleted");
  }
  if (lower === "not_admin_direct") {
    return translateBy(lang, "platform_popup_only_admin_direct_draft_popups_can");
  }
  if (lower === "name_required") {
    return translateBy(lang, "platform_popup_enter_a_campaign_name");
  }
  if (lower === "schedule_invalid") {
    return translateBy(lang, "platform_popup_end_time_must_be_after_start");
  }
  if (lower.includes("creative_mode_presentation_mismatch")) {
    return translateBy(lang, "platform_popup_this_image_type_does_not_match");
  }
  if (lower === "presentation_family_locked") {
    return translateBy(lang, "platform_popup_a_popup_cannot_be_changed_into");
  }
  if (lower === "ptr_band_too_small") {
    return translateBy(lang, "platform_popup_image_resolution_is_too_low");
  }
  if (lower.includes("creative_required")) {
    return translateBy(lang, "platform_popup_upload_the_phone_band_image_first");
  }
  if (lower === "ptr_default_band_required_live") {
    return translateBy(lang, "platform_popup_the_phone_band_is_required_while");
  }
  if (lower === "owner_campaign_copy_forbidden") {
    return translateBy(lang, "platform_popup_owner_requested_campaigns_cannot_be_copied");
  }
  if (lower === "load_failed" || lower === "save_failed") {
    return translateBy(lang, "platform_popup_could_not_save_try_again");
  }

  // Unknown codes: keep short human fallback (not the raw code as primary).
  return translateBy(lang, "platform_popup_could_not_complete_the_action_raw", { raw });
}
