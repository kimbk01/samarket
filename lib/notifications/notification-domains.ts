export const NOTIFICATION_DOMAINS = [
  "trade_chat",
  "community_chat",
  "order",
  "store",
] as const;

export type NotificationDomain = (typeof NOTIFICATION_DOMAINS)[number];

export function isNotificationDomain(v: string | null | undefined): v is NotificationDomain {
  return NOTIFICATION_DOMAINS.includes(v as NotificationDomain);
}
