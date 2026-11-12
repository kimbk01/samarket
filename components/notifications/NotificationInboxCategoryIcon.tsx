"use client";

import {
  Bell,
  Gift,
  Headphones,
  Lock,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { serviceBrandIconSlot, type ServiceBrandIconSlotProps } from "@/components/brand/ServiceBrandIcon";
import type { NotificationInboxVisualKind } from "@/lib/notifications/notification-inbox-visual";

/** Icons aligned to DIBAY notification modal / full-inbox mockup. */
/** 서비스 분야(배달·커뮤니티·거래·채팅) = 브랜드 대표 아이콘 (Owner 2026-11-13). 원형 배경색은 기존 그대로. */
const ICONS: Record<NotificationInboxVisualKind, LucideIcon | ((p: ServiceBrandIconSlotProps) => React.JSX.Element)> = {
  notice: Megaphone,
  system: Lock,
  marketing: Gift,
  delivery: serviceBrandIconSlot("DIPICK"),
  community: serviceBrandIconSlot("LOUNGE"),
  trade: serviceBrandIconSlot("MARKET"),
  cs: Headphones,
  chat: serviceBrandIconSlot("LETARING"),
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
