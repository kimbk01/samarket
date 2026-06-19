"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

type GroupMemberRoleBadgeProps = {
  role: "owner" | "admin" | "member" | string | null | undefined;
  className?: string;
};

/** Kakao/Telegram-style role badge — OWNER #006241, ADMIN #00754A. */
export function GroupMemberRoleBadge({ role, className = "" }: GroupMemberRoleBadgeProps) {
  const { safeT } = useI18n();
  const r = typeof role === "string" ? role.trim() : "";
  if (r === "owner") {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-ui-rect bg-[#006241] px-1.5 py-0.5 sam-text-xxs font-bold uppercase tracking-wide text-white ${className}`}
      >
        {safeT("cm_ui_group_role_owner_badge", { fallbackKo: "OWNER", fallbackEn: "OWNER" })}
      </span>
    );
  }
  if (r === "admin") {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-ui-rect bg-[#00754A] px-1.5 py-0.5 sam-text-xxs font-bold uppercase tracking-wide text-white ${className}`}
      >
        {safeT("cm_ui_group_role_admin_badge", { fallbackKo: "ADMIN", fallbackEn: "ADMIN" })}
      </span>
    );
  }
  return null;
}
