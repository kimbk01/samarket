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

import {
  buildMessengerArchiveHref,
  type MessengerArchiveEntry,
} from "@/lib/community-messenger/messenger-archive-route";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { parseCommunityMessengerRoomIdFromPathname } from "@/lib/community-messenger/messenger-room-pathname";
import { replaceMessengerUrlInPlace } from "@/lib/community-messenger/messenger-url-in-place";

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
  /**
   * ≥768 split list — 섹션 전환 시 `/rooms/[id]` 유지 (참고 메신저 우측 마지막 대화).
   * `tabletSplitListOnly` 일 때 true.
   */
  retainRoomPathOnSectionChange?: boolean;
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
  retainRoomPathOnSectionChange = false,
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
      const stickyRoomId =
        retainRoomPathOnSectionChange && typeof window !== "undefined"
          ? parseCommunityMessengerRoomIdFromPathname(window.location.pathname)
          : null;
      const basePath = stickyRoomId
        ? `/community-messenger/rooms/${encodeURIComponent(stickyRoomId)}`
        : "/community-messenger";
      const nextUrl = `${basePath}?${qs.toString()}`;
      if (typeof window !== "undefined") {
        const cur = `${window.location.pathname}${window.location.search}`;
        if (cur === nextUrl) return;
      }
      if (options?.history === "push") {
        void router.push(nextUrl, { scroll: false });
        return;
      }
      /** 채팅 P0-3: 탭 주소는 제자리 교체 — 서버 요청·페이지 다시 렌더 없음 (`messenger-url-in-place.ts`) */
      replaceMessengerUrlInPlace(nextUrl);
    },
    [retainRoomPathOnSectionChange, router]
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

  /**
   * 보관함 열기 (채팅 시안 4판 「4. 보관함」) — 대화 탭 맨 아래 「보관함」 줄(`chats`) · 친구 탭 「관리」·설정 「친구 관리」(`friends`).
   * 탭 전환(replace)과 달리 기록을 쌓는다(push) — 보관함 머리글 뒤로 = 들어온 탭으로 돌아감.
   */
  const openMessengerArchive = useCallback(
    (entry: MessengerArchiveEntry) => {
      pendingUserSectionRef.current = "archive";
      resetMessengerTransientUi({ bumpOverlayGeneration: false });
      setMainSection("archive");
      const from =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("from") : null;
      const nextUrl = buildMessengerArchiveHref({ entry, from });
      if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` === nextUrl) return;
      void router.push(nextUrl, { scroll: false });
    },
    [pendingUserSectionRef, resetMessengerTransientUi, router, setMainSection]
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
    openMessengerArchive,
  };
}
