"use client";

/**
 * Admin HOME shelf preview — H-11: 앱과 같은 조합(`buildAdminHomeShelfDraftPreview`)·같은 렌더
 * (`StoresHomeCompositionSlotSection`). 초안의 순서·기간·노출·이미지·혜택·부제·전체 보기를 모두 반영한다.
 */

import { useMemo, type ReactNode } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresHomeCompositionSlotSection } from "@/components/stores/home/hub/StoresHomeCompositionSlotSection";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  toTelemetryFreeHomeInsertions,
  type AdminHomeShelfDraftPreview,
} from "@/lib/stores/product/stores-home-shelf-admin-preview";

export type AdminHomeShelfPreviewFeed =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stores: StoreHomeFeedItem[]; homeInsertions?: StoresHomeInsertionMeta };

const noopRegister = () => {};
const donePhase = () => "done" as const;

export function AdminStoresHomeShelfLivePreview({
  shelfId,
  feed,
  preview,
  onReload,
}: {
  shelfId: string;
  feed: AdminHomeShelfPreviewFeed;
  preview: AdminHomeShelfDraftPreview | null;
  onReload: () => void;
}) {
  const { language } = useI18n();
  const ko = language === "ko";
  const shelf = preview?.shelves.find((s) => s.shelfId === shelfId) ?? null;

  /** 앱 상세 메뉴 하이드레이션 대신 home-feed 대표 메뉴(featuredItems)로 이미지 채움 — 같은 응답 데이터. */
  const hydratedByStoreId = useMemo(() => {
    const map = new Map<string, BrowseFeaturedCardItem[]>();
    if (feed.status !== "ready") return map;
    for (const store of feed.stores) {
      map.set(
        store.id,
        store.featuredItems.map((item) => ({
          productId: item.productId,
          name: item.name,
          price: item.price,
          imageUrl: item.imageUrl ?? null,
        }))
      );
    }
    return map;
  }, [feed]);

  /** telemetry-free — 노출 토큰 행 제거한 혜택 데이터만 (광고 집계 계약). */
  const previewBenefitInsertions = useMemo(
    () => (feed.status === "ready" ? toTelemetryFreeHomeInsertions(feed.homeInsertions) : undefined),
    [feed]
  );

  let body: ReactNode = null;
  if (!shelf) {
    body = null;
  } else if (!shelf.enabled) {
    body = (
      <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-6 text-center text-[12px] text-sam-muted">
        {ko ? "선반 OFF — 고객 HOME에 이 선반이 노출되지 않습니다." : "Shelf OFF — not shown on customer HOME."}
      </p>
    );
  } else if (!shelf.customerVisible) {
    body = (
      <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-6 text-center text-[12px] text-sam-muted">
        {ko ? "노출 기간 밖 — 지금 고객 HOME에 노출되지 않습니다." : "Outside schedule — not shown on customer HOME now."}
      </p>
    );
  } else if (feed.status === "loading") {
    body = <p className="px-2 py-6 text-center text-[12px] text-sam-muted">{ko ? "실데이터 로딩…" : "Loading live data…"}</p>;
  } else if (feed.status === "error") {
    body = <p className="px-2 py-6 text-center text-[12px] text-sam-danger">{feed.message}</p>;
  } else if (preview && shelf.composerSlot) {
    body = (
      <StoresHomeCompositionSlotSection
        slot={shelf.composerSlot}
        composition={preview.composition}
        hydratedByStoreId={hydratedByStoreId}
        getPhase={donePhase}
        registerListItem={noopRegister}
        shelfProduct={preview.shelves}
        homeInsertions={previewBenefitInsertions}
        feedStores={feed.stores}
      />
    );
  }

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
          {ko ? "실데이터 미리보기 · 고객 HOME 과 같은 화면" : "Live preview · same as customer HOME"}
        </p>
        <AdminActionButton variant="ghost" size="sm" onClick={onReload}>
          {adminCta("refresh", ko)}
        </AdminActionButton>
      </div>
      <p className="mb-2 text-[12px] text-sam-muted">
        {ko
          ? "관리자 본인 위치 기준 홈 피드 · 저장 전 초안 반영"
          : "Home feed for the admin's own location · unsaved draft applied"}
      </p>
      {body}
    </div>
  );
}
