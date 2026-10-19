/**
 * 채팅 Admin R1 — 권한·열람 감사·증거 보존 문구.
 */
export const adminChatR1AMessages = {
  ko: {
    admin_chat_r1_ghost_banner_title: "운영 열람 — 참여자에게 보이지 않음",
    admin_chat_r1_ghost_banner_body:
      "채팅 관리 권한(chats)이 있는 관리자만 볼 수 있습니다. 신고·거래·주문에 연결된 방은 바로 열람되고, 연결이 없는 1:1·그룹 방의 메시지는 최고 관리자가 사유(10자 이상)를 입력해야 열립니다. 모든 본문 열람은 서버 감사 기록에 남으며, 참여자로 추가되거나 읽음·발송·알림이 생기지 않습니다.",
    admin_chat_r1_content_locked_title: "메시지 본문 잠김",
    admin_chat_r1_content_locked_super_admin:
      "신고·거래·주문에 연결되지 않은 사적 방입니다. 메시지 본문은 최고 관리자만 사유를 입력하고 열람할 수 있습니다.",
    admin_chat_r1_content_locked_reason:
      "신고·거래·주문에 연결되지 않은 사적 방입니다. 열람 사유(10자 이상)를 입력하면 본문을 불러오며, 열람 기록이 남습니다.",
    admin_chat_r1_content_unlock_cta: "사유 입력 후 열람",
    admin_chat_r1_content_reason_prompt_title: "고스트 열람 사유",
    admin_chat_r1_content_reason_prompt_desc:
      "신고·법적 요청 번호와 열람 목적을 10자 이상 입력하세요. 감사 기록에 남습니다.",
    admin_chat_r1_content_reason_placeholder: "예: 법적 요청 2026-123 확인 목적",
    admin_chat_r1_content_reason_too_short: "사유는 10자 이상이어야 합니다.",
    admin_chat_r1_content_basis_linked_report: "열람 근거: 처리 중인 신고 연결",
    admin_chat_r1_content_basis_linked_trade: "열람 근거: 거래 채팅",
    admin_chat_r1_content_basis_linked_store_order: "열람 근거: 매장 주문 채팅",
    admin_chat_r1_content_basis_ghost: "열람 근거: 고스트 열람 (최고 관리자 사유 기록)",
    admin_chat_r1_ghost_action_view: "본문 열람",
    admin_chat_r1_reason_required: "처리 사유를 2자 이상 입력하세요.",
    admin_chat_r1_stale_state: "다른 관리자가 먼저 처리했거나 상태가 바뀌었습니다. 새로고침 후 다시 확인하세요.",
    admin_chat_r1_action_confirm_title: "채팅 조치 확인",
    admin_chat_r1_action_confirm_cta: "처리",
    admin_chat_r1_hard_delete_reason_title: "영구 삭제 사유",
    admin_chat_r1_hard_delete_reason_desc:
      "법적 요청 번호 등 삭제 사유를 10자 이상 입력하세요. 신고가 연결된 방은 증거 보존을 위해 삭제되지 않습니다.",
    admin_chat_r1_hard_delete_evidence_skipped: "신고 증거 보존 — 삭제 제외",
    admin_chat_r1_hard_delete_super_admin_only: "영구 삭제는 최고 관리자만 할 수 있습니다.",
  },
  en: {
    admin_chat_r1_ghost_banner_title: "Ops view — invisible to participants",
    admin_chat_r1_ghost_banner_body:
      "Only admins with the chat permission (chats) can open this page. Rooms linked to a report, trade, or store order open directly; messages in unlinked direct/group rooms require a super admin and a reason (10+ characters). Every content view is audited on the server; you are never added as a participant and no read, send, or notification happens.",
    admin_chat_r1_content_locked_title: "Message content locked",
    admin_chat_r1_content_locked_super_admin:
      "This private room is not linked to a report, trade, or order. Only a super admin can view its messages, with a reason.",
    admin_chat_r1_content_locked_reason:
      "This private room is not linked to a report, trade, or order. Enter a reason (10+ characters) to load messages; the view is audited.",
    admin_chat_r1_content_unlock_cta: "Enter reason and view",
    admin_chat_r1_content_reason_prompt_title: "Ghost view reason",
    admin_chat_r1_content_reason_prompt_desc:
      "Enter the report or legal request number and purpose (10+ characters). It is recorded in the audit log.",
    admin_chat_r1_content_reason_placeholder: "e.g. Legal request 2026-123 review",
    admin_chat_r1_content_reason_too_short: "The reason must be at least 10 characters.",
    admin_chat_r1_content_basis_linked_report: "View basis: open report linked",
    admin_chat_r1_content_basis_linked_trade: "View basis: trade chat",
    admin_chat_r1_content_basis_linked_store_order: "View basis: store order chat",
    admin_chat_r1_content_basis_ghost: "View basis: ghost view (super admin reason recorded)",
    admin_chat_r1_ghost_action_view: "Content view",
    admin_chat_r1_reason_required: "Enter a reason of at least 2 characters.",
    admin_chat_r1_stale_state: "Another admin already handled this or the state changed. Refresh and check again.",
    admin_chat_r1_action_confirm_title: "Confirm chat action",
    admin_chat_r1_action_confirm_cta: "Apply",
    admin_chat_r1_hard_delete_reason_title: "Permanent delete reason",
    admin_chat_r1_hard_delete_reason_desc:
      "Enter the deletion reason, such as a legal request number (10+ characters). Rooms linked to reports are kept to preserve evidence.",
    admin_chat_r1_hard_delete_evidence_skipped: "Report evidence preserved — not deleted",
    admin_chat_r1_hard_delete_super_admin_only: "Only a super admin can permanently delete.",
  },
} as const;
