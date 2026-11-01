"use client";

import { Gift, Megaphone, RefreshCw, Settings2, type LucideIcon } from "lucide-react";
import type { CustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { CC_ICON_WELL_CLASS } from "@/lib/mypage/customer-center-ui";

const ICONS: Record<CustomerCenterContentType, LucideIcon> = {
  notice: Megaphone,
  system: Settings2,
  marketing: Gift,
  // S7 업데이트 소식 — 다른 게시판과 같은 일반(선) 아이콘
  update: RefreshCw,
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
