"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, ChevronRight, ClipboardList, Handshake, Layers, Package } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { orderStatusName } from "@/lib/stores/store-order-process-model";
import { buyerStoreOrderDetailPath } from "@/lib/delivery/customer/navigate-to-buyer-store-order-detail";
import { homeOrderReadyMinutes, type HomeMyActivityResponse } from "@/lib/home/home-my-activity";

type Row = { key: "trade" | "order"; label: string; sub: string | null; href: string };

/**
 * 홈 ⑤ 내 진행 중 (회원 · 1건 이상일 때만) — 시안 v2 §3-6 (Owner 「v2대로 구현」 2026-11-26).
 * 휴대폰 = 겹친 네모 아이콘 제목 + 알약 2개(거래 연초록 · 주문 연노랑) · 태블릿 = 진초록 머리띠 + 줄.
 * 데이터 = `GET /api/home/my-activity` 1번 (거래 = 협의 중·예약 중 상품 · 주문 = 진행 중 단계).
 * 「도착 n분」은 배달 예상 값이 없어 쓰지 않는다 — 조리 전이면 「준비 n분」, 아니면 매장 이름.
 */
export function HomeMyActivity({
  refreshSeq,
  onShownChange,
}: {
  refreshSeq: number;
  /** 칸이 보이는지 — 태블릿 2열 배치가 빈 칸 자리를 잡지 않게 */
  onShownChange?: (shown: boolean) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [data, setData] = useState<HomeMyActivityResponse | null>(null);
  /** 「준비 n분」 기준 시각 — 받을 때와 1분마다 갱신 (그리기 중 시계를 읽지 않는다) */
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    void fetch("/api/home/my-activity", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const j = (await res.json().catch(() => null)) as HomeMyActivityResponse | null;
        if (alive && res.ok && j?.ok) {
          setData(j);
          setNow(Date.now());
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [refreshSeq]);

  const rows: Row[] = [];
  const trade = data?.trade;
  if (trade && trade.count > 0) {
    rows.push({ key: "trade", label: t("home_my_trade_count", { count: trade.count }), sub: trade.title || null, href: trade.href });
  }
  const order = data?.order;
  if (order && order.count > 0) {
    if (order.count === 1) {
      const mins = now > 0 ? homeOrderReadyMinutes(order, now) : null;
      rows.push({
        key: "order",
        label: t("home_my_order_one", { stage: orderStatusName(order.status, order.fulfillment) }),
        sub: mins != null ? t("home_my_order_ready", { min: mins }) : order.storeName || null,
        href: buyerStoreOrderDetailPath(order.id),
      });
    } else {
      rows.push({ key: "order", label: t("home_my_order_many", { count: order.count }), sub: null, href: "/orders" });
    }
  }

  const shown = rows.length > 0;
  useEffect(() => {
    onShownChange?.(shown);
  }, [shown, onShownChange]);
  if (!shown) return null;

  return (
    <section className="home-my" data-home-my-activity>
      <h2 className="home-my-head">
        <Layers className="home-my-head-ic home-my-head-ic--m" strokeWidth={2.2} aria-hidden />
        <ClipboardList className="home-my-head-ic home-my-head-ic--t" strokeWidth={2.2} aria-hidden />
        {t("home_my_activity_title")}
      </h2>
      <ul className="home-my-list">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              className={`home-press home-my-row home-my-row--${row.key}`}
              onClick={() => router.push(row.href)}
              data-home-my-row={row.key}
            >
              <span className="home-my-ic" aria-hidden>
                {row.key === "trade" ? (
                  <>
                    <Handshake className="home-my-ic-m" strokeWidth={2} />
                    <Package className="home-my-ic-t" strokeWidth={2} />
                  </>
                ) : (
                  <Bike className="home-my-ic-mt" strokeWidth={2} />
                )}
              </span>
              <span className="home-my-text">
                <b>{row.label}</b>
                {row.sub ? <span className="home-my-sub"> · {row.sub}</span> : null}
              </span>
              <ChevronRight className="home-my-chev" strokeWidth={2.4} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
