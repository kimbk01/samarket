"use client";

import { useMemo } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  communityMessengerMessageSearchText,
  extractHttpUrls,
  looksLikeDirectImageUrl,
} from "@/components/community-messenger/room/community-messenger-room-helpers";

/**
 * 방 메시지 배열에서 파생되는 검색·갤러리·링크·표시 목록 — UI 본체와 분리해 의존·테스트 단위를 고정한다.
 */
export function useMessengerRoomDerivedMessageLists(
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>,
  hiddenCallStubIds: Set<string>,
  roomSearchQuery: string
) {
  const messageSearchResults = useMemo(() => {
    const q = roomSearchQuery.trim().toLowerCase();
    const base = roomMessages.filter((m) => m.messageType !== "system");
    if (!q) return base;
    return base.filter((m) => {
      const preview = communityMessengerMessageSearchText(m);
      const hay = `${m.senderLabel} ${preview}`.toLowerCase();
      return hay.includes(q);
    });
  }, [roomMessages, roomSearchQuery]);

  const { mediaGalleryMessages, photoMessageCount } = useMemo(() => {
    const mediaGalleryMessages: Array<CommunityMessengerMessage & { pending?: boolean }> = [];
    let photoMessageCount = 0;
    for (const m of roomMessages) {
      const t = m.messageType;
      if (t === "image") {
        photoMessageCount += 1;
        mediaGalleryMessages.push(m);
        continue;
      }
      if (t === "voice" || t === "sticker") {
        mediaGalleryMessages.push(m);
        continue;
      }
      if (t === "text" && looksLikeDirectImageUrl(m.content)) {
        photoMessageCount += 1;
        mediaGalleryMessages.push(m);
      }
    }
    return { mediaGalleryMessages, photoMessageCount };
  }, [roomMessages]);

  const linkThreadMessages = useMemo(() => {
    return roomMessages.filter((m) => {
      if (m.messageType === "system" || m.messageType === "call_stub" || m.messageType === "file") return false;
      return extractHttpUrls(m.content).length > 0;
    });
  }, [roomMessages]);

  const displayRoomMessages = useMemo(
    () => roomMessages.filter((m) => !(m.messageType === "call_stub" && hiddenCallStubIds.has(m.id))),
    [roomMessages, hiddenCallStubIds]
  );

  const fileMessages = useMemo(() => roomMessages.filter((m) => m.messageType === "file"), [roomMessages]);

  const managementEventMessages = useMemo(
    () =>
      roomMessages
        .filter((m) => m.messageType === "system" && m.content.trim())
        .slice(-5)
        .reverse(),
    [roomMessages]
  );

  const voiceMessageCount = useMemo(() => roomMessages.filter((m) => m.messageType === "voice").length, [roomMessages]);

  const fileMessageCount = fileMessages.length;
  const linkMessageCount = linkThreadMessages.length;

  return {
    messageSearchResults,
    mediaGalleryMessages,
    linkThreadMessages,
    displayRoomMessages,
    fileMessages,
    managementEventMessages,
    photoMessageCount,
    voiceMessageCount,
    fileMessageCount,
    linkMessageCount,
  };
}
