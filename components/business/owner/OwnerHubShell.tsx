"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/owner-lite-external-store";
import { buildBusinessAdminSidebar } from "@/lib/business/business-admin-nav";
import { OwnerHubMainMenu } from "@/components/business/owner/OwnerHubMainMenu";
import { StoresOwnerStackHeader } from "@/components/business/owner/StoresOwnerStackHeader";
import { BusinessAdminOpenToggle } from "@/components/business/admin/BusinessAdminOpenToggle";
import { BusinessAdminVisibleToggle } from "@/components/business/admin/BusinessAdminVisibleToggle";
import { BusinessStatusBadge } from "@/components/business/admin/BusinessStatusBadge";
import { OwnerHubStoreAvatar } from "@/components/business/owner/OwnerHubStoreAvatar";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { useOwnerCommerceNotificationUnreadCount } from "@/hooks/useOwnerCommerceNotificationUnreadCount";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";
import {
  fetchStoreBannersDeduped,
  fetchStoreMenusDeduped,
  fetchStoreNoticesDeduped,
  fetchStorePublicBySlugDeduped,
  fetchStoreSummaryDeduped,
} from "@/lib/stores/store-delivery-api-client";
import {
  OwnerHubDashboardPanelProvider,
  useOwnerHubDashboardPanel,
} from "@/components/business/owner/owner-hub-dashboard-panel-context";
import { OWNER_HUB_DASHBOARD_SLIDE_MS } from "@/components/business/owner/owner-hub-dashboard-slide-ms";

const MY_STORE_BTN_BASE =
  "shrink-0 inline-flex select-none touch-manipulation items-center justify-center rounded-ui-rect border px-2.5 py-1.5 sam-text-xxs font-semibold shadow-sm transition-[transform,background-color,border-color,box-shadow] duration-100 ease-out";

const MY_STORE_BTN_PRESS =
  "active:scale-[0.96] active:bg-[#1C8DB8]/30 active:border-[#106180] active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.14)]";

export function OwnerHubShell({ children }: { children: React.ReactNode }) {
  return (
    <OwnerHubDashboardPanelProvider>
      <OwnerHubShellInner>{children}</OwnerHubShellInner>
    </OwnerHubDashboardPanelProvider>
  );
}

function OwnerHubShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/stores/owner";
  const searchParams = useSearchParams();
  const router = useRouter();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";

  const hubCtx = useOwnerHubDashboardPanel();
  const hubPushPercent = hubCtx?.hubPushPercent ?? 0;

  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [orderAlertsBadge, setOrderAlertsBadge] = useState(0);

  const reloadStores = useCallback(async () => {
    try {
      const { status, json: raw } = await fetchMeStoresListDeduped();
      const json = raw as { ok?: boolean; stores?: StoreRow[] };
      if (status === 401 || !json?.ok || !Array.isArray(json.stores)) {
        setStores([]);
        return;
      }
      setStores(json.stores as StoreRow[]);
    } catch {
      setStores([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await reloadStores();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadStores]);

  const selectedRow = useMemo(() => {
    if (!stores || stores.length === 0) return null;
    const byParam =
      storeIdParam.length > 0 ? stores.find((s) => s.id === storeIdParam) : undefined;
    return byParam ?? pickPreferredOwnerStore(stores) ?? stores[0]!;
  }, [stores, storeIdParam]);

  const orderCountsStoreId =
    selectedRow &&
    String(selectedRow.approval_status) === "approved" &&
    selectedRow.is_visible === true &&
    storeRowCanSell(selectedRow)
      ? selectedRow.id
      : null;

  useEffect(() => {
    if (!orderCountsStoreId) {
      setOrderAlertsBadge(0);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const { json: raw } = await fetchStoreOrderCountsDeduped(orderCountsStoreId);
        const j = raw as {
          ok?: boolean;
          refund_requested_count?: unknown;
          pending_accept_count?: unknown;
        };
        if (cancelled || !j?.ok) {
          if (!cancelled) setOrderAlertsBadge(0);
          return;
        }
        const refund = Math.max(0, Math.floor(Number(j.refund_requested_count) || 0));
        const pending = Math.max(0, Math.floor(Number(j.pending_accept_count) || 0));
        setOrderAlertsBadge(refund + pending);
      } catch {
        if (!cancelled) setOrderAlertsBadge(0);
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

  const shopName = selectedRow?.store_name?.trim() || "매장";
  const ownerCommerceUnread = useOwnerCommerceNotificationUnreadCount();

  const navCtx = useMemo(() => {
    if (!selectedRow) {
      return {
        storeId: "",
        slug: "",
        approvalStatus: "",
        isVisible: false,
        canSell: false,
        orderAlertsBadge: 0,
      };
    }
    return {
      storeId: selectedRow.id,
      slug: selectedRow.slug ?? "",
      approvalStatus: String(selectedRow.approval_status),
      isVisible: selectedRow.is_visible === true,
      canSell: storeRowCanSell(selectedRow),
      orderAlertsBadge,
    };
  }, [selectedRow, orderAlertsBadge]);

  const sections = useMemo(() => buildBusinessAdminSidebar(navCtx), [navCtx]);

  const showInlineOwnerNav = Boolean(selectedRow);

  const storeSlug = (selectedRow?.slug ?? "").trim();
  const storeApproved = selectedRow != null && String(selectedRow.approval_status) === "approved";
  const storePublicVisible = selectedRow != null && parsePostgresBool(selectedRow.is_visible, false);
  /** 고객용 `/stores/[slug]` — `GET /api/stores/[slug]`·`getApprovedStoreBySlug` 와 동일 조건 */
  const myStoreCustomerHref =
    storeApproved && storePublicVisible && storeSlug.length > 0
      ? `/stores/${encodeURIComponent(storeSlug)}`
      : null;

  useEffect(() => {
    if (!myStoreCustomerHref) return;
    try {
      router.prefetch(myStoreCustomerHref);
    } catch {
      /* noop */
    }
  }, [myStoreCustomerHref, router]);

  /** 고객 매장 상세 첫 요청이 캐시 히트되도록 — `StoreDetailPublic` 의 split API 와 동일 키 */
  useEffect(() => {
    if (!myStoreCustomerHref || !storeSlug) return;
    void Promise.all([
      fetchStoreSummaryDeduped(storeSlug),
      fetchStoreMenusDeduped(storeSlug),
      fetchStorePublicBySlugDeduped(storeSlug),
      fetchStoreBannersDeduped(storeSlug),
      fetchStoreNoticesDeduped(storeSlug),
    ]).catch(() => {});
  }, [myStoreCustomerHref, storeSlug]);

  /** 대시보드 패널과 동일 320ms — 허브를 좌로 밀 때·복귀할 때 동일 타이밍 */
  const hubPushStyle: CSSProperties = {
    transform: `translateX(${hubPushPercent}%)`,
    transitionProperty: "transform",
    transitionDuration: `${OWNER_HUB_DASHBOARD_SLIDE_MS}ms`,
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    willChange: hubPushPercent !== 0 ? "transform" : "auto",
  };

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-sam-app">
      <div className="min-h-screen min-w-0" style={hubPushStyle}>
        <StoresOwnerStackHeader
          variant="hub"
          backHref="/mypage/section/store/manage"
          shopName={shopName}
          hubSubtitle="매장 운영 센터"
          rightSlot={
            <Link
              href={`/stores/owner/notifications?${searchParams.toString()}`}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
              aria-label="알림"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {ownerCommerceUnread != null && ownerCommerceUnread > 0 ? (
                <span className={`${OWNER_HUB_BADGE_DOT_CLASS} ring-sam-surface/80`}>
                  {ownerCommerceUnread > 99 ? "99+" : ownerCommerceUnread}
                </span>
              ) : null}
            </Link>
          }
        />

        <main className="mx-auto w-full max-w-6xl min-w-0 px-3 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-[calc(env(safe-area-inset-top,0px)+3.5rem+0.75rem)] sm:px-4 lg:pb-8">
          {showInlineOwnerNav ?
            <>
              <section
                aria-labelledby="owner-hub-main-nav-heading"
                className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
              >
                <h2 id="owner-hub-main-nav-heading" className="sr-only">
                  매장 운영 메뉴
                </h2>
                <div className="border-b border-sam-border-soft px-3 py-4">
                  <div className="flex items-start gap-3">
                    <OwnerHubStoreAvatar profileImageUrl={selectedRow?.profile_image_url} shopName={shopName} />
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate sam-text-body font-semibold text-sam-fg">{shopName}</p>
                        <p className="sam-text-xxs text-sam-muted">매장 운영 센터</p>
                      </div>
                      {storeSlug.length > 0 ?
                        myStoreCustomerHref ?
                          <Link
                            prefetch
                            href={myStoreCustomerHref}
                            aria-label="나의매장 — 고객 매장 페이지로 이동"
                            className={`${MY_STORE_BTN_BASE} ${MY_STORE_BTN_PRESS} border-[#157aa0] bg-[#1C8DB8]/12 text-[#0f6a8a] hover:bg-[#1C8DB8]/20`}
                          >
                            나의매장
                          </Link>
                        : <span
                            className={`${MY_STORE_BTN_BASE} cursor-not-allowed border-sam-border-soft bg-sam-surface-muted text-sam-muted`}
                            title={
                              !storeApproved ?
                                "매장 심사 승인 후 고객 매장 페이지로 이동할 수 있어요."
                              : "고객 매장 페이지는 아래 「노출」을 켠 뒤 이동할 수 있어요."
                            }
                          >
                            나의매장
                          </span>
                      : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {selectedRow && String(selectedRow.approval_status) === "approved" ?
                      <>
                        <BusinessAdminVisibleToggle row={selectedRow} onUpdated={() => void reloadStores()} />
                        <BusinessAdminOpenToggle row={selectedRow} onUpdated={() => void reloadStores()} />
                      </>
                    : <>
                        {selectedRow?.is_visible === true ?
                          <BusinessStatusBadge tone="success">공개중</BusinessStatusBadge>
                        : <BusinessStatusBadge tone="muted">비공개</BusinessStatusBadge>}
                        <BusinessStatusBadge tone="warning">심사·준비</BusinessStatusBadge>
                      </>
                    }
                  </div>
                </div>
                <div className="px-1 py-3">
                  <OwnerHubMainMenu sections={sections} pathname={pathname} />
                </div>
                <div className="border-t border-sam-border-soft p-3">
                  <Link
                    href="/my"
                    className="block rounded-ui-rect px-3 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
                  >
                    ← 내 정보(홈)
                  </Link>
                </div>
              </section>

              <section
                aria-labelledby="owner-hub-summary-heading"
                className="mt-6 border-t border-sam-border-soft pt-6"
              >
                <h2 id="owner-hub-summary-heading" className="mb-4 sam-text-body-lg font-semibold text-sam-fg">
                  운영 요약
                </h2>
                {children}
              </section>
            </>
          : children}
        </main>
      </div>
    </div>
  );
}
