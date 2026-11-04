/**
 * 광고 ② 수정 설계 구현 (Owner 「설계안대로 구현」 2026-11-04) — 인트로 문구. 뒤에 spread 되므로 같은 키는 이 파일 값이 우선한다.
 */
export const adsImpl1104IntroMessages = {
  ko: {
    // DS-8: 회원 금지 경로(/admin·/stores/owner)로 가는 CTA 저장 거부
    admin_launch_intro_err_cta_path_forbidden:
      "버튼 이동 경로로 관리자·사장님 화면(/admin·/stores/owner)은 쓸 수 없습니다. 회원이 볼 수 있는 앱 안 주소를 넣어 주세요.",
    // IN-A05: 손상 게시본 — 검사 코드 원문 대신 한국어 사유 ({error} 자리에 아래 사유 문구가 들어간다)
    admin_launch_intro_history_invalid: "손상됨 — {error} · 다시 게시할 수 없습니다",
    admin_launch_intro_invalid_reason_format: "게시본 형식 오류",
    admin_launch_intro_invalid_reason_unreadable: "게시본 문서를 읽을 수 없음",
    admin_launch_intro_invalid_reason_schema: "지원하지 않는 문서 버전",
    admin_launch_intro_invalid_reason_scenes: "장면 수·장면 목록 오류",
    admin_launch_intro_invalid_reason_scene_empty: "내용이 없는 장면이 있음",
    admin_launch_intro_invalid_reason_scene_id: "장면 번호 오류",
    admin_launch_intro_invalid_reason_layout: "장면 배치 설정 오류",
    admin_launch_intro_invalid_reason_background: "배경 설정 오류",
    admin_launch_intro_invalid_reason_image: "그림 정보 오류",
    admin_launch_intro_invalid_reason_video: "영상 정보 오류",
    admin_launch_intro_invalid_reason_text: "문구 설정 오류",
    admin_launch_intro_invalid_reason_decoration: "꾸밈 요소 오류",
    admin_launch_intro_invalid_reason_motion: "움직임·전환 설정 오류",
    admin_launch_intro_invalid_reason_duration: "장면 시간 오류",
    admin_launch_intro_invalid_reason_cta: "버튼 설정 오류",
    admin_launch_intro_invalid_reason_cta_path: "버튼 이동 경로 오류",
    admin_launch_intro_invalid_reason_cta_forbidden: "버튼이 관리자·사장님 화면으로 이동",
  },
  en: {
    admin_launch_intro_err_cta_path_forbidden:
      "Admin and store-owner screens (/admin, /stores/owner) cannot be used as the button path. Enter an in-app address members can open.",
    admin_launch_intro_history_invalid: "Broken — {error} · cannot be reactivated",
    admin_launch_intro_invalid_reason_format: "Publication format error",
    admin_launch_intro_invalid_reason_unreadable: "Publication document cannot be read",
    admin_launch_intro_invalid_reason_schema: "Unsupported document version",
    admin_launch_intro_invalid_reason_scenes: "Scene count or list error",
    admin_launch_intro_invalid_reason_scene_empty: "A scene has no content",
    admin_launch_intro_invalid_reason_scene_id: "Scene id error",
    admin_launch_intro_invalid_reason_layout: "Scene layout error",
    admin_launch_intro_invalid_reason_background: "Background settings error",
    admin_launch_intro_invalid_reason_image: "Image data error",
    admin_launch_intro_invalid_reason_video: "Video data error",
    admin_launch_intro_invalid_reason_text: "Text settings error",
    admin_launch_intro_invalid_reason_decoration: "Decoration error",
    admin_launch_intro_invalid_reason_motion: "Motion or transition error",
    admin_launch_intro_invalid_reason_duration: "Scene duration error",
    admin_launch_intro_invalid_reason_cta: "Button settings error",
    admin_launch_intro_invalid_reason_cta_path: "Button path error",
    admin_launch_intro_invalid_reason_cta_forbidden: "Button goes to an admin or store-owner screen",
  },
} as const;
