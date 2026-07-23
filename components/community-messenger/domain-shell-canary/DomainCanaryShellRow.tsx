"use client";

import Link from "next/link";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { GroupDomainAvatar } from "@/components/community-messenger/domain-shell-canary/GroupDomainAvatar";

export type DomainCanaryShellRowAvatarKind = "user" | "group" | "listing" | "store";

export function DomainCanaryShellRow({
  href,
  title,
  preview,
  avatarUrl,
  avatarKind = "user",
  trailing,
  unreadCount,
  statusBadge,
  time,
  subtitle,
  onNavigate,
}: {
  href: string;
  title: string;
  preview: string;
  avatarUrl?: string | null;
  /** group → group image or group-only placeholder (never title initial / peer face) */
  avatarKind?: DomainCanaryShellRowAvatarKind;
  /** @deprecated prefer unreadCount + statusBadge so status never hides unread */
  trailing?: string;
  unreadCount?: number;
  statusBadge?: string | null;
  time?: string;
  subtitle?: string;
  onNavigate?: () => void;
}) {
  const unread =
    typeof unreadCount === "number" && unreadCount > 0
      ? unreadCount
      : trailing && /^\d+$/.test(trailing)
        ? Number(trailing)
        : 0;
  const status =
    (statusBadge?.trim() || (trailing && !/^\d+$/.test(trailing) ? trailing : "") || "").trim() ||
    null;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-h-[68px] items-center gap-3 border-b border-sam-border px-3"
      data-domain-row-unread={unread > 0 ? "1" : "0"}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sam-muted/20">
        {avatarKind === "group" ? (
          <GroupDomainAvatar imageUrl={avatarUrl} size={48} className="h-12 w-12" />
        ) : avatarKind === "user" ? (
          <SamarketUserAvatarThumb
            avatarUrl={avatarUrl}
            size={48}
            roundedClassName="rounded-full"
            className="h-12 w-12 object-cover"
          />
        ) : avatarUrl ? (
          <SamarketThumbnail src={avatarUrl} alt="" size={48} className="h-12 w-12 object-cover" />
        ) : (
          <span className="text-sm text-sam-muted" aria-hidden>
            ·
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-sam-fg">{title}</div>
        {subtitle ? (
          <div className="truncate text-[11px] text-sam-muted">{subtitle}</div>
        ) : null}
        <div className="truncate text-xs text-sam-muted">{preview}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-sam-muted">
        {time ? <span>{time}</span> : null}
        {unread > 0 ? (
          <span className="rounded-full bg-sam-primary px-1.5 py-0.5 text-[10px] text-white tabular-nums">
            {unread > 999 ? "999+" : unread}
          </span>
        ) : null}
        {status ? <span className="max-w-[7rem] truncate text-[10px] text-sam-muted">{status}</span> : null}
      </div>
    </Link>
  );
}

export function formatDomainCanaryTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return new Date(t).toLocaleString();
  } catch {
    return "";
  }
}
