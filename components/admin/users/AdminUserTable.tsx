"use client";

import Link from "next/link";
import { memo, useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUser } from "@/lib/types/admin-user";
import { AdminModerationStatusBadge } from "@/components/admin/AdminModerationStatusBadge";
import {
  ADMIN_USER_PROVIDER_LABEL_KEY,
  type AdminUserSortKey,
  type AdminUserSortOrder,
} from "@/lib/admin-users/admin-user-utils";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";

const MEMBER_TYPE_SHORT_KEYS: Record<AdminUser["memberType"], MessageKey> = {
  normal: "admin_users_member_type_normal_short",
  premium: "admin_users_member_type_premium_short",
  admin: "admin_users_member_type_admin_short",
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

interface AdminUserTableProps {
  users: AdminUser[];
  onEditMember: (user: AdminUser) => void;
  sortKey: AdminUserSortKey;
  sortOrder: AdminUserSortOrder;
  onSortChange: (key: AdminUserSortKey) => void;
  /** false(기본): UUID 열 숨김 */
  showMemberUuid?: boolean;
}

const PROVIDER_BADGE_CLASS: Record<string, string> = {
  google: "border-[#d7e3ff] bg-white text-[#1c1e21]",
  kakao: "border-[#f4d35e] bg-[#fff8d8] text-[#2b2118]",
  naver: "border-[#bdecc8] bg-[#ecf8ef] text-[#128a3a]",
  apple: "border-[#dadde1] bg-white text-[#050505]",
  facebook: "border-sam-primary-border bg-sam-primary-soft text-sam-primary",
  email: "border-[#d7e3ff] bg-[#eef4ff] text-[#1c1e21]",
  manual: "border-[#cfd6df] bg-[#f8fafc] text-[#475467]",
  unknown: "border-[#dadde1] bg-[#f7f8fa] text-[#65676b]",
};

function GoogleProviderIcon() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[13px] font-black shadow-sm">
      <span className="text-sam-primary">G</span>
    </span>
  );
}

function KakaoProviderIcon() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#fee500] shadow-sm">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-[#191919]">
        <path d="M12 4.5c-4.4 0-8 2.7-8 6 0 2.1 1.5 4 3.8 5.1l-.7 2.6a.45.45 0 0 0 .68.5l3.1-2.1c.37.04.74.06 1.12.06 4.4 0 8-2.7 8-6s-3.6-6.16-8-6.16Z" />
      </svg>
    </span>
  );
}

function EmailProviderIcon() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sam-primary shadow-sm">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-white stroke-2">
        <path d="M4 6.5h16v11H4z" />
        <path d="m4.5 7 7.5 6 7.5-6" />
      </svg>
    </span>
  );
}

function ManualProviderIcon() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#475467] text-[10px] font-black text-white shadow-sm">
      M
    </span>
  );
}

function DefaultProviderIcon({ provider }: { provider: string }) {
  const label = provider === "facebook" ? "f" : provider === "naver" ? "N" : provider === "apple" ? "A" : "?";
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#f0f2f5] text-[11px] font-black text-[#475467] shadow-sm">
      {label}
    </span>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "google") return <GoogleProviderIcon />;
  if (provider === "kakao") return <KakaoProviderIcon />;
  if (provider === "email") return <EmailProviderIcon />;
  if (provider === "manual") return <ManualProviderIcon />;
  return <DefaultProviderIcon provider={provider} />;
}

function ProviderBadge({
  user,
  t,
}: {
  user: AdminUser;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}) {
  const provider = user.authProvider ?? "unknown";
  const labelKey = ADMIN_USER_PROVIDER_LABEL_KEY[provider] ?? ADMIN_USER_PROVIDER_LABEL_KEY.unknown;
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${PROVIDER_BADGE_CLASS[provider] ?? PROVIDER_BADGE_CLASS.unknown}`}>
      <ProviderIcon provider={provider} />
      <span>{t(labelKey)}</span>
    </span>
  );
}

function formatDateTime(value: string | null | undefined, localeTag: string, emptyDash: string): string {
  if (!value) return emptyDash;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return emptyDash;
  return new Date(time).toLocaleString(localeTag, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SortHeader({
  label,
  sortId,
  align = "left",
  sortKey,
  sortOrder,
  onSortChange,
  className = "",
}: {
  label: string;
  sortId: AdminUserSortKey;
  align?: "left" | "right" | "center";
  sortKey: AdminUserSortKey;
  sortOrder: AdminUserSortOrder;
  onSortChange: (key: AdminUserSortKey) => void;
  className?: string;
}) {
  const active = sortKey === sortId;
  return (
    <th className={`border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-xs font-bold tracking-[0.01em] text-[#475467] ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={() => onSortChange(sortId)}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 transition hover:bg-white hover:text-sam-primary ${align === "right" ? "justify-end" : ""}`}
      >
        <span>{label}</span>
        <span className={active ? "text-sam-primary" : "text-[#8a8d91]"}>{active ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

const AdminUserTableRow = memo(function AdminUserTableRow({
  user: u,
  showMemberUuid,
  onEditMember,
}: {
  user: AdminUser;
  showMemberUuid: boolean;
  onEditMember: (user: AdminUser) => void;
}) {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const emptyCell = t("admin_users_empty_placeholder");
  const handleCopyLogin = useCallback(() => {
    const value = u.loginIdentifier ?? u.loginUsername ?? "";
    if (!value) return;
    void navigator.clipboard.writeText(value).catch(() => {});
  }, [u.loginIdentifier, u.loginUsername]);

  const handleCopyUuid = useCallback(() => {
    void navigator.clipboard.writeText(u.id).catch(() => {});
  }, [u.id]);

  const handleEdit = useCallback(() => {
    onEditMember(u);
  }, [onEditMember, u]);

  return (
    <tr className="group border-b border-[#e6eaf0] bg-white hover:bg-[#f8fbff]">
      <td className="sticky left-0 z-10 min-w-[132px] border-r border-[#e9edf3] whitespace-nowrap bg-white px-3 py-3 group-hover:bg-[#f8fbff]">
        <ProviderBadge user={u} t={t} />
      </td>
      <td className="sticky left-[132px] z-10 min-w-[230px] border-r border-[#e9edf3] whitespace-nowrap bg-white px-3 py-3 group-hover:bg-[#f8fbff]">
        <span className="text-[13px] font-semibold text-[#101828]">{u.loginIdentifier ?? u.loginUsername ?? emptyCell}</span>
        {u.loginIdentifier || u.loginUsername ?
          <button
            type="button"
            className="ml-2 align-baseline text-xs font-semibold text-sam-primary hover:text-sam-primary-hover hover:underline"
            onClick={handleCopyLogin}
          >
            {t("admin_users_action_copy")}
          </button>
        : null}
        {showMemberUuid ? (
          <p className="mt-1 max-w-[220px] truncate text-[11px] text-[#8a8d91]" title={u.id}>{u.id}</p>
        ) : null}
        {!showMemberUuid ?
          <Link
            href={`/admin/users/${u.id}`}
            className="ml-2 align-baseline text-xs font-semibold text-sam-primary hover:text-sam-primary-hover hover:underline"
          >
            {t("admin_users_action_detail")}
          </Link>
        : null}
        {showMemberUuid ? (
          <button
            type="button"
            className="ml-2 align-baseline text-xs font-semibold text-sam-primary hover:text-sam-primary-hover hover:underline"
            onClick={handleCopyUuid}
          >
            {t("admin_users_action_copy_uuid")}
          </button>
        ) : null}
      </td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3">
        <p className="font-semibold text-[#101828]">{u.displayName ?? u.nickname}</p>
        <p className="mt-0.5 text-[11px] font-mono text-[#8a8d91]">{u.username ? `@${u.username}` : "-"}</p>
      </td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-[#475467]">{u.email?.trim() || emptyCell}</td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-[#475467]">{u.phone?.trim() || emptyCell}</td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-xs">
        <span
          className={`rounded-full px-2.5 py-1 font-bold ${
            u.phoneVerified ? "bg-sam-primary-soft text-sam-primary" : "bg-[#f0f2f5] text-[#65676b]"
          }`}
        >
          {u.phoneVerified
            ? t("admin_users_phone_status_verified")
            : u.verificationStatus === "pending"
              ? t("admin_users_phone_status_pending")
              : t("admin_users_phone_status_none")}
        </span>
      </td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-xs">
        <span
          className={`rounded-full px-2.5 py-1 font-bold ${
            u.phoneVerified && String(u.memberStatus ?? "").toLowerCase() === "active"
              ? "bg-sam-primary-soft text-sam-primary"
              : String(u.memberStatus ?? "").toLowerCase() === "pending"
                ? "bg-[#fff3e8] text-[#b54708]"
                : "bg-[#f0f2f5] text-[#65676b]"
          }`}
        >
          {u.phoneVerified && String(u.memberStatus ?? "").toLowerCase() === "active"
            ? t("admin_users_member_state_active")
            : !u.phoneVerified
              ? t("admin_users_member_state_need_phone")
              : String(u.memberStatus ?? "").toLowerCase() === "pending"
                ? t("admin_users_member_state_pending")
                : (u.memberStatus ?? t("admin_users_member_state_pending"))}
        </span>
      </td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-[#101828]">{t(MEMBER_TYPE_SHORT_KEYS[u.memberType])}</td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3">
        <AdminModerationStatusBadge status={u.moderationStatus} />
      </td>
      <td className="max-w-[min(280px,32vw)] truncate border-r border-[#e9edf3] px-3 py-3 text-[#475467]" title={u.location ?? undefined}>
        {u.location?.trim() ? u.location : emptyCell}
      </td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-right">
        <p className="font-bold text-sam-primary">{(u.pointBalance ?? 0).toLocaleString()}P</p>
        <Link
          href={`/admin/users/${u.id}?tab=points`}
          className="text-[11px] text-[#65676b] hover:text-sam-primary hover:underline"
        >
          {t("admin_users_points_link")}
        </Link>
      </td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-right text-[#475467]">
        {u.productCount} / {u.soldCount}
      </td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-right text-[#475467]">{u.reportCount}</td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-xs tabular-nums text-[#475467]">
        {formatDateTime(u.joinedAt, dateLocale, emptyCell)}
      </td>
      <td className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-xs tabular-nums text-[#475467]">
        {formatDateTime(u.lastSignInAt ?? u.lastActiveAt, dateLocale, emptyCell)}
      </td>
      <td className="whitespace-nowrap px-3 py-3 align-top">
        <button
          type="button"
          className="rounded-full border border-sam-primary-border bg-sam-primary-soft px-3 py-1 text-xs font-bold text-sam-primary shadow-sm transition hover:bg-sam-primary-soft-2"
          onClick={handleEdit}
        >
          {t("admin_users_action_edit")}
        </button>
      </td>
    </tr>
  );
});

AdminUserTableRow.displayName = "AdminUserTableRow";

export function AdminUserTable({
  users,
  onEditMember,
  sortKey,
  sortOrder,
  onSortChange,
  showMemberUuid = false,
}: AdminUserTableProps) {
  const { t } = useI18n();
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border border-[#d0d7e2] bg-white shadow-sm">
      <table className="min-w-[1630px] border-collapse font-sans text-[13px] leading-normal">
        <thead>
          <tr className="border-b border-[#d0d7e2] bg-[#f6f8fb]">
            <SortHeader label={t("admin_users_col_provider")} sortId="provider" sortKey={sortKey} sortOrder={sortOrder} onSortChange={onSortChange} className="sticky left-0 z-20 bg-[#f6f8fb]" />
            <SortHeader label={t("admin_users_col_login_id")} sortId="loginIdentifier" sortKey={sortKey} sortOrder={sortOrder} onSortChange={onSortChange} className="sticky left-[132px] z-20 min-w-[230px] bg-[#f6f8fb]" />
            <SortHeader label={t("admin_users_col_nickname")} sortId="nickname" sortKey={sortKey} sortOrder={sortOrder} onSortChange={onSortChange} />
            <th className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-left text-xs font-bold tracking-[0.01em] text-[#475467]">{t("admin_users_col_email")}</th>
            <th className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-left text-xs font-bold tracking-[0.01em] text-[#475467]">{t("admin_users_col_phone")}</th>
            <SortHeader label={t("admin_users_col_phone_verify")} sortId="phoneVerified" sortKey={sortKey} sortOrder={sortOrder} onSortChange={onSortChange} />
            <th className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-left text-xs font-bold tracking-[0.01em] text-[#475467]">{t("admin_users_col_member_status")}</th>
            <th className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-left text-xs font-bold tracking-[0.01em] text-[#475467]">{t("admin_users_col_member_type")}</th>
            <SortHeader label={t("admin_users_col_moderation")} sortId="moderationStatus" sortKey={sortKey} sortOrder={sortOrder} onSortChange={onSortChange} />
            <th className="border-r border-[#e9edf3] whitespace-nowrap px-3 py-3 text-left text-xs font-bold tracking-[0.01em] text-[#475467]">{t("admin_users_col_region")}</th>
            <SortHeader label={t("admin_users_col_points")} sortId="points" align="right" sortKey={sortKey} sortOrder={sortOrder} onSortChange={onSortChange} />
            <SortHeader label={t("admin_users_col_products_sales")} sortId="products" align="right" sortKey={sortKey} sortOrder={sortOrder} onSortChange={onSortChange} />
            <SortHeader label={t("admin_users_col_reports")} sortId="reports" align="right" sortKey={sortKey} sortOrder={sortOrder} onSortChange={onSortChange} />
            <SortHeader label={t("admin_users_col_joined")} sortId="joined" sortKey={sortKey} sortOrder={sortOrder} onSortChange={onSortChange} />
            <SortHeader label={t("admin_users_col_last_login")} sortId="lastSignIn" sortKey={sortKey} sortOrder={sortOrder} onSortChange={onSortChange} />
            <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-bold tracking-[0.01em] text-[#475467]">{t("admin_users_col_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <AdminUserTableRow key={u.id} user={u} showMemberUuid={showMemberUuid} onEditMember={onEditMember} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
