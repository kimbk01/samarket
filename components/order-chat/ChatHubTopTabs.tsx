"use client";

/**
 * 채팅 허브 2단 — 흰 배경 Tab Bar (스크롤 + 선택 탭 톤 + 하단 인디케이터)
 * 탭 정의는 `lib/chats/surfaces/chat-hub-tab-defs.ts` — 종류별 문구는 각 `*-chat-surface.ts`.
 */
import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { buildChatHubTopTabDefs } from "@/lib/chats/surfaces/chat-hub-tab-defs";
import type { ChatHubSegment } from "@/lib/chats/surfaces/chat-hub-segment";
import { APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS } from "@/lib/ui/app-content-layout";

export type { ChatHubSegment } from "@/lib/chats/surfaces/chat-hub-segment";

const tabScrollHide =
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function ChatHubTopTabs({
  active,
  orderChatsHref = "/orders?tab=chat",
  showOrderTab = true,
}: {
  active: ChatHubSegment;
  /** 주문 채팅 목록 URL — 관리자는 `/admin/order-chats` 등 전달 */
  orderChatsHref?: string;
  /** false: `/chats` 허브 — 주문 채팅은 `/orders` 탭으로 이동 */
  showOrderTab?: boolean;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<ChatHubSegment, HTMLAnchorElement | null>>({
    trade: null,
    community: null,
    order: null,
  });
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const tabs = buildChatHubTopTabDefs({ orderChatsHref, showOrderTab });

  const updateIndicator = useCallback(() => {
    const outer = outerRef.current;
    const tab = tabRefs.current[active];
    if (!outer || !tab) return;
    const o = outer.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    setIndicator({ left: t.left - o.left, width: t.width });
  }, [active]);

  /** 선택 탭을 가로 스크롤 영역 안으로 항상 보이게 — 가능하면 뷰 중앙 정렬 */
  const scrollActiveTabIntoView = useCallback(() => {
    const scrollEl = scrollRef.current;
    const tabEl = tabRefs.current[active];
    if (!scrollEl || !tabEl) return;

    const viewW = scrollEl.clientWidth;
    if (viewW <= 0) return;

    const scrollRect = scrollEl.getBoundingClientRect();
    const tabRect = tabEl.getBoundingClientRect();
    const tabW = tabRect.width;
    const tabLeftInContent = scrollEl.scrollLeft + (tabRect.left - scrollRect.left);
    const maxScroll = Math.max(0, scrollEl.scrollWidth - viewW);
    const targetLeft = tabLeftInContent - (viewW - tabW) / 2;
    const left = Math.max(0, Math.min(maxScroll, targetLeft));

    scrollEl.scrollTo({ left, behavior: "smooth" });
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
    <div className="w-full border-b border-gray-200 bg-white">
      <div
        ref={outerRef}
        className={`relative ${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS}`}
      >
        <nav
          ref={scrollRef}
          className={`flex h-[55px] flex-nowrap items-center gap-6 overflow-x-auto ${tabScrollHide}`}
          aria-label="채팅 구분"
        >
          {tabs.map(({ segment, href, label }) => {
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
                  "flex shrink-0 items-center whitespace-nowrap text-[14px] leading-snug transition-colors duration-200 sm:text-[15px]",
                  isOn ? "font-semibold text-gray-900" : "font-medium text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div
          className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-gray-900 transition-[left,width] duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
          aria-hidden
        />
      </div>
    </div>
  );
}
