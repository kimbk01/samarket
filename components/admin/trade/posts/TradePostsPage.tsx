"use client";

/**
 * 거래 게시물 목록 `/admin/posts-management` (설계 v2 §C-2).
 * 탭·검색·필터·정렬·페이지는 모두 URL 에 둔다 → 상세에서 돌아오면 그대로 복원된다. 자동 새로고침 없음.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  COMMUNITY_TD,
  CommunityFilterField,
  CommunityListShell,
  CommunityPagination,
  CommunityPeriodFilter,
  CommunityResetFilters,
  CommunitySearchInput,
  CommunitySelect,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  TradeMemberCell,
  TradePostThumb,
  TradeStageBadge,
  TradeVisibilityBadges,
  formatTradePrice,
} from "@/components/admin/trade/kit/TradeAdminKit";
import {
  TRADE_POST_SORTS,
  TRADE_POST_SORT_LABELS,
  TRADE_POST_TABS,
  TRADE_POST_TAB_LABELS,
  parseTradePostSort,
  parseTradePostTab,
  type TradePostTab,
} from "@/lib/admin/trade-admin/trade-post-tabs";
import { getAdminCategories } from "@/lib/categories/admin/getAdminCategories";

const PAGE_SIZE = 50;
const FIELD =
  "rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg outline-none focus:border-sam-primary";

export type TradePostListRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  price: number | null;
  is_free_share: boolean | null;
  status: string | null;
  seller_listing_state: string | null;
  moderation_state: string | null;
  owner_state: string | null;
  moderation_reason: string | null;
  thumbnail_url: string | null;
  images: unknown;
  trade_category_id: string | null;
  category_name: string | null;
  category_active: boolean | null;
  trade_type: string | null;
  lgu_id: string | null;
  region_label: string | null;
  view_count: number | null;
  favorite_count: number | null;
  chat_count: number | null;
  created_at: string | null;
  updated_at: string | null;
  seller_label: string | null;
  open_report_count: number | null;
};

type ListResponse = {
  ok?: boolean;
  error?: string;
  total?: number;
  tabCounts?: Partial<Record<TradePostTab, number | null>> | null;
  rows?: TradePostListRow[];
};

const EMPTY_TEXT: Partial<Record<TradePostTab, string>> = {
  all: "조건에 맞는 거래 게시물이 없습니다.",
  reported: "처리 대기 중인 신고가 있는 게시물이 없습니다.",
  legacy_hidden: "원인 미확인 숨김 게시물이 없습니다.",
  unclassified: "분류 확인이 필요한 게시물이 없습니다.",
};

const TRADE_TYPE_OPTIONS = [
  { value: "", label: "전체" },
  { value: "product", label: "중고" },
  { value: "job", label: "알바" },
];

/** 거래 카테고리 목록 (비활성 포함) — 목록 필터·상세 수정 공용 */
export function useTradeCategoryOptions() {
  const [cats, setCats] = useState<{ id: string; name: string; active: boolean }[]>([]);
  useEffect(() => {
    let alive = true;
    void getAdminCategories().then((all) => {
      if (!alive) return;
      setCats(all.filter((c) => c.type === "trade").map((c) => ({ id: c.id, name: c.name, active: c.is_active })));
    });
    return () => {
      alive = false;
    };
  }, []);
  return cats;
}

/** 지역(시·군) 목록 — 거래글이 있는 지역만, 이름순 */
function useTradeRegionOptions() {
  const [regions, setRegions] = useState<{ id: string; name: string; posts: number }[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin/trade/regions", { credentials: "include", cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          rows?: { lgu_id: string | null; name: string; posts: number }[];
        };
        if (!alive || !res.ok || !Array.isArray(json.rows)) return;
        setRegions(
          json.rows
            .filter((r): r is { lgu_id: string; name: string; posts: number } => Boolean(r.lgu_id))
            .map((r) => ({ id: r.lgu_id, name: r.name, posts: r.posts }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      } catch {
        /* 지역 목록을 못 읽어도 목록 화면은 그대로 쓴다 */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return regions;
}

export function TradePostsPage() {
  const { language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const qs = useCommunityQueryState();

  const tab = parseTradePostTab(qs.get("tab"));
  const sort = parseTradePostSort(qs.get("sort"));
  const q = qs.get("q");
  const sellerId = qs.get("sellerId");
  const categoryId = qs.get("categoryId");
  const tradeType = qs.get("tradeType");
  const lguId = qs.get("lguId");
  const period = qs.get("period");
  const from = qs.get("from");
  const to = qs.get("to");
  const priceMin = qs.get("priceMin");
  const priceMax = qs.get("priceMax");
  const page = qs.page;

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams({ tab, sort, limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
    const put = (k: string, v: string) => {
      if (v) p.set(k, v);
    };
    put("q", q);
    put("sellerId", sellerId);
    put("categoryId", categoryId);
    put("tradeType", tradeType);
    put("lguId", lguId);
    put("period", period);
    if (period === "custom") {
      put("from", from);
      put("to", to);
    }
    put("priceMin", priceMin);
    put("priceMax", priceMax);
    return `/api/admin/trade/posts?${p.toString()}`;
  }, [tab, sort, page, q, sellerId, categoryId, tradeType, lguId, period, from, to, priceMin, priceMax]);

  const { state, reload } = useCommunityAdminJson<ListResponse>(apiUrl);
  const data = state.data;
  const rows = data?.rows ?? [];
  const total = typeof data?.total === "number" ? data.total : null;
  const [counts, setCounts] = useState<ListResponse["tabCounts"]>(null);
  useEffect(() => {
    if (state.status === "ok" && state.data.tabCounts) setCounts(state.data.tabCounts);
  }, [state]);

  const categories = useTradeCategoryOptions();
  const regions = useTradeRegionOptions();
  const regionName =
    regions.find((r) => r.id === lguId)?.name ?? rows.find((r) => r.lgu_id === lguId)?.region_label ?? null;
  const sellerLabel = rows.find((r) => r.user_id === sellerId)?.seller_label ?? null;

  const [minDraft, setMinDraft] = useState(priceMin);
  const [maxDraft, setMaxDraft] = useState(priceMax);
  useEffect(() => {
    setMinDraft(priceMin);
    setMaxDraft(priceMax);
  }, [priceMin, priceMax]);

  const tabs = TRADE_POST_TABS.map((t) => ({
    value: t,
    label: TRADE_POST_TAB_LABELS[t],
    count: counts ? (counts[t] ?? null) : null,
  }));

  const detailHref = (id: string) => communityDetailHref(`/admin/products/${encodeURIComponent(id)}`, qs.selfHref);

  const filters = (
    <>
      <CommunityFilterField label="검색">
        <CommunitySearchInput value={q} onCommit={(v) => qs.set({ q: v })} placeholder="제목·본문·글 번호" />
      </CommunityFilterField>
      <CommunityFilterField label="유형">
        <CommunitySelect value={tradeType} onChange={(v) => qs.set({ tradeType: v })} options={TRADE_TYPE_OPTIONS} />
      </CommunityFilterField>
      <CommunityFilterField label="카테고리">
        <CommunitySelect
          value={categoryId}
          onChange={(v) => qs.set({ categoryId: v })}
          options={[
            { value: "", label: "전체" },
            ...categories.map((c) => ({ value: c.id, label: c.active ? c.name : `${c.name} (비활성)` })),
          ]}
        />
      </CommunityFilterField>
      <CommunityFilterField label="지역">
        <CommunitySelect
          value={lguId}
          onChange={(v) => qs.set({ lguId: v })}
          options={[
            { value: "", label: "전체" },
            ...(lguId && !regions.some((r) => r.id === lguId) ? [{ value: lguId, label: regionName ?? "선택한 지역" }] : []),
            ...regions.map((r) => ({ value: r.id, label: `${r.name} (${r.posts.toLocaleString()})` })),
          ]}
        />
      </CommunityFilterField>
      <CommunityPeriodFilter
        period={period}
        from={from}
        to={to}
        onChange={(v) => qs.set({ period: v.period, from: v.from, to: v.to })}
      />
      <CommunityFilterField label="가격 (₱)">
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            qs.set({ priceMin: minDraft.trim(), priceMax: maxDraft.trim() });
          }}
        >
          <input
            inputMode="numeric"
            value={minDraft}
            onChange={(e) => setMinDraft(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="최소"
            className={`${FIELD} w-24`}
          />
          <span className="text-sam-muted">~</span>
          <input
            inputMode="numeric"
            value={maxDraft}
            onChange={(e) => setMaxDraft(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="최대"
            className={`${FIELD} w-24`}
          />
          <button type="submit" className={`${FIELD} font-semibold`}>
            조회
          </button>
        </form>
      </CommunityFilterField>
      <CommunityFilterField label="정렬">
        <CommunitySelect
          value={sort}
          onChange={(v) => qs.set({ sort: v === "latest" ? "" : v })}
          options={TRADE_POST_SORTS.map((s) => ({ value: s, label: TRADE_POST_SORT_LABELS[s] }))}
        />
      </CommunityFilterField>
      {sellerId ? (
        <span className="inline-flex items-center gap-1 self-end rounded-full border border-sam-border bg-sam-app px-3 py-1 text-[12px] text-sam-fg">
          판매자: {sellerLabel ?? "선택한 회원"}
          <button
            type="button"
            aria-label="판매자 조건 지우기"
            onClick={() => qs.set({ sellerId: null })}
            className="ml-1 font-semibold text-sam-muted hover:text-sam-fg"
          >
            ×
          </button>
        </span>
      ) : null}
      {lguId ? (
        <span className="inline-flex items-center gap-1 self-end rounded-full border border-sam-border bg-sam-app px-3 py-1 text-[12px] text-sam-fg">
          지역: {regionName ?? "선택한 지역"}
          <button
            type="button"
            aria-label="지역 조건 지우기"
            onClick={() => qs.set({ lguId: null })}
            className="ml-1 font-semibold text-sam-muted hover:text-sam-fg"
          >
            ×
          </button>
        </span>
      ) : null}
      <CommunityResetFilters onReset={() => qs.reset(["tab"])} />
    </>
  );

  let body;
  if (state.status === "error") {
    body = (
      <div className="p-3">
        <AdminErrorState ko={ko} code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      </div>
    );
  } else if (state.status === "loading" && !data) {
    body = (
      <div className="p-3">
        <AdminLoadingState ko={ko} />
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <div className="p-3">
        <AdminEmptyState ko={ko} message={EMPTY_TEXT[tab] ?? "해당 상태의 게시물이 없습니다."} />
      </div>
    );
  } else {
    body = (
      <CommunityTable
        head={["썸네일", "제목·가격", "판매자", "지역", "카테고리", "판매 단계", "노출", "신고", "채팅·찜", "등록", "수정", ""]}
      >
        {rows.map((r) => (
          <tr
            key={r.id}
            onClick={() => router.push(detailHref(r.id))}
            className="cursor-pointer border-b border-sam-border-soft hover:bg-sam-app"
          >
            <td className={COMMUNITY_TD}>
              <TradePostThumb post={r} size={48} />
            </td>
            <td className={`${COMMUNITY_TD} max-w-[18rem]`}>
              <Link
                href={detailHref(r.id)}
                onClick={(e) => e.stopPropagation()}
                className="line-clamp-2 font-medium text-sam-fg hover:underline"
              >
                {r.title?.trim() || "제목 없음"}
              </Link>
              <span className="mt-0.5 flex flex-wrap items-center gap-1 text-sam-muted">
                {formatTradePrice(r.price, r.is_free_share)}
                {r.trade_type === "job" ? <AdminToneBadge tone="neutral">알바</AdminToneBadge> : null}
              </span>
            </td>
            <td className={COMMUNITY_TD} onClick={(e) => e.stopPropagation()}>
              <TradeMemberCell userId={r.user_id} label={r.seller_label} returnTo={qs.selfHref} />
            </td>
            <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{r.region_label ?? "—"}</td>
            <td className={COMMUNITY_TD}>
              <span className="flex flex-wrap items-center gap-1">
                {r.category_name ?? "—"}
                {r.category_active === false ? <AdminToneBadge tone="neutral">비활성</AdminToneBadge> : null}
              </span>
            </td>
            <td className={COMMUNITY_TD}>
              <TradeStageBadge value={r.seller_listing_state} />
            </td>
            <td className={COMMUNITY_TD}>
              <TradeVisibilityBadges moderationState={r.moderation_state} ownerState={r.owner_state} />
            </td>
            <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
              {(r.open_report_count ?? 0) > 0 ? (
                <AdminToneBadge tone="danger">{r.open_report_count}건</AdminToneBadge>
              ) : (
                <span className="text-sam-muted">—</span>
              )}
            </td>
            <td className={`${COMMUNITY_TD} whitespace-nowrap text-sam-muted`}>
              {(r.chat_count ?? 0).toLocaleString()} · {(r.favorite_count ?? 0).toLocaleString()}
            </td>
            <td className={COMMUNITY_TD}>
              <CommunityTimeCell iso={r.created_at} />
            </td>
            <td className={COMMUNITY_TD}>
              <CommunityTimeCell iso={r.updated_at} />
            </td>
            <td className={COMMUNITY_TD} onClick={(e) => e.stopPropagation()}>
              <AdminActionLink href={detailHref(r.id)} variant="secondary">
                상세
              </AdminActionLink>
            </td>
          </tr>
        ))}
      </CommunityTable>
    );
  }

  return (
    <CommunityListShell
      title="거래 게시물"
      description="중고·알바 거래글의 판매 단계와 노출 상태를 확인하고 조치합니다."
      actions={
        <AdminActionButton variant="secondary" onClick={reload} disabled={state.status === "loading"}>
          {state.status === "loading" ? "불러오는 중…" : "새로고침"}
        </AdminActionButton>
      }
      tabs={<CommunityTabs tabs={tabs} value={tab} onChange={(v) => qs.set({ tab: v === "all" ? "" : v })} />}
      filters={filters}
      footer={
        rows.length > 0 || page > 1 ? (
          <CommunityPagination page={page} pageSize={PAGE_SIZE} total={total} onPage={(p) => qs.set({ page: p })} />
        ) : null
      }
    >
      {body}
    </CommunityListShell>
  );
}
