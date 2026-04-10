"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { stopNotificationPlayback } from "@/lib/notifications/notification-sound-engine";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";

export type UserNotificationSettingsState = {
  trade_chat_enabled: boolean;
  community_chat_enabled: boolean;
  order_enabled: boolean;
  store_enabled: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
};

const DEFAULT_SETTINGS: UserNotificationSettingsState = {
  trade_chat_enabled: true,
  community_chat_enabled: true,
  order_enabled: true,
  store_enabled: true,
  sound_enabled: true,
  vibration_enabled: true,
};

type NotificationSurfaceValue = {
  /** 명시적 포그라운드 채팅방 (임베드 시트 등) */
  explicitTradeChatRoomId: string | null;
  setExplicitTradeChatRoomId: (id: string | null) => void;
  explicitCommunityChatRoomId: string | null;
  setExplicitCommunityChatRoomId: (id: string | null) => void;
  /** URL 기반 + explicit 병합 */
  activeTradeChatRoomId: string | null;
  activeCommunityChatRoomId: string | null;
  isWindowFocused: boolean;
  userNotificationSettings: UserNotificationSettingsState;
  refreshUserNotificationSettings: () => Promise<void>;
  /** 인앱 알림음 재생 전 도메인·설정·포커스 검사 */
  shouldPlayInAppSound: (domain: NotificationDomain, refId: string | null | undefined) => boolean;
};

const NotificationSurfaceContext = createContext<NotificationSurfaceValue | null>(null);

function tradeRoomIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const m =
    pathname.match(/^\/chats\/([^/]+)\/?$/) ||
    pathname.match(/^\/mypage\/trade\/chat\/([^/]+)\/?$/);
  if (m?.[1] && m[1] !== "compose") return decodeURIComponent(m[1]);
  return null;
}

function communityRoomIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/community-messenger\/rooms\/([^/]+)\/?$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export function NotificationSurfaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [explicitTradeChatRoomId, setExplicitTradeChatRoomId] = useState<string | null>(null);
  const [explicitCommunityChatRoomId, setExplicitCommunityChatRoomId] = useState<string | null>(
    null
  );
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [userNotificationSettings, setUserNotificationSettings] =
    useState<UserNotificationSettingsState>(DEFAULT_SETTINGS);

  const pathTrade = tradeRoomIdFromPathname(pathname ?? null);
  const pathCommunity = communityRoomIdFromPathname(pathname ?? null);

  const activeTradeChatRoomId = explicitTradeChatRoomId ?? pathTrade;
  const activeCommunityChatRoomId = explicitCommunityChatRoomId ?? pathCommunity;

  const refreshUserNotificationSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notification-settings", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        settings?: Partial<UserNotificationSettingsState>;
      };
      if (j?.ok && j.settings && typeof j.settings === "object") {
        setUserNotificationSettings({ ...DEFAULT_SETTINGS, ...j.settings });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshUserNotificationSettings();
  }, [refreshUserNotificationSettings]);

  useEffect(() => {
    const onCustom = () => void refreshUserNotificationSettings();
    if (typeof window !== "undefined") {
      window.addEventListener("kasama:user-notification-settings-changed", onCustom);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("kasama:user-notification-settings-changed", onCustom);
      }
    };
  }, [refreshUserNotificationSettings]);

  useEffect(() => {
    const onFocus = () => setIsWindowFocused(true);
    const onBlur = () => setIsWindowFocused(false);
    const onVis = () => setIsWindowFocused(document.visibilityState === "visible");
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    setIsWindowFocused(document.visibilityState === "visible");
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  /** 경로·명시 채팅방 진입 시 재생 중 알림음 종료 */
  useEffect(() => {
    if (activeTradeChatRoomId || activeCommunityChatRoomId) {
      stopNotificationPlayback();
    }
  }, [activeTradeChatRoomId, activeCommunityChatRoomId]);

  const shouldPlayInAppSound = useCallback(
    (domain: NotificationDomain, refId: string | null | undefined): boolean => {
      if (!userNotificationSettings.sound_enabled) return false;
      if (domain === "trade_chat" && userNotificationSettings.trade_chat_enabled === false) {
        return false;
      }
      if (domain === "community_chat" && userNotificationSettings.community_chat_enabled === false) {
        return false;
      }
      if (domain === "order" && userNotificationSettings.order_enabled === false) return false;
      if (domain === "store" && userNotificationSettings.store_enabled === false) return false;

      const ref = refId != null ? String(refId).trim() : "";
      if (domain === "trade_chat" && ref && activeTradeChatRoomId === ref) {
        return false;
      }
      if (domain === "community_chat" && ref && activeCommunityChatRoomId === ref) {
        return false;
      }
      if (!isWindowFocused) {
        return true;
      }
      return true;
    },
    [
      userNotificationSettings,
      activeTradeChatRoomId,
      activeCommunityChatRoomId,
      isWindowFocused,
    ]
  );

  const value = useMemo(
    () => ({
      explicitTradeChatRoomId,
      setExplicitTradeChatRoomId,
      explicitCommunityChatRoomId,
      setExplicitCommunityChatRoomId,
      activeTradeChatRoomId,
      activeCommunityChatRoomId,
      isWindowFocused,
      userNotificationSettings,
      refreshUserNotificationSettings,
      shouldPlayInAppSound,
    }),
    [
      explicitTradeChatRoomId,
      explicitCommunityChatRoomId,
      activeTradeChatRoomId,
      activeCommunityChatRoomId,
      isWindowFocused,
      userNotificationSettings,
      refreshUserNotificationSettings,
      shouldPlayInAppSound,
    ]
  );

  return (
    <NotificationSurfaceContext.Provider value={value}>{children}</NotificationSurfaceContext.Provider>
  );
}

export function useNotificationSurface(): NotificationSurfaceValue | null {
  return useContext(NotificationSurfaceContext);
}
