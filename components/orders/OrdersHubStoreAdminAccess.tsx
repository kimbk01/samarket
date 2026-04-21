"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MyBusinessNavList } from "@/components/business/MyBusinessNavList";
import { buildMyBusinessNavGroups } from "@/lib/business/my-business-nav";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/owner-lite-external-store";

function computeCanSell(row: StoreRow): boolean {
  return (
    !!row.sales_permission &&
    row.sales_permission.allowed_to_sell === true &&
    row.sales_permission.sales_status === "approved"
  );
}

function pickDefaultStore(stores: StoreRow[]): StoreRow | null {
  return pickPreferredOwnerStore(stores);
}

type HubState =
  | { kind: "loading" }
  | { kind: "unauth" }
  | { kind: "no_supabase" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ok"; row: StoreRow };

/**
 * 주문 허브 탭 줄 오른쪽 끝 — 매장 소유자만 햄버거 표시(별도 2단 바 없음).
 */
export function OrdersHubStoreAdminMenuTrigger() {
  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hub, setHub] = useState<HubState>({ kind: "loading" });
  const [orderAlertsBadge, setOrderAlertsBadge] = useState(0);
  const prevPendingDeliveryRef = useRef<number | null>(null);

  const loadStores = useCallback(async () => {
    setHub({ kind: "loading" });
    try {
      const { status, json: raw } = await fetchMeStoresListDeduped();
      const j = raw as { ok?: boolean; error?: string; stores?: StoreRow[] };
      if (status === 401) {
        setHub({ kind: "unauth" });
        return;
      }
      if (status === 503) {
        setHub({ kind: "no_supabase" });
        return;
      }
      if (!j?.ok) {
        setHub({
          kind: "error",
          message: typeof j?.error === "string" ? j.error : "load_failed",
        });
        return;
      }
      const stores = (j.stores ?? []) as StoreRow[];
      const row = pickDefaultStore(stores);
      if (!row) {
        setHub({ kind: "empty" });
        return;
      }
      setHub({ kind: "ok", row });
    } catch {
      setHub({ kind: "error", message: "network_error" });
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  const storeRow = hub.kind === "ok" ? hub.row : null;

  const orderCountsStoreId =
    storeRow &&
    storeRow.approval_status === "approved" &&
    storeRow.is_visible === true &&
    computeCanSell(storeRow)
      ? storeRow.id
      : null;

  useEffect(() => {
    if (!orderCountsStoreId) {
      setOrderAlertsBadge(0);
      prevPendingDeliveryRef.current = null;
      return;
    }
    prevPendingDeliveryRef.current = null;
    let cancelled = false;

    const tick = async () => {
      try {
        const { json: rawCounts } = await fetchStoreOrderCountsDeduped(orderCountsStoreId);
        const j = rawCounts as {
          ok?: boolean;
          refund_requested_count?: unknown;
          pending_accept_count?: unknown;
          pending_delivery_count?: unknown;
        };
        if (cancelled) return;
        if (j?.ok) {
          const refund = Math.max(0, Math.floor(Number(j.refund_requested_count) || 0));
          const pending = Math.max(0, Math.floor(Number(j.pending_accept_count) || 0));
          setOrderAlertsBadge(refund + pending);
          const delivery = Math.max(0, Math.floor(Number(j.pending_delivery_count) || 0));
          prevPendingDeliveryRef.current = delivery;
        } else {
          setOrderAlertsBadge(0);
          prevPendingDeliveryRef.current = null;
        }
      } catch {
        if (!cancelled) {
          setOrderAlertsBadge(0);
          prevPendingDeliveryRef.current = null;
        }
      }
    };

    void tick();
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void tick();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [orderCountsStoreId]);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  if (!mounted) return null;
  if (hub.kind === "unauth" || hub.kind === "empty") return null;

  const groups =
    storeRow != null
      ? buildMyBusinessNavGroups({
          storeId: storeRow.id,
          slug: storeRow.slug ?? "",
          approvalStatus: String(storeRow.approval_status),
          isVisible: !!storeRow.is_visible,
          canSell: computeCanSell(storeRow),
          orderAlertsBadge,
        })
      : [];

  const drawerBody =
    hub.kind === "ok" && storeRow ? (
      <MyBusinessNavList
        groups={groups}
        className="rounded-ui-rect shadow-none ring-1 ring-sam-border-soft"
        onNavigate={() => setDrawerOpen(false)}
      />
    ) : hub.kind === "loading" ? (
      <p className="px-4 py-6 text-center text-sm text-sam-muted">매장 정보 불러오는 중…</p>
    ) : hub.kind === "no_supabase" ? (
      <div className="space-y-3 px-4 py-6 text-center">
        <p className="text-sm text-amber-800">매장 DB가 연결되지 않았습니다.</p>
        <button
          type="button"
          className="text-sm font-medium text-signature underline"
          onClick={() => void loadStores()}
        >
          다시 시도
        </button>
      </div>
    ) : hub.kind === "error" ? (
      <div className="space-y-3 px-4 py-6 text-center">
        <p className="text-sm text-red-700">매장을 불러오지 못했습니다. ({hub.message})</p>
        <button
          type="button"
          className="text-sm font-medium text-signature underline"
          onClick={() => void loadStores()}
        >
          다시 시도
        </button>
      </div>
    ) : (
      <p className="px-4 py-6 text-center text-sm text-sam-muted">상태를 확인할 수 없습니다.</p>
    );

  const drawer =
    drawerOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[60] flex justify-end"
            role="dialog"
            aria-modal="true"
            aria-label="매장 관리 메뉴"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              aria-label="메뉴 닫기"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="relative flex h-full w-[min(100vw,22rem)] max-w-full flex-col bg-sam-surface shadow-2xl sm:w-[24rem]">
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-sam-border px-3">
                <p className="min-w-0 truncate sam-text-body font-semibold text-sam-fg">매장 관리</p>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect sam-text-page-title leading-none text-sam-muted hover:bg-sam-surface-muted"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
              {hub.kind === "ok" && storeRow?.store_name?.trim() ? (
                <p className="truncate border-b border-sam-border-soft bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-fg">
                  {storeRow.store_name.trim()}
                </p>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
                {drawerBody}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const showHamburger =
    hub.kind === "ok" || hub.kind === "loading" || hub.kind === "no_supabase" || hub.kind === "error";

  if (!showHamburger) return null;

  return (
    <>
      <div className="flex h-[55px] w-11 shrink-0 flex-col justify-center border-l border-sam-border-soft bg-sam-surface">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          disabled={hub.kind === "loading"}
          className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-ui-rect text-sam-fg hover:bg-sam-surface-muted active:bg-sam-border-soft disabled:cursor-wait disabled:opacity-50"
          aria-label="매장 관리자 메뉴 열기"
          aria-expanded={drawerOpen}
          aria-busy={hub.kind === "loading"}
        >
          <svg
            className="h-[14px] w-[18px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.25}
            aria-hidden
          >
            <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>
      {drawer}
    </>
  );
}
