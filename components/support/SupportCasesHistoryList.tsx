"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyListPager } from "@/components/mypage/ds/MyListPager";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { SupportGenericHubInquireGate } from "@/components/support/SupportGenericHubInquireGate";
import { deliverSupportOpen } from "@/lib/support/deliver-support-open";
import type { SupportCaseRow } from "@/lib/support/support-case-types";
import { getSupportCategoryDefinition } from "@/lib/support/support-category-registry";
import {
  SUPPORT_CASE_HISTORY_TABS,
  supportCaseStatusLabelMeta,
  type SupportCaseHistoryTab,
} from "@/lib/support/support-status-label";
import { subscribeSupportModalState, getSupportModalState } from "@/lib/support/support-modal-controller";
import type { MessageKey } from "@/lib/i18n/messages";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { supportErrorLabel } from "@/lib/support/support-display-labels";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { MYPAGE_LIST_PAGE_DEFAULT } from "@/lib/mypage/mypage-list-cursor";
import {
  fetchMypageListJson,
  forgetMypageListCache,
  useMypageCursorList,
  type MypageCursorPage,
} from "@/lib/mypage/use-mypage-cursor-list";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";
import { Sam } from "@/lib/ui/sam-component-classes";

/** 상담 내역 탭 목록 캐시 키 접두 (S63) */
export const SUPPORT_HISTORY_CACHE_PREFIX = "me:support:cases:";

/** `GET /api/support/cases` 고객 상담 내역 탭 요청 주소 — 첫 페이지 20건 */
export function supportHistoryTabUrl(tab: SupportCaseHistoryTab, cursor: string | null): string {
  const qs = new URLSearchParams({ audience: "MEMBER", status: tab, limit: String(MYPAGE_LIST_PAGE_DEFAULT) });
  if (cursor) qs.set("cursor", cursor);
  return `/api/support/cases?${qs.toString()}`;
}

/** DEF-16: re-read after the Support sheet closes so status / unread reflect the visit. */
function useOnSupportModalClosed(onClosed: () => void): void {
  useEffect(() => {
    let wasOpen = getSupportModalState().phase === "open";
    return subscribeSupportModalState(() => {
      const isOpen = getSupportModalState().phase === "open";
      if (wasOpen && !isOpen) onClosed();
      wasOpen = isOpen;
    });
  }, [onClosed]);
}

function SupportCaseHistoryRow({ c }: { c: SupportCaseRow }) {
  const { safeT } = useI18n();
  // DEF-08: labels from SSOT (status label module + category registry), never raw enums.
  const statusMeta = supportCaseStatusLabelMeta(c.status);
  const statusLabel = safeT(statusMeta.key, {
    fallbackKo: statusMeta.fallbackKo,
    fallbackEn: statusMeta.fallbackEn,
  });
  const categoryDef = getSupportCategoryDefinition(c.category);
  const categoryLabel = safeT((categoryDef?.labelKey ?? "support_cat_other") as MessageKey, {
    fallbackKo: "문의",
    fallbackEn: "Inquiry",
  });
  const unread = Number(c.requester_unread_count) || 0;
  return (
    <li>
      <button
        type="button"
        className="flex w-full min-h-11 items-start gap-3 px-4 py-3 text-left transition active:bg-sam-surface-muted"
        onClick={() => {
          deliverSupportOpen({ caseId: c.id, source: "history" });
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-sam-fg">
            <span className="min-w-0 truncate">
              {/* Never `subject` — it is an internal "CATEGORY · surface" token (B5). */}
              {c.public_case_no || categoryLabel}
            </span>
            {unread > 0 ? (
              <span
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sam-primary px-1.5 text-[11px] font-semibold text-sam-surface"
                data-support-history-unread={unread}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </p>
          <p className={`${OverlayUi.caption} !mb-0 mt-0.5`}>
            {categoryLabel}
            {" · "}
            {statusLabel}
          </p>
          <p className={`${OverlayUi.caption} !mb-0`}>
            {c.last_message_at ? formatMypageDate(c.last_message_at, { style: "relative" }) : ""}
          </p>
        </div>
      </button>
    </li>
  );
}

/**
 * 상담 내역 목록 — **사장님 고객센터와 공유**(`OwnerCustomerCenterView`).
 * `withStatusTabs` 를 켠 고객(MEMBER) 화면만 상태 탭·커서 더 보기(최종 설계 S63). 기본(OWNER) 렌더·요청은 불변.
 */
export function SupportCasesHistoryList({
  audience,
  storeId,
  withStatusTabs = false,
}: {
  audience: "MEMBER" | "OWNER";
  storeId?: string | null;
  /** 고객 상담 내역 화면 — `?tab=active|done` 상태 탭 + 커서 더 보기 (MEMBER 전용) */
  withStatusTabs?: boolean;
}) {
  if (withStatusTabs && audience === "MEMBER") return <MemberSupportCasesTabbedList />;
  return <SupportCasesFlatList audience={audience} storeId={storeId} />;
}

function SupportCasesFlatList({ audience, storeId }: { audience: "MEMBER" | "OWNER"; storeId?: string | null }) {
  const { safeT } = useI18n();
  const [cases, setCases] = useState<SupportCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ audience });
      if (audience === "OWNER" && storeId) qs.set("storeId", storeId);
      const res = await fetch(`/api/support/cases?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        cases?: SupportCaseRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "load_failed");
        setCases([]);
        return;
      }
      setCases(json.cases ?? []);
    } catch {
      setError("network_error");
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [audience, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadOnClose = useCallback(() => void load(), [load]);
  useOnSupportModalClosed(reloadOnClose);

  if (loading) {
    return (
      <p className="px-4 py-6 text-sm text-sam-muted">
        {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
      </p>
    );
  }
  if (error) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-sam-danger">{supportErrorLabel(safeT, error)}</p>
        <button type="button" className="mt-2 text-sm underline" onClick={() => void load()}>
          {safeT("common_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
        </button>
      </div>
    );
  }
  if (cases.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-sam-muted">
        {safeT("support_history_empty", {
          fallbackKo: "상담 내역이 없습니다.",
          fallbackEn: "No support conversations yet.",
        })}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-sam-border" data-support-cases-history="1">
      {cases.map((c) => (
        <SupportCaseHistoryRow key={c.id} c={c} />
      ))}
    </ul>
  );
}

type CasesPageJson = {
  ok?: boolean;
  cases?: SupportCaseRow[];
  nextCursor?: string | null;
  counts?: { active?: number };
};

/** 고객 상담 내역 — 상태 탭 [진행중 n · 완료] + 커서 더 보기 (S63) */
function MemberSupportCasesTabbedList() {
  const { t, safeT } = useI18n();
  const [tab, setTab] = useMypageTabParam<SupportCaseHistoryTab>({
    values: SUPPORT_CASE_HISTORY_TABS,
    defaultValue: "active",
  });
  const [activeCount, setActiveCount] = useState<number | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<MypageCursorPage<SupportCaseRow>> => {
      const json = await fetchMypageListJson<CasesPageJson>(supportHistoryTabUrl(tab, cursor));
      if (!json.ok) throw new Error("support_cases_not_ok");
      if (!cursor && typeof json.counts?.active === "number") setActiveCount(json.counts.active);
      return {
        items: Array.isArray(json.cases) ? json.cases : [],
        next_cursor: typeof json.nextCursor === "string" && json.nextCursor ? json.nextCursor : null,
      };
    },
    [tab]
  );

  const list = useMypageCursorList<SupportCaseRow>({
    cacheKey: `${SUPPORT_HISTORY_CACHE_PREFIX}${tab}`,
    fetchPage,
    getId: (c) => c.id,
  });
  useMypageListRestore({ ready: list.status === "ready", loadedPages: list.pages });

  const { reload } = list;
  const reloadOnClose = useCallback(() => {
    // 상담 상태가 탭을 옮겼을 수 있다 — 다른 탭 캐시도 비우고 현재 탭 첫 페이지만 다시
    forgetMypageListCache(SUPPORT_HISTORY_CACHE_PREFIX);
    void reload();
  }, [reload]);
  useOnSupportModalClosed(reloadOnClose);

  const tabLabel = (v: SupportCaseHistoryTab) =>
    v === "active"
      ? activeCount != null && activeCount > 0
        ? `${t("mypage_s63_tab_active")} ${activeCount > 99 ? "99+" : activeCount}`
        : t("mypage_s63_tab_active")
      : t("mypage_s63_tab_done");

  let body: ReactNode;
  if (list.status === "loading") {
    body = <MyStateView kind="loading" template="list" rows={5} />;
  } else if (list.status === "error") {
    body = (
      <MyStateView
        kind="error"
        template="list"
        error={{ message: supportErrorLabel(safeT, "load_failed"), onRetry: () => void list.reload() }}
      />
    );
  } else if (list.items.length === 0) {
    body =
      tab === "active" ? (
        <MyStateView
          kind="empty"
          template="list"
          empty={{
            title: t("mypage_s63_empty_active"),
            cta: (
              <SupportGenericHubInquireGate
                audience="MEMBER"
                sourceSurface="mypage_customer_center"
                className="w-full max-w-[240px]"
                buttonClassName={`${Sam.btn.primaryCombo} w-full min-h-11`}
                inquireDataAttr="data-support-hub-inquire"
              />
            ),
          }}
        />
      ) : (
        <MyStateView kind="empty" template="list" empty={{ title: t("mypage_s63_empty_done") }} />
      );
  } else {
    body = (
      <>
        <ul
          className="divide-y divide-sam-border-soft overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface"
          data-support-cases-history="1"
        >
          {list.items.map((c) => (
            <SupportCaseHistoryRow key={c.id} c={c} />
          ))}
        </ul>
        <MyListPager
          hasMore={list.nextCursor != null}
          loading={list.loadingMore}
          error={list.loadMoreError}
          onLoadMore={list.loadMore}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-support-history-tabs={tab}>
      <div className={Sam.tabs.bar} role="tablist" aria-label={t("support_history_title")}>
        {SUPPORT_CASE_HISTORY_TABS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={tab === v}
            data-testid={`support-history-tab-${v}`}
            onClick={() => setTab(v)}
            className={`${tab === v ? Sam.tabs.tabActive : Sam.tabs.tab} ${Sam.focusRing} flex-1`}
          >
            {tabLabel(v)}
          </button>
        ))}
      </div>
      {body}
    </div>
  );
}
