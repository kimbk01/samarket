"use client";

import { Gift, Megaphone, Settings2, type LucideIcon } from "lucide-react";
import type { CustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { CC_ICON_WELL_CLASS } from "@/lib/mypage/customer-center-ui";

const ICONS: Record<CustomerCenterContentType, LucideIcon> = {
  notice: Megaphone,
  system: Settings2,
  marketing: Gift,
};

export function CustomerCenterBoardTypeIcon({
  contentType,
  className = CC_ICON_WELL_CLASS,
  iconClassName = "h-[18px] w-[18px]",
}: {
  contentType: CustomerCenterContentType;
  className?: string;
  iconClassName?: string;
}) {
  const Icon = ICONS[contentType] ?? Megaphone;
  return (
    <span className={className} aria-hidden>
      <Icon className={iconClassName} strokeWidth={2} />
    </span>
  );
}
