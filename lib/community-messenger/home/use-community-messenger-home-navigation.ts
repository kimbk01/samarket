"use client";

import { useCallback } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  communityMessengerRoomHref,
  type MessengerRoomListSource,
} from "@/lib/community-messenger/messenger-entry-origin";
import { runMessengerViewTransition } from "@/lib/community-messenger/messenger-view-transition";
import {
  chipToInboxKind,
  messengerChatFiltersToSearchParams,
  type MessengerChatInboxFilter,
  type MessengerChatKindFilter,
  type MessengerChatListChip,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";

function roomListSourceFromPillar(pillar: "trade" | "delivery" | null | undefined): MessengerRoomListSource {
  if (pillar === "trade") return "trade";
  if (pillar === "delivery") return "delivery";
  return "inbox";
}

type Args = {
  router: AppRouterInstance;
  chatInboxFilter: MessengerChatInboxFilter;
  chatKindFilter: MessengerChatKindFilter;
  resetMessengerTransientUi: () => void;
  setMainSection: (next: MessengerMainSection) => void;
  setChatInboxFilter: (next: MessengerChatInboxFilter) => void;
  setChatKindFilter: (next: MessengerChatKindFilter) => void;
  /** 거래/배달 전용 서브 라우트일 때 방 URL 에 `cm_list` 부착 */
  pillar?: "trade" | "delivery" | null;
  /** 방 진입 시 `?from=` 유지 */
  messengerEntryOrigin?: string | null;
};

export function useCommunityMessengerHomeNavigation({
  router,
  chatInboxFilter,
  chatKindFilter,
  resetMessengerTransientUi,
  setMainSection,
  setChatInboxFilter,
  setChatKindFilter,
  pillar = null,
  messengerEntryOrigin = null,
}: Args) {
  const replaceMessengerSectionUrl = useCallback(
    (section: MessengerMainSection, inbox: MessengerChatInboxFilter, kind: MessengerChatKindFilter) => {
      const qs = new URLSearchParams();
      qs.set("section", section);
      if (section === "chats") {
        const extra = messengerChatFiltersToSearchParams(inbox, kind);
        extra.forEach((v, k) => qs.set(k, v));
      }
      const nextUrl = `/community-messenger?${qs.toString()}`;
      if (typeof window !== "undefined") {
        const cur = `${window.location.pathname}${window.location.search}`;
        if (cur === nextUrl) return;
      }
      void router.replace(nextUrl, { scroll: false });
    },
    [router]
  );

  const navigateToCommunityRoom = useCallback(
    (roomId: string) => {
      const id = String(roomId ?? "").trim();
      if (!id) return;
      const listSource = roomListSourceFromPillar(pillar);
      const dest = communityMessengerRoomHref(id, messengerEntryOrigin, listSource);
      runMessengerViewTransition(() => {
        router.push(dest);
      }, "room-forward");
    },
    [router, pillar, messengerEntryOrigin]
  );

  const onPrimarySectionChange = useCallback(
    (next: MessengerMainSection) => {
      resetMessengerTransientUi();
      setMainSection(next);
      if (next === "chats") {
        replaceMessengerSectionUrl("chats", chatInboxFilter, chatKindFilter);
      } else {
        replaceMessengerSectionUrl(next, chatInboxFilter, chatKindFilter);
      }
    },
    [chatInboxFilter, chatKindFilter, replaceMessengerSectionUrl, resetMessengerTransientUi, setMainSection]
  );

  const onChatListChipChange = useCallback(
    (chip: MessengerChatListChip) => {
      resetMessengerTransientUi();
      const { inbox, kind } = chipToInboxKind(chip);
      setChatInboxFilter(inbox);
      setChatKindFilter(kind);
      replaceMessengerSectionUrl("chats", inbox, kind);
    },
    [replaceMessengerSectionUrl, resetMessengerTransientUi, setChatInboxFilter, setChatKindFilter]
  );

  return {
    navigateToCommunityRoom,
    replaceMessengerSectionUrl,
    onPrimarySectionChange,
    onChatListChipChange,
  };
}
