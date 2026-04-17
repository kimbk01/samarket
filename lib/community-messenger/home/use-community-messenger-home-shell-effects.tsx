"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { MainTier1ExtrasState } from "@/contexts/MainTier1ExtrasContext";
import { useEffect, useLayoutEffect } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { consumeCommunityMessengerHomeReturn } from "@/lib/community-messenger/home-return-timing";
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
  fetchMeNotificationSettingsGet,
} from "@/lib/me/fetch-me-notification-settings-client";
import { resolveMessengerChatFilters, resolveMessengerSection, type MessengerChatInboxFilter, type MessengerChatKindFilter, type MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerFriendRequest,
} from "@/lib/community-messenger/types";
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
  incomingRequestCount: number;
  setNotificationSettings: Dispatch<SetStateAction<MessengerNotificationSettings>>;
  data: CommunityMessengerBootstrap | null;
  incomingFriendRequestPopup: CommunityMessengerFriendRequest | null;
  setIncomingFriendRequestPopup: Dispatch<SetStateAction<CommunityMessengerFriendRequest | null>>;
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
  incomingRequestCount,
  setNotificationSettings,
  data,
  incomingFriendRequestPopup,
  setIncomingFriendRequestPopup,
}: Args): void {
  useEffect(() => {
    consumeCommunityMessengerHomeReturn();
  }, []);

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
    const tab = searchParams.get("tab");
    if (tab === "settings") {
      openSettingsSheet();
      router.replace("/community-messenger", { scroll: false });
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
  }, [searchParams, router, openSettingsSheet, setChatInboxFilter, setChatKindFilter, setMainSection]);

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      tier1: {
        rightSlot: headerActionsNode,
      },
    });
    return () => setMainTier1Extras(null);
  }, [headerActionsNode, incomingRequestCount, setMainTier1Extras]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchMeNotificationSettingsGet();
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: Partial<MessengerNotificationSettings>;
        };
        if (!cancelled && res.ok && json.ok && json.settings) {
          setNotificationSettings((prev) => ({
            ...prev,
            trade_chat_enabled: json.settings?.trade_chat_enabled !== false,
            community_chat_enabled: json.settings?.community_chat_enabled !== false,
            order_enabled: json.settings?.order_enabled !== false,
            store_enabled: json.settings?.store_enabled !== false,
            sound_enabled: json.settings?.sound_enabled !== false,
            vibration_enabled: json.settings?.vibration_enabled !== false,
          }));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setNotificationSettings]);

  useEffect(() => {
    if (!incomingFriendRequestPopup) return;
    const stillPending = (data?.requests ?? []).some(
      (r) => r.id === incomingFriendRequestPopup.id && r.direction === "incoming"
    );
    if (!stillPending) setIncomingFriendRequestPopup(null);
  }, [data?.requests, incomingFriendRequestPopup, setIncomingFriendRequestPopup]);
}
