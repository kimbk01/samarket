import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** Server-side community messenger copy (default locale until request lang is threaded). */
export function cmServiceT(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(DEFAULT_APP_LANGUAGE, key, vars);
}

export function cmProfileFallbackLabel(fallbackId: string): string {
  return cmServiceT("cm_svc_member_fallback", {
    id: fallbackId.replace(/-/g, "").slice(0, 6),
  });
}

export function cmSenderDisplayLabel(senderId: string, viewerId: string, peerLabel: string): string {
  if (senderId === viewerId) return cmServiceT("common_me");
  if (!senderId) return cmServiceT("cm_svc_system");
  return peerLabel || cmProfileFallbackLabel(senderId);
}

export function cmGroupTitleFallback(memberCount: number): string {
  return cmServiceT("cm_svc_group_members", { count: memberCount });
}

export function cmGroupTitleWithPeers(labels: string[], peerCount: number, memberCount: number): string {
  if (!labels.length) return cmGroupTitleFallback(memberCount);
  if (peerCount > labels.length) {
    return cmServiceT("cm_svc_group_and_more", {
      labels: labels.join(", "),
      extra: peerCount - labels.length,
    });
  }
  return labels.join(", ");
}

export function cmOpenGroupRoomTitle(): string {
  return cmServiceT("cm_svc_open_group_room");
}

export function cmDirectRoomSubtitleFallback(): string {
  return cmServiceT("cm_svc_direct_subtitle");
}

export function cmOpenGroupRoomSubtitle(count: number): string {
  return cmServiceT("cm_svc_open_group_subtitle", { count });
}

export function cmGroupRoomSubtitle(count: number): string {
  return cmServiceT("cm_svc_group_subtitle", { count });
}

export function cmRoomLastMessagePlaceholder(roomType: "direct" | "group"): string {
  return roomType === "direct"
    ? cmServiceT("cm_svc_last_msg_direct")
    : cmServiceT("cm_svc_last_msg_group");
}

export function cmPeerFallbackLabel(): string {
  return cmServiceT("cm_svc_peer_fallback");
}

export function cmTradePostTitleFallback(): string {
  return cmServiceT("community_no_title");
}

export function cmSvcUserDefaultLabel(): string {
  return cmServiceT("cm_svc_user_default");
}

export function cmSvcDeletedMessagePreview(): string {
  return cmServiceT("cm_svc_deleted_message");
}

export function cmMessagePreviewFallback(content: string, maxLen = 120): string {
  const c = content.trim();
  if (c.length > maxLen) return `${c.slice(0, maxLen - 3)}…`;
  return c || cmServiceT("cm_svc_message_default");
}

export function cmRoomSnapshotDescription(input: {
  roomType: string;
  summary: string | null | undefined;
  memberCount: number;
}): string {
  if (input.roomType === "direct") return cmServiceT("cm_svc_room_desc_direct");
  if (input.summary?.trim()) return input.summary.trim();
  const visibility =
    input.roomType === "open_group"
      ? cmServiceT("cm_svc_room_vis_open")
      : cmServiceT("cm_svc_room_vis_private");
  return cmServiceT("cm_svc_room_desc_group", {
    count: input.memberCount,
    visibility,
  });
}

export function cmLastPreviewVoice(): string {
  return cmServiceT("cm_home_preview_voice");
}

export function cmLastPreviewImage(): string {
  return cmServiceT("cm_home_preview_photo");
}

export function cmLastPreviewFile(fileName?: string): string {
  const name = (fileName ?? "").trim();
  return name
    ? cmServiceT("cm_home_preview_file_named", { name })
    : cmServiceT("cm_home_preview_file");
}

export function cmLastPreviewSticker(): string {
  return cmServiceT("cm_svc_sticker_preview");
}

export function cmLastPreviewCall(content?: string): string {
  const detail = (content ?? "").trim();
  return detail
    ? cmServiceT("cm_home_preview_call_named", { detail })
    : cmServiceT("cm_home_preview_call");
}

export function cmLastPreviewNotification(content?: string): string {
  return (content ?? "").trim() || cmServiceT("cm_svc_notification_preview");
}

export function cmLastPreviewPhotoAlbum(count: number): string {
  return count > 1
    ? cmServiceT("cm_svc_photos_album_preview", { count })
    : cmLastPreviewImage();
}

/** 레거시 한글 placeholder·현재 locale fallback 모두 약한 제목으로 본다. */
export function isWeakTradeMessengerHeadline(headline: string | null | undefined): boolean {
  const h = (headline ?? "").trim();
  if (!h) return true;
  if (h === "거래" || h === "제목 없음") return true;
  if (h === cmServiceT("cm_ui_trade_headline_fallback")) return true;
  if (h === cmTradePostTitleFallback()) return true;
  return false;
}
