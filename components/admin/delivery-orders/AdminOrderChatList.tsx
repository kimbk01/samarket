"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { AdminOrderDetailModal, useAdminOrderDetailParam } from "@/components/admin/store-orders/AdminOrderDetailModal";
import { ADMIN_STORE_ORDER_STATUS_LABEL_KEYS } from "@/lib/admin/store-orders/admin-store-order-status-labels";
import type { AdminStoreOrderChatListRow } from "@/lib/admin-delivery-orders/list-admin-store-order-chats";
import type { StoreOrderStatus } from "@/lib/stores/order-status-transitions";

/**
 * P1-1 — Delivery order-chat LIVE (lookup-only).
 * Identity = store_orders.community_messenger_room_id. 「주문 채팅 열기」 → /admin/stores/orders/{orderId}/chat
 * (single admin order-chat route, same as order detail — DEF-60/61).
 * Admin entry never creates rooms.
 */
/** C-11 — 화면 페이지 크기 (URL `page`) · 검색어 (URL `q`). */
const ORDER_CHAT_PAGE_SIZE = 30;

export function AdminOrderChatList() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/order-chats";
  const searchParams = useSearchParams();
  const spKey = searchParams?.toString() ?? "";
  const returnTo = `${pathname}${spKey ? `?${spKey}` : ""}`;
  const urlQ = (searchParams?.get("q") ?? "").trim();
  const page = Math.max(1, Math.floor(Number(searchParams?.get("page")) || 1));
  const [draft, setDraft] = useState(urlQ);
  useEffect(() => setDraft(urlQ), [urlQ]);
  const updateUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(spKey);
      for (const [k, v] of Object.entries(patch)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      if (!("page" in patch)) sp.delete("page");
      const qs = sp.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, spKey]
  );
  const [rows, setRows] = useState<AdminStoreOrderChatListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; status?: number } | null>(null);
  const modal = useAdminOrderDetailParam();
  const statusLabel = (s: string) => {
    const key = ADMIN_STORE_ORDER_STATUS_LABEL_KEYS[s as StoreOrderStatus];
    return key ? t(key) : ko ? "알 수 없는 상태" : "Unknown status";
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/order-chats", { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        rows?: AdminStoreOrderChatListRow[];
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setRows([]);
        setError({ code: res.status === 401 || res.status === 403 ? "forbidden" : json?.error || "load_failed", status: res.status });
        return;
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch {
      setRows([]);
      setError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = urlQ.toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.orderNo, row.orderId, row.storeLabel, row.customerLabel, row.customerUserId]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, urlQ]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / ORDER_CHAT_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * ORDER_CHAT_PAGE_SIZE, currentPage * ORDER_CHAT_PAGE_SIZE);
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    updateUrl({ q: draft.trim() || null });
  };

  const searchBar = (
    <form onSubmit={onSearch} className="mb-3 flex flex-wrap items-center gap-2" data-admin-list-filters="order-chats">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={ko ? "주문번호 · 매장 · 고객 닉네임 · 회원 ID" : "Order no · store · customer · member ID"}
        className="min-w-[240px] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      />
      <AdminActionButton type="submit" variant="primary">
        {adminCta("search", ko)}
      </AdminActionButton>
      {urlQ ? (
        <AdminActionButton variant="secondary" onClick={() => updateUrl({ q: null })}>
          {adminCta("reset", ko)}
        </AdminActionButton>
      ) : null}
    </form>
  );

  if (loading) {
    return (
      <div data-admin-surface="live" data-admin-domain="delivery">
        <AdminLoadingState
          ko={ko}
          label={safeT("admin_do_chat_list_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div data-admin-surface="live" data-admin-domain="delivery">
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.status} onRetry={() => void load()} />
      </div>
    );
  }

  if (filteredRows.length === 0) {
    return (
      <div
        data-admin-surface="live"
        data-admin-domain="delivery"
        data-admin-entity="store_order_chat"
        data-testid="admin-order-chat-empty"
      >
        {searchBar}
        <AdminEmptyState
          ko={ko}
          message={
            urlQ
              ? ko
                ? "검색 조건에 맞는 주문 채팅이 없습니다."
                : "No order chats match this search."
              : safeT("admin_do_chat_list_empty", { fallbackKo: "주문 채팅이 없습니다.", fallbackEn: "No order chats." })
          }
          action={
            <Link href="/admin/stores/orders" className="font-medium text-sam-fg underline">
              {t("admin_do_chat_store_orders")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
    {searchBar}
    <div
      className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface"
      data-admin-surface="live"
      data-admin-domain="delivery"
      data-admin-entity="store_order_chat"
      data-admin-chat-domain="store_order"
      data-testid="admin-order-chat-list-live"
    >
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {safeT("admin_do_chat_col_order", { fallbackKo: "주문", fallbackEn: "Order" })}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {safeT("admin_do_chat_col_store", { fallbackKo: "매장", fallbackEn: "Store" })}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {safeT("admin_do_chat_col_customer", { fallbackKo: "고객", fallbackEn: "Customer" })}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {safeT("admin_do_chat_col_last", {
                fallbackKo: "최근 메시지",
                fallbackEn: "Last message",
              })}
            </th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row) => (
            <tr key={row.orderId} className="border-b border-sam-border/70 last:border-0">
              <td className="px-3 py-2.5 align-top">
                <Link
                  href={withAdminReturnTo(`/admin/stores/orders/${encodeURIComponent(row.orderId)}/chat`, returnTo)}
                  className="font-medium text-signature underline"
                >
                  {safeT("admin_do_chat_open_room", {
                    fallbackKo: "주문 채팅 열기",
                    fallbackEn: "Open order chat",
                  })}
                </Link>
                <div className="mt-1">
                  <AdminActionButton
                    variant="ghost"
                    size="sm"
                    className="!px-0 font-mono"
                    onClick={() => modal.openOrder(row.orderId, "basic")}
                    data-open-order={row.orderNo || row.orderId}
                  >
                    {row.orderNo || (language === "en" ? "Open order" : "주문 보기")}
                  </AdminActionButton>
                  <span className="ml-2 sam-text-xxs text-sam-muted">{statusLabel(row.orderStatus)}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 align-top text-sam-fg">{row.storeLabel}</td>
              <td className="px-3 py-2.5 align-top">
                {row.customerUserId ? (
                  <Link
                    href={withAdminReturnTo(`/admin/users/${encodeURIComponent(row.customerUserId)}`, returnTo)}
                    className="text-signature underline"
                  >
                    {row.customerLabel}
                  </Link>
                ) : (
                  <span className="text-sam-muted">-</span>
                )}
              </td>
              <td className="px-3 py-2.5 align-top">
                <div className="line-clamp-2 text-sam-fg">{row.lastMessage}</div>
                <div className="mt-0.5 sam-text-xxs text-sam-muted">
                  {row.lastMessageAt ? formatAdminDateTime(row.lastMessageAt, language) : "-"}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AdminOrderDetailModal orderId={modal.orderId} section={modal.section} onClose={modal.closeOrder} onChanged={() => void load()} />
    </div>
    {pageCount > 1 ? (
      <nav className="mt-3 flex flex-wrap items-center gap-2 sam-text-body-secondary" data-admin-list-pager="page">
        <AdminActionButton
          variant="secondary"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => updateUrl({ page: currentPage - 1 > 1 ? String(currentPage - 1) : null })}
        >
          {ko ? "이전" : "Previous"}
        </AdminActionButton>
        <span className="text-sam-muted">
          {currentPage} / {pageCount}
        </span>
        <AdminActionButton
          variant="secondary"
          size="sm"
          disabled={currentPage >= pageCount}
          onClick={() => updateUrl({ page: String(currentPage + 1) })}
        >
          {ko ? "다음" : "Next"}
        </AdminActionButton>
      </nav>
    ) : null}
    </div>
  );
}
