/**
 * 언어 재감사 2026-11-27 — notif 도메인 새 키 (설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md`).
 * ko·en 을 같은 키로 동시에 넣는다. 다른 카탈로그와 키가 겹치면 `check:i18n-quality` duplicate-key 실패.
 *
 * - `support_seed_*`: 고객센터 시작 메시지. ko 값은 저장 문장과 글자가 같아야 한다(옛 행 대응표가 이 값으로 찾는다).
 * - `point_desc_*`: 포인트 내역 설명. ko 값은 원장 `description` 저장 문장과 글자가 같아야 한다(§4-3 옛 행 457행 대응).
 */
export const reauditNotifMessages = {
  ko: {
    support_seed_opened: "문의를 시작했습니다.",
    support_seed_triage: "문의 접수 · {category}",
    support_seed_triage_issue: "문의 접수 · {category} · {issue}",
    point_desc_community_write: "커뮤니티 게시글 작성",
    point_desc_community_qna: "커뮤니티 질문 작성",
    point_desc_community_comment: "커뮤니티 댓글 작성",
    point_desc_community_board_fallback: "커뮤니티",
    point_desc_reward_random: "랜덤 {min}~{max}P 중 {base}P",
    point_desc_reward_fixed: "고정 {base}P",
    point_desc_ad_purchase: "{name} 광고 구매",
    point_desc_ad_apply_refund: "{name} 신청 실패 환불",
    point_desc_feed_ad_hold: "피드 광고 신청 — 포인트 보류",
    point_desc_feed_ad_hold_rollback: "피드 광고 신청 — 보류 행 생성 실패 환급",
    point_desc_feed_ad_release: "피드 광고 거절/취소 — 보류 해제",
    point_desc_feed_ad_capture: "피드 광고 승인 — {cost}P 확정",
    point_desc_feed_ad_comp_refund: "피드 광고 승인 실패 보상 — 확정 포인트 환급",
    point_desc_feed_ad_comp_release: "피드 광고 승인 실패 보상 — 보류 해제",
    point_desc_reward_write: "글쓰기 보상 ({board})",
    point_desc_reward_comment: "댓글 보상 ({board})",
    point_desc_admin_reason: "관리자 지급 사유: {reason}",
  },
  en: {
    support_seed_opened: "Inquiry started.",
    support_seed_triage: "Inquiry received · {category}",
    support_seed_triage_issue: "Inquiry received · {category} · {issue}",
    point_desc_community_write: "Community post",
    point_desc_community_qna: "Community question",
    point_desc_community_comment: "Community comment",
    point_desc_community_board_fallback: "Community",
    point_desc_reward_random: "{base}P (random {min}~{max}P)",
    point_desc_reward_fixed: "Fixed {base}P",
    point_desc_ad_purchase: "Ad purchase: {name}",
    point_desc_ad_apply_refund: "Refund: {name} request failed",
    point_desc_feed_ad_hold: "Feed ad request — points on hold",
    point_desc_feed_ad_hold_rollback: "Feed ad request — hold failed, refunded",
    point_desc_feed_ad_release: "Feed ad declined or canceled — hold released",
    point_desc_feed_ad_capture: "Feed ad approved — {cost}P charged",
    point_desc_feed_ad_comp_refund: "Feed ad approval failed — points refunded",
    point_desc_feed_ad_comp_release: "Feed ad approval failed — hold released",
    point_desc_reward_write: "Post reward ({board})",
    point_desc_reward_comment: "Comment reward ({board})",
    point_desc_admin_reason: "Admin reason: {reason}",
  },
} as const;
