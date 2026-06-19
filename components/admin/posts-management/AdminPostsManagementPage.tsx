"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { getAdminProductsFromDb } from "@/lib/admin-products/getAdminProductsFromDb";
import {
  filterAndSortPostsManagement,
  POSTS_MANAGEMENT_TABS,
  DEFAULT_POSTS_MANAGEMENT_FILTERS,
  countPostsWithoutCategoryMeta,
  countProductsForTab,
  hasPostsManagementActiveFilters,
  type PostsManagementTab,
  type PostsManagementFilters,
} from "@/lib/admin-products/posts-management-utils";
import type { Product } from "@/lib/types/product";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPostsManagementFilterBar } from "./AdminPostsManagementFilterBar";
import { AdminPostsManagementTable } from "./AdminPostsManagementTable";
import { fetchAdminPostsManagementDeduped } from "@/lib/admin/fetch-admin-posts-management-deduped";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { POSTS_MGMT_TAB_LABEL_KEY } from "./posts-management-i18n";

/** 한 페이지 표시 건수 */
const POSTS_MANAGEMENT_PAGE_SIZE = 40;

export interface AdminPostsManagementPageProps {
  /** 서버에서 서비스 롤로 미리 불러온 목록 (RLS·API userId 없이도 표시) */
  initialProducts?: Product[];
}

export function AdminPostsManagementPage({
  initialProducts = [],
}: AdminPostsManagementPageProps) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "all";
  const tab: PostsManagementTab =
    POSTS_MANAGEMENT_TABS.some((tabValue) => tabValue === tabParam)
      ? (tabParam as PostsManagementTab)
      : "all";

  const [filters, setFilters] =
    useState<PostsManagementFilters>(DEFAULT_POSTS_MANAGEMENT_FILTERS);
  const [sellerSearch, setSellerSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [productIdSearch, setProductIdSearch] = useState("");
  const [showProductIdColumn, setShowProductIdColumn] = useState(false);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  /** 마지막 API/폴백 조회 메타(빈 목록 원인 구분) */
  const [listQueryError, setListQueryError] = useState<string | null>(null);
  const [listUsedServiceRole, setListUsedServiceRole] = useState(false);
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const [currentPage, setCurrentPage] = useState(1);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [tableClientWidth, setTableClientWidth] = useState(0);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) setLoading(true);

      try {
        const { status, json: raw } = await fetchAdminPostsManagementDeduped();
        if (status >= 200 && status < 300 && raw && typeof raw === "object") {
          const data = raw as {
            products?: Product[];
            queryError?: string | null;
            usedServiceRole?: boolean;
          };
          if (Array.isArray(data.products)) {
            setProducts(data.products);
            setListQueryError(data.queryError ?? null);
            setListUsedServiceRole(data.usedServiceRole ?? false);
            if (!silent) setLoading(false);
            return;
          }
        }
      } catch {
        /* API 실패 시 클라이언트 Supabase로 폴백 */
      }

      const { products: list, queryError } = await getAdminProductsFromDb();
      setProducts(list);
      setListQueryError(queryError);
      setListUsedServiceRole(false);
      if (!silent) setLoading(false);
    },
    []
  );

  const refreshList = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  useEffect(() => {
    if (initialProducts.length > 0) {
      setProducts(initialProducts);
      setLoading(false);
      return;
    }
    void load();
  }, [initialProducts.length, load]);

  // 웹에서 판매자가 문의중/예약중/판매완료로 상태 변경하면 DB(posts.status)가 바뀌지만,
  // 어드민 페이지는 기본적으로 실시간 갱신을 안 하므로 '바로 업데이트'를 위해 폴링합니다.
  useEffect(() => {
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const filtered = useMemo(
    () =>
      filterAndSortPostsManagement(
        products,
        tab,
        filters,
        sellerSearch,
        categorySearch,
        productIdSearch
      ),
    [products, tab, filters, sellerSearch, categorySearch, productIdSearch]
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / POSTS_MANAGEMENT_PAGE_SIZE)
  );
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * POSTS_MANAGEMENT_PAGE_SIZE;
  const pageEnd = Math.min(pageStart + POSTS_MANAGEMENT_PAGE_SIZE, filtered.length);
  const paginatedFiltered = useMemo(
    () => filtered.slice(pageStart, pageEnd),
    [filtered, pageStart, pageEnd]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    tab,
    sellerSearch,
    categorySearch,
    filters.dealType,
    filters.status,
    filters.hasReport,
    filters.hiddenOnly,
    filters.bannedSuspect,
    filters.sortKey,
    filters.webVisibleOnly,
    filters.jobListingKind,
    productIdSearch,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const onTableHorizontalScroll = useCallback(() => {
    const t = tableScrollRef.current;
    const b = bottomScrollRef.current;
    if (!t || !b) return;
    if (b.scrollLeft !== t.scrollLeft) b.scrollLeft = t.scrollLeft;
  }, []);

  const onBottomHorizontalScroll = useCallback(() => {
    const t = tableScrollRef.current;
    const b = bottomScrollRef.current;
    if (!t || !b) return;
    if (t.scrollLeft !== b.scrollLeft) t.scrollLeft = b.scrollLeft;
  }, []);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;

    const update = () => {
      setTableScrollWidth(el.scrollWidth);
      setTableClientWidth(el.clientWidth);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [products, tab, showProductIdColumn, loading]);

  const showBottomFixedScroll = tableScrollWidth > tableClientWidth + 2;

  const pageButtonItems = useMemo((): (number | "ellipsis")[] => {
    const total = totalPages;
    const cur = safePage;
    if (total <= 9) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const set = new Set<number>();
    set.add(1);
    set.add(total);
    for (let i = cur - 1; i <= cur + 1; i++) {
      if (i >= 1 && i <= total) set.add(i);
    }
    const sorted = [...set].sort((a, b) => a - b);
    const out: (number | "ellipsis")[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) {
        out.push("ellipsis");
      }
      out.push(sorted[i]!);
    }
    return out;
  }, [totalPages, safePage]);

  const tabLabel = t(POSTS_MGMT_TAB_LABEL_KEY[tab]);
  const noCategoryMeta = countPostsWithoutCategoryMeta(products);
  const tradeTabCount = countProductsForTab(products, "trade");
  const filtersActive = hasPostsManagementActiveFilters(
    filters,
    sellerSearch,
    categorySearch,
    productIdSearch
  );

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_POSTS_MANAGEMENT_FILTERS);
    setSellerSearch("");
    setCategorySearch("");
    setProductIdSearch("");
  }, []);

  const showTable = !loading && filtered.length > 0;

  return (
    <div className={`min-w-0 space-y-4${showBottomFixedScroll ? " pb-14" : ""}`}>
      <AdminPageHeader titleKey="admin_posts_mgmt_page_title" />
      <div className="flex flex-wrap items-center gap-2 border-b border-sam-border pb-3">
        {POSTS_MANAGEMENT_TABS.map((tabValue) => (
          <Link
            key={tabValue}
            href={`/admin/posts-management?tab=${tabValue}`}
            className={`rounded-ui-rect px-4 py-2 sam-text-body font-medium ${
              tab === tabValue
                ? "bg-signature text-white"
                : "bg-sam-surface-muted text-sam-fg hover:bg-sam-border-soft"
            }`}
          >
            {t(POSTS_MGMT_TAB_LABEL_KEY[tabValue])}{" "}
            <span className="opacity-90">
              ({!loading ? countProductsForTab(products, tabValue) : "–"})
            </span>
          </Link>
        ))}
      </div>
      <AdminPostsManagementFilterBar
        tab={tab}
        filters={filters}
        products={products}
        sellerSearch={sellerSearch}
        categorySearch={categorySearch}
        productIdSearch={productIdSearch}
        showProductIdColumn={showProductIdColumn}
        onFiltersChange={setFilters}
        onSellerSearchChange={setSellerSearch}
        onCategorySearchChange={setCategorySearch}
        onProductIdSearchChange={setProductIdSearch}
        onShowProductIdColumnChange={setShowProductIdColumn}
      />
      {!loading && products.length > 0 && (
        <p className="sam-text-body-secondary text-sam-muted">
          {t("admin_posts_mgmt_stats_loaded", {
            loaded: String(products.length),
            filtered: String(filtered.length),
          })}
          {filtered.length > 0 &&
            t("admin_posts_mgmt_stats_page_range", {
              start: String(pageStart + 1),
              end: String(pageEnd),
              pageSize: String(POSTS_MANAGEMENT_PAGE_SIZE),
            })}
        </p>
      )}
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("common_loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-12 text-center">
          {products.length === 0 ? (
            <div className="mx-auto max-w-lg space-y-3 text-left sam-text-body text-sam-fg">
              {listQueryError ? (
                <>
                  <p className="font-medium text-red-800">{t("admin_posts_mgmt_err_query_title")}</p>
                  <p className="rounded-ui-rect bg-red-50 px-3 py-2 font-mono sam-text-helper text-red-900">
                    {listQueryError}
                  </p>
                  <p className="sam-text-body-secondary text-sam-muted">
                    {t("admin_posts_mgmt_err_env_hint", {
                      envFile: "web/.env.local",
                      urlKey: "NEXT_PUBLIC_SUPABASE_URL",
                      anonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
                      serviceKey: "SUPABASE_SERVICE_ROLE_KEY",
                      devCmd: "npm run dev",
                      logTag: "[admin posts-management]",
                    })}
                  </p>
                </>
              ) : !listUsedServiceRole ? (
                <>
                  <p className="font-medium text-sam-fg">{t("admin_posts_mgmt_empty_zero_title")}</p>
                  <p className="sam-text-body-secondary text-sam-muted">
                    {t("admin_posts_mgmt_empty_zero_anon_body", {
                      serviceKey: "SUPABASE_SERVICE_ROLE_KEY",
                      docPath: "web/docs/supabase-env-setup.md",
                    })}
                  </p>
                  <p className="sam-text-body-secondary text-sam-muted">
                    {t("admin_posts_mgmt_empty_zero_anon_hint", {
                      postsTable: "public.posts",
                    })}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-sam-fg">{t("admin_posts_mgmt_empty_zero_title")}</p>
                  <p className="sam-text-body-secondary text-sam-muted">
                    {t("admin_posts_mgmt_empty_zero_service_body")}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-lg space-y-4 sam-text-body text-sam-fg">
              <p className="font-medium text-sam-fg">
                {t("admin_posts_mgmt_empty_filtered_title", {
                  loaded: String(products.length),
                })}
              </p>
              <ul className="list-inside list-disc text-left sam-text-body-secondary text-sam-muted">
                <li>
                  {tab === "used-car" ||
                  tab === "real-estate" ||
                  tab === "jobs" ||
                  tab === "exchange"
                    ? t("admin_posts_mgmt_empty_hint_section_tab", {
                        tabLabel,
                        serviceTypeField: "services.service_type",
                      })
                    : tab === "trade"
                      ? t("admin_posts_mgmt_empty_hint_trade_tab")
                      : tab === "etc"
                        ? t("admin_posts_mgmt_empty_hint_etc_tab")
                        : t("admin_posts_mgmt_empty_hint_no_match")}
                </li>
                {noCategoryMeta > 0 && (
                  <li>
                    {t("admin_posts_mgmt_empty_hint_no_category", {
                      count: String(noCategoryMeta),
                    })}
                  </li>
                )}
                {filters.webVisibleOnly && (
                  <li>{t("admin_posts_mgmt_empty_hint_web_visible")}</li>
                )}
                {filtersActive && (
                  <li>{t("admin_posts_mgmt_empty_hint_relax_filters")}</li>
                )}
              </ul>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {tradeTabCount > 0 && tab !== "trade" && (
                  <Link
                    href="/admin/posts-management?tab=trade"
                    className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-medium text-white"
                  >
                    {t("admin_posts_mgmt_link_trade_tab", { count: String(tradeTabCount) })}
                  </Link>
                )}
                <Link
                  href="/admin/posts-management?tab=all"
                  className={`rounded-ui-rect px-4 py-2 sam-text-body-secondary font-medium ${
                    tradeTabCount > 0 && tab !== "trade"
                      ? "border border-sam-border bg-sam-surface text-sam-fg"
                      : "bg-signature text-white"
                  }`}
                >
                  {t("admin_posts_mgmt_link_all_tab")}
                </Link>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body-secondary font-medium text-sam-fg"
                  >
                    {t("admin_posts_mgmt_reset_filters")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <AdminPostsManagementTable
            ref={tableScrollRef}
            products={paginatedFiltered}
            showProductIdColumn={showProductIdColumn}
            onHorizontalScroll={onTableHorizontalScroll}
            onActionSuccess={refreshList}
          />

          {showBottomFixedScroll && (
            <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-sam-border bg-sam-surface md:hidden px-3 pb-[var(--safe-bottom)]">
              <div
                ref={bottomScrollRef}
                onScroll={onBottomHorizontalScroll}
                className="h-6 w-full overflow-x-scroll overflow-y-hidden"
                aria-hidden
              >
                <div
                  className="h-1"
                  style={{ width: Math.max(tableScrollWidth, 1) }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sam-border bg-sam-surface px-3 py-2.5 md:px-4">
            <p className="sam-text-body-secondary text-sam-muted">
              {t("admin_posts_mgmt_pagination_info", {
                page: String(safePage),
                totalPages: String(totalPages),
                total: String(filtered.length),
              })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("admin_posts_mgmt_prev")}
              </button>
              <div className="flex max-w-[min(100%,320px)] flex-wrap items-center gap-1">
                {pageButtonItems.map((item, idx) =>
                  item === "ellipsis" ? (
                    <span
                      key={`e-${idx}`}
                      className="px-1 sam-text-body-secondary text-sam-meta"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCurrentPage(item)}
                      className={`min-w-[2.25rem] rounded-ui-rect px-2 py-1.5 sam-text-body-secondary font-medium ${
                        item === safePage
                          ? "bg-signature text-white"
                          : "border border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-app"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
              </div>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("admin_posts_mgmt_next")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
