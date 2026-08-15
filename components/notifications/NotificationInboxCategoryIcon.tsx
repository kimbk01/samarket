"use client";

import {
  Bell,
  Gift,
  Headphones,
  Lock,
  Megaphone,
  MessageCircle,
  Package,
  User,
  type LucideIcon,
} from "lucide-react";
import type { NotificationInboxVisualKind } from "@/lib/notifications/notification-inbox-visual";

/** Icons aligned to DIBAY notification modal / full-inbox mockup. */
const ICONS: Record<NotificationInboxVisualKind, LucideIcon> = {
  notice: Megaphone,
  system: Lock,
  marketing: Gift,
  delivery: Package,
  community: User,
  trade: MessageCircle,
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
