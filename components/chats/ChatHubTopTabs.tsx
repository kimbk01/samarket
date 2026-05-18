"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildChatHubTopTabDefs } from "@/lib/chats/surfaces/chat-hub-tab-defs";
import type { ChatHubSegment } from "@/lib/chats/surfaces/chat-hub-segment";
import { APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS } from "@/lib/ui/app-content-layout";

export type { ChatHubSegment } from "@/lib/chats/surfaces/chat-hub-segment";

const tabScrollHide = "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function ChatHubTopTabs({
  active,
  orderChatsHref = "/community-messenger/delivery-chats",
  showOrderTab = true,
}: {
  active: ChatHubSegment;
  orderChatsHref?: string;
  showOrderTab?: boolean;
}) {
  const { t } = useI18n();
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<ChatHubSegment, HTMLAnchorElement | null>>({ trade: null, order: null });
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const tabs = buildChatHubTopTabDefs({ orderChatsHref, showOrderTab });

  const updateIndicator = useCallback(() => {
    const outer = outerRef.current;
    const tab = tabRefs.current[active];
    if (!outer || !tab) return;
    const o = outer.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    setIndicator({ left: tr.left - o.left, width: tr.width });
  }, [active]);

  const scrollActiveTabIntoView = useCallback(() => {
    const scrollEl = scrollRef.current;
    const tabEl = tabRefs.current[active];
    if (!scrollEl || !tabEl) return;
    const viewW = scrollEl.clientWidth;
    if (viewW <= 0) return;
    const scrollRect = scrollEl.getBoundingClientRect();
    const tabRect = tabEl.getBoundingClientRect();
    const tabLeftInContent = scrollEl.scrollLeft + (tabRect.left - scrollRect.left);
    const maxScroll = Math.max(0, scrollEl.scrollWidth - viewW);
    const targetLeft = tabLeftInContent - (viewW - tabRect.width) / 2;
    scrollEl.scrollTo({ left: Math.max(0, Math.min(maxScroll, targetLeft)), behavior: "smooth" });
  }, [active]);

  useLayoutEffect(() => {
    updateIndicator();
    const outer = outerRef.current;
    const ro = new ResizeObserver(() => updateIndicator());
    if (outer) ro.observe(outer);
    window.addEventListener("resize", updateIndicator);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [active, orderChatsHref, showOrderTab, updateIndicator]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateIndicator, { passive: true });
    return () => el.removeEventListener("scroll", updateIndicator);
  }, [updateIndicator]);

  useLayoutEffect(() => {
    scrollActiveTabIntoView();
    requestAnimationFrame(updateIndicator);
  }, [active, scrollActiveTabIntoView, updateIndicator]);

  return (
    <div className="w-full border-b border-sam-border bg-sam-surface">
      <div ref={outerRef} className={`relative ${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS}`}>
        <nav
          ref={scrollRef}
          className={`flex h-[55px] flex-nowrap items-center gap-6 overflow-x-auto ${tabScrollHide}`}
          aria-label={t("nav_trade_hub_chat")}
        >
          {tabs.map(({ segment, href, label, labelKey }) => {
            const isOn = active === segment;
            return (
              <Link
                key={segment}
                ref={(el) => {
                  tabRefs.current[segment] = el;
                }}
                href={href}
                prefetch={false}
                aria-current={isOn ? "page" : undefined}
                className={[
                  "flex shrink-0 items-center whitespace-nowrap sam-text-body leading-snug transition-colors duration-200 sm:sam-text-body",
                  isOn ? "font-semibold text-sam-fg" : "font-medium text-sam-muted hover:text-sam-fg",
                ].join(" ")}
              >
                {labelKey ? t(labelKey) : label}
              </Link>
            );
          })}
        </nav>
        <div
          className="pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-sam-primary transition-[left,width] duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
          aria-hidden
        />
      </div>
    </div>
  );
}
