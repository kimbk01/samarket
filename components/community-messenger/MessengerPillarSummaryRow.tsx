"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { MessengerPillarSummary } from "@/lib/community-messenger/use-community-messenger-home-state";
import { withMessengerEntryOrigin } from "@/lib/community-messenger/messenger-entry-origin";
import { runMessengerViewTransition, shouldSkipMessengerNavTransitionModifiers } from "@/lib/community-messenger/messenger-view-transition";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import {
  DOMAIN_LIST_CANARY_PRIMED_EVENT,
  peekDomainStoreOrderHubListPreview,
  peekDomainStoreOrderUnreadRoomCount,
  peekDomainTradeHubListPreview,
  peekDomainTradeUnreadRoomCount,
  type DomainCommerceHubListPreview,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-hub-prefetch";
import { subscribeDomainListCanaryPatch } from "@/components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch";

/**
 * 메신저 받은메시지함 상단의 「거래 채팅」/「배달 채팅」 묶음 행.
 *
 * - Preview/시각/latestRoomId: Domain list DTO (List와 동일 Facts). bootstrap summarize 는 cold fallback.
 * - 미읽음 방 수 뱃지 (Hub):
 *   - trade → Domain Trade list hub.unreadRoomCount (= count(rows where unread>0))
 *   - delivery(주문 채팅) → Domain customer list hub.unreadRoomCount
 * - DO NOT use owner-hub trade/delivery attention counts as chat unread room SSOT.
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
  const [domainPreview, setDomainPreview] = useState<DomainCommerceHubListPreview | null>(() =>
    readDomainPreview(variant)
  );
  const [listUnreadRooms, setListUnreadRooms] = useState<number | null>(() =>
    variant === "trade"
      ? peekDomainTradeUnreadRoomCount()
      : peekDomainStoreOrderUnreadRoomCount()
  );

  useEffect(() => {
    const readUnread = () =>
      variant === "trade"
        ? peekDomainTradeUnreadRoomCount()
        : peekDomainStoreOrderUnreadRoomCount();
    setDomainPreview(readDomainPreview(variant));
    setListUnreadRooms(readUnread());
    const onPrimed = (ev: Event) => {
      const bundle = (ev as CustomEvent<{ bundle?: string }>).detail?.bundle;
      if (variant === "trade" && bundle !== "trade") return;
      if (variant === "delivery" && bundle !== "store_order") return;
      setDomainPreview(readDomainPreview(variant));
      setListUnreadRooms(readUnread());
    };
    window.addEventListener(DOMAIN_LIST_CANARY_PRIMED_EVENT, onPrimed);
    const unsubPatch =
      variant === "trade"
        ? subscribeDomainListCanaryPatch("trade", () => {
            /** 새 메시지 패치는 미리보기·시각도 바꾼다 — 안 읽음 수만 읽으면 묶음 줄 문장이 예전 메시지로 남음(2026-10-28 실기) */
            setDomainPreview(readDomainPreview("trade"));
            setListUnreadRooms(peekDomainTradeUnreadRoomCount());
          })
        : subscribeDomainListCanaryPatch("store_order", () => {
            setDomainPreview(readDomainPreview("delivery"));
            setListUnreadRooms(peekDomainStoreOrderUnreadRoomCount());
          });
    return () => {
      window.removeEventListener(DOMAIN_LIST_CANARY_PRIMED_EVENT, onPrimed);
      unsubPatch();
    };
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
   * 2026-11-10 채팅 화면 시안 3판(Owner): 입구 칸에는 마지막 대화·시각을 보여 주지 않는다 —
   * 마지막 대화는 거래/주문 목록 각 행에서만. 이 칸은 이름 + 안 읽은 방 수 + 화살표.
   * latestRoomId 는 진입 프리페치·실기 계측용 data 속성으로만 남긴다.
   */
  const domainAtMs = Date.parse(domainPreview?.lastEventAt ?? "") || 0;
  const bootstrapAtMs = Date.parse(lastItem?.lastEventAt ?? "") || 0;
  const useDomain =
    Boolean(domainPreview && (domainPreview.latestRoomId || domainPreview.lastEventAt)) &&
    !(bootstrapAtMs > domainAtMs);
  const latestRoomId = useDomain ? domainPreview!.latestRoomId : lastItem?.room.id ?? null;
  /**
   * Trade / Customer Order Hub = Domain list unreadRoomCount
   * (= count(rows where unreadMessageCount > 0)). Cache miss → 0 (no attention fallback).
   */
  const unread = Math.max(0, Math.floor(Number(listUnreadRooms) || 0));
  const tileToneClass =
    variant === "trade"
      ? "border-[color:color-mix(in_srgb,var(--sam-primary)_22%,transparent)] bg-[color:var(--sam-primary-soft)] text-[color:var(--sam-primary)]"
      : "border-[color:color-mix(in_srgb,var(--dibay-gold,#EAC784)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--dibay-gold,#EAC784)_22%,var(--sam-bg-surface,#fff))] text-[color:var(--dibay-brown,#362415)]";

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
      className={`flex min-h-[44px] min-w-0 select-none touch-manipulation items-center gap-2 rounded-ui-rect border px-2.5 py-2 transition-transform duration-100 ease-out active:scale-[0.97] ${tileToneClass}`}
      aria-label={t("cm_ui_pillar_open_list_aria", { title: copy.title })}
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
      {variant === "trade" ? <StorefrontIcon className="h-5 w-5 shrink-0" /> : <DeliveryScooterIcon className="h-5 w-5 shrink-0" />}
      <span data-cm-list-title="" className="min-w-0 flex-1 truncate text-[14px] font-bold leading-tight">
        {copy.title}
      </span>
      {unread > 0 ? (
        <span className="min-h-[18px] min-w-[18px] shrink-0 rounded-full bg-[color:var(--sm-color-danger)] px-1.5 text-center text-[10.5px] font-bold leading-[18px] text-white">
          {unread > 999 ? "999+" : unread}
        </span>
      ) : null}
      <span className="shrink-0 opacity-60" aria-hidden>
        <ChevronRightIcon />
      </span>
    </Link>
  );
}
