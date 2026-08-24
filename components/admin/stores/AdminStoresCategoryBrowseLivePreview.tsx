"use client";

/**
 * Admin CATEGORY preview — live GET /api/stores/browse?primary=&sub=
 * Scope is primary/secondary only (not HOME shelves; not other primaries).
 * sub=all → mixed within that primary; sub=X → that secondary only.
 */

import { useEffect, useState } from "react";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { StoreBrowseCategoryRowCard, browseItemToRowCard } from "@/components/stores/browse/StoreBrowseCategoryRowCard";
import type { StoresBrowseInsertionMetaRow } from "@/lib/stores/composition/stores-composition-browse-insertion-meta";

export type AdminCategoryBrowsePreviewProps = {
  primarySlug: string;
  /** `all` or secondary slug */
  subSlug: string;
  scopeLabel: string;
  scopeBreadcrumb: string;
  draftEnabled: boolean;
  adEnabled: boolean;
  couponEnabled: boolean;
  defaultSort?: string;
  ko: boolean;
  /** Bump after save to re-fetch customer browse */
  reloadToken?: number;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      stores: BrowseStoreListItem[];
      insertionRows: StoresBrowseInsertionMetaRow[];
      scopeEnabled: boolean;
      serverTitle: string | null;
    };

export function AdminStoresCategoryBrowseLivePreview({
  primarySlug,
  subSlug,
  scopeLabel,
  scopeBreadcrumb,
  draftEnabled,
  adEnabled,
  couponEnabled,
  defaultSort,
  ko,
  reloadToken = 0,
}: AdminCategoryBrowsePreviewProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    const pk = primarySlug.trim().toLowerCase();
    if (!pk) {
      setState({ status: "idle" });
      return;
    }
    const sk = (subSlug.trim().toLowerCase() || "all") === "all" ? "all" : subSlug.trim().toLowerCase();
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      try {
        const qs = new URLSearchParams({ primary: pk, sub: sk, limit: "8", fresh: "1" });
        if (defaultSort) qs.set("sort", defaultSort);
        const res = await fetch(`/api/stores/browse?${qs.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          stores?: BrowseStoreListItem[];
          error?: string;
          meta?: {
            browseScopePolicy?: {
              enabled?: boolean;
              displayTitleKo?: string | null;
              displayTitleEn?: string | null;
            };
            browseInsertion?: { rows?: StoresBrowseInsertionMetaRow[] };
          };
        };
        if (cancelled) return;
        if (!json.ok || !Array.isArray(json.stores)) {
          setState({
            status: "error",
            message: json.error?.trim() || (ko ? "카테고리 목록을 불러오지 못했습니다." : "Failed to load category browse."),
          });
          return;
        }
        const pol = json.meta?.browseScopePolicy;
        const serverTitle =
          (ko ? pol?.displayTitleKo : pol?.displayTitleEn || pol?.displayTitleKo)?.trim() || null;
        setState({
          status: "ready",
          stores: json.stores,
          insertionRows: Array.isArray(json.meta?.browseInsertion?.rows)
            ? json.meta!.browseInsertion!.rows!
            : [],
          scopeEnabled: pol?.enabled !== false,
          serverTitle,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : ko ? "browse 오류" : "Browse error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [primarySlug, subSlug, ko, reloadToken, defaultSort]);

  const headerTitle = scopeLabel.trim() || (state.status === "ready" ? state.serverTitle : null) || primarySlug;
  const readyState = state.status === "ready" ? state : null;
  const effectiveEnabled = draftEnabled && (readyState == null || readyState.scopeEnabled);

  const insertionBanner =
    readyState && (adEnabled || couponEnabled)
      ? readyState.insertionRows.find(
          (r): r is Extract<StoresBrowseInsertionMetaRow, { kind: "paid_ad" | "coupon" }> =>
            adEnabled && couponEnabled
              ? r.kind === "paid_ad" || r.kind === "coupon"
              : adEnabled
                ? r.kind === "paid_ad"
                : r.kind === "coupon"
        ) ?? null
      : null;

  return (
    <div
      className="mx-auto w-[242px] overflow-hidden rounded-[28px] border-[6px] border-sam-fg/80 bg-white shadow-xl"
      data-admin-category-card-preview="true"
      data-preview-live="true"
      data-preview-primary={primarySlug}
      data-preview-sub={subSlug}
    >
      <div className="bg-sam-app px-3 pb-3 pt-2">
        <p className="mb-1 text-center text-[9px] font-bold uppercase tracking-wide text-emerald-700">
          {ko ? "실데이터 · 업종 스코프" : "Live · industry scope"}
        </p>
        <div className="mb-2 flex h-7 items-center rounded-full bg-white px-3 text-[10px] font-semibold text-sam-muted ring-1 ring-sam-border">
          dibay
        </div>
        <p className="mb-1 truncate text-[10px] font-semibold text-sam-muted" title={scopeBreadcrumb}>
          {scopeBreadcrumb}
        </p>
        <div className="mb-2 flex gap-1 overflow-x-auto">
          <span className="shrink-0 rounded-full bg-sam-fg px-2 py-1 text-[10px] font-bold text-white">
            {headerTitle}
          </span>
          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-sam-muted">
            {subSlug === "all"
              ? ko
                ? "1차 전체(혼합)"
                : "Primary mix"
              : ko
                ? "2차만"
                : "Secondary only"}
          </span>
        </div>

        {!draftEnabled ? (
          <p className="rounded-ui-rect bg-rose-50 px-2 py-6 text-center text-[11px] font-semibold text-rose-800">
            {ko
              ? "초안 OFF — 저장 시 고객 목록이 비워집니다."
              : "Draft OFF — customer list will be empty after save."}
          </p>
        ) : state.status === "loading" || state.status === "idle" ? (
          <p className="px-2 py-8 text-center text-[11px] text-sam-muted">{ko ? "실데이터 로딩…" : "Loading live…"}</p>
        ) : state.status === "error" ? (
          <p className="px-2 py-6 text-center text-[11px] text-rose-700">{state.message}</p>
        ) : !readyState || !effectiveEnabled ? (
          <p className="rounded-ui-rect bg-rose-50 px-2 py-6 text-center text-[11px] font-semibold text-rose-800">
            {ko ? "저장 정책 OFF — 고객 목록 비움" : "Saved policy OFF — customer list empty"}
          </p>
        ) : (
          <>
            {insertionBanner ? (
              <div
                className={`mb-2 rounded-ui-rect px-2 py-2 text-[11px] font-bold ${
                  insertionBanner.kind === "paid_ad"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-purple-100 text-purple-800"
                }`}
              >
                {insertionBanner.kind === "paid_ad"
                  ? ko
                    ? "스폰서드"
                    : "Sponsored"
                  : ko
                    ? "쿠폰 혜택"
                    : "Coupon"}
                <span className="ml-1 font-medium opacity-80">{insertionBanner.title}</span>
              </div>
            ) : null}
            {readyState.stores.length === 0 ? (
              <p className="rounded-ui-rect border border-dashed border-sam-border bg-white px-2 py-6 text-center text-[11px] text-sam-muted">
                {ko
                  ? "이 1·2차 스코프에 매장이 없습니다. (다른 업종 매장은 섞이지 않습니다)"
                  : "No stores in this primary/secondary scope. (Other industries are not mixed in.)"}
              </p>
            ) : (
              readyState.stores.map((store) => (
                <div key={store.id} className="mb-2">
                  <StoreBrowseCategoryRowCard
                    data={browseItemToRowCard(store)}
                    locale={ko ? "ko" : "en"}
                    couponBadgeTitle={couponEnabled ? (ko ? "쿠폰" : "Coupon") : null}
                  />
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
