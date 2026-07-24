"use client";

import Link from "next/link";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { formatDomainCanaryTime } from "@/components/community-messenger/domain-shell-canary/DomainCanaryShellRow";

/**
 * Trade list row — product + counterpart overlay, role · peer · status, preview.
 * Height ~72–84px; status badge separate from preview.
 */
export function TradeDomainShellRow({
  href,
  productTitle,
  productImageUrl,
  peerLabel,
  peerAvatarUrl,
  roleLabel,
  statusBadge,
  preview,
  previewIsSystemEvent,
  unreadCount,
  lastMessageAt,
  onNavigate,
}: {
  href: string;
  productTitle: string;
  productImageUrl: string | null;
  peerLabel: string;
  peerAvatarUrl: string | null;
  roleLabel: string;
  statusBadge: string | null;
  preview: string;
  previewIsSystemEvent?: boolean;
  unreadCount: number;
  lastMessageAt: string;
  onNavigate?: () => void;
}) {
  const time = formatDomainCanaryTime(lastMessageAt);
  const subtitle = statusBadge
    ? `${roleLabel} · ${peerLabel} [${statusBadge}]`
    : `${roleLabel} · ${peerLabel}`;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-h-[76px] items-center gap-3 border-b border-sam-border px-3 py-2"
      data-domain-row-unread={unreadCount > 0 ? "1" : "0"}
      data-trade-list-row="1"
    >
      <div className="relative h-12 w-12 shrink-0">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-ui-rect bg-sam-muted/20">
          {productImageUrl ? (
            <SamarketThumbnail
              src={productImageUrl}
              alt=""
              size={48}
              className="h-12 w-12 object-cover"
            />
          ) : (
            <span className="text-sm text-sam-muted" aria-hidden>
              ·
            </span>
          )}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 overflow-hidden rounded-full border-2 border-sam-app bg-sam-muted/30">
          <SamarketUserAvatarThumb
            avatarUrl={peerAvatarUrl}
            size={20}
            roundedClassName="rounded-full"
            className="h-5 w-5 object-cover"
          />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-sam-fg">{productTitle}</div>
          {time ? <span className="shrink-0 text-[11px] text-sam-muted">{time}</span> : null}
        </div>
        <div className="truncate text-[11px] text-sam-muted">{subtitle}</div>
        <div
          className={
            previewIsSystemEvent
              ? "truncate text-[11px] text-sam-muted/80"
              : "truncate text-xs text-sam-muted"
          }
        >
          {preview}
        </div>
      </div>
      {unreadCount > 0 ? (
        <span className="shrink-0 rounded-full bg-sam-primary px-1.5 py-0.5 text-[10px] text-white tabular-nums">
          {unreadCount > 999 ? "999+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
