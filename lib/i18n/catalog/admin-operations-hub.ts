/** Phase 11: components/admin/operations */
export const adminOperationsHubMessages = {
  ko: {
    admin_ops_hub_page_title: "운영 허브",
    admin_ops_hub_quarantine_banner:
      "ORPHAN / QUARANTINE · /admin/operations 은 레거시 링크 허브입니다. Domain SSOT 메뉴(Trade/Community/Delivery/Messenger)를 우선하세요.",
    admin_ops_hub_card_quick_links: "빠른 이동",
    admin_ops_hub_card_chat_backend: "채팅 조치 (백엔드)",
    admin_ops_hub_link_chats: "채팅 관리",
    admin_ops_hub_link_chats_desc: "거래·커뮤니티·비즈 등 방 목록 및 상세 조치",
    admin_ops_hub_link_reports: "신고",
    admin_ops_hub_link_reports_desc: "채팅·게시글 신고 검토",
    admin_ops_hub_link_posts: "게시글",
    admin_ops_hub_link_posts_desc: "커뮤니티 콘텐츠 점검",
    admin_ops_hub_link_comments: "댓글",
    admin_ops_hub_link_comments_desc: "댓글 문의·악성 댓글 대응",
    admin_ops_hub_link_users: "회원",
    admin_ops_hub_link_users_desc: "계정·제재 연계",
    admin_ops_hub_chat_backend_p1:
      "관리자 채팅 상세의 버튼은 POST /api/admin/chat/rooms/[id]/action 으로 처리됩니다. product_chats ID로 열어도 연결된 chat_rooms에 동일하게 반영됩니다.",
    admin_ops_hub_chat_backend_p2:
      "읽기 전용·관련 컬럼 오류 시 Supabase에 일반채팅 확장 마이그레이션(is_readonly, related_*) 적용 여부를 확인하세요.",
  },
  en: {
    admin_ops_hub_page_title: "Operations hub",
    admin_ops_hub_quarantine_banner:
      "ORPHAN / QUARANTINE · /admin/operations is a legacy link hub. Prefer Domain SSOT menus (Trade/Community/Delivery/Messenger).",
    admin_ops_hub_card_quick_links: "Quick links",
    admin_ops_hub_card_chat_backend: "Chat actions (backend)",
    admin_ops_hub_link_chats: "Chat management",
    admin_ops_hub_link_chats_desc: "Trade, community, biz rooms and moderation",
    admin_ops_hub_link_reports: "Reports",
    admin_ops_hub_link_reports_desc: "Review chat and post reports",
    admin_ops_hub_link_posts: "Posts",
    admin_ops_hub_link_posts_desc: "Community content review",
    admin_ops_hub_link_comments: "Comments",
    admin_ops_hub_link_comments_desc: "Comment inquiries and abuse",
    admin_ops_hub_link_users: "Members",
    admin_ops_hub_link_users_desc: "Accounts and sanctions",
    admin_ops_hub_chat_backend_p1:
      "Admin chat detail actions use POST /api/admin/chat/rooms/[id]/action. Opening via product_chats ID applies to the linked chat_rooms row.",
    admin_ops_hub_chat_backend_p2:
      "If readonly/related columns fail, verify Supabase migrations for is_readonly and related_* on general chat.",
  },
  
};
