import type { AdminManagementWorkspace, OperationalFrequencyClass } from "./types";
import { sortByOperationalFrequency } from "./operational-frequency";

/**
 * Frequency registry — operational class metadata for future sidebar/page priority.
 * Not measured usage. Domain grouping must be preserved when ordering.
 */
export type OperationalFrequencyEntry = {
  id: string;
  workspace: AdminManagementWorkspace;
  section: string;
  route: string;
  frequency: OperationalFrequencyClass;
  /** Within same frequency class (lower first). */
  order: number;
  purpose: string;
};

const REGISTRY: readonly OperationalFrequencyEntry[] = [
  {
    id: "delivery-orders",
    workspace: "DELIVERY",
    section: "orders",
    route: "/admin/stores/orders",
    frequency: "DAILY_CRITICAL",
    order: 10,
    purpose: "Store order ops queue",
  },
  {
    id: "trade-reports",
    workspace: "TRADE",
    section: "reports",
    route: "/admin/reports?domain=trade",
    frequency: "DAILY_CRITICAL",
    order: 10,
    purpose: "Trade moderation queue",
  },
  {
    id: "trade-posts-management",
    workspace: "TRADE",
    section: "content",
    route: "/admin/posts-management",
    frequency: "FREQUENT",
    order: 20,
    purpose: "Trade listing management list (W1 proof surface)",
  },
  {
    id: "community-home",
    workspace: "COMMUNITY",
    section: "ops",
    route: "/admin/community",
    frequency: "DAILY_CRITICAL",
    order: 1,
    purpose: "Community overview",
  },
  {
    id: "community-reports",
    workspace: "COMMUNITY",
    section: "moderation",
    route: "/admin/community/reports",
    frequency: "DAILY_CRITICAL",
    order: 10,
    purpose: "Community report queue (community_reports)",
  },
  {
    id: "community-meeting-reports",
    workspace: "COMMUNITY",
    section: "moderation",
    route: "/admin/philife/meeting-reports",
    frequency: "DAILY_CRITICAL",
    order: 20,
    purpose: "Meeting report queue (meeting_reports) — separate owner",
  },
  {
    id: "community-posts",
    workspace: "COMMUNITY",
    section: "content",
    route: "/admin/community/posts",
    frequency: "FREQUENT",
    order: 10,
    purpose: "Community post management",
  },
  {
    id: "community-comments",
    workspace: "COMMUNITY",
    section: "content",
    route: "/admin/community/comments",
    frequency: "FREQUENT",
    order: 20,
    purpose: "Community comment management",
  },
  {
    id: "community-topics",
    workspace: "COMMUNITY",
    section: "content",
    route: "/admin/community/topics",
    frequency: "FREQUENT",
    order: 30,
    purpose: "Community topic/category management",
  },
  {
    id: "community-promotions",
    workspace: "COMMUNITY",
    section: "promo",
    route: "/admin/community/promotions",
    frequency: "OCCASIONAL",
    order: 10,
    purpose: "Community Point promotion (point_promotion_orders)",
  },
  {
    id: "community-point-policies",
    workspace: "COMMUNITY",
    section: "config",
    route: "/admin/community/point-policies",
    frequency: "CONFIGURATION",
    order: 10,
    purpose: "Community board_point_policies scoped UX",
  },
  {
    id: "community-settings",
    workspace: "COMMUNITY",
    section: "config",
    route: "/admin/community/settings",
    frequency: "CONFIGURATION",
    order: 20,
    purpose: "Community feed settings",
  },
  {
    id: "messenger-rooms",
    workspace: "MESSENGER",
    section: "rooms",
    route: "/admin/chats/messenger",
    frequency: "FREQUENT",
    order: 10,
    purpose: "Messenger room admin",
  },
  {
    id: "ops-dashboard",
    workspace: "OPERATIONS",
    section: "control-plane",
    route: "/admin",
    frequency: "DAILY_CRITICAL",
    order: 1,
    purpose: "Action Center / control plane",
  },
  {
    id: "finance-control-plane",
    workspace: "FINANCE",
    section: "control-plane",
    route: "/admin/finance",
    frequency: "DAILY_CRITICAL",
    order: 1,
    purpose: "Common Finance Control Plane (B4) — Action Required root",
  },
  {
    id: "finance-point-charges",
    workspace: "FINANCE",
    section: "point",
    route: "/admin/point-charges",
    frequency: "DAILY_CRITICAL",
    order: 10,
    purpose: "Point charge queue",
  },
  {
    id: "ads-delivery",
    workspace: "ADS_EXPOSURE",
    section: "delivery-ads",
    route: "/admin/delivery-ads/manage",
    frequency: "DAILY_CRITICAL",
    order: 1,
    purpose: "Delivery ads ops (store promo + banner)",
  },
  {
    id: "support-cases",
    workspace: "SUPPORT",
    section: "cases",
    route: "/admin/support",
    frequency: "DAILY_CRITICAL",
    order: 10,
    purpose: "Support cases",
  },
  {
    id: "notifications-campaigns",
    workspace: "NOTIFICATIONS",
    section: "send",
    route: "/admin/notifications",
    frequency: "OCCASIONAL",
    order: 10,
    purpose: "Admin push / notification send tools",
  },
  {
    id: "notifications-settings",
    workspace: "NOTIFICATIONS",
    section: "config",
    route: "/admin/settings/notifications",
    frequency: "CONFIGURATION",
    order: 10,
    purpose: "Notification sound / preference settings",
  },
  {
    id: "system-users",
    workspace: "SYSTEM",
    section: "members",
    route: "/admin/users",
    frequency: "FREQUENT",
    order: 10,
    purpose: "Member lookup / management",
  },
  {
    id: "system-member-deletion-requests",
    workspace: "SYSTEM",
    section: "members",
    route: "/admin/users",
    frequency: "DAILY_CRITICAL",
    order: 5,
    purpose: "Member deletion-request queue (separate from list bulk)",
  },
  {
    id: "system-prelaunch-reset",
    workspace: "SYSTEM",
    section: "reset",
    route: "/admin/prelaunch-reset",
    frequency: "OCCASIONAL",
    order: 40,
    purpose: "Pre-launch selective reset (not domain bulk)",
  },
  {
    id: "system-settings",
    workspace: "SYSTEM",
    section: "settings",
    route: "/admin/settings",
    frequency: "CONFIGURATION",
    order: 50,
    purpose: "System settings",
  },
  {
    id: "ads-legacy",
    workspace: "ADS_EXPOSURE",
    section: "legacy",
    route: "/admin/ad-products",
    frequency: "ARCHIVE",
    order: 90,
    purpose: "Legacy ads nav clutter (cleanup backlog)",
  },
] as const;

export function listOperationalFrequencyRegistry(): readonly OperationalFrequencyEntry[] {
  return REGISTRY;
}

export function listOperationalFrequencyByWorkspace(
  workspace: AdminManagementWorkspace
): OperationalFrequencyEntry[] {
  return sortByOperationalFrequency(REGISTRY.filter((e) => e.workspace === workspace));
}

export function getOperationalFrequencyEntry(
  id: string
): OperationalFrequencyEntry | undefined {
  return REGISTRY.find((e) => e.id === id);
}
