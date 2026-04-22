"use client";

import { useCallback } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  chipToInboxKind,
  messengerChatFiltersToSearchParams,
  type MessengerChatInboxFilter,
  type MessengerChatKindFilter,
  type MessengerChatListChip,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";

type Args = {
  router: AppRouterInstance;
  chatInboxFilter: MessengerChatInboxFilter;
  chatKindFilter: MessengerChatKindFilter;
  resetMessengerTransientUi: () => void;
  setMainSection: (next: MessengerMainSection) => void;
  setChatInboxFilter: (next: MessengerChatInboxFilter) => void;
  setChatKindFilter: (next: MessengerChatKindFilter) => void;
};

export function useCommunityMessengerHomeNavigation({
  router,
  chatInboxFilter,
  chatKindFilter,
  resetMessengerTransientUi,
  setMainSection,
  setChatInboxFilter,
  setChatKindFilter,
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
      router.push(`/community-messenger/rooms/${encodeURIComponent(id)}`);
    },
    [router]
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
