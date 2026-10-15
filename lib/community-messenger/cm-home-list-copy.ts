import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";
import {
  formatCallStubRoomTipForViewer,
  isCallStubRoomTipToken,
} from "@/lib/community-messenger/call-stub-room-tip";
import { isCommunityMessengerStickerPublicPath } from "@/lib/stickers/sticker-content";
import {
  communityMessengerRoomIsDelivery,
  communityMessengerRoomIsTrade,
} from "@/lib/community-messenger/messenger-room-domain";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type {
  CommunityMessengerCallLog,
  CommunityMessengerMessageType,
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
  /**
   * 서버가 저장한 실제 시스템 문구(주문 요약·예약 상태·그룹 입퇴장 등)를 그대로 보인다.
   * 일괄 "시스템 메시지" 치환은 리스트에서 실제 내용을 숨겼다. 첫 줄만(여러 줄 요약 카드).
   */
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
  return firstLine || translateCmUi("cm_home_sys_message");
}

export function getRoomPreviewText(room: CommunityMessengerRoomSummary, viewerUserId?: string | null): string {
  const lastMessage = room.lastMessage?.trim();
  const lastMessageType = room.lastMessageType ?? "text";
  if (lastMessageType === "image") return translateCmUi("cm_home_preview_photo");
  if (lastMessageType === "voice") return translateCmUi("cm_home_preview_voice");
  if (lastMessageType === "file") {
    if (!lastMessage) return translateCmUi("cm_home_preview_file");
    /** Typed file tip may store fileName or legacy generic token — never treat as URL by extension. */
    if (/^https?:\/\//i.test(lastMessage) || lastMessage.startsWith("//")) {
      return translateCmUi("cm_home_preview_file");
    }
    return LEGACY_FILE_PREVIEW.has(lastMessage)
      ? translateCmUi("cm_home_preview_file")
      : translateCmUi("cm_home_preview_file_named", { name: lastMessage });
  }
  if (lastMessageType === "system") {
    /**
     * 방 생성 시 `last_message=''`·`last_message_type='system'` 이 기본값 — 메시지가 없는 방이다.
     * "시스템 메시지"로 표기하지 않고 아래 빈 방/컨텍스트 안내로 내려간다.
     */
    if (lastMessage) return formatSystemPreview(lastMessage);
  } else if (lastMessageType === "gift_certificate") {
    return translateCmUi("cm_home_preview_gift");
  } else if (lastMessageType === "sticker") {
    return translateCmUi("cm_home_preview_sticker");
  } else if (lastMessageType === "community_post_share") {
    return translateCmUi("cm_home_preview_post_share");
  }
  if (lastMessageType === "call_stub") {
    if (!lastMessage) return translateCmUi("cm_home_preview_call");
    /** 토큰 tip → viewer(발신/수신) 기준 문구(타임라인과 동일 계약). 레거시 라벨은 그대로. */
    const callText = formatCallStubRoomTipForViewer(lastMessage, viewerUserId);
    return LEGACY_CALL_TOKEN.test(callText)
      ? callText
      : translateCmUi("cm_home_preview_call_named", { detail: callText });
  }
  /** TEXT: show content as-is (including https://…jpg) — no URL→photo heuristic. */
  if (lastMessage && !parseCommunityMessengerRoomContextMeta(lastMessage)) {
    return lastMessage;
  }
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

/**
 * 도메인 리스트(거래·주문 canary 등) 행 previewText — 홈 리스트(`getRoomPreviewText`)와 동일 포맷터.
 * Realtime 행의 원문(`cmcall1|…` 토큰·스티커 경로·영문 상품권 content)을 viewer 기준 라벨로 바꾼다.
 */
export function formatCmListPreviewTextForViewer(
  input: { lastMessage: string | null | undefined; lastMessageType?: CommunityMessengerMessageType | null },
  viewerUserId?: string | null
): string {
  const room = {
    lastMessage: String(input.lastMessage ?? ""),
    lastMessageType: input.lastMessageType ?? "text",
  } as Pick<CommunityMessengerRoomSummary, "lastMessage" | "lastMessageType"> as CommunityMessengerRoomSummary;
  return getRoomPreviewText(room, viewerUserId);
}

/** `sticker://…` (레거시) 또는 `/stickers/…` 정적 경로 — 원문 노출 금지 대상. */
function looksLikeRawStickerContent(text: string): boolean {
  return text.startsWith("sticker://") || isCommunityMessengerStickerPublicPath(text);
}

/**
 * 렌더/통합 행 매핑 방어선 — 이미 저장된 previewText 가 원문 통화 토큰·스티커 URI 면
 * 같은 포맷터(`formatCmListPreviewTextForViewer`)로 라벨화. 그 외 텍스트는 그대로.
 */
export function guardRawCmListPreviewText(text: string | null | undefined, viewerUserId?: string | null): string {
  const raw = String(text ?? "");
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (isCallStubRoomTipToken(trimmed)) {
    return formatCmListPreviewTextForViewer({ lastMessage: trimmed, lastMessageType: "call_stub" }, viewerUserId);
  }
  if (looksLikeRawStickerContent(trimmed)) {
    return formatCmListPreviewTextForViewer({ lastMessage: trimmed, lastMessageType: "sticker" }, viewerUserId);
  }
  return raw;
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
