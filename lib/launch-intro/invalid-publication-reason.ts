/**
 * 광고 ② IN-A05 — 손상 게시본(저장된 문서가 검사를 통과하지 못한 게시본)의 검사 코드 → 한국어 사유 문구 키.
 * 어드민 게시본 목록이 검사 코드 원문(`scene_empty` 등)을 화면에 보이지 않게 한다.
 * 표에 없는 코드는 모두 「게시본 형식 오류」. Pure module.
 */

export type LaunchIntroInvalidReasonKey =
  | "admin_launch_intro_invalid_reason_format"
  | "admin_launch_intro_invalid_reason_unreadable"
  | "admin_launch_intro_invalid_reason_schema"
  | "admin_launch_intro_invalid_reason_scenes"
  | "admin_launch_intro_invalid_reason_scene_empty"
  | "admin_launch_intro_invalid_reason_scene_id"
  | "admin_launch_intro_invalid_reason_layout"
  | "admin_launch_intro_invalid_reason_background"
  | "admin_launch_intro_invalid_reason_image"
  | "admin_launch_intro_invalid_reason_video"
  | "admin_launch_intro_invalid_reason_text"
  | "admin_launch_intro_invalid_reason_decoration"
  | "admin_launch_intro_invalid_reason_motion"
  | "admin_launch_intro_invalid_reason_duration"
  | "admin_launch_intro_invalid_reason_cta"
  | "admin_launch_intro_invalid_reason_cta_path"
  | "admin_launch_intro_invalid_reason_cta_forbidden";

/** 정확히 맞는 코드 표 (검사기 `validateLaunchIntroDocument` · `splitStoredLaunchIntroPublication` 이 내는 코드) */
export const LAUNCH_INTRO_INVALID_REASON_TABLE: Readonly<Record<string, LaunchIntroInvalidReasonKey>> = {
  publication_document_unreadable: "admin_launch_intro_invalid_reason_unreadable",
  document_invalid: "admin_launch_intro_invalid_reason_format",
  settings_invalid: "admin_launch_intro_invalid_reason_format",
  schema_version_unknown: "admin_launch_intro_invalid_reason_schema",
  scenes_invalid: "admin_launch_intro_invalid_reason_scenes",
  scenes_count_invalid: "admin_launch_intro_invalid_reason_scenes",
  scene_invalid: "admin_launch_intro_invalid_reason_scenes",
  scene_empty: "admin_launch_intro_invalid_reason_scene_empty",
  scene_id_invalid: "admin_launch_intro_invalid_reason_scene_id",
  scene_id_duplicate: "admin_launch_intro_invalid_reason_scene_id",
  layout_invalid: "admin_launch_intro_invalid_reason_layout",
  layout_logo_requires_logo: "admin_launch_intro_invalid_reason_layout",
  media_fit_invalid: "admin_launch_intro_invalid_reason_layout",
  background_invalid: "admin_launch_intro_invalid_reason_background",
  text_align_invalid: "admin_launch_intro_invalid_reason_text",
  decorations_invalid: "admin_launch_intro_invalid_reason_decoration",
  decoration_asset_missing: "admin_launch_intro_invalid_reason_decoration",
  decoration_size_invalid: "admin_launch_intro_invalid_reason_decoration",
  decoration_slot_invalid: "admin_launch_intro_invalid_reason_decoration",
  motion_invalid: "admin_launch_intro_invalid_reason_motion",
  transition_invalid: "admin_launch_intro_invalid_reason_motion",
  duration_invalid: "admin_launch_intro_invalid_reason_duration",
  cta_label_invalid: "admin_launch_intro_invalid_reason_cta",
  cta_action_invalid: "admin_launch_intro_invalid_reason_cta",
  cta_next_on_last_scene: "admin_launch_intro_invalid_reason_cta",
  cta_path_invalid: "admin_launch_intro_invalid_reason_cta_path",
  cta_path_forbidden: "admin_launch_intro_invalid_reason_cta_forbidden",
};

/** 앞부분이 같은 검사 코드 묶음 (필드 이름이 앞에 붙는 코드: `image_sha_invalid`, `headline_too_long` …) */
const PREFIX_TABLE: ReadonlyArray<readonly [RegExp, LaunchIntroInvalidReasonKey]> = [
  [/^image_[a-z_]+$/, "admin_launch_intro_invalid_reason_image"],
  [/^video_[a-z_]+$/, "admin_launch_intro_invalid_reason_video"],
  [/^(headline|supporting)_[a-z_]+$/, "admin_launch_intro_invalid_reason_text"],
  [/^background_[a-z_]+$/, "admin_launch_intro_invalid_reason_background"],
  [/^decorations?_[a-z_]+$/, "admin_launch_intro_invalid_reason_decoration"],
  [/^(media|logo)_[a-z_]+$/, "admin_launch_intro_invalid_reason_layout"],
];

export function launchIntroInvalidPublicationReasonKey(code: unknown): LaunchIntroInvalidReasonKey {
  const c = typeof code === "string" ? code.split(":")[0]!.trim() : "";
  if (!c) return "admin_launch_intro_invalid_reason_format";
  const exact = Object.prototype.hasOwnProperty.call(LAUNCH_INTRO_INVALID_REASON_TABLE, c)
    ? LAUNCH_INTRO_INVALID_REASON_TABLE[c]
    : undefined;
  if (exact) return exact;
  for (const [re, key] of PREFIX_TABLE) if (re.test(c)) return key;
  return "admin_launch_intro_invalid_reason_format";
}
