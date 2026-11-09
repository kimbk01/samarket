/**
 * 매장 사장님 전용 운영 공지 (배달 오픈 4단계 · Owner 승인 설계 2026-11-10) — 어드민 「보는 사람」·알림 + 사장님 화면.
 * Spread into runtime MESSAGES + MessageKey only — NOT into adminMessages
 * (adminMessages 는 TS7056 선언 크기 한도 — 선례 `admin-trade-sold-window`).
 */
export const ownerAnnouncementsMessages = {
  ko: {
    admin_app_notice_audience_label: "보는 사람",
    admin_app_notice_audience_all: "전체 회원",
    admin_app_notice_audience_store_owners: "매장 사장님 전체(심사 중 포함)",
    admin_app_notice_audience_store_owners_approved: "승인 매장 사장님만",
    admin_app_notice_audience_owner_hint:
      "사장님 전용 공지는 회원 고객센터에 나오지 않고, 사장님 화면 「운영 공지」에만 나옵니다.",
    admin_app_notice_pinned: "운영 공지 목록 상단 고정",
    admin_app_notice_notify_owners: "저장 후 대상 사장님 전체에게 알림 보내기",
    admin_app_notice_notify_owners_hint:
      "슈퍼 관리자만 보낼 수 있습니다. 지금 게시 중인 글만 보내지며, 같은 공지는 사장님마다 한 번만 갑니다.",
    admin_app_notice_notify_owners_super_only: "알림 보내기는 슈퍼 관리자만 할 수 있습니다.",
    admin_app_notice_notify_owners_confirm_title: "사장님에게 알림 보내기",
    admin_app_notice_notify_owners_confirm_desc: "공지를 저장한 뒤 대상 사장님 전체에게 알림을 보냅니다.",
    admin_app_notice_notify_owners_result: "알림 발송 — 대상 {recipients}명 · 성공 {sent} · 실패 {failed}",
    admin_app_notice_notify_owners_failed: "공지는 저장됐지만 알림 발송에 실패했습니다 ({code}).",
    owner_announcements_title: "운영 공지",
    owner_announcements_desc: "DIBAY 가 사장님께 드리는 운영 안내",
    owner_announcements_empty: "아직 운영 공지가 없습니다.",
    owner_announcements_load_failed: "운영 공지를 불러오지 못했습니다.",
    owner_announcements_retry: "다시 불러오기",
    owner_announcements_pinned: "고정",
    owner_announcements_unread: "안 읽음",
    owner_announcements_view_all: "전체 보기",
    owner_announcements_not_found: "공지를 찾을 수 없습니다.",
    owner_announcements_back_to_list: "목록으로",
  },
  en: {
    admin_app_notice_audience_label: "Audience",
    admin_app_notice_audience_all: "All members",
    admin_app_notice_audience_store_owners: "All store owners (incl. under review)",
    admin_app_notice_audience_store_owners_approved: "Approved store owners only",
    admin_app_notice_audience_owner_hint:
      "Owner-only notices do not appear in the member Customer Center — only on the owner “Operations notices” screen.",
    admin_app_notice_pinned: "Pin to top of operations notices",
    admin_app_notice_notify_owners: "Notify all target owners after saving",
    admin_app_notice_notify_owners_hint:
      "Super admins only. Sent only while the notice is published; each owner gets it once per notice.",
    admin_app_notice_notify_owners_super_only: "Only super admins can send notifications.",
    admin_app_notice_notify_owners_confirm_title: "Notify store owners",
    admin_app_notice_notify_owners_confirm_desc: "Save the notice, then notify all target store owners.",
    admin_app_notice_notify_owners_result: "Notification — {recipients} owners · sent {sent} · failed {failed}",
    admin_app_notice_notify_owners_failed: "The notice was saved, but sending notifications failed ({code}).",
    owner_announcements_title: "Operations notices",
    owner_announcements_desc: "Operating updates from DIBAY for store owners",
    owner_announcements_empty: "No operations notices yet.",
    owner_announcements_load_failed: "Could not load operations notices.",
    owner_announcements_retry: "Reload",
    owner_announcements_pinned: "Pinned",
    owner_announcements_unread: "Unread",
    owner_announcements_view_all: "View all",
    owner_announcements_not_found: "Notice not found.",
    owner_announcements_back_to_list: "Back to list",
  },
} as const;
