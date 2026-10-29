"use client";

/**
 * 관리자 홈 선반 미리보기 = 고객 앱 렌더 그대로 (Owner 2026-10-29 「미리보기 = 앱」).
 *
 * - 데이터: 관리자 페이지가 1회 받은 home-feed(이 관리자 계정·저장 주소 기준 — 앱과 같은 서버 판정)
 * - 배정: `composeLiveHomeFeed(stores, policyMeta, draftShelves)` — 고객 홈과 같은 함수, 저장 전 초안 반영
 * - 렌더: 고객 홈의 `StoresHomeCompositionSlotSection` 그대로 — 별도 카드·격자·혜택 경로 없음
 * - 비면: 배정 진단(`allocateHomeShelvesForAdmin`)의 실제 이유를 보여 준다
 */

import { useMemo } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresHomeCompositionSlotSection } from "@/components/stores/home/hub/StoresHomeCompositionSlotSection";
import {
  composeLiveHomeFeed,
  type StoresHomeCompositionPolicyMeta,
} from "@/lib/stores/composition/stores-composition-live";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import type { HomeShelfAdminAllocation } from "@/lib/stores/product/stores-home-shelf-draft-allocation";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";

const NO_HYDRATION = new Map<string, BrowseFeaturedCardItem[]>();
const noopRegister = () => {};
const donePhase = () => "done" as const;

export function AdminStoresHomeShelfLivePreview({
  shelfId,
  stores,
  policyMeta,
  draftShelves,
  allocation,
  feedStatus,
  onReload,
}: {
  shelfId: string;
  stores: readonly StoreHomeFeedItem[];
  policyMeta: StoresHomeCompositionPolicyMeta | null;
  /** 저장 전 초안 전체 (`applyHomeShelfDrafts`) */
  draftShelves: readonly StoresHomeShelfResolvedConfig[];
  allocation: HomeShelfAdminAllocation | undefined;
  feedStatus: "loading" | "ready" | "error";
  onReload: () => void;
}) {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const shelf = draftShelves.find((s) => s.shelfId === shelfId) ?? null;
  const composition = useMemo(
    () => composeLiveHomeFeed(stores, policyMeta, draftShelves),
    [draftShelves, policyMeta, stores]
  );

  const reason = allocation?.customerVisible
    ? null
    : allocation?.hiddenReason
      ? t(`admin_stores_home_hidden_${allocation.hiddenReason}`)
      : null;

  return (
    <div
      className="rounded-ui-rect border border-sam-border bg-white p-3 shadow-sm"
      data-admin-home-shelf-preview={shelfId}
      data-preview-live="true"
      data-preview-presentation={shelf?.presentation ?? ""}
      data-preview-slot={shelf?.composerSlot ?? ""}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-sam-success">
          {ko ? "고객 앱 화면 · 이 관리자 계정 주소 기준" : "Customer app view · this admin account's address"}
        </p>
        <AdminActionButton variant="ghost" size="sm" onClick={onReload}>
          {adminCta("refresh", ko)}
        </AdminActionButton>
      </div>
      {feedStatus === "loading" ? (
        <p className="px-2 py-6 text-center text-[12px] text-sam-muted">{ko ? "실데이터 로딩…" : "Loading live data…"}</p>
      ) : feedStatus === "error" ? (
        <p className="px-2 py-6 text-center text-[12px] text-sam-danger">
          {ko ? "홈 피드를 불러오지 못했습니다." : "Failed to load home feed."}
        </p>
      ) : !shelf?.composerSlot ? (
        <p className="rounded-ui-rect bg-sam-warning-soft px-3 py-6 text-center text-[12px] text-sam-warning">
          {ko ? "고객 홈에 연결된 선반이 아닙니다." : "Not wired to customer HOME."}
        </p>
      ) : allocation?.customerVisible ? (
        <div className="max-w-[420px]">
          <StoresHomeCompositionSlotSection
            slot={shelf.composerSlot}
            composition={composition}
            hydratedByStoreId={NO_HYDRATION}
            getPhase={donePhase}
            registerListItem={noopRegister}
            shelfProduct={draftShelves}
            feedStores={stores}
          />
        </div>
      ) : (
        <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-6 text-center text-[12px] text-sam-muted">
          {ko ? "고객 홈에 이 선반이 나오지 않습니다" : "This shelf is not shown on customer HOME"}
          {reason ? ` — ${reason}` : ""}
        </p>
      )}
    </div>
  );
}
