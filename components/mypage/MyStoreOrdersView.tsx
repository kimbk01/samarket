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
import { PHILIFE_FEED_INSET_NEG_X_CLASS, PHILIFE_FEED_INSET_X_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import type { CompletedOrderReorderPayload } from "@/lib/stores/apply-completed-order-to-commerce-cart";
import { StoreOrderReorderAgainButton } from "@/components/mypage/StoreOrderReorderAgainButton";
import { StoreOrderMessengerDeepLink } from "@/components/stores/StoreOrderMessengerDeepLink";
import { buildMessengerContextInputFromStoreOrderSnapshot } from "@/lib/community-messenger/store-order-messenger-context";
import {
  deleteMeStoreOrder,
  fetchMeStoreOrdersListDeduped,
  patchMeStoreOrder,
} from "@/lib/stores/store-delivery-api-client";

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
  community_messenger_room_id?: string | null;
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
const FB_HOVER_ROW = "hover:bg-sam-surface-muted dark:hover:bg-[#3A3B3C]";
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
  const canCancelHere = o.order_status === "pending";
  const delivery = isDeliveryFulfillment(o.fulfillment_type);

  const storeImg = o.store_profile_image_url?.trim() || "";
  const relTime = formatFeedRelativeTime(o.created_at);
  const actionCell = `flex min-h-[44px] min-w-0 flex-1 items-center justify-center px-1 text-center sam-text-body-secondary font-semibold transition-colors sm:text-sm ${FB_BODY} ${FB_HOVER_ROW}`;
  const actionCellSignature = `flex min-h-[44px] min-w-0 flex-1 items-center justify-center px-1 text-center sam-text-body-secondary font-semibold transition-colors sm:text-sm text-signature ${FB_HOVER_ROW}`;

  return (
    <article
      className="relative overflow-hidden rounded-ui-rect bg-sam-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] dark:bg-[#242526] dark:ring-sam-surface/[0.08]"
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
              <div className={`flex h-full w-full items-center justify-center sam-text-xxs font-semibold ${FB_MUTED}`}>
                매장
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`truncate sam-text-body font-semibold leading-snug ${FB_BODY}`}>
                  {o.store_name || "매장"}
                </p>
                <p className={`mt-0.5 sam-text-body-secondary leading-snug ${FB_MUTED}`}>
                  <span>{relTime}</span>
                  <span className="mx-1 text-[#CED0D4] dark:text-[#5F6164]" aria-hidden>
                    ·
                  </span>
                  <span className="font-mono sam-text-helper">{o.order_no}</span>
                </p>
                {o.buyer_note?.trim() ? (
                  <p className={`mt-1.5 sam-text-body-secondary font-medium text-amber-800 dark:text-amber-200`}>
                    요청 사항 있음
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
                {isMemberOrderStatus(o.order_status) ? (
                  <MemberOrderStatusBadge status={o.order_status} />
                ) : (
                  <span className="inline-flex max-w-[7rem] shrink-0 truncate rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-bold text-sam-fg dark:bg-[#3A3B3C] dark:text-[#E4E6EB]">
                    {BUYER_ORDER_STATUS_LABEL[o.order_status] ?? o.order_status}
                  </span>
                )}
                <span className="relative inline-flex shrink-0 overflow-visible">
                  <span
                    className={`rounded-ui-rect px-2 py-0.5 sam-text-xxs font-bold ${
                      delivery
                        ? "bg-[#E7F3FF] text-[#1877F2] dark:bg-signature/15 dark:text-signature"
                        : "bg-emerald-50 text-emerald-900 dark:bg-emerald-900/25 dark:text-emerald-200"
                    }`}
                  >
                    {delivery ? "배달" : "포장"}
                  </span>
                  {orderChatUnread > 0 ? (
                    <span
                      className="pointer-events-none absolute -right-1 -top-1 z-[2] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#F02849] px-0.5 sam-text-xxs font-bold leading-none text-white ring-2 ring-sam-surface dark:ring-[#242526]"
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
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full sam-text-body font-semibold leading-none text-[#65676B] transition-colors hover:bg-sam-surface-muted disabled:opacity-50 dark:text-[#B0B3B8] dark:hover:bg-[#3A3B3C]`}
                    aria-label="주문 내역 삭제"
                    title="내역에서 삭제"
                  >
                    {deleteBusy ? "…" : "×"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className={`mt-3 border-t ${FB_DIVIDER} pt-3`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`sam-text-body-secondary font-medium sm:text-sm ${FB_MUTED}`}>결제 금액</span>
                <span className={`sam-text-body font-semibold tabular-nums sm:text-base ${FB_BODY}`}>
                  {formatMoneyPhp(o.payment_amount)}
                </span>
              </div>
              <p className={`mt-2 sam-text-body-secondary leading-snug sm:text-sm ${FB_MUTED}`}>
                {statusUserLine(o.order_status)}
              </p>
              {(o.order_status === "ready_for_pickup" ||
                o.order_status === "delivering" ||
                o.order_status === "arrived") &&
              o.auto_complete_at ? (
                <p className={`mt-2 sam-text-body-secondary leading-snug ${FB_MUTED}`}>
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
            className={`flex min-h-[44px] min-w-0 flex-1 cursor-not-allowed items-center justify-center px-1 text-center sam-text-body-secondary font-medium text-[#BCC0C4] dark:text-[#6F7175] sm:text-sm`}
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

      {o.community_messenger_room_id ? (
        <div className={`border-t ${FB_DIVIDER}`}>
          <StoreOrderMessengerDeepLink
            roomId={o.community_messenger_room_id}
            variant="compact"
            context={buildMessengerContextInputFromStoreOrderSnapshot({
              storeName: o.store_name,
              orderNo: o.order_no,
              fulfillmentType: o.fulfillment_type,
              orderStatus: o.order_status,
              paymentAmount: o.payment_amount,
              firstLineProductTitle: o.items?.[0]?.product_title_snapshot ?? null,
              thumbnailUrl: o.store_profile_image_url ?? null,
            })}
            className={`flex min-h-[40px] w-full items-center justify-center px-3 sam-text-body-secondary font-semibold text-signature ${FB_HOVER_ROW}`}
          />
        </div>
      ) : null}

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
          className={`w-full border-t ${FB_DIVIDER} py-2.5 text-center sam-text-body font-semibold text-[#F02849] transition-colors hover:bg-sam-surface-muted disabled:opacity-50 dark:hover:bg-[#3A3B3C]`}
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
        const { status, json } = await fetchMeStoreOrdersListDeduped("");
        if (status === 401) {
          if (!silent) setState({ kind: "unauth" });
          return;
        }
        if (status === 503) {
          if (!silent) {
            setState({
              kind: "error",
              message: "supabase_unconfigured",
            });
          }
          return;
        }
        const data = json as { ok?: boolean; error?: string; orders?: unknown };
        if (!data?.ok) {
          if (!silent) {
            setState({
              kind: "error",
              message: typeof data?.error === "string" ? data.error : "load_failed",
            });
          }
          return;
        }
        setState({ kind: "ok", orders: (data.orders ?? []) as OrderRow[] });
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
  const loginHref = "/login";

  const requestCancelPending = useCallback(
    async (orderId: string) => {
      if (!confirm("주문을 취소할까요? 매장이 아직 접수하지 않은 경우에만 가능합니다.")) return;
      setCancelBusyId(orderId);
      try {
        const { status, json } = await patchMeStoreOrder(orderId, { cancel: true });
        const j = json as { ok?: boolean; error?: string };
        if (status < 200 || status >= 300 || j?.ok === false) {
          const code = typeof j?.error === "string" ? j.error : "cancel_failed";
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
        const { status, json } = await deleteMeStoreOrder(orderId);
        const j = json as { ok?: boolean; error?: string };
        if (status < 200 || status >= 300 || j?.ok === false) {
          const code = typeof j?.error === "string" ? j.error : "hide_failed";
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
          ? "min-w-0 pb-1"
          : "w-full min-h-0 bg-sam-app dark:bg-[#18191A]"
      }
    >
      <div
        className={
          embedded
            ? "mx-auto w-full min-w-0 max-w-none px-0 pt-0"
            : "min-w-0 w-full min-h-0 flex flex-col gap-1"
        }
      >
        {toast ? (
          <p className="mb-3 rounded-ui-rect bg-[#050505] px-3 py-2.5 text-center sam-text-body-secondary text-white shadow-md dark:bg-[#E4E6EB] dark:text-[#050505]">
            {toast}
          </p>
        ) : null}

        {state.kind === "loading" ? (
          <div
            className={`mb-3 rounded-ui-rect bg-sam-surface px-4 py-10 text-center text-sm ${FB_MUTED} shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] dark:bg-[#242526] dark:ring-sam-surface/[0.08]`}
          >
            불러오는 중…
          </div>
        ) : null}

        {state.kind === "unauth" ? (
          <div
            className={`rounded-ui-rect border ${FB_DIVIDER} bg-sam-surface px-4 py-4 text-center sam-text-body text-amber-900 dark:bg-[#242526] dark:text-amber-200`}
          >
            <p>로그인 후 매장 주문 내역과 주문 채팅을 확인할 수 있습니다.</p>
            <Link
              href={loginHref}
              className="mt-3 inline-flex rounded-ui-rect bg-signature px-4 py-2.5 sam-text-body font-semibold text-white"
            >
              로그인하고 주문 보기
            </Link>
          </div>
        ) : null}

        {state.kind === "error" ? (
          <div
            className={`space-y-2 rounded-ui-rect border ${FB_DIVIDER} bg-sam-surface px-4 py-4 dark:bg-[#242526]`}
          >
            {state.message === "supabase_unconfigured" ? (
              <p className={`sam-text-body text-amber-800 dark:text-amber-200`}>
                서버에 Supabase(매장 주문) 설정이 없어 목록을 불러올 수 없습니다.
              </p>
            ) : null}
            <p className={`sam-text-body text-[#F02849]`}>불러오지 못했습니다. ({state.message})</p>
            <button
              type="button"
              onClick={() => void load()}
              className="sam-text-body font-semibold text-signature hover:underline"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {state.kind === "ok" ? (
          <>
            <div
              className={
                embedded
                  ? `sticky top-0 z-10 mb-3 -mx-3 rounded-ui-rect border ${FB_DIVIDER} bg-sam-surface shadow-sm dark:bg-[#242526] sm:-mx-4 lg:mx-0`
                  : // `AppStickyHeader`(1단)과 둘 다 sticky+z 가 되면 같은 뷰포트 스크롤에서 겹쳐 첫 카드가 잘릴 수 있어 mypage 에서는 2행 sticky 를 쓰지 않는다. 상위 `APP_MAIN_FEED_STACK` 이 인셋·pt 를 맡김.
                    `${PHILIFE_FEED_INSET_NEG_X_CLASS} shrink-0 border-b ${FB_DIVIDER} bg-sam-surface/95 backdrop-blur-sm dark:bg-[#242526]/95`
              }
            >
              <div className={embedded ? "px-0" : PHILIFE_FEED_INSET_X_CLASS}>
                <MemberOrderTabs variant="feed" active={tab} onChange={setTab} counts={counts} />
              </div>
            </div>

            {allSorted.length === 0 ? (
              <div
                className={`rounded-ui-rect bg-sam-surface px-4 py-8 text-center text-sm ${FB_MUTED} shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] dark:bg-[#242526] dark:ring-sam-surface/[0.08]`}
              >
                <p className={FB_BODY}>아직 매장 주문이 없습니다.</p>
                <Link
                  href="/stores"
                  className="mt-4 inline-block rounded-ui-rect bg-signature px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
                >
                  매장 둘러보기
                </Link>
              </div>
            ) : (
              <ul className={embedded ? "space-y-2.5" : "min-w-0 space-y-3"}>
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
