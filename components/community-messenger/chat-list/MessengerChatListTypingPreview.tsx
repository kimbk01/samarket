"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TypingIndicatorLine } from "@/components/community-messenger/TypingIndicatorLine";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";
import { useMessengerRealtimeStore } from "@/lib/community-messenger/stores/messenger-realtime-store";
import { selectMessengerTypingUserIdsKey } from "@/lib/community-messenger/realtime/typing/messenger-typing-select";
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
  viewerUserId,
  children,
}: {
  roomId: string;
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

  const typing = useMessengerTypingStore(
    (state) => selectMessengerTypingUserIdsKey(state.byRoomId, { roomId: rid, viewerUserId: viewer }) !== ""
  );

  return (
    <span ref={anchorRef} data-cm-list-typing={typing ? "1" : undefined}>
      {typing ? <TypingIndicatorLine label={t("cm_typing_direct")} /> : children}
    </span>
  );
});
