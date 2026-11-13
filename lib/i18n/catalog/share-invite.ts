/**
 * 초대 랜딩 비회원 화면 문구 (Owner G-7 2026-11-14 「초대 랜딩만 최소 정보 공개」).
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §D-6 · G-7 · 시안 4절.
 */
import { DIBAY_SERVICE_BRAND as B } from "../../brand/dibay-service-brand";

export const shareInviteMessages = {
  ko: {
    share_invite_kind_moim: `${B.CREW} 모임 초대`,
    share_invite_kind_group: `${B.LETARING} 그룹 채팅 초대`,
    share_invite_members: "멤버 {count}명",
    share_invite_members_one: "멤버 1명",
    share_invite_approval_note: "참여하려면 승인이 필요해요",
    share_invite_login_cta: "로그인하고 참여하기",
    share_invite_expired_title: "초대 링크가 만료되었어요",
    share_invite_expired_body: "초대한 사람에게 새 링크를 받아 주세요.",
  },
  en: {
    share_invite_kind_moim: `${B.CREW} invite`,
    share_invite_kind_group: `${B.LETARING} group chat invite`,
    share_invite_members: "{count} members",
    share_invite_members_one: "1 member",
    share_invite_approval_note: "Joining needs approval",
    share_invite_login_cta: "Log in to join",
    share_invite_expired_title: "This invite link has expired",
    share_invite_expired_body: "Ask the person who invited you for a new link.",
  },
} as const;
