import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";
import {
  communityMessengerRoomIsDelivery,
  communityMessengerRoomIsTrade,
} from "@/lib/community-messenger/messenger-room-domain";
import type {
  CommunityMessengerCallLog,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

const LEGACY_FILE_PREVIEW = new Set(["파일", "File"]);
const LEGACY_CALL_TOKEN = /통화|call/i;

function callKindLabel(callKind: CommunityMessengerCallLog["callKind"]): string {
  return translateCmUi(callKind === "video" ? "cm_home_call_video" : "cm_home_call_voice");
}

export function formatCmHomeCallDurationLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins < 1) return translateCmUi("cm_home_call_duration_secs", { secs });
  return translateCmUi("cm_home_call_duration_mins", {
    mins,
    secs: secs.toString().padStart(2, "0"),
  });
}

export function formatCallPreview(call: CommunityMessengerCallLog): string {
  const kindLabel = callKindLabel(call.callKind);
  if (call.status === "missed") return translateCmUi("cm_home_call_missed");
  if (call.status === "cancelled") {
    return translateCmUi("cm_home_call_cancelled", { kind: kindLabel });
  }
  if (call.status === "rejected") {
    return translateCmUi("cm_home_call_rejected", { kind: kindLabel });
  }
  if (call.durationSeconds > 0) {
    return translateCmUi("cm_home_call_with_duration", {
      kind: kindLabel,
      duration: formatCmHomeCallDurationLabel(call.durationSeconds),
    });
  }
  return translateCmUi("cm_home_call_ended", { kind: kindLabel });
}

export function getRoomTypeBadgeLabel(room: CommunityMessengerRoomSummary): string {
  if (room.roomType === "open_group") return translateCmUi("cm_home_badge_open");
  if (room.roomType === "private_group") return translateCmUi("cm_home_badge_group");
  if (room.contextMeta?.kind === "delivery") return translateCmUi("cm_home_badge_delivery");
  if (room.contextMeta?.kind === "trade") return translateCmUi("cm_home_badge_trade");
  if (communityMessengerRoomIsDelivery(room)) return translateCmUi("cm_home_badge_delivery");
  if (communityMessengerRoomIsTrade(room)) return translateCmUi("cm_home_badge_trade");
  return translateCmUi("cm_home_badge_direct");
}

function formatSystemPreview(value: string): string {
  const text = value.trim();
  if (!text) return translateCmUi("cm_home_sys_message");
  if (text.startsWith("공지 수정") || text.startsWith("공지 변경")) {
    return translateCmUi("cm_home_sys_notice_changed");
  }
  if (text === "공지 삭제" || text === "공지가 삭제되었습니다.") {
    return translateCmUi("cm_home_sys_notice_deleted");
  }
  if (text.startsWith("운영 권한 변경") || text === "그룹 권한이 변경되었습니다.") {
    return translateCmUi("cm_home_sys_permission_changed");
  }
  if (text.startsWith("관리자 지정")) return text;
  if (text.startsWith("관리자 해제")) return text;
  if (text.startsWith("방장 위임")) return text;
  if (text.startsWith("멤버 초대")) return text;
  if (text.startsWith("멤버보내기") || text.startsWith("멤버보내기")) return text;
  if (text.includes("주문") && (text.includes("접수") || text.includes("접수됨"))) {
    return translateCmUi("cm_home_sys_order_accepted");
  }
  if (text.includes("거래") && text.includes("제안")) {
    const m = text.match(/[\d,.\s]+[₱₩$€원]/);
    return m
      ? translateCmUi("cm_home_sys_trade_offer_amount", { amount: m[0].trim() })
      : translateCmUi("cm_home_sys_trade_offer");
  }
  return translateCmUi("cm_home_sys_message");
}

export function getRoomPreviewText(room: CommunityMessengerRoomSummary): string {
  const lastMessage = room.lastMessage?.trim();
  const lastMessageType = room.lastMessageType ?? "text";
  if (lastMessageType === "image") return translateCmUi("cm_home_preview_photo");
  if (lastMessageType === "voice") return translateCmUi("cm_home_preview_voice");
  if (lastMessageType === "file") {
    if (!lastMessage) return translateCmUi("cm_home_preview_file");
    return LEGACY_FILE_PREVIEW.has(lastMessage)
      ? translateCmUi("cm_home_preview_file")
      : translateCmUi("cm_home_preview_file_named", { name: lastMessage });
  }
  if (lastMessageType === "system") {
    return formatSystemPreview(lastMessage ?? "");
  }
  if (lastMessageType === "call_stub") {
    if (!lastMessage) return translateCmUi("cm_home_preview_call");
    return LEGACY_CALL_TOKEN.test(lastMessage)
      ? lastMessage
      : translateCmUi("cm_home_preview_call_named", { detail: lastMessage });
  }
  if (lastMessage) return lastMessage;
  const meta = room.contextMeta;
  if (meta?.headline) return meta.headline;
  const summary = room.summary?.trim();
  if (summary) {
    if (meta) return translateCmUi("cm_home_preview_check_message");
    if (summary[0] === "{") return translateCmUi("cm_home_preview_trade_order_guide");
    return summary;
  }
  return translateCmUi("cm_home_preview_no_messages");
}

export function cmStoreOrderHeadline(storeName: string, orderNo: string | null | undefined): string {
  const store = storeName.trim() || translateCmUi("cm_svc_store_fallback");
  const no = (orderNo ?? "").trim();
  return no
    ? translateCmUi("cm_svc_order_headline", { store, orderNo: no })
    : translateCmUi("cm_svc_order_headline_short", { store });
}

export function cmTradeFlowMessageBlockedCopy(): string {
  return translateCmUi("cm_svc_trade_flow_msg_blocked");
}

export function cmTradeSellerClosedCopy(): string {
  return translateCmUi("cm_svc_trade_seller_closed");
}

export function cmTradeSenderLeftCopy(): string {
  return translateCmUi("cm_svc_trade_sender_left");
}

export function cmTradeChatModeLockedCopy(): string {
  return translateCmUi("cm_svc_trade_chat_mode_locked");
}

export function cmMgmtMemberInviteContent(labels?: string): string {
  return labels
    ? translateCmUi("cm_svc_mgmt_member_invite_named", { labels })
    : translateCmUi("cm_svc_mgmt_member_invite");
}

export function cmMgmtNoticeContent(noticeText: string): string {
  const text = noticeText.trim();
  return text
    ? translateCmUi("cm_svc_mgmt_notice_edit", { text })
    : translateCmUi("cm_svc_mgmt_notice_delete");
}

export function cmMgmtPermissionsContent(): string {
  return translateCmUi("cm_svc_mgmt_permissions");
}

export function cmMgmtAdminRoleContent(nextRole: "admin" | "member", targetLabel?: string): string {
  if (nextRole === "admin") {
    return targetLabel
      ? translateCmUi("cm_svc_mgmt_admin_assign_named", { name: targetLabel })
      : translateCmUi("cm_svc_mgmt_admin_assign");
  }
  return targetLabel
    ? translateCmUi("cm_svc_mgmt_admin_revoke_named", { name: targetLabel })
    : translateCmUi("cm_svc_mgmt_admin_revoke");
}

export function cmMgmtOwnerTransferContent(targetLabel?: string): string {
  return targetLabel
    ? translateCmUi("cm_svc_mgmt_owner_transfer_named", { name: targetLabel })
    : translateCmUi("cm_svc_mgmt_owner_transfer");
}

export function cmMgmtMemberKickContent(targetLabel?: string): string {
  return targetLabel
    ? translateCmUi("cm_svc_mgmt_member_kick_named", { name: targetLabel })
    : translateCmUi("cm_svc_mgmt_member_kick");
}
