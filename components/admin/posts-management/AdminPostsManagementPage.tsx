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

/** 한 페이지 표시 건수 */
const POSTS_MANAGEMENT_PAGE_SIZE = 40;

export interface AdminPostsManagementPageProps {
  /** 서버에서 서비스 롤로 미리 불러온 목록 (RLS·API userId 없이도 표시) */
  initialProducts?: Product[];
}

export function AdminPostsManagementPage({
  initialProducts = [],
}: AdminPostsManagementPageProps) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "all";
  const tab: PostsManagementTab =
    POSTS_MANAGEMENT_TABS.some((t) => t.value === tabParam)
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

  const tabLabel =
    POSTS_MANAGEMENT_TABS.find((t) => t.value === tab)?.label ?? tab;
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
      <AdminPageHeader title="게시물 관리" />
      <div className="flex flex-wrap items-center gap-2 border-b border-sam-border pb-3">
        {POSTS_MANAGEMENT_TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/posts-management?tab=${t.value}`}
            className={`rounded-ui-rect px-4 py-2 sam-text-body font-medium ${
              tab === t.value
                ? "bg-signature text-white"
                : "bg-sam-surface-muted text-sam-fg hover:bg-sam-border-soft"
            }`}
          >
            {t.label}{" "}
            <span className="opacity-90">
              ({!loading ? countProductsForTab(products, t.value) : "–"})
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
          DB에서 불러온 글 <strong>{products.length}</strong>건 · 현재 탭·필터 적용 후{" "}
          <strong>{filtered.length}</strong>건
          {filtered.length > 0 && (
            <>
              {" "}
              · 이번 페이지 <strong>{pageStart + 1}</strong>–<strong>{pageEnd}</strong>번째 (페이지당{" "}
              {POSTS_MANAGEMENT_PAGE_SIZE}건)
            </>
          )}
        </p>
      )}
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          불러오는 중…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-12 text-center">
          {products.length === 0 ? (
            <div className="mx-auto max-w-lg space-y-3 text-left sam-text-body text-sam-fg">
              {listQueryError ? (
                <>
                  <p className="font-medium text-red-800">posts 조회 실패</p>
                  <p className="rounded-ui-rect bg-red-50 px-3 py-2 font-mono sam-text-helper text-red-900">
                    {listQueryError}
                  </p>
                  <p className="sam-text-body-secondary text-sam-muted">
                    <code className="rounded bg-sam-surface-muted px-1">web/.env.local</code>에{" "}
                    <strong>NEXT_PUBLIC_SUPABASE_URL</strong>,{" "}
                    <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong>, 권장{" "}
                    <strong>SUPABASE_SERVICE_ROLE_KEY</strong>(service_role 또는 sb_secret)를 넣고{" "}
                    <code className="rounded bg-sam-surface-muted px-1">npm run dev</code>를 재시작하세요. 터미널의{" "}
                    <code className="rounded bg-sam-surface-muted px-1">[admin posts-management]</code> 로그에 PostgREST
                    메시지가 더 나올 수 있습니다.
                  </p>
                </>
              ) : !listUsedServiceRole ? (
                <>
                  <p className="font-medium text-sam-fg">불러온 글이 0건입니다.</p>
                  <p className="sam-text-body-secondary text-sam-muted">
                    서버에 <strong>SUPABASE_SERVICE_ROLE_KEY</strong>가 없으면 anon 키로만 조회합니다. RLS가
                    막으면 실제 글이 있어도 목록이 비어 보일 수 있습니다. 어드민 게시물 관리에는{" "}
                    <strong>service_role 키 설정을 권장</strong>합니다. (
                    <code className="rounded bg-sam-surface-muted px-1">web/docs/supabase-env-setup.md</code> 참고)
                  </p>
                  <p className="sam-text-body-secondary text-sam-muted">
                    키를 넣은 뒤에도 0건이면 <code className="rounded bg-sam-surface-muted px-1">public.posts</code>에
                    행이 있는지 Supabase Table Editor에서 확인하세요.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-sam-fg">불러온 글이 0건입니다.</p>
                  <p className="sam-text-body-secondary text-sam-muted">
                    service_role로 조회했으며 쿼리는 성공했습니다. DB에 아직 글이 없거나, 다른 프로젝트를
                    바라보고 있을 수 있습니다. 탭·필터를 &quot;전체&quot;로 두고 다시 확인해 보세요.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-lg space-y-4 sam-text-body text-sam-fg">
              <p className="font-medium text-sam-fg">
                불러온 글은 {products.length}건인데, 지금 조건에는 0건입니다.
              </p>
              <ul className="list-inside list-disc text-left sam-text-body-secondary text-sam-muted">
                <li>
                  {tab === "used-car" ||
                  tab === "real-estate" ||
                  tab === "jobs" ||
                  tab === "exchange" ? (
                    <>
                      탭 <strong>{tabLabel}</strong>은 DB의 <code className="rounded bg-sam-surface-muted px-1">services.service_type</code> 또는
                      카테고리(slug·icon·이름)로 그 영역에 올린 글만 보여 줍니다.
                    </>
                  ) : tab === "trade" ? (
                    <>
                      <strong>중고거래</strong> 탭은 일반 중고 홈·거래 카테고리 글입니다. 부동산·중고차·알바·환전
                      등 전용 영역으로 분류된 글은 해당 탭에만 나옵니다.
                    </>
                  ) : tab === "etc" ? (
                    <>
                      <strong>기타</strong>는 커뮤니티·비즈니스·서비스(요청)형 등 알바·환전이 아닌
                      웹 영역으로 분류된 글입니다.
                    </>
                  ) : (
                    <>
                      현재 탭·필터 조건에 맞는 글이 없습니다. <strong>전체</strong> 탭에서 건수를
                      확인하세요.
                    </>
                  )}
                </li>
                {noCategoryMeta > 0 && (
                  <li>
                    카테고리가 비어 있거나 미해석·미연결인 글이 {noCategoryMeta}건 있습니다. 웹 진입 정보가
                    없으면 <strong>중고거래</strong> 탭에 포함됩니다.
                  </li>
                )}
                {filters.webVisibleOnly && (
                  <li>
                    <strong>웹 노출만</strong>이 켜져 있으면 숨김·삭제 글은 빠집니다.
                  </li>
                )}
                {filtersActive && (
                  <li>
                    판매자·상품 ID·카테고리 검색·정렬·상태·체크박스 필터를 완화해 보세요.
                  </li>
                )}
              </ul>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {tradeTabCount > 0 && tab !== "trade" && (
                  <Link
                    href="/admin/posts-management?tab=trade"
                    className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-medium text-white"
                  >
                    중고거래 탭으로 ({tradeTabCount})
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
                  전체 탭으로
                </Link>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body-secondary font-medium text-sam-fg"
                  >
                    필터·검색 초기화
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
            <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-sam-border bg-sam-surface md:hidden px-3">
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
              <span className="font-medium text-sam-fg">
                {safePage} / {totalPages}
              </span>{" "}
              페이지 · 총 {filtered.length}건
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
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
                다음
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
