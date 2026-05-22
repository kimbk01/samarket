"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { MainTier1ExtrasState } from "@/contexts/MainTier1ExtrasContext";
import { useEffect, useLayoutEffect, useMemo } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  isCommunityMessengerIncomingCallBannerEnabled,
  isCommunityMessengerIncomingCallSoundEnabled,
  readCommunityMessengerLocalSettings,
  type CommunityMessengerLocalSettings,
} from "@/lib/community-messenger/preferences";
import { RECENT_SEARCHES_STORAGE_KEY } from "@/lib/community-messenger/home/community-messenger-home-constants";
import {
  readDismissedCommunityMessengerNotificationIds,
} from "@/lib/community-messenger/community-messenger-home-notification-dismiss-storage";
import {
  fetchMeNotificationSettingsSnapshot,
} from "@/lib/me/fetch-me-notification-settings-client";
import { scheduleStartupApiDeferred } from "@/lib/http/startup-api-scheduler";
import {
  messengerSectionLabel,
  resolveMessengerChatFilters,
  resolveMessengerSection,
  type MessengerChatInboxFilter,
  type MessengerChatKindFilter,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";
import {
  inferMessengerEntryOriginFromReferrer,
  messengerEntryOriginBackHref,
  parseMessengerEntryOrigin,
  persistMessengerEntryOrigin,
  readStoredMessengerEntryOrigin,
  type MessengerEntryOrigin,
} from "@/lib/community-messenger/messenger-entry-origin";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";
import type {
  MessengerNotificationSettings,
  FriendSheetState,
} from "@/lib/community-messenger/home/community-messenger-home-types";

type Args = {
  router: AppRouterInstance;
  searchParams: ReadonlyURLSearchParams;
  setMainTier1Extras: ((next: MainTier1ExtrasState | null) => void) | null | undefined;
  headerActionsNode: ReactNode;
  roomActionSheetOpen: boolean;
  setRoomActionSheet: Dispatch<SetStateAction<unknown>>;
  setOpenedMenuItemId: Dispatch<SetStateAction<string | null>>;
  setIncomingCallSoundEnabled: Dispatch<SetStateAction<boolean>>;
  setIncomingCallBannerEnabled: Dispatch<SetStateAction<boolean>>;
  setLocalSettings: Dispatch<SetStateAction<CommunityMessengerLocalSettings>>;
  setRecentSearches: Dispatch<SetStateAction<string[]>>;
  recentSearches: string[];
  setDismissedNotificationIds: Dispatch<SetStateAction<string[]>>;
  openSettingsSheet: () => void;
  setMainSection: Dispatch<SetStateAction<MessengerMainSection>>;
  setChatInboxFilter: Dispatch<SetStateAction<MessengerChatInboxFilter>>;
  setChatKindFilter: Dispatch<SetStateAction<MessengerChatKindFilter>>;
  setNotificationSettings: Dispatch<SetStateAction<MessengerNotificationSettings>>;
  data: CommunityMessengerBootstrap | null;
  /** `/philife` 헤더 푸시 스택: URL `section` 동기화·1단 `rightSlot` 은 별도 처리 */
  fromPhilifeHeaderStack?: boolean;
  mainSection: MessengerMainSection;
  /**
   * 거래/배달 전용 서브 라우트 모드.
   * - `null` 이면 인박스: `?from=community|trade|delivery` 로 1단 헤더 뒤로가기 분기.
   * - `"trade" | "delivery"` 면 1단 헤더 제목을 「거래 채팅」/「배달 채팅」 으로,
   *   뒤로가기는 메신저 인박스(`/community-messenger?section=chats` + `?from` 보존).
   */
  pillar?: "trade" | "delivery" | null;
};

export function useCommunityMessengerHomeShellEffects({
  router,
  searchParams,
  setMainTier1Extras,
  headerActionsNode,
  roomActionSheetOpen,
  setRoomActionSheet,
  setOpenedMenuItemId,
  setIncomingCallSoundEnabled,
  setIncomingCallBannerEnabled,
  setLocalSettings,
  setRecentSearches,
  recentSearches,
  setDismissedNotificationIds,
  openSettingsSheet,
  setMainSection,
  setChatInboxFilter,
  setChatKindFilter,
  setNotificationSettings,
  data,
  fromPhilifeHeaderStack = false,
  mainSection,
  pillar = null,
}: Args): void {
  useEffect(() => {
    if (!roomActionSheetOpen) return;
    const handleViewportChange = () => {
      setRoomActionSheet(null);
      setOpenedMenuItemId((current) => (current?.startsWith("room:menu:") ? null : current));
    };
    window.addEventListener("resize", handleViewportChange);
    return () => window.removeEventListener("resize", handleViewportChange);
  }, [roomActionSheetOpen, setOpenedMenuItemId, setRoomActionSheet]);

  useEffect(() => {
    setIncomingCallSoundEnabled(isCommunityMessengerIncomingCallSoundEnabled());
    setIncomingCallBannerEnabled(isCommunityMessengerIncomingCallBannerEnabled());
    setLocalSettings(readCommunityMessengerLocalSettings());
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            setRecentSearches(
              parsed
                .map((item) => (typeof item === "string" ? item.trim() : ""))
                .filter(Boolean)
                .slice(0, 8)
            );
          }
        }
      } catch {
        /* ignore */
      }
      setDismissedNotificationIds(readDismissedCommunityMessengerNotificationIds());
    }
  }, [
    setDismissedNotificationIds,
    setIncomingCallBannerEnabled,
    setIncomingCallSoundEnabled,
    setLocalSettings,
    setRecentSearches,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(recentSearches.slice(0, 8)));
    } catch {
      /* ignore */
    }
  }, [recentSearches]);

  useEffect(() => {
    if (fromPhilifeHeaderStack) return;
    const tab = searchParams.get("tab");
    if (tab === "settings") {
      openSettingsSheet();
      router.replace("/community-messenger?section=chats", { scroll: false });
      return;
    }
    if (tab === "friends") {
      setMainSection("friends");
      router.replace("/community-messenger?section=friends", { scroll: false });
      return;
    }
    const section = searchParams.get("section");
    const filter = searchParams.get("filter");
    const kind = searchParams.get("kind");
    setMainSection(resolveMessengerSection(section ?? undefined, tab ?? undefined));
    const { inbox, kind: nextKind } = resolveMessengerChatFilters(filter ?? undefined, kind ?? undefined, tab ?? undefined);
    setChatInboxFilter(inbox);
    setChatKindFilter(nextKind);
  }, [
    searchParams,
    router,
    openSettingsSheet,
    setChatInboxFilter,
    setChatKindFilter,
    setMainSection,
    fromPhilifeHeaderStack,
  ]);

  const entryOrigin: MessengerEntryOrigin = useMemo(
    () => parseMessengerEntryOrigin(searchParams.get("from")),
    [searchParams]
  );

  /**
   * 진입 출처(`?from=`) 가 비어 있고 인박스(메신저 홈 + 거래/배달 서브 라우트) 마운트 직후라면,
   * referrer 가 같은 origin 의 `/community`·`/stores` 일 때 `?from=community|delivery` 를 1회 주입한다.
   *
   * 명시적 `?from=` 이 있으면 그대로 존중(`parseMessengerEntryOrigin` 가 우선).
   * 새창·딥링크에서는 referrer 가 비어 영향이 없다(기본 백 href = `/philife`).
   */
  useEffect(() => {
    if (fromPhilifeHeaderStack) return;
    if (entryOrigin) return;
    if (typeof window === "undefined") return;
    const inferred = inferMessengerEntryOriginFromReferrer();
    if (!inferred) return;
    const next = new URLSearchParams(window.location.search);
    if (next.get("from")) return;
    next.set("from", inferred);
    const nextUrl = `${window.location.pathname}?${next.toString()}`;
    void router.replace(nextUrl, { scroll: false });
    /** referrer 는 한 번만 사용 — 무한 replace 방지(ESLint 의존성: 마운트 시 한 번) */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (fromPhilifeHeaderStack) return;
    if (!setMainTier1Extras) return;
    const fromUrl = parseMessengerEntryOrigin(searchParams.get("from"));
    if (fromUrl) persistMessengerEntryOrigin(fromUrl);
    const resolvedOrigin: MessengerEntryOrigin = fromUrl ?? readStoredMessengerEntryOrigin();

    const titleText =
      pillar === "trade" ? "nav_trade_chat_label"
      : pillar === "delivery" ? "nav_chat_order_compact"
      : messengerSectionLabel(mainSection);
    /**
     * 1단 헤더 뒤로가기:
     * - 인박스·거래/배달 묶음 모두 **명시적 `backHref` + `preferHistoryBack: false`** — 히스토리 back 에 의존하지 않음.
     * - `?from=` 이 없으면 세션에 저장된 마지막 출처로 `/philife`·`/market`·`/stores` 결정.
     * - 묶음 → 인박스: `resolvedOrigin` 으로 `?section=chats&from=` 보존.
     */
    const inboxQs = resolvedOrigin ? `?section=chats&from=${encodeURIComponent(resolvedOrigin)}` : "?section=chats";
    let backHref: string;
    if (pillar) {
      backHref = `/community-messenger${inboxQs}`;
    } else {
      backHref = messengerEntryOriginBackHref(resolvedOrigin);
    }
    setMainTier1Extras({
      tier1: {
        rightSlot: headerActionsNode,
        titleText,
        subtitle: "",
        hideTier1BottomBorder: true,
        alignTier1TitleStart: true,
        backHref,
        preferHistoryBack: false,
      },
    });
    return () => setMainTier1Extras(null);
  }, [headerActionsNode, mainSection, setMainTier1Extras, fromPhilifeHeaderStack, pillar, searchParams]);

  useEffect(() => {
    let cancelled = false;
    const cancelSchedule = scheduleStartupApiDeferred(
      "notification-settings-messenger-home",
      () => {
        void (async () => {
          try {
            const snapshot = await fetchMeNotificationSettingsSnapshot();
            if (!cancelled && snapshot?.ok && snapshot.settings) {
              setNotificationSettings((prev) => ({
                ...prev,
                trade_chat_enabled: snapshot.settings?.trade_chat_enabled !== false,
                community_chat_enabled: snapshot.settings?.community_chat_enabled !== false,
                order_enabled: snapshot.settings?.order_enabled !== false,
                store_enabled: snapshot.settings?.store_enabled !== false,
                sound_enabled: snapshot.settings?.sound_enabled !== false,
                vibration_enabled: snapshot.settings?.vibration_enabled !== false,
              }));
            }
          } catch {
            /* ignore */
          }
        })();
      },
      { delayMs: 150 }
    );
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [setNotificationSettings]);

  useEffect(() => {
    useIncomingFriendRequestPopupStore.getState().syncIncomingFromBootstrapRequests(data?.requests);
  }, [data?.requests]);
}
