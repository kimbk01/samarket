"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { CommerceCartHubHeaderRight } from "@/components/layout/CommerceCartHubHeaderRight";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { MemberOrderStatusBadge } from "@/components/member-orders/MemberOrderStatusBadge";
import { MemberOrderTabs } from "@/components/member-orders/MemberOrderTabs";
import { MEMBER_STATUS_USER_MESSAGE } from "@/lib/member-orders/member-order-labels";
import type { MemberOrderStatus, MemberOrderTab } from "@/lib/member-orders/types";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { isStoreOrderChatDisabledForBuyer } from "@/lib/stores/order-status-transitions";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import {
  APP_MAIN_COLUMN_CLASS,
  APP_MAIN_GUTTER_NEG_X_CLASS,
  APP_MAIN_GUTTER_X_CLASS,
} from "@/lib/ui/app-content-layout";
import type { CompletedOrderReorderPayload } from "@/lib/stores/apply-completed-order-to-commerce-cart";
import { StoreOrderReorderAgainButton } from "@/components/mypage/StoreOrderReorderAgainButton";

type ItemRow = {
  id: string;
  product_id?: string;
  product_title_snapshot: string;
  price_snapshot?: number;
  qty: number;
  options_snapshot_json?: unknown;
};

type OrderRow = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  /** `GET /api/me/store-orders` — 매장 상세·장바구니 경로용 */
  store_slug?: string;
  total_amount: number;
  payment_amount: number;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note: string | null;
  created_at: string;
  auto_complete_at?: string | null;
  items?: ItemRow[];
  /** `GET /api/me/store-orders` — 완료·미작성·store_reviews 테이블 있을 때만 true */
  can_submit_review?: boolean;
  /** 매장 프로필(채팅 목록 카드와 동일 톤의 썸네일) */
  store_profile_image_url?: string | null;
  order_chat_unread_count?: number;
};

function buyerStoreOrderChatHref(args: { embedded: boolean; orderId: string }): string {
  return args.embedded
    ? `/orders/store/${encodeURIComponent(args.orderId)}/chat`
    : `/mypage/store-orders/${encodeURIComponent(args.orderId)}/chat`;
}

const MEMBER_STATUSES = new Set<string>([
  "pending",
  "accepted",
  "preparing",
  "delivering",
  "ready_for_pickup",
  "arrived",
  "completed",
  "cancelled",
  "cancel_requested",
  "refund_requested",
  "refunded",
]);

function isMemberOrderStatus(s: string): s is MemberOrderStatus {
  return MEMBER_STATUSES.has(s);
}

function filterByTab(rows: OrderRow[], tab: MemberOrderTab): OrderRow[] {
  return rows.filter((o) => {
    const s = o.order_status;
    switch (tab) {
      case "all":
        return true;
      case "active":
        return ["pending", "accepted", "preparing", "delivering", "ready_for_pickup", "arrived"].includes(
          s
        );
      case "done":
        return s === "completed";
      case "issue":
        return ["cancelled", "cancel_requested", "refund_requested", "refunded"].includes(s);
      default:
        return true;
    }
  });
}

function tabCounts(rows: OrderRow[]): Record<MemberOrderTab, number> {
  const keys: MemberOrderTab[] = ["all", "active", "done", "issue"];
  const o: Record<MemberOrderTab, number> = { all: 0, active: 0, done: 0, issue: 0 };
  for (const k of keys) o[k] = filterByTab(rows, k).length;
  return o;
}

function isDeliveryFulfillment(ft: string) {
  return ft === "local_delivery" || ft === "shipping";
}

function statusUserLine(status: string) {
  if (isMemberOrderStatus(status)) {
    return MEMBER_STATUS_USER_MESSAGE[status];
  }
  return BUYER_ORDER_STATUS_LABEL[status] ?? status;
}

/** 피드형 메타 — 페이스북 스타일 상대 시각 */
function formatFeedRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "방금 전";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

const FB_MUTED = "text-[#65676B] dark:text-[#B0B3B8]";
const FB_BODY = "text-[#050505] dark:text-[#E4E6EB]";
const FB_HOVER_ROW = "hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C]";
const FB_DIVIDER = "border-[#CED0D4]/80 dark:border-[#3E4042]";

function FeedActionRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`flex min-h-[44px] divide-x divide-[#CED0D4]/70 dark:divide-[#3E4042] border-t ${FB_DIVIDER}`}
    >
      {children}
    </div>
  );
}

function reorderPayloadFromListOrder(o: OrderRow): CompletedOrderReorderPayload | null {
  if (o.order_status !== "completed") return null;
  const slug = String(o.store_slug ?? "").trim();
  if (!slug) return null;
  const items = (o.items ?? [])
    .map((it) => ({
      product_id: String((it as ItemRow).product_id ?? "").trim(),
      product_title_snapshot: it.product_title_snapshot,
      price_snapshot: Math.round(Number((it as ItemRow).price_snapshot) || 0),
      qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
      options_snapshot_json: (it as ItemRow).options_snapshot_json,
    }))
    .filter((it) => it.product_id.length > 0);
  if (!items.length) return null;
  return {
    storeId: o.store_id,
    storeSlug: slug,
    storeName: o.store_name,
    fulfillmentType: o.fulfillment_type,
    items,
  };
}

function MyStoreOrderCard({
  order: o,
  detailHref,
  chatHref,
  reviewHref,
  canSubmitReview,
  chatDisabled,
  orderChatUnread,
  onCancelPending,
  cancelBusy,
  allowDelete,
  onDelete,
  deleteBusy,
}: {
  order: OrderRow;
  detailHref: string;
  chatHref: string;
  reviewHref: string;
  canSubmitReview: boolean;
  chatDisabled: boolean;
  /** 주문 채팅 미읽음 — 배달/포장 뱃지 우측 상단 표시 */
  orderChatUnread: number;
  onCancelPending?: (id: string) => void;
  cancelBusy?: boolean;
  allowDelete?: boolean;
  onDelete?: (id: string) => void;
  deleteBusy?: boolean;
}) {
  const router = useRouter();
  const reorderPayload = reorderPayloadFromListOrder(o);
  const onChatPointerEnter = useCallback(() => {
    router.prefetch(chatHref);
  }, [chatHref, router]);
  const activeTab = [
    "pending",
    "accepted",
    "preparing",
    "delivering",
    "ready_for_pickup",
    "arrived",
  ].includes(o.order_status);
  const canCancelHere = o.order_status === "pending";
  const delivery = isDeliveryFulfillment(o.fulfillment_type);

  const storeImg = o.store_profile_image_url?.trim() || "";
  const relTime = formatFeedRelativeTime(o.created_at);
  const actionCell = `flex min-h-[44px] min-w-0 flex-1 items-center justify-center px-1 text-center text-[15px] font-semibold transition-colors ${FB_BODY} ${FB_HOVER_ROW}`;
  const actionCellSignature = `flex min-h-[44px] min-w-0 flex-1 items-center justify-center px-1 text-center text-[15px] font-semibold transition-colors text-signature ${FB_HOVER_ROW}`;

  return (
    <article
      className={`relative overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] dark:bg-[#242526] dark:ring-white/[0.08] ${
        activeTab ? "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-[3px] before:bg-signature" : ""
      }`}
    >
      <div className="px-3 pb-2 pt-3 sm:px-4">
        <div className="flex gap-2.5">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#E4E6EB] dark:bg-[#3A3B3C]">
            {storeImg ? (
              <img
                src={storeImg}
                alt={o.store_name || "매장"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className={`flex h-full w-full items-center justify-center text-[11px] font-semibold ${FB_MUTED}`}>
                매장
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`truncate text-[15px] font-semibold leading-snug sm:text-[17px] ${FB_BODY}`}>
                  {o.store_name || "매장"}
                </p>
                <p className={`mt-0.5 text-[13px] leading-snug ${FB_MUTED}`}>
                  <span>{relTime}</span>
                  <span className="mx-1 text-[#CED0D4] dark:text-[#5F6164]" aria-hidden>
                    ·
                  </span>
                  <span className="font-mono text-[12px]">{o.order_no}</span>
                </p>
                {o.buyer_note?.trim() ? (
                  <p className={`mt-1.5 text-[13px] font-medium text-amber-800 dark:text-amber-200`}>
                    요청 사항 있음
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
                {isMemberOrderStatus(o.order_status) ? (
                  <MemberOrderStatusBadge status={o.order_status} />
                ) : (
                  <span className="inline-flex max-w-[7rem] shrink-0 truncate rounded-full bg-[#F0F2F5] px-2 py-0.5 text-[11px] font-bold text-gray-800 dark:bg-[#3A3B3C] dark:text-[#E4E6EB]">
                    {BUYER_ORDER_STATUS_LABEL[o.order_status] ?? o.order_status}
                  </span>
                )}
                <span className="relative inline-flex shrink-0 overflow-visible">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      delivery
                        ? "bg-[#E7F3FF] text-[#1877F2] dark:bg-signature/15 dark:text-signature"
                        : "bg-emerald-50 text-emerald-900 dark:bg-emerald-900/25 dark:text-emerald-200"
                    }`}
                  >
                    {delivery ? "배달" : "포장"}
                  </span>
                  {orderChatUnread > 0 ? (
                    <span
                      className="pointer-events-none absolute -right-1 -top-1 z-[2] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#F02849] px-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-[#242526]"
                      aria-label={`주문 채팅 읽지 않은 메시지 ${orderChatUnread > 99 ? "99+" : orderChatUnread}건`}
                    >
                      {orderChatUnread > 99 ? "99+" : orderChatUnread}
                    </span>
                  ) : null}
                </span>
                {allowDelete && onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(o.id)}
                    disabled={deleteBusy}
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold leading-none text-[#65676B] transition-colors hover:bg-[#F0F2F5] disabled:opacity-50 dark:text-[#B0B3B8] dark:hover:bg-[#3A3B3C]`}
                    aria-label="주문 내역 삭제"
                    title="내역에서 삭제"
                  >
                    {deleteBusy ? "…" : "×"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className={`mt-3 border-t ${FB_DIVIDER} pt-3`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[15px] font-normal ${FB_MUTED}`}>결제 금액</span>
                <span className={`text-[17px] font-bold tabular-nums sm:text-[20px] ${FB_BODY}`}>
                  {formatMoneyPhp(o.payment_amount)}
                </span>
              </div>
              <p className={`mt-2 text-[15px] leading-snug ${FB_MUTED}`}>{statusUserLine(o.order_status)}</p>
              {(o.order_status === "ready_for_pickup" ||
                o.order_status === "delivering" ||
                o.order_status === "arrived") &&
              o.auto_complete_at ? (
                <p className={`mt-2 text-[13px] leading-snug ${FB_MUTED}`}>
                  자동 완료 예정{" "}
                  <span className={`font-semibold ${FB_BODY}`}>
                    {new Date(o.auto_complete_at).toLocaleString("ko-KR")}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <FeedActionRow>
        <Link href={detailHref} className={actionCell}>
          상세보기
        </Link>
        {chatDisabled ? (
          <span
            className={`flex min-h-[44px] min-w-0 flex-1 cursor-not-allowed items-center justify-center px-1 text-center text-[15px] font-medium text-[#BCC0C4] dark:text-[#6F7175]`}
          >
            주문 채팅
          </span>
        ) : (
          <Link
            href={chatHref}
            className={actionCellSignature}
            onMouseEnter={onChatPointerEnter}
            onFocus={onChatPointerEnter}
          >
            주문 채팅
          </Link>
        )}
      </FeedActionRow>

      {o.order_status === "completed" && reorderPayload ? (
        <FeedActionRow>
          {canSubmitReview ? (
            <Link
              href={reviewHref}
              className={`${actionCell} text-amber-800 dark:text-amber-200`}
            >
              리뷰 작성
            </Link>
          ) : null}
          <StoreOrderReorderAgainButton
            payload={reorderPayload}
            className={`${actionCellSignature} min-w-0 border-0 bg-transparent`}
          />
        </FeedActionRow>
      ) : canSubmitReview ? (
        <FeedActionRow>
          <Link href={reviewHref} className={`${actionCell} text-amber-800 dark:text-amber-200`}>
            리뷰 작성
          </Link>
        </FeedActionRow>
      ) : null}

      {canCancelHere && onCancelPending ? (
        <button
          type="button"
          disabled={cancelBusy}
          onClick={() => onCancelPending(o.id)}
          className={`w-full border-t ${FB_DIVIDER} py-2.5 text-center text-[15px] font-semibold text-[#F02849] transition-colors hover:bg-[#F0F2F5] disabled:opacity-50 dark:hover:bg-[#3A3B3C]`}
        >
          {cancelBusy ? "처리 중…" : "주문 취소"}
        </button>
      ) : null}
    </article>
  );
}

export function MyStoreOrdersView({
  embedded = false,
  suppressTier1Sync = false,
}: {
  embedded?: boolean;
  suppressTier1Sync?: boolean;
}) {
  const pathname = usePathname();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const [tab, setTab] = useState<MemberOrderTab>("all");
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "unauth" }
    | { kind: "error"; message: string }
    | { kind: "ok"; orders: OrderRow[] }
  >({ kind: "loading" });

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) setState({ kind: "loading" });
      try {
        const res = await fetch("/api/me/store-orders", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.status === 401) {
          if (!silent) setState({ kind: "unauth" });
          return;
        }
        if (res.status === 503) {
          if (!silent) {
            setState({
              kind: "error",
              message: "supabase_unconfigured",
            });
          }
          return;
        }
        const json = await res.json();
        if (!json?.ok) {
          if (!silent) {
            setState({
              kind: "error",
              message: typeof json?.error === "string" ? json.error : "load_failed",
            });
          }
          return;
        }
        setState({ kind: "ok", orders: (json.orders ?? []) as OrderRow[] });
      } catch {
        if (!silent) setState({ kind: "error", message: "network_error" });
      }
    },
    []
  );
  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => {
    void load({ silent: true });
  });

  useLayoutEffect(() => {
    if (embedded) return;
    if (suppressTier1Sync) return;
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      tier1: {
        rightSlot: <CommerceCartHubHeaderRight />,
      },
    });
    return () => setMainTier1Extras(null);
  }, [embedded, setMainTier1Extras, suppressTier1Sync]);

  const allSorted = useMemo(() => {
    if (state.kind !== "ok") return [];
    return [...state.orders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [state]);

  const counts = useMemo(() => tabCounts(allSorted), [allSorted]);
  const filtered = useMemo(() => filterByTab(allSorted, tab), [allSorted, tab]);
  const loginHref = `/login?next=${encodeURIComponent(pathname ?? (embedded ? "/orders?tab=store" : "/mypage/store-orders"))}`;

  const requestCancelPending = useCallback(
    async (orderId: string) => {
      if (!confirm("주문을 취소할까요? 매장이 아직 접수하지 않은 경우에만 가능합니다.")) return;
      setCancelBusyId(orderId);
      try {
        const res = await fetch(`/api/me/store-orders/${encodeURIComponent(orderId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancel: true }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || json?.ok === false) {
          const code = typeof json?.error === "string" ? json.error : "cancel_failed";
          const msg =
            code === "cannot_cancel_after_accepted"
              ? "매장이 접수한 뒤에는 여기서 취소할 수 없습니다."
              : `취소에 실패했습니다. (${code})`;
          setToast(msg);
          setTimeout(() => setToast(null), 3200);
          return;
        }
        setToast("주문이 취소되었어요.");
        setTimeout(() => setToast(null), 2800);
        await load({ silent: true });
      } catch {
        setToast("네트워크 오류가 발생했습니다.");
        setTimeout(() => setToast(null), 2800);
      } finally {
        setCancelBusyId(null);
      }
    },
    [load]
  );

  const requestHideOrder = useCallback(
    async (orderId: string) => {
      if (!confirm("이 주문 내역을 내 목록에서 삭제할까요? 매장/관리자 화면에는 유지됩니다.")) return;
      setDeleteBusyId(orderId);
      try {
        const res = await fetch(`/api/me/store-orders/${encodeURIComponent(orderId)}`, {
          method: "DELETE",
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || json?.ok === false) {
          const code = typeof json?.error === "string" ? json.error : "hide_failed";
          const msg =
            code === "buyer_hide_schema_missing"
              ? "서버 설정이 아직 적용되지 않아 삭제를 처리할 수 없습니다."
              : `삭제에 실패했습니다. (${code})`;
          setToast(msg);
          setTimeout(() => setToast(null), 3200);
          return;
        }
        setToast("주문 내역을 삭제했어요.");
        setTimeout(() => setToast(null), 2400);
        await load({ silent: true });
      } catch {
        setToast("네트워크 오류가 발생했습니다.");
        setTimeout(() => setToast(null), 2800);
      } finally {
        setDeleteBusyId(null);
      }
    },
    [load]
  );

  return (
    <div
      className={
        embedded
          ? "bg-[#F0F2F5] pb-6 dark:bg-[#18191A]"
          : "min-h-screen bg-[#F0F2F5] pb-10 dark:bg-[#18191A]"
      }
    >
      <div
        className={`${APP_MAIN_COLUMN_CLASS} min-w-0 ${APP_MAIN_GUTTER_X_CLASS} ${
          embedded ? "pt-2" : "pt-2 sm:pt-3"
        }`}
      >
        {toast ? (
          <p className="mb-3 rounded-lg bg-[#050505] px-3 py-2.5 text-center text-[13px] text-white shadow-md dark:bg-[#E4E6EB] dark:text-[#050505]">
            {toast}
          </p>
        ) : null}

        {state.kind === "loading" ? (
          <div
            className={`mb-3 rounded-lg bg-white px-4 py-12 text-center text-[15px] ${FB_MUTED} shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] dark:bg-[#242526] dark:ring-white/[0.08]`}
          >
            불러오는 중…
          </div>
        ) : null}

        {state.kind === "unauth" ? (
          <div
            className={`rounded-lg border ${FB_DIVIDER} bg-white px-4 py-4 text-center text-[15px] text-amber-900 dark:bg-[#242526] dark:text-amber-200`}
          >
            <p>로그인 후 매장 주문 내역과 주문 채팅을 확인할 수 있습니다.</p>
            <Link
              href={loginHref}
              className="mt-3 inline-flex rounded-lg bg-signature px-4 py-2.5 text-[15px] font-semibold text-white"
            >
              로그인하고 주문 보기
            </Link>
          </div>
        ) : null}

        {state.kind === "error" ? (
          <div
            className={`space-y-2 rounded-lg border ${FB_DIVIDER} bg-white px-4 py-4 dark:bg-[#242526]`}
          >
            {state.message === "supabase_unconfigured" ? (
              <p className={`text-[15px] text-amber-800 dark:text-amber-200`}>
                서버에 Supabase(매장 주문) 설정이 없어 목록을 불러올 수 없습니다.
              </p>
            ) : null}
            <p className={`text-[15px] text-[#F02849]`}>불러오지 못했습니다. ({state.message})</p>
            <button
              type="button"
              onClick={() => void load()}
              className="text-[15px] font-semibold text-signature hover:underline"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {state.kind === "ok" ? (
          <>
            <div
              className={`sticky top-0 z-20 ${APP_MAIN_GUTTER_NEG_X_CLASS} mb-3 border-b ${FB_DIVIDER} bg-white/92 backdrop-blur-md dark:bg-[#242526]/95`}
            >
              <div className={APP_MAIN_GUTTER_X_CLASS}>
                <MemberOrderTabs variant="feed" active={tab} onChange={setTab} counts={counts} />
              </div>
            </div>

            {allSorted.length === 0 ? (
              <div
                className={`rounded-lg bg-white px-4 py-8 text-center text-[15px] ${FB_MUTED} shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] dark:bg-[#242526] dark:ring-white/[0.08]`}
              >
                <p className={FB_BODY}>아직 매장 주문이 없습니다.</p>
                <Link
                  href="/stores"
                  className="mt-4 inline-block rounded-lg bg-signature px-4 py-2.5 text-[15px] font-semibold text-white hover:opacity-95"
                >
                  매장 둘러보기
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {filtered.map((o) => (
                  <li key={o.id}>
                    <MyStoreOrderCard
                      order={o}
                      detailHref={
                        embedded
                          ? `/orders/store/${encodeURIComponent(o.id)}`
                          : `/mypage/store-orders/${encodeURIComponent(o.id)}`
                      }
                      chatHref={buyerStoreOrderChatHref({
                        embedded,
                        orderId: o.id,
                      })}
                      chatDisabled={isStoreOrderChatDisabledForBuyer(o.order_status)}
                      orderChatUnread={Math.max(0, Number(o.order_chat_unread_count) || 0)}
                      reviewHref={
                        embedded
                          ? `/orders/store/${encodeURIComponent(o.id)}/review`
                          : `/mypage/store-orders/${encodeURIComponent(o.id)}/review`
                      }
                      canSubmitReview={o.can_submit_review === true}
                      onCancelPending={requestCancelPending}
                      cancelBusy={cancelBusyId === o.id}
                      allowDelete={!embedded}
                      onDelete={requestHideOrder}
                      deleteBusy={deleteBusyId === o.id}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
