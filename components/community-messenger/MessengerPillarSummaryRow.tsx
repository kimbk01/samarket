"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MessengerListRow } from "@/components/community-messenger/line-ui";
import {
  formatConversationTimestamp,
  type MessengerPillarSummary,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import { withMessengerEntryOrigin } from "@/lib/community-messenger/messenger-entry-origin";
import { resolveStoreOrderDisplayIdentity } from "@/lib/community-messenger/store-order-display-identity";
import { runMessengerViewTransition, shouldSkipMessengerNavTransitionModifiers } from "@/lib/community-messenger/messenger-view-transition";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import {
  DOMAIN_LIST_CANARY_PRIMED_EVENT,
  peekDomainStoreOrderHubListPreview,
  peekDomainTradeHubListPreview,
  type DomainCommerceHubListPreview,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-hub-prefetch";

/**
 * 메신저 받은메시지함 상단의 「거래 채팅」/「배달 채팅」 묶음 행.
 *
 * - Preview/시각/latestRoomId: Domain list DTO (List와 동일 Facts). bootstrap summarize 는 cold fallback.
 * - 보라 미읽음 뱃지는 Projection Apply → owner-hub (`chatUnread` / `storeOrderChatUnread`)만.
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

function readDomainPreview(variant: Variant): DomainCommerceHubListPreview | null {
  return variant === "trade" ? peekDomainTradeHubListPreview() : peekDomainStoreOrderHubListPreview();
}

type Props = {
  variant: Variant;
  summary: MessengerPillarSummary;
  /** 인박스 진입 시점에 가지고 있던 출처 — 서브 리스트에 그대로 보존 */
  entryOriginQuery?: string | null;
};

export function MessengerPillarSummaryRow({ variant, summary, entryOriginQuery = null }: Props) {
  const router = useRouter();
  const isWide = useIsMessengerSplitViewport();
  const { t } = useI18n();
  const hub = useOwnerHubBadgeBreakdown();
  const [domainPreview, setDomainPreview] = useState<DomainCommerceHubListPreview | null>(() =>
    readDomainPreview(variant)
  );

  useEffect(() => {
    setDomainPreview(readDomainPreview(variant));
    const onPrimed = (ev: Event) => {
      const bundle = (ev as CustomEvent<{ bundle?: string }>).detail?.bundle;
      if (variant === "trade" && bundle !== "trade") return;
      if (variant === "delivery" && bundle !== "store_order") return;
      setDomainPreview(readDomainPreview(variant));
    };
    window.addEventListener(DOMAIN_LIST_CANARY_PRIMED_EVENT, onPrimed);
    return () => window.removeEventListener(DOMAIN_LIST_CANARY_PRIMED_EVENT, onPrimed);
  }, [variant]);

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
  /**
   * 주문(delivery) 허브 preview 는 표시 정체성이 매장이어야 한다(회원명·room.title 금지).
   * Domain list 가 있으면 매장명/preview/시각은 List 1행과 동일 Facts.
   */
  const deliveryStoreIdentity =
    variant === "delivery" && lastItem ? resolveStoreOrderDisplayIdentity(lastItem.room) : null;
  const useDomain = Boolean(domainPreview && (domainPreview.latestRoomId || domainPreview.lastEventAt));
  const lastTitle = useDomain
    ? domainPreview!.title.trim() || copy.defaultRoomLabel
    : variant === "delivery"
      ? deliveryStoreIdentity?.storeName?.trim() || copy.defaultRoomLabel
      : lastItem?.room.title?.trim() || copy.defaultRoomLabel;
  const previewBase = useDomain
    ? domainPreview!.previewText.trim()
    : lastItem?.preview?.trim() || "";
  const preview = previewBase
    ? `${lastTitle}: ${previewBase}`
    : useDomain || lastItem
      ? lastTitle
      : copy.emptyPreview;
  const lastEventAt = useDomain ? domainPreview!.lastEventAt : lastItem?.lastEventAt;
  const latestRoomId = useDomain ? domainPreview!.latestRoomId : lastItem?.room.id ?? null;
  /**
   * Projection Apply SSOT — Trade Hub = chatUnread, Order Hub = storeOrderChatUnread.
   * Bootstrap room totals are never the purple badge.
   */
  const unread =
    variant === "trade"
      ? Math.max(0, Math.floor(hub.chatUnread || 0))
      : Math.max(0, Math.floor(hub.storeOrderChatUnread || 0));

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
      data-messenger-pillar-unread={String(unread)}
      data-messenger-pillar-latest-room={latestRoomId ?? ""}
      data-messenger-pillar-preview-source={useDomain ? "domain_list" : "bootstrap"}
      className="block select-none touch-manipulation rounded-[var(--messenger-radius-md)] transition-[transform,background-color,box-shadow] duration-100 ease-out will-change-transform active:scale-[0.97] active:bg-[color:var(--messenger-surface-muted)] [box-shadow:inset_0_0_0_1px_transparent] active:[box-shadow:inset_0_1px_0_rgba(255,255,255,0.06),inset_0_2px_10px_rgba(0,0,0,0.1)]"
      aria-label={`${copy.title} 묶음 보기`}
      onClick={(e) => {
        if (shouldSkipMessengerNavTransitionModifiers(e)) return;
        e.preventDefault();
        runMessengerViewTransition(() => {
          if (isWide) {
            router.replace(href, { scroll: false });
            return;
          }
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
