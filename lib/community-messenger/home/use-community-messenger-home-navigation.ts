"use client";

import { useCallback, type MutableRefObject } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { runCommunityMessengerRoomForwardNavigation } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import { messengerRoomListSourceFromPathname } from "@/lib/community-messenger/messenger-entry-origin";
import {
  chipToInboxKind,
  messengerChatFiltersToSearchParams,
  type MessengerChatInboxFilter,
  type MessengerChatKindFilter,
  type MessengerChatListChip,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";

import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";

export type NavigateToCommunityRoomOptions = {
  viewerUserId?: string | null;
  roomForPrime?: CommunityMessengerRoomSummary | null;
};

type Args = {
  router: AppRouterInstance;
  mainSection: MessengerMainSection;
  chatInboxFilter: MessengerChatInboxFilter;
  chatKindFilter: MessengerChatKindFilter;
  resetMessengerTransientUi: MessengerResetTransientUiFn;
  setMainSection: (next: MessengerMainSection) => void;
  setChatInboxFilter: (next: MessengerChatInboxFilter) => void;
  setChatKindFilter: (next: MessengerChatKindFilter) => void;
  /** 현재 메신저 목록 URL — 거래·배달·인박스와 리스트 행의 `cm_list` 를 동일 규칙으로 맞춤 */
  pathname: string;
  /** 방 진입 시 `?from=` 유지 */
  messengerEntryOrigin?: string | null;
  /**
   * 사용자 탭이 소유한 section. URL sync 가 soft-nav 중간값으로
   * 두 번째 transition 을 시작하지 않도록 shell effect 와 공유한다.
   */
  pendingUserSectionRef: MutableRefObject<MessengerMainSection | null>;
};

export function useCommunityMessengerHomeNavigation({
  router,
  mainSection,
  chatInboxFilter,
  chatKindFilter,
  resetMessengerTransientUi,
  setMainSection,
  setChatInboxFilter,
  setChatKindFilter,
  pathname,
  messengerEntryOrigin = null,
  pendingUserSectionRef,
}: Args) {
  const replaceMessengerSectionUrl = useCallback(
    (
      section: MessengerMainSection,
      inbox: MessengerChatInboxFilter,
      kind: MessengerChatKindFilter,
      options?: { history?: "push" | "replace" }
    ) => {
      const qs = new URLSearchParams();
      qs.set("section", section);
      if (section === "chats") {
        const extra = messengerChatFiltersToSearchParams(inbox, kind);
        extra.forEach((v, k) => qs.set(k, v));
      }
      if (typeof window !== "undefined") {
        const from = new URLSearchParams(window.location.search).get("from")?.trim();
        if (from) qs.set("from", from);
      }
      const nextUrl = `/community-messenger?${qs.toString()}`;
      if (typeof window !== "undefined") {
        const cur = `${window.location.pathname}${window.location.search}`;
        if (cur === nextUrl) return;
      }
      const navigate = options?.history === "push" ? router.push.bind(router) : router.replace.bind(router);
      void navigate(nextUrl, { scroll: false });
    },
    [router]
  );

  const navigateToCommunityRoom = useCallback(
    (roomId: string, options?: NavigateToCommunityRoomOptions) => {
      const listSource = messengerRoomListSourceFromPathname(pathname);
      void runCommunityMessengerRoomForwardNavigation({
        router,
        roomId,
        listSource,
        fromEntryOrigin: messengerEntryOrigin,
        viewerUserId: options?.viewerUserId,
        roomForPrime: options?.roomForPrime,
      });
    },
    [router, pathname, messengerEntryOrigin]
  );

  const onPrimarySectionChange = useCallback(
    (next: MessengerMainSection) => {
      if (next === mainSection) return;
      // 클릭이 section·transition authority. URL replace 는 side effect.
      pendingUserSectionRef.current = next;
      resetMessengerTransientUi({ bumpOverlayGeneration: false });
      setMainSection(next);
      replaceMessengerSectionUrl(next, chatInboxFilter, chatKindFilter, { history: "replace" });
    },
    [
      chatInboxFilter,
      chatKindFilter,
      mainSection,
      pendingUserSectionRef,
      replaceMessengerSectionUrl,
      resetMessengerTransientUi,
      setMainSection,
    ]
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
