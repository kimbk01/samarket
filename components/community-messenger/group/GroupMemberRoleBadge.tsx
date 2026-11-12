"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

type GroupMemberRoleBadgeProps = {
  role: "owner" | "admin" | "member" | string | null | undefined;
  className?: string;
};

/**
 * 그룹 역할 배지 — 방장·관리자·멤버 (한국어 화면에 영어 「OWNER」「ADMIN」 금지 · 2026-11-12).
 * 글자는 그룹 화면이 이미 쓰는 키(`nav_messenger_owner_label`·`cm_ui_admin`), 색은 브랜드 토큰.
 */
export function GroupMemberRoleBadge({ role, className = "" }: GroupMemberRoleBadgeProps) {
  const { t, safeT } = useI18n();
  const r = typeof role === "string" ? role.trim() : "";
  if (r === "owner") {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-ui-rect bg-[color:var(--overlay-primary)] px-1.5 py-0.5 sam-text-xxs font-bold text-white ${className}`}
      >
        {t("nav_messenger_owner_label")}
      </span>
    );
  }
  if (r === "admin") {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-ui-rect bg-[color:var(--overlay-primary)] px-1.5 py-0.5 sam-text-xxs font-bold text-white ${className}`}
      >
        {t("cm_ui_admin")}
      </span>
    );
  }
  if (r === "member") {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-ui-rect bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs font-semibold text-sam-muted ${className}`}
      >
        {safeT("cm_ui_group_role_member_badge")}
      </span>
    );
  }
  return null;
}
