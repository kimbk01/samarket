"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Handshake, Receipt } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { fetchMeStoreOrdersHubSummaryDeduped } from "@/lib/stores/store-delivery-api-client";
import { orderStatusName } from "@/lib/stores/store-order-process-model";
import { buyerStoreOrderDetailPath } from "@/lib/delivery/customer/navigate-to-buyer-store-order-detail";
import { fetchCommunityMessengerHomeSilentLists } from "@/lib/community-messenger/cm-home-silent-lists-fetch";
import { communityMessengerRoomHref } from "@/lib/community-messenger/messenger-entry-origin";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";
import type { BuyerStoreOrdersHubSummary } from "@/lib/delivery/customer/load-buyer-store-orders-hub-summary";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { homePressFromClick } from "@/lib/ui/home-press-feedback";

/** 거래가 끝나지 않은 거래 채팅 상태 — `TradeFlowStatus` 중 대화·판매자 완료 표시 전 단계 */
const ACTIVE_TRADE_FLOW = new Set(["chatting", "seller_marked_done"]);

/** home-sync 대화 목록 → 진행 중 거래 방 (최근 순 그대로) */
export function pickActiveTradeRooms(chats: CommunityMessengerRoomSummary[] | undefined): CommunityMessengerRoomSummary[] {
  return (chats ?? []).filter(
    (r) => r.contextMeta?.kind === "trade" && ACTIVE_TRADE_FLOW.has(String(r.contextMeta.tradeFlowStatus ?? ""))
  );
}

type Row = { key: "order" | "trade"; label: string; sub: string | null; href: string };

/**
 * 홈 ⑤ 내 진행 중 (회원만 · 진행 중이 있을 때만) — 설계 §3⑤ (Owner 「제안대로 승인」 2026-11-26, D4 포함).
 * 주문 = 기존 주문 요약 API(`hub_summary`), 단계 이름 = `orderStatusName` 만.
 * 거래 = 메신저 대화 목록(home-sync critical, 메신저와 같은 단일 비행·재생 캐시)의 거래 방.
 * 예상 도착 시간은 데이터가 없어 보이지 않는다. 둘 다 0건이면 칸 전체를 그리지 않는다.
 */
export function HomeMyActivity({
  refreshSeq,
  onShownChange,
}: {
  refreshSeq: number;
  /** 칸이 보이는지(진행 중 1건 이상) — 태블릿 2열 배치가 빈 칸 자리를 잡지 않게 */
  onShownChange?: (shown: boolean) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [summary, setSummary] = useState<BuyerStoreOrdersHubSummary | null>(null);
  const [trades, setTrades] = useState<CommunityMessengerRoomSummary[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchMeStoreOrdersHubSummaryDeduped({ force: refreshSeq > 0 })
      .then((r) => {
        const s = (r.json as { ok?: boolean; hub_summary?: BuyerStoreOrdersHubSummary } | null)?.hub_summary;
        if (alive && r.status === 200 && s) setSummary(s);
      })
      .catch(() => {});
    void fetchCommunityMessengerHomeSilentLists({ tier: "critical", reentryTrigger: "app_home_my_activity" })
      .then(({ res, json }) => {
        if (alive && res.ok && json.ok !== false) setTrades(pickActiveTradeRooms(json.chats));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [refreshSeq]);

  const rows: Row[] = [];
  const active = summary?.activeOrders ?? 0;
  if (active === 1 && summary?.firstActive) {
    const o = summary.firstActive;
    rows.push({
      key: "order",
      label: t("home_my_order_one", { store: o.store_name }),
      sub: orderStatusName(o.order_status, o.fulfillment_type),
      href: buyerStoreOrderDetailPath(o.id),
    });
  } else if (active > 0) {
    rows.push({ key: "order", label: t("home_my_order_many", { count: active }), sub: null, href: "/orders" });
  }
  if (trades.length === 1) {
    const r = trades[0]!;
    rows.push({
      key: "trade",
      label: t("home_my_trade_one", { title: r.contextMeta?.headline || r.title }),
      sub: r.contextMeta?.itemStateLabel ?? null,
      href: communityMessengerRoomHref(r.id, null, "trade"),
    });
  } else if (trades.length > 1) {
    rows.push({ key: "trade", label: t("home_my_trade_many", { count: trades.length }), sub: null, href: TRADE_CHAT_MESSENGER_LIST_HREF });
  }
  const shown = rows.length > 0;
  useEffect(() => {
    onShownChange?.(shown);
  }, [shown, onShownChange]);
  if (!shown) return null;

  return (
    <section className="home-my" data-home-my-activity>
      <h2 className="home-my-title">{t("home_my_activity_title")}</h2>
      <ul className="home-my-list">
        {rows.map((row) => {
          const Icon = row.key === "order" ? Receipt : Handshake;
          return (
            <li key={row.key}>
              <button
                type="button"
                className="home-press home-my-row"
                onClick={(e) => {
                  homePressFromClick("tap", e);
                  router.push(row.href);
                }}
                data-home-my-row={row.key}
              >
                <span className="home-my-ic" aria-hidden>
                  <Icon className="h-[18px] w-[18px] text-sam-primary" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[14px] font-bold text-sam-fg">{row.label}</span>
                  {row.sub ? <span className="block truncate text-[12px] font-semibold text-[#1C7A3A]">{row.sub}</span> : null}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-sam-muted" strokeWidth={2.2} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
