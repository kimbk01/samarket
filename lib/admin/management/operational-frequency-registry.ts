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
    id: "community-reports",
    workspace: "COMMUNITY",
    section: "reports",
    route: "/admin/community/reports",
    frequency: "DAILY_CRITICAL",
    order: 10,
    purpose: "Community report queue",
  },
  {
    id: "community-posts",
    workspace: "COMMUNITY",
    section: "content",
    route: "/admin/community/posts",
    frequency: "FREQUENT",
    order: 20,
    purpose: "Community post management",
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
    route: "/admin/delivery-ads",
    frequency: "FREQUENT",
    order: 10,
    purpose: "Delivery ads ops",
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
    section: "campaigns",
    route: "/admin/notifications",
    frequency: "OCCASIONAL",
    order: 10,
    purpose: "Notification campaigns",
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
