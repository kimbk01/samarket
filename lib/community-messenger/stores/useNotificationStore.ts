import { create } from "zustand";
import {
  isCommunityMessengerIncomingCallBannerEnabled,
  isCommunityMessengerIncomingCallSoundEnabled,
  setCommunityMessengerIncomingCallBannerEnabled,
  setCommunityMessengerIncomingCallSoundEnabled,
} from "@/lib/community-messenger/preferences";

export type MessengerNotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  kind?: "message" | "friend_request" | "call" | "trade" | "delivery" | "system";
};

type NotificationState = {
  messageNotificationEnabled: boolean;
  friendRequestNotificationEnabled: boolean;
  tradeNotificationEnabled: boolean;
  deliveryNotificationEnabled: boolean;
  incomingCallSoundEnabled: boolean;
  vibrationEnabled: boolean;
  overlayEnabled: boolean;
  notifications: MessengerNotificationItem[];

  setNotificationPreferences: (patch: Partial<Omit<NotificationState, "notifications">>) => void;
  pushNotification: (item: MessengerNotificationItem) => void;
  markNotificationRead: (id: string) => void;
  deleteNotification: (id: string) => void;
};

export const useNotificationStore = create<NotificationState>((set) => ({
  messageNotificationEnabled: true,
  friendRequestNotificationEnabled: true,
  tradeNotificationEnabled: true,
  deliveryNotificationEnabled: true,
  incomingCallSoundEnabled:
    typeof window !== "undefined" ? isCommunityMessengerIncomingCallSoundEnabled() : true,
  vibrationEnabled: true,
  overlayEnabled: typeof window !== "undefined" ? isCommunityMessengerIncomingCallBannerEnabled() : true,
  notifications: [],

  setNotificationPreferences: (patch) => {
    set((state) => ({ ...state, ...patch }));
    if (typeof window === "undefined") return;
    if (patch.incomingCallSoundEnabled !== undefined) {
      setCommunityMessengerIncomingCallSoundEnabled(patch.incomingCallSoundEnabled);
    }
    if (patch.overlayEnabled !== undefined) {
      setCommunityMessengerIncomingCallBannerEnabled(patch.overlayEnabled);
    }
  },

  pushNotification: (item) =>
    set((state) => ({
      notifications: [item, ...state.notifications].slice(0, 200),
    })),

  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),

  deleteNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
