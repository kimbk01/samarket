"use client";

import { useMemo } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  communityMessengerMessageSearchText,
  extractHttpUrls,
  looksLikeDirectImageUrl,
} from "@/components/community-messenger/room/community-messenger-room-helpers";

type RoomMsg = CommunityMessengerMessage & { pending?: boolean };

/**
 * 방 메시지 배열에서 파생되는 검색·갤러리·링크·표시 목록 — UI 본체와 분리해 의존·테스트 단위를 고정한다.
 *
 * `roomMessages` 변경 시 **단일 순회**로 파생 배열·카운트를 채워, 타임라인·가상화 직전 구간의 CPU를 줄인다.
 */
export function useMessengerRoomDerivedMessageLists(
  roomMessages: Array<RoomMsg>,
  hiddenCallStubIds: Set<string>,
  roomSearchQuery: string
) {
  const derived = useMemo(() => {
    const q = roomSearchQuery.trim().toLowerCase();

    const messageSearchBase: RoomMsg[] = [];
    const displayRoomMessages: RoomMsg[] = [];
    const mediaGalleryMessages: RoomMsg[] = [];
    const linkThreadMessages: RoomMsg[] = [];
    const fileMessages: RoomMsg[] = [];
    const systemWithTrimmedContent: RoomMsg[] = [];

    let photoMessageCount = 0;
    let voiceMessageCount = 0;

    for (const m of roomMessages) {
      if (m.messageType !== "system") {
        messageSearchBase.push(m);
      }

      if (!(m.messageType === "call_stub" && hiddenCallStubIds.has(m.id))) {
        displayRoomMessages.push(m);
      }

      const t = m.messageType;
      if (t === "image") {
        photoMessageCount += 1;
        mediaGalleryMessages.push(m);
      } else if (t === "voice" || t === "sticker") {
        mediaGalleryMessages.push(m);
      } else if (t === "text" && looksLikeDirectImageUrl(m.content)) {
        photoMessageCount += 1;
        mediaGalleryMessages.push(m);
      }

      if (t !== "system" && t !== "call_stub" && t !== "file") {
        if (extractHttpUrls(m.content).length > 0) {
          linkThreadMessages.push(m);
        }
      }

      if (t === "file") {
        fileMessages.push(m);
      }

      if (t === "system" && m.content.trim()) {
        systemWithTrimmedContent.push(m);
      }

      if (t === "voice") {
        voiceMessageCount += 1;
      }
    }

    const messageSearchResults: RoomMsg[] = (() => {
      if (!q) return messageSearchBase;
      return messageSearchBase.filter((m) => {
        const preview = communityMessengerMessageSearchText(m);
        const hay = `${m.senderLabel} ${preview}`.toLowerCase();
        return hay.includes(q);
      });
    })();

    const managementEventMessages = systemWithTrimmedContent.slice(-5).reverse();

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
  }, [roomMessages, hiddenCallStubIds, roomSearchQuery]);

  return derived;
}
