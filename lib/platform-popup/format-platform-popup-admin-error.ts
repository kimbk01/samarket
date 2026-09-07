/**
 * Map Platform Popup Admin API error codes → operator-facing copy.
 * Never surface raw codes like `cta_invalid:internal_path_required` in UI.
 */

export function formatPlatformPopupAdminError(
  code: string | null | undefined,
  lang: "ko" | "en"
): string {
  const raw = String(code ?? "").trim();
  if (!raw) {
    return lang === "en" ? "Something went wrong." : "처리 중 오류가 발생했습니다.";
  }

  const lower = raw.toLowerCase();
  if (lower === "cta_invalid:internal_path_required" || lower.endsWith(":internal_path_required")) {
    return lang === "en"
      ? "Enter an in-app path for the click destination (example: /market)."
      : "클릭 후 이동 경로를 입력해 주세요. 예: /market";
  }
  if (lower === "cta_invalid:external_url_required" || lower.endsWith(":external_url_required")) {
    return lang === "en" ? "Enter an HTTPS URL for the external link." : "외부 링크 HTTPS 주소를 입력해 주세요.";
  }
  if (lower === "cta_invalid:destination_id_required" || lower.endsWith(":destination_id_required")) {
    return lang === "en"
      ? "Enter the destination ID (store / post / listing)."
      : "이동 대상 ID(매장·게시물·거래글)를 입력해 주세요.";
  }
  if (lower.startsWith("cta_invalid:")) {
    return lang === "en"
      ? "Click destination is invalid. Check the After-click settings."
      : "클릭 후 이동 설정이 올바르지 않습니다. 경로를 확인해 주세요.";
  }
  if (lower === "surface_required") {
    return lang === "en" ? "Select at least one placement." : "노출 위치를 하나 이상 선택해 주세요.";
  }
  if (lower === "not_draft") {
    return lang === "en"
      ? "Only draft popups can be deleted. Pause or end a live campaign instead."
      : "임시저장 팝업만 삭제할 수 있습니다. 노출 중이면 일시 중지 또는 종료를 사용하세요.";
  }
  if (lower === "not_admin_direct") {
    return lang === "en"
      ? "Only Admin Direct draft popups can be deleted here."
      : "Admin 직접 등록 임시저장 팝업만 삭제할 수 있습니다.";
  }
  if (lower === "name_required") {
    return lang === "en" ? "Enter a campaign name." : "캠페인 이름을 입력해 주세요.";
  }
  if (lower === "schedule_invalid") {
    return lang === "en" ? "End time must be after start time." : "종료 시각은 시작 시각보다 이후여야 합니다.";
  }
  if (lower === "load_failed" || lower === "save_failed") {
    return lang === "en" ? "Could not save. Try again." : "저장하지 못했습니다. 다시 시도해 주세요.";
  }

  // Unknown codes: keep short human fallback (not the raw code as primary).
  return lang === "en"
    ? `Could not complete the action (${raw}).`
    : `요청을 처리하지 못했습니다 (${raw}).`;
}
