/**
 * 커뮤니티 Admin 완성 (설계 v2) — 메뉴·화면·버튼 문구. admin.ts 뒤에 spread 되므로 같은 키는 이 파일 값이 우선한다.
 */
export const adminCommunityR4Messages = {
  ko: {
    // 공통 포인트 충전 목록 서버 페이지네이션 (admin.ts 추론 타입 한도 회피를 위해 이 카탈로그에 둔다)
    admin_points_charge_search_placeholder: "닉네임 · 입금자명 · 신청 번호",
    admin_points_charge_page_status: "{page}/{pages} 페이지",
    admin_points_charge_page_prev: "이전",
    admin_points_charge_page_next: "다음",
    // 모임·댓글 목록 검색·총 건수
    admin_community_list_total: "총 {count}건",
    admin_community_comments_search_label: "검색 (내용·작성자)",
    admin_community_comments_search_placeholder: "댓글 내용·작성자 닉네임·ID",
    // 게시글 상세 — 첨부 이미지 개별 삭제
    admin_community_post_images_heading: "첨부 이미지 {count}장",
    admin_community_post_image_delete: "이미지 삭제",
    admin_community_post_image_delete_title: "첨부 이미지 삭제",
    admin_community_post_image_delete_target: "삭제할 이미지",
    admin_community_post_image_delete_notice:
      "이 이미지를 글에서 뺍니다(본문 안 이미지 포함). 다른 곳에서 쓰지 않는 이미지 파일만 지우고, 수정 이력에 남은 이미지는 증거로 보관합니다. 작성자에게 관리자 수정 알림이 갑니다.",
    admin_community_post_image_delete_reason_placeholder: "예: 개인정보가 보이는 사진",
    admin_community_post_image_delete_done: "이미지를 삭제했습니다.",
    admin_community_post_image_delete_dirty: "저장하지 않은 본문 수정을 먼저 저장하거나 취소해 주세요.",
  },
  en: {
    admin_points_charge_search_placeholder: "Nickname · depositor · request ID",
    admin_points_charge_page_status: "Page {page} of {pages}",
    admin_points_charge_page_prev: "Prev",
    admin_points_charge_page_next: "Next",
    // Meetings / comments list search & totals
    admin_community_list_total: "{count} total",
    admin_community_comments_search_label: "Search (content · author)",
    admin_community_comments_search_placeholder: "Comment text, author nickname or ID",
    // Post detail — delete one attached image
    admin_community_post_images_heading: "{count} attached image(s)",
    admin_community_post_image_delete: "Delete image",
    admin_community_post_image_delete_title: "Delete attached image",
    admin_community_post_image_delete_target: "Image",
    admin_community_post_image_delete_notice:
      "Removes this image from the post (including inline body images). The file is deleted only if nothing else uses it; images kept in the edit history are retained as evidence. The author is notified of the admin edit.",
    admin_community_post_image_delete_reason_placeholder: "e.g. photo shows personal information",
    admin_community_post_image_delete_done: "Image deleted.",
    admin_community_post_image_delete_dirty: "Save or cancel the unsaved edit first.",
  },
} as const;
