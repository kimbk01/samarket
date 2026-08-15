"use client";

import {
  Bell,
  Gift,
  Headphones,
  Megaphone,
  MessageCircle,
  Package,
  Rocket,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import type { NotificationInboxVisualKind } from "@/lib/notifications/notification-inbox-visual";

const ICONS: Record<NotificationInboxVisualKind, LucideIcon> = {
  notice: Megaphone,
  system: Rocket,
  marketing: Gift,
  delivery: Package,
  community: MessageCircle,
  trade: ShoppingBag,
  cs: Headphones,
  chat: MessageCircle,
  default: Bell,
};

export function NotificationInboxCategoryIcon({
  kind,
  className = "h-5 w-5",
}: {
  kind: NotificationInboxVisualKind;
  className?: string;
}) {
  const Icon = ICONS[kind] ?? Bell;
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}
