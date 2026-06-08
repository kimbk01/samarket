"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { MessengerListRow } from "@/components/community-messenger/line-ui";
import {
  formatConversationTimestamp,
  type MessengerPillarSummary,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import { withMessengerEntryOrigin } from "@/lib/community-messenger/messenger-entry-origin";
import { runMessengerViewTransition, shouldSkipMessengerNavTransitionModifiers } from "@/lib/community-messenger/messenger-view-transition";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 메신저 받은메시지함 상단의 「거래 채팅」/「배달 채팅」 묶음 행.
 *
 * - 추가 fetch 없이 `MessengerPillarSummary` 만으로 렌더(거래 가볍게 invariant 유지).
 * - 탭 시 전용 서브 라우트(`/community-messenger/trade-chats|delivery-chats`)로 이동.
 * - 1:1·그룹 채팅 행과 시각 톤(아바타·제목·미리보기·우측 시간·미읽음 뱃지)을 통일.
 */

type Variant = "trade" | "delivery";

const VARIANT_COPY: Record<Variant, { href: string }> = {
  trade: {
    href: "/community-messenger/trade-chats",
  },
  delivery: {
    href: "/community-messenger/delivery-chats",
  },
};

function StorefrontIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 8.5 5 4.5h14l1.5 4" />
      <path d="M3.5 8.5h17v2.2a2.4 2.4 0 0 1-4.8 0 2.4 2.4 0 0 1-4.8 0 2.4 2.4 0 0 1-4.8 0 2.4 2.4 0 0 1-2.6 0V8.5Z" />
      <path d="M5.5 12.5V19h13v-6.5" />
      <path d="M10 19v-4h4v4" />
    </svg>
  );
}

function DeliveryScooterIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="6.5" cy="17" r="2.4" />
      <circle cx="17.5" cy="17" r="2.4" />
      <path d="M9 17h6" />
      <path d="M5.5 17H4.5a1.5 1.5 0 0 1-1.5-1.5v-2.7a1.5 1.5 0 0 1 1.5-1.5H8" />
      <path d="M8 11.3 10.5 7H14l2 4 2.7 1.5a1.4 1.4 0 0 1 .8 1.3v1.7a1.5 1.5 0 0 1-1.5 1.5h-.5" />
      <path d="M14 7h3.2" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

type Props = {
  variant: Variant;
  summary: MessengerPillarSummary;
  /** 인박스 진입 시점에 가지고 있던 출처 — 서브 리스트에 그대로 보존 */
  entryOriginQuery?: string | null;
};

export function MessengerPillarSummaryRow({ variant, summary, entryOriginQuery = null }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const copy = useMemo(() => {
    const base = VARIANT_COPY[variant];
    if (variant === "trade") {
      return {
        ...base,
        title: t("cm_ui_chat_group_trade"),
        emptyPreview: t("nav_chat_trade_empty"),
        defaultRoomLabel: t("cm_ui_chat_group_trade"),
      };
    }
    return {
      ...base,
      title: t("nav_chat_order_compact"),
      emptyPreview: t("nav_chat_order_empty"),
      defaultRoomLabel: t("nav_chat_order_compact"),
    };
  }, [t, variant]);

  const href = useMemo(() => {
    if (!entryOriginQuery) return copy.href;
    return withMessengerEntryOrigin(
      copy.href,
      entryOriginQuery === "community" || entryOriginQuery === "trade" || entryOriginQuery === "delivery"
        ? entryOriginQuery
        : null
    );
  }, [copy.href, entryOriginQuery]);

  const lastItem = summary.lastItem;
  const lastTitle = lastItem?.room.title?.trim() || copy.defaultRoomLabel;
  const previewBase = lastItem?.preview?.trim();
  const preview = previewBase
    ? `${lastTitle}: ${previewBase}`
    : lastItem
      ? lastTitle
      : copy.emptyPreview;
  const lastEventAt = lastItem?.lastEventAt;
  const unread = summary.unreadTotal;

  const avatar = (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)]"
      style={{ color: "var(--messenger-text)" }}
      aria-hidden
    >
      {variant === "trade" ? <StorefrontIcon /> : <DeliveryScooterIcon />}
    </div>
  );

  return (
    <Link
      href={href}
      prefetch
      scroll={false}
      data-messenger-chat-row="true"
      data-messenger-pillar-row={variant}
      className="block select-none touch-manipulation rounded-[var(--messenger-radius-md)] transition-[transform,background-color,box-shadow] duration-100 ease-out will-change-transform active:scale-[0.97] active:bg-[color:var(--messenger-surface-muted)] [box-shadow:inset_0_0_0_1px_transparent] active:[box-shadow:inset_0_1px_0_rgba(255,255,255,0.06),inset_0_2px_10px_rgba(0,0,0,0.1)]"
      aria-label={`${copy.title} 묶음 보기`}
      onClick={(e) => {
        if (shouldSkipMessengerNavTransitionModifiers(e)) return;
        e.preventDefault();
        runMessengerViewTransition(() => {
          router.push(href);
        }, "pillar-forward");
      }}
    >
      <MessengerListRow
        avatar={avatar}
        trailing={
          <>
            <span
              className="sam-text-helper font-normal tabular-nums"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {lastEventAt ? formatConversationTimestamp(lastEventAt) : ""}
            </span>
            <div className="flex items-center gap-1">
              {unread > 0 ? (
                <span className="min-h-[18px] min-w-[18px] rounded-full bg-[color:var(--messenger-primary)] px-1 text-center sam-text-xxs font-semibold leading-[18px] text-white">
                  {unread > 999 ? "999+" : unread}
                </span>
              ) : null}
              <span style={{ color: "var(--messenger-text-secondary)" }} aria-hidden>
                <ChevronRightIcon />
              </span>
            </div>
          </>
        }
      >
        <div className="flex min-w-0 items-center gap-1">
          <p
            className="min-w-0 truncate sam-text-body font-semibold leading-tight"
            style={{ color: "var(--messenger-text)" }}
          >
            {copy.title}
          </p>
          {summary.count > 0 ? (
            <span
              className="shrink-0 sam-text-helper font-normal tabular-nums"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {summary.count}
            </span>
          ) : null}
        </div>
        <p
          className={`min-w-0 truncate sam-text-body-secondary font-normal leading-snug ${unread > 0 ? "font-medium" : ""}`}
          style={{ color: unread > 0 ? "var(--messenger-text)" : "var(--messenger-text-secondary)" }}
        >
          {preview}
        </p>
      </MessengerListRow>
    </Link>
  );
}
