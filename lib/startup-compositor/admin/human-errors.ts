/**
 * REBUILD 14 P6 — map canonical validation failures to Owner-facing Korean.
 * Never surface raw codes like invalid_document:invalid_motion:SLIDE_LEFT.
 */

const REASON_KO: Record<string, string> = {
  authoring_not_object: "문서 형식이 올바르지 않습니다.",
  authoring_schema_unsupported: "지원하지 않는 문서 버전입니다.",
  authoring_document_id_invalid: "문서 식별자가 올바르지 않습니다.",
  authoring_title_invalid: "이름을 입력해 주세요.",
  authoring_content_class_invalid: "콘텐츠 구분이 올바르지 않습니다.",
  authoring_draft_version_invalid: "초안 버전이 올바르지 않습니다.",
  authoring_intro_missing: "인트로 내용이 없습니다.",
  system_start_missing: "시스템 시작 설정이 없습니다.",
  system_start_background_color_invalid: "시스템 시작 배경색을 확인해 주세요.",
  system_start_min_visible_ms_invalid: "시스템 시작 최소 표시 시간을 확인해 주세요.",
  system_start_brand_size_invalid: "브랜드 크기(S/M/L)를 확인해 주세요.",
  system_start_brand_geometry_invalid: "브랜드 위치를 확인해 주세요.",
  system_start_brand_media_required: "브랜드를 켜려면 로고 이미지를 선택해 주세요.",
  intro_invalid: "인트로 내용을 확인해 주세요.",
  apply_requires_saved_draft: "저장한 뒤에 서비스 적용할 수 있습니다.",
  apply_unsaved_divergence: "저장되지 않은 변경이 있습니다. 먼저 저장해 주세요.",
  apply_forbidden_content_class_QA: "QA 문서는 서비스에 적용할 수 없습니다.",
  apply_forbidden_content_class_SYSTEM_BOOTSTRAP:
    "시스템 부트스트랩은 서비스에 적용할 수 없습니다.",
  apply_forbidden_content_class: "이 문서는 서비스에 적용할 수 없습니다.",
  staging_integrity_fail: "패키지 무결성 검증에 실패했습니다. 이전 서비스 버전을 유지합니다.",
  staging_empty: "적용할 준비가 된 버전이 없습니다.",
  package_seal_failed: "패키지 생성에 실패했습니다. 이전 서비스 버전을 유지합니다.",
  save_in_flight: "저장이 진행 중입니다. 잠시 후 다시 시도해 주세요.",
  apply_in_flight: "서비스 적용이 진행 중입니다. 잠시 후 다시 시도해 주세요.",
  motion_transition_token_forbidden:
    "장면 전환 효과는 요소 등장 효과로 사용할 수 없습니다.",
  motion_unsupported: "지원하지 않는 등장 효과입니다.",
  raw_url_cta_forbidden: "주소(URL)를 직접 입력할 수 없습니다. 이동 대상을 목록에서 선택해 주세요.",
  media_gif_preview_capability_false:
    "GIF는 미리보기에서 공유 타임라인으로 제어되지 않아 지금은 선택할 수 없습니다.",
  media_mp4_preview_capability_false:
    "MP4는 미리보기 재생 계약이 확인되기 전이라 지금은 선택할 수 없습니다.",
  last_scene_required: "장면은 최소 하나 이상 필요합니다.",
};

export function humanizeAuthoringError(reason: string): string {
  if (REASON_KO[reason]) return REASON_KO[reason];
  if (reason.startsWith("apply_forbidden_content_class:")) {
    const cls = reason.slice("apply_forbidden_content_class:".length);
    return (
      REASON_KO[`apply_forbidden_content_class_${cls}`] ??
      REASON_KO.apply_forbidden_content_class
    );
  }
  if (reason.startsWith("invalid_cta_action")) {
    return REASON_KO.raw_url_cta_forbidden;
  }
  if (reason.startsWith("invalid_motion:")) {
    return "요소 등장 효과를 확인해 주세요.";
  }
  if (reason.startsWith("invalid_transition:") || reason.startsWith("bad_transition")) {
    return "장면 전환 효과를 확인해 주세요.";
  }
  if (reason.startsWith("staging_content_class_forbidden:")) {
    return REASON_KO.apply_forbidden_content_class;
  }
  // Never echo raw technical codes to Owner UI.
  return "입력 내용을 확인해 주세요.";
}
