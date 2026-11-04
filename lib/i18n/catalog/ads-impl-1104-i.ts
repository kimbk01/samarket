/**
 * 광고 ② 수정 설계 구현 (Owner 「설계안대로 구현」 2026-11-04) — 인트로 문구. 뒤에 spread 되므로 같은 키는 이 파일 값이 우선한다.
 */
export const adsImpl1104IntroMessages = {
  ko: {
    // IN-N6 (2026-11-04): 「앱을 켤 때」 → 새로 실행할 때 (백그라운드 복귀·알림으로 열기는 인트로 없음)
    admin_launch_intro_total_hint: "앱을 새로 실행할 때 이 시간만큼 인트로가 보입니다. 짧을수록 사용자가 덜 지칩니다.",
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
    // IN-N6 (2026-11-04): 빈도 정본 — 인트로는 새로 실행(USER_COLD)일 때만. 백그라운드 복귀·알림으로 열기는 인트로 없음.
    admin_launch_intro_frequency_every_launch:
      "새로 실행할 때마다(완전히 종료 후 다시 켬 · 백그라운드 복귀·알림으로 열 때는 안 나옴)",
    admin_launch_intro_fit_landscape_note:
      "「꽉 채우기」는 세로 화면에서만 가장자리가 잘립니다. 가로 화면(태블릿·회전)에서는 그림 전체가 보이고 남는 양옆은 같은 그림을 흐리게 채웁니다.",
    admin_launch_intro_reduced_motion_note:
      "기기에서 「동작 줄이기」를 켠 사용자에게는 등장·둥실둥실 움직임이 꺼지고 장면 전환은 짧은 흐려짐으로 바뀝니다.",
  },
  en: {
    admin_launch_intro_total_hint: "On a fresh app launch the intro shows this long. Shorter is less tiring.",
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
    admin_launch_intro_frequency_every_launch:
      "Every fresh launch (fully closed, then opened again · not when returning from background or opening from a notification)",
    admin_launch_intro_fit_landscape_note:
      "'Fill' crops edges only in portrait. In landscape (tablet or rotated) the whole picture shows and the empty sides are filled with the same picture, blurred.",
    admin_launch_intro_reduced_motion_note:
      "For users with 'Reduce motion' on, enter and float motion are off and scene changes become a short fade.",
  },
} as const;
