"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TypingIndicatorLine } from "@/components/community-messenger/TypingIndicatorLine";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";
import { useMessengerRealtimeStore } from "@/lib/community-messenger/stores/messenger-realtime-store";
import {
  selectMessengerTypingUserIdsKey,
  splitMessengerTypingUserIdsKey,
} from "@/lib/community-messenger/realtime/typing/messenger-typing-select";
import { resolveMessengerTypingLabel } from "@/lib/community-messenger/realtime/typing/resolve-messenger-typing-label";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import {
  observeMessengerChatListRowVisibility,
  requestMessengerChatListTypingSlot,
} from "@/lib/community-messenger/realtime/typing/messenger-chat-list-typing-slots";

/**
 * 대화 목록 행 미리보기 자리 — 상대가 입력 중이면 「입력 중」 + 점 (P3, 레거시 Telegram 대화 목록과 같은 자리).
 * 행이 화면에 보이는 동안만 수신 슬롯(최대 15방)을 잡고, 화면에서 빠지거나 언마운트되면 반납한다.
 */
export const MessengerChatListTypingPreview = memo(function MessengerChatListTypingPreview({
  roomId,
  roomType,
  viewerUserId,
  children,
}: {
  roomId: string;
  /** 그룹이면 레거시처럼 이름 규칙(1명·2명·2명 외 N명), 1:1 은 「입력 중」 */
  roomType: string;
  viewerUserId: string | null | undefined;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const rid = roomId.trim().toLowerCase();
  /** 행 props 에 본인 id 가 없는 화면(검색 등)은 실시간 저장소의 본인 id */
  const storeViewer = useMessengerRealtimeStore((state) => state.viewerUserId);
  const viewer = (viewerUserId ?? storeViewer ?? "").trim();

  useEffect(() => {
    const el = anchorRef.current;
    if (!el || !rid || !viewer) return;
    return observeMessengerChatListRowVisibility(el, setVisible);
  }, [rid, viewer]);

  useEffect(() => {
    if (!visible || !rid || !viewer) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    return requestMessengerChatListTypingSlot({ sb, roomId: rid, viewerUserId: viewer });
  }, [rid, viewer, visible]);

  const typingIdsKey = useMessengerTypingStore((state) =>
    selectMessengerTypingUserIdsKey(state.byRoomId, { roomId: rid, viewerUserId: viewer })
  );

  /**
   * 이름 = 목록 요약에는 멤버 이름이 없어 ① 방 스냅샷 캐시 멤버(별칭 우선) ② 실시간 저장소의 그 사람 메시지 발신자 이름 순.
   * 못 찾으면 resolver 가 「{N}명 입력 중」.
   */
  const label = useMemo(() => {
    const ids = splitMessengerTypingUserIdsKey(typingIdsKey);
    if (ids.length === 0) return null;
    const members = roomType === "direct" ? [] : peekRoomSnapshot(rid, viewer)?.members ?? [];
    const messages = roomType === "direct" ? [] : useMessengerRealtimeStore.getState().messagesByRoomId[rid] ?? [];
    return resolveMessengerTypingLabel({
      roomType,
      typingUserIds: ids,
      nameOf: (userId) => {
        const m = members.find((x) => x.id === userId);
        if (m) {
          if (m.identityMode === "alias" && m.aliasProfile?.displayName?.trim()) return m.aliasProfile.displayName.trim();
          if (m.label?.trim()) return m.label.trim();
        }
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const msg = messages[i]!;
          if (msg.senderId === userId && msg.senderLabel?.trim()) return msg.senderLabel.trim();
        }
        return null;
      },
      t,
    });
  }, [rid, roomType, t, typingIdsKey, viewer]);

  return (
    <span ref={anchorRef} data-cm-list-typing={label ? "1" : undefined}>
      {label ? <TypingIndicatorLine label={label} /> : children}
    </span>
  );
});
