import type { NotificationEventCategory } from "@/lib/notifications/core/notification-event-types";

export type NotificationRuntimeAppState =
  | "foreground"
  | "background"
  | "killed"
  | "lockscreen";

export type ForegroundBehavior =
  | "suppress"
  | "in_app_bottom_banner"
  | "call_incoming_ui_only";

export type BackgroundBehavior = "os_notification" | "none";

export type NotificationPolicyProfile = {
  category: NotificationEventCategory;
  foregroundBehavior: ForegroundBehavior;
  backgroundBehavior: BackgroundBehavior;
  badgeEnabled: boolean;
  soundEnabled: boolean;
  lockscreenVisibility: "public" | "private" | "secret";
  dndRespect: boolean;
  adminMutable: boolean;
};

const DEFAULT_POLICY: NotificationPolicyProfile = {
  category: "chat_message",
  foregroundBehavior: "in_app_bottom_banner",
  backgroundBehavior: "os_notification",
  badgeEnabled: true,
  soundEnabled: true,
  lockscreenVisibility: "private",
  dndRespect: true,
  adminMutable: true,
};

const POLICY_BY_CATEGORY: Record<NotificationEventCategory, NotificationPolicyProfile> = {
  chat_message: { ...DEFAULT_POLICY, category: "chat_message" },
  group_message: { ...DEFAULT_POLICY, category: "group_message" },
  trade_message: { ...DEFAULT_POLICY, category: "trade_message" },
  trade_status: { ...DEFAULT_POLICY, category: "trade_status" },
  order_status: { ...DEFAULT_POLICY, category: "order_status" },
  delivery_status: { ...DEFAULT_POLICY, category: "delivery_status" },
  community_activity: { ...DEFAULT_POLICY, category: "community_activity" },
  admin_marketing_banner: {
    ...DEFAULT_POLICY,
    category: "admin_marketing_banner",
    badgeEnabled: false,
    lockscreenVisibility: "secret",
  },
  admin_notice: {
    ...DEFAULT_POLICY,
    category: "admin_notice",
    lockscreenVisibility: "private",
  },
  missed_call: { ...DEFAULT_POLICY, category: "missed_call" },
  incoming_call_signal: {
    ...DEFAULT_POLICY,
    category: "incoming_call_signal",
    foregroundBehavior: "call_incoming_ui_only",
    backgroundBehavior: "none",
    badgeEnabled: false,
    adminMutable: false,
  },
  // Legacy profiles (compat)
  chat: { ...DEFAULT_POLICY, category: "chat" },
  group: { ...DEFAULT_POLICY, category: "group" },
  trade: { ...DEFAULT_POLICY, category: "trade" },
  store: { ...DEFAULT_POLICY, category: "store" },
  call: {
    ...DEFAULT_POLICY,
    category: "call",
    foregroundBehavior: "call_incoming_ui_only",
    backgroundBehavior: "none",
    badgeEnabled: false,
    adminMutable: false,
  },
};

export function resolveNotificationPolicyProfile(
  category: NotificationEventCategory
): NotificationPolicyProfile {
  return POLICY_BY_CATEGORY[category] ?? DEFAULT_POLICY;
}

export function shouldUseOsNotificationForState(
  profile: NotificationPolicyProfile,
  appState: NotificationRuntimeAppState
): boolean {
  if (profile.backgroundBehavior === "none") return false;
  return appState === "background" || appState === "killed" || appState === "lockscreen";
}
