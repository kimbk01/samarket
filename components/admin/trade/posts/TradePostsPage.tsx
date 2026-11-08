"use client";

/**
 * 거래 게시물 목록 `/admin/posts-management` (설계 v2 §C-2).
 * 탭·검색·필터·정렬·페이지는 모두 URL 에 둔다 → 상세에서 돌아오면 그대로 복원된다. 자동 새로고침 없음.
 * URL: tab(탭 — 대시보드 딥링크) · q · sellerId · categoryId · tradeType · lguId · from/to(PHT) · (호환) period ·
 *      priceMin · priceMax · sort · page · size(20/50/100)
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  CommunityActionSheet,
  communityDetailHref,
  communitySheetFetch,
  useCommunityListQuery,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
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
  TRADE_POST_SORT_LABEL_KEYS,
  TRADE_POST_TABS,
  TRADE_POST_TAB_LABEL_KEYS,
  TRADE_POST_MODERATION_ACTION_LABEL_KEYS,
  allowedTradePostModerationActions,
  parseTradePostSort,
  parseTradePostTab,
  type TradePostModerationAction,
  type TradePostTab,
} from "@/lib/admin/trade-admin/trade-post-tabs";
import { getAdminCategories } from "@/lib/categories/admin/getAdminCategories";
import type { MessageKey } from "@/lib/i18n/messages";

const LIST_EXTRAS = ["sellerId", "categoryId", "tradeType", "lguId", "priceMin", "priceMax"] as const;
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

const EMPTY_TEXT: Partial<Record<TradePostTab, MessageKey>> = {
  all: "admin_trade_posts_empty_all",
  reported: "admin_trade_posts_empty_reported",
  unclassified: "admin_trade_posts_empty_unclassified",
};

/** 목록 일괄 조치 (설계 v2 §C-2) — 선택 숨김 · 선택 숨김 해제만. 일괄 삭제는 두지 않는다 (§F-1-4). */
const BULK_ACTIONS = [
  { action: "hide", from: "visible", labelKey: "admin_trade_posts_bulk_hide" },
  { action: "unhide", from: "admin_hidden", labelKey: "admin_trade_posts_bulk_unhide" },
] as const;

type PostSheet = { action: TradePostModerationAction; targets: TradePostListRow[] };

const TRADE_TYPE_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "common_all" },
  { value: "product", labelKey: "admin_trade_posts_type_product" },
  { value: "job", labelKey: "admin_trade_posts_job_badge" },
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
  const { t } = useI18n();
  const router = useRouter();
  /** `tab` 은 조회 조건 밖 키 — [초기화] 후에도 유지, 탭을 바꾸면 1쪽으로 */
  const qs = useCommunityQueryState();
  const lq = useCommunityListQuery({ extras: LIST_EXTRAS, sorts: TRADE_POST_SORTS, defaults: { sort: "latest" } });

  const tab = parseTradePostTab(qs.get("tab"));
  const sort = parseTradePostSort(lq.query.sort);
  const { sellerId, categoryId, tradeType, lguId, priceMin, priceMax } = lq.query.extras;

  const apiUrl = useMemo(() => {
    const p = lq.apiParams();
    p.set("tab", tab);
    p.set("sort", sort);
    return `/api/admin/trade/posts?${p.toString()}`;
  }, [lq, tab, sort]);

  const { state, reload } = useCommunityAdminJson<ListResponse>(apiUrl);
  const data = state.data;
  const loading = state.status === "loading";
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

  const tabs = TRADE_POST_TABS.map((tab) => ({
    value: tab,
    label: t(TRADE_POST_TAB_LABEL_KEYS[tab]),
    count: counts ? (counts[tab] ?? null) : null,
  }));

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sheet, setSheet] = useState<PostSheet | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    setSelected(new Set());
  }, [apiUrl]);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  /** 한 건씩 같은 조치 API(같은 RPC·감사)로 처리. 실패가 있으면 첫 실패를 시트에 돌려주고 성공 건수는 안내한다. */
  const submitSheet = async (target: PostSheet, reason: string) => {
    let done = 0;
    let firstFail: Awaited<ReturnType<typeof communitySheetFetch>> | null = null;
    for (const r of target.targets) {
      const res = await communitySheetFetch(`/api/admin/trade/posts/${encodeURIComponent(r.id)}/moderation`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: target.action, reason, expectedUpdatedAt: r.updated_at }),
      });
      if (res.ok) done += 1;
      else firstFail ??= res;
    }
    if (target.targets.length > 1) {
      const doneText = t("admin_trade_posts_bulk_done", { action: t(TRADE_POST_MODERATION_ACTION_LABEL_KEYS[target.action]), n: done });
      setNotice(firstFail ? `${doneText} · ${t("admin_trade_posts_bulk_failed", { n: target.targets.length - done })}` : doneText);
    }
    return firstFail ?? { ok: true as const };
  };

  const detailHref = (id: string) => communityDetailHref(`/admin/products/${encodeURIComponent(id)}`, lq.selfHref);

  /** [조회] — 검색어·기간과 함께 가격 범위도 적용 (필터 바 하나의 [조회]) */
  const barQuery = useMemo(
    () => ({
      ...lq,
      submit: () => {
        const dates = Boolean(lq.draft.from || lq.draft.to);
        lq.patch({
          q: lq.draft.q,
          from: lq.draft.from,
          to: lq.draft.to,
          extras: { priceMin: minDraft.trim(), priceMax: maxDraft.trim(), ...(dates ? { period: "" } : {}) },
        });
      },
    }),
    [lq, minDraft, maxDraft]
  );

  const filterBar = (
    <CommunityFilterBar lq={barQuery} searchPlaceholder={t("admin_trade_posts_search_ph")} pending={loading}>
      <CommunityFilterField label={t("admin_trade_points_th_type")}>
        <CommunitySelect value={tradeType} onChange={(v) => lq.setExtra("tradeType", v)} options={TRADE_TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} />
      </CommunityFilterField>
      <CommunityFilterField label={t("admin_trade_audit_target_category")}>
        <CommunitySelect
          value={categoryId}
          onChange={(v) => lq.setExtra("categoryId", v)}
          options={[
            { value: "", label: t("common_all") },
            ...categories.map((c) => ({ value: c.id, label: c.active ? c.name : t("admin_trade_posts_category_inactive", { name: c.name }) })),
          ]}
        />
      </CommunityFilterField>
      <CommunityFilterField label={t("common_region")}>
        <CommunitySelect
          value={lguId}
          onChange={(v) => lq.setExtra("lguId", v)}
          options={[
            { value: "", label: t("common_all") },
            ...(lguId && !regions.some((r) => r.id === lguId) ? [{ value: lguId, label: regionName ?? t("admin_trade_posts_selected_region") }] : []),
            ...regions.map((r) => ({ value: r.id, label: `${r.name} (${formatAdminNumber(r.posts)})` })),
          ]}
        />
      </CommunityFilterField>
      <CommunityFilterField label={t("admin_trade_posts_price_php")}>
        <span className="flex items-center gap-1">
          <input
            inputMode="numeric"
            value={minDraft}
            onChange={(e) => setMinDraft(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={t("admin_trade_posts_min")}
            aria-label={t("admin_trade_posts_min_price")}
            className={`${FIELD} w-24`}
          />
          <span className="text-sam-muted">~</span>
          <input
            inputMode="numeric"
            value={maxDraft}
            onChange={(e) => setMaxDraft(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={t("admin_trade_posts_max")}
            aria-label={t("admin_trade_posts_max_price")}
            className={`${FIELD} w-24`}
          />
        </span>
      </CommunityFilterField>
      <CommunityFilterField label={t("common_sort")}>
        <CommunitySelect
          value={sort}
          onChange={(v) => lq.setSort(v)}
          options={TRADE_POST_SORTS.map((s) => ({ value: s, label: t(TRADE_POST_SORT_LABEL_KEYS[s]) }))}
        />
      </CommunityFilterField>
      {sellerId ? (
        <CommunityFilterField label={t("admin_trade_th_seller")}>
          <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
            {sellerLabel ?? t("admin_trade_audit_selected_member")}
            <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => lq.setExtra("sellerId", "")}>
              {t("admin_trade_filter_clear")}
            </AdminActionButton>
          </span>
        </CommunityFilterField>
      ) : null}
    </CommunityFilterBar>
  );

  const body = (
    <CommunityListBody
      state={state}
      empty={rows.length === 0}
      lq={lq}
      onRetry={reload}
      emptyMessage={t(EMPTY_TEXT[tab] ?? "admin_trade_posts_empty_status")}
    >
      <CommunityTable
        head={[
          t("admin_trade_posts_th_select"),
          t("admin_trade_posts_th_thumb"),
          t("admin_trade_posts_th_title_price"),
          t("admin_trade_th_seller"),
          t("common_region"),
          t("admin_trade_audit_target_category"),
          t("admin_trade_posts_th_stage"),
          t("admin_trade_posts_th_visibility"),
          t("common_report"),
          t("admin_trade_posts_th_chats_favs"),
          t("admin_trade_th_created"),
          t("admin_trade_posts_th_updated"),
          t("admin_trade_posts_th_actions"),
        ]}
      >
        {rows.map((r) => (
          <tr
            key={r.id}
            onClick={() => router.push(detailHref(r.id))}
            className="cursor-pointer border-b border-sam-border-soft hover:bg-sam-app"
          >
            <td className={COMMUNITY_TD} onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                aria-label={t("admin_trade_posts_select_post")}
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                className="h-4 w-4"
              />
            </td>
            <td className={COMMUNITY_TD}>
              <TradePostThumb post={r} size={48} />
            </td>
            <td className={`${COMMUNITY_TD} max-w-[18rem]`}>
              <Link
                href={detailHref(r.id)}
                onClick={(e) => e.stopPropagation()}
                className="line-clamp-2 font-medium text-sam-fg hover:underline"
              >
                {r.title?.trim() || t("admin_trade_posts_no_title")}
              </Link>
              <span className="mt-0.5 flex flex-wrap items-center gap-1 text-sam-muted">
                {formatTradePrice(r.price, r.is_free_share)}
                {r.trade_type === "job" ? <AdminToneBadge tone="neutral">{t("admin_trade_posts_job_badge")}</AdminToneBadge> : null}
              </span>
            </td>
            <td className={COMMUNITY_TD} onClick={(e) => e.stopPropagation()}>
              <TradeMemberCell userId={r.user_id} label={r.seller_label} returnTo={lq.selfHref} />
            </td>
            <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{r.region_label ?? "—"}</td>
            <td className={COMMUNITY_TD}>
              <span className="flex flex-wrap items-center gap-1">
                {r.category_name ?? "—"}
                {r.category_active === false ? <AdminToneBadge tone="neutral">{t("admin_trade_posts_inactive_badge")}</AdminToneBadge> : null}
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
                <AdminToneBadge tone="danger">{t("admin_trade_count_items", { n: r.open_report_count ?? 0 })}</AdminToneBadge>
              ) : (
                <span className="text-sam-muted">—</span>
              )}
            </td>
            <td className={`${COMMUNITY_TD} whitespace-nowrap text-sam-muted`}>
              {formatAdminNumber(r.chat_count ?? 0)} · {formatAdminNumber(r.favorite_count ?? 0)}
            </td>
            <td className={COMMUNITY_TD}>
              <CommunityTimeCell iso={r.created_at} />
            </td>
            <td className={COMMUNITY_TD}>
              <CommunityTimeCell iso={r.updated_at} />
            </td>
            <td className={COMMUNITY_TD} onClick={(e) => e.stopPropagation()}>
              {/* 행 버튼은 조치 2개 이하 (ghost) — 상세는 행·제목 클릭. 숨김·삭제는 복구 가능해 danger 아님 (확인 시트는 그대로) */}
              <span className="flex flex-wrap gap-1">
                {allowedTradePostModerationActions(String(r.moderation_state ?? "")).map((a) => (
                  <AdminActionButton key={a} variant="ghost" size="sm" onClick={() => setSheet({ action: a, targets: [r] })}>
                    {t(TRADE_POST_MODERATION_ACTION_LABEL_KEYS[a])}
                  </AdminActionButton>
                ))}
              </span>
            </td>
          </tr>
        ))}
      </CommunityTable>
    </CommunityListBody>
  );

  const bulkBar =
    rows.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft px-3 py-2 text-[13px]">
        <label className="flex items-center gap-1 text-sam-muted">
          <input
            type="checkbox"
            checked={allOnPage}
            onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))}
            className="h-4 w-4"
          />
          {t("admin_trade_posts_select_all_page")}
        </label>
        <span className="text-sam-muted">{t("admin_trade_posts_selected_count", { n: selectedRows.length })}</span>
        {/* 일괄 조치는 행을 선택했을 때만 */}
        {(selectedRows.length > 0 ? BULK_ACTIONS : []).map((b) => {
          const targets = selectedRows.filter((r) => r.moderation_state === b.from);
          return (
            <AdminActionButton
              key={b.action}
              variant="secondary"
              disabled={targets.length === 0}
              onClick={() => setSheet({ action: b.action, targets })}
            >
              {t(b.labelKey)} ({targets.length})
            </AdminActionButton>
          );
        })}
        {notice ? <span role="status" className="text-sam-fg">{notice}</span> : null}
      </div>
    ) : null;

  return (
    <CommunityListShell
      title={t("admin_trade_posts_title")}
      description={t("admin_trade_posts_desc")}
      actions={
        <AdminActionButton variant="secondary" onClick={reload} disabled={loading}>
          {loading ? t("common_loading") : t("admin_trade_dash_refresh")}
        </AdminActionButton>
      }
      tabs={<CommunityTabs tabs={tabs} value={tab} onChange={(v) => qs.set({ tab: v === "all" ? "" : v })} />}
      filterBar={filterBar}
      footer={<CommunityListPagination lq={lq} total={total} disabled={loading} />}
    >
      {bulkBar}
      {body}
      {sheet ? (
        <CommunityActionSheet
          title={
            sheet.targets.length > 1
              ? t("admin_trade_posts_sheet_title_n", { action: t(TRADE_POST_MODERATION_ACTION_LABEL_KEYS[sheet.action]), n: sheet.targets.length })
              : t("admin_trade_posts_sheet_title", { action: t(TRADE_POST_MODERATION_ACTION_LABEL_KEYS[sheet.action]) })
          }
          rows={[
            {
              label: t("admin_trade_audit_target"),
              value:
                sheet.targets.length === 1
                  ? sheet.targets[0].title?.trim() || t("admin_trade_posts_no_title")
                  : t("admin_trade_posts_target_more", {
                      title: sheet.targets[0].title?.trim() || t("admin_trade_posts_no_title"),
                      n: sheet.targets.length - 1,
                    }),
            },
          ]}
          notice={sheet.action === "hide" || sheet.action === "delete" ? t("admin_trade_posts_seller_cannot_undo") : undefined}
          reason={{ minLength: 2, placeholder: t("admin_trade_posts_reason_ph") }}
          destructive={sheet.action === "hide" || sheet.action === "delete"}
          confirmLabel={t(TRADE_POST_MODERATION_ACTION_LABEL_KEYS[sheet.action])}
          onClose={() => {
            setSheet(null);
            reload();
          }}
          onSubmit={(reason) => submitSheet(sheet, reason)}
          onSettled={() => {
            setSheet(null);
            setSelected(new Set());
            reload();
          }}
        />
      ) : null}
    </CommunityListShell>
  );
}
