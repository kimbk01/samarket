import type { AppLanguageCode } from "@/lib/i18n/config";
import type {
  CommunityMessengerMessage,
  CommunityMessengerRoomSnapshot,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { buildRoomBoundMissedCallNotificationInput } from "@/lib/community-messenger/call-authority/call-missed-notification-authority";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import { buildMessageNotificationDisplay } from "@/lib/notifications/display/build-message-notification-display";
import {
  resolveContextLabelFromMeta,
  resolveEffectiveRoomKind,
} from "@/lib/notifications/display/message-notification-room-kind";

/**
 * §14-11 M-B1 — 앱 안 메시지 배너 문구. OS 푸시(`notification_events` title/body)와 같은 함수로 만든다.
 * 내용을 알 수 없으면 null — 내용 없는 배너(「새 메시지가 도착했습니다」)는 띄우지 않는다.
 */
export type MessengerInAppBannerContent = {
  title: string;
  preview: string;
  avatarUrl: string | null;
};

/** 프리패치 스냅샷의 최신 수신 메시지가 이보다 오래되면 이번 알림의 메시지가 아니다. */
const BANNER_MESSAGE_MAX_AGE_MS = 120_000;

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function roomContext(room: CommunityMessengerRoomSummary) {
  const roomKind = resolveEffectiveRoomKind({
    chatDomain: room.chatDomain ?? null,
    roomType: room.roomType,
    directKey: room.messengerDirectKey ?? null,
  });
  const contextLabel = resolveContextLabelFromMeta(
    room.contextMeta ?? parseCommunityMessengerRoomContextMeta(room.summary)
  );
  return { roomKind, contextLabel };
}

function latestIncomingMessage(
  snapshot: CommunityMessengerRoomSnapshot,
  viewerUserId: string,
  nowMs: number
): CommunityMessengerMessage | null {
  let best: CommunityMessengerMessage | null = null;
  let bestAt = -Infinity;
  for (const m of snapshot.messages) {
    if (m.isMine || m.pending || !m.senderId || m.senderId === viewerUserId) continue;
    if (m.messageType === "system" || trimText(m.deletedForEveryoneAt)) continue;
    const at = Date.parse(m.createdAt);
    if (!Number.isFinite(at) || at < bestAt) continue;
    best = m;
    bestAt = at;
  }
  if (!best) return null;
  /** call_stub 은 세션 시작 시각이 createdAt — 부재중 판정까지 벨 시간만큼 늦게 도착한다. */
  if (best.messageType !== "call_stub" && nowMs - bestAt > BANNER_MESSAGE_MAX_AGE_MS) return null;
  return best;
}

export function buildMessengerInAppBannerContentFromSnapshot(args: {
  snapshot: CommunityMessengerRoomSnapshot;
  viewerUserId: string;
  language: AppLanguageCode;
  chatPreviewEnabled: boolean;
  nowMs?: number;
}): MessengerInAppBannerContent | null {
  const { snapshot, viewerUserId, language } = args;
  const message = latestIncomingMessage(snapshot, viewerUserId, args.nowMs ?? Date.now());
  if (!message) return null;
  const sender = snapshot.members.find((p) => p.id === message.senderId);
  const senderName = trimText(sender?.label) || trimText(message.senderLabel);
  const avatarUrl = trimText(sender?.avatarUrl) || null;
  const room = snapshot.room;

  if (message.messageType === "call_stub") {
    if (message.callStatus !== "missed") return null;
    const missed = buildRoomBoundMissedCallNotificationInput({
      recipientUserId: viewerUserId,
      roomId: room.id,
      callSessionId: trimText(message.callSessionId) || message.id,
      actorUserId: message.senderId ?? "",
      callKind: message.callKind === "video" ? "video" : "voice",
      callerDisplayName: senderName,
      chatDomain: room.chatDomain ?? null,
    });
    return { title: missed.title, preview: trimText(missed.body), avatarUrl };
  }

  const { roomKind, contextLabel } = roomContext(room);
  const display = buildMessageNotificationDisplay({
    language,
    chatPreviewEnabled: args.chatPreviewEnabled,
    roomKind,
    messageType: message.messageType,
    textContent: message.content,
    sender: { displayName: senderName, avatarUrl },
    room: { name: trimText(room.title) || null, contextLabel },
    roomId: room.id,
    chatDomain: room.chatDomain ?? null,
  });
  return { title: display.title, preview: display.body, avatarUrl: display.senderAvatarUrl };
}

/** 스냅샷을 못 받았을 때 — 홈 목록 행(상대 이름·목록 미리보기). 미리보기 끔이면 내용 숨김. */
export function buildMessengerInAppBannerContentFromListRow(args: {
  row: CommunityMessengerRoomSummary;
  language: AppLanguageCode;
  chatPreviewEnabled: boolean;
}): MessengerInAppBannerContent | null {
  const { row } = args;
  const title = trimText(row.title);
  const lastMessage = trimText(row.lastMessage);
  if (!title || !lastMessage) return null;
  const display = buildMessageNotificationDisplay({
    language: args.language,
    chatPreviewEnabled: args.chatPreviewEnabled,
    roomKind: "direct",
    messageType: "text",
    textContent: lastMessage,
    sender: { displayName: title, avatarUrl: row.avatarUrl },
    room: { name: title, contextLabel: null },
    roomId: row.id,
  });
  return { title, preview: display.body, avatarUrl: trimText(row.avatarUrl) || null };
}
