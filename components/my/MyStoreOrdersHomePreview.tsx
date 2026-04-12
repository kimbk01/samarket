"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { formatMoneyPhp } from "@/lib/utils/format";
import { fetchMeStoreOrdersListDeduped } from "@/lib/stores/store-delivery-api-client";

const ORDER_LABEL: Record<string, string> = { ...BUYER_ORDER_STATUS_LABEL };

const FULFILL_LABEL: Record<string, string> = {
  pickup: "포장 픽업",
  local_delivery: "배달",
  shipping: "배달",
};

type PreviewItem = {
  product_title_snapshot: string;
  qty: number;
};

type PreviewOrder = {
  id: string;
  order_no: string;
  store_name: string;
  payment_amount: number;
  order_status: string;
  fulfillment_type: string;
  created_at: string;
  buyer_note?: string | null;
  auto_complete_at?: string | null;
  items?: PreviewItem[];
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unauth" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "ok"; orders: PreviewOrder[] };

const PREVIEW_LIMIT = 3;

/** loading / idle 제외 — fetch 완료 후 상태만 반환 */
async function fetchStoreOrdersPreviewState(): Promise<Exclude<State, { kind: "idle" | "loading" }>> {
  try {
    const { status, json } = await fetchMeStoreOrdersListDeduped("?limit=8");
    if (status === 401) {
      return { kind: "unauth" };
    }
    if (status === 503) {
      return { kind: "unavailable" };
    }
    const data = json as { ok?: boolean; orders?: unknown };
    if (!data?.ok) {
      return { kind: "error" };
    }
    const rows = (data.orders ?? []) as PreviewOrder[];
    if (rows.length === 0) {
      return { kind: "empty" };
    }
    return { kind: "ok", orders: rows.slice(0, PREVIEW_LIMIT) };
  } catch {
    return { kind: "error" };
  }
}

type Props = {
  /** false면 요청하지 않음(비로그인 등) */
  enabled?: boolean;
};

/**
 * 내정보(/mypage) 프로필 아래 — 최근 배달 주문 요약.
 * UI·데이터는 `/mypage/store-orders`(MyStoreOrdersView)와 동일 API·카드 톤.
 */
export function MyStoreOrdersHomePreview({ enabled = true }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!enabled) {
      setState({ kind: "idle" });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading" });
    void fetchStoreOrdersPreviewState().then((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  function retry() {
    setState({ kind: "loading" });
    void fetchStoreOrdersPreviewState().then(setState);
  }

  if (!enabled) {
    return null;
  }

  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <section className="rounded-ui-rect border border-ig-border bg-sam-surface p-4" aria-busy="true">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">배달 주문</h2>
        </div>
        <p className="text-[13px] text-muted">불러오는 중…</p>
      </section>
    );
  }

  if (state.kind === "unauth") {
    return null;
  }

  if (state.kind === "unavailable") {
    return (
      <section className="rounded-ui-rect border border-ig-border bg-sam-surface p-4">
        <h2 className="text-[15px] font-semibold text-foreground">배달 주문</h2>
        <p className="mt-2 text-[13px] text-muted">주문 정보를 불러올 수 없습니다. (서버 설정)</p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="rounded-ui-rect border border-ig-border bg-sam-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">배달 주문</h2>
          <button
            type="button"
            onClick={() => retry()}
            className="text-[13px] font-medium text-signature"
          >
            다시 시도
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-ui-rect border border-ig-border bg-sam-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-foreground">배달 주문</h2>
        <Link href="/my/store-orders" className="shrink-0 text-[13px] font-medium text-signature">
          전체 보기
        </Link>
      </div>

      {state.kind === "empty" ? (
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-muted">아직 배달 주문이 없습니다.</p>
          <Link
            href="/stores"
            className="inline-block text-[13px] font-medium text-signature underline underline-offset-2"
          >
            매장 둘러보기
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {state.orders.map((o) => (
            <li
              key={o.id}
              className="rounded-ui-rect border border-ig-border bg-sam-surface p-4"
            >
              <Link
                href={`/my/store-orders/${encodeURIComponent(o.id)}`}
                className="block transition-colors active:opacity-90"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[15px] font-semibold text-foreground">
                    {o.store_name?.trim() || "매장"}
                  </p>
                  <span className="text-xs text-muted">{o.order_no}</span>
                </div>
                <p className="mt-2 text-lg font-bold text-foreground">{formatMoneyPhp(o.payment_amount)}</p>
                {o.items && o.items.length > 0 ? (
                  <p className="mt-1 text-[12px] leading-snug text-muted">
                    {o.items.map((it) => `${it.product_title_snapshot}×${it.qty}`).join(", ")}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted">
                  {FULFILL_LABEL[o.fulfillment_type] ?? o.fulfillment_type}
                  {" · "}
                  {ORDER_LABEL[o.order_status] ?? o.order_status}
                </p>
                {(o.order_status === "ready_for_pickup" ||
                  o.order_status === "delivering" ||
                  o.order_status === "arrived") &&
                o.auto_complete_at ? (
                  <p className="mt-2 text-[11px] leading-snug text-muted">
                    자동 완료 예정:{" "}
                    <span className="font-medium text-foreground">
                      {new Date(o.auto_complete_at).toLocaleString("ko-KR")}
                    </span>
                  </p>
                ) : null}
                {o.buyer_note ? (
                  <p className="mt-2 text-xs text-muted">요청: {o.buyer_note}</p>
                ) : null}
                <p className="mt-2 text-[11px] text-muted">
                  {new Date(o.created_at).toLocaleString("ko-KR")}
                </p>
                <p className="mt-2 text-right text-xs text-signature">상세 보기 →</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
