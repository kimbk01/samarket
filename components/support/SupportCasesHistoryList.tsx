"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyListPager } from "@/components/mypage/ds/MyListPager";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { SupportGenericHubInquireGate } from "@/components/support/SupportGenericHubInquireGate";
import { deliverSupportOpen } from "@/lib/support/deliver-support-open";
import type { SupportCaseRow } from "@/lib/support/support-case-types";
import { useSupportCategoryLabels } from "@/lib/support/use-support-category-settings";
import { supportCaseStatusLabelMeta } from "@/lib/support/support-status-label";
import { subscribeSupportModalState, getSupportModalState } from "@/lib/support/support-modal-controller";
import { supportErrorLabel } from "@/lib/support/support-display-labels";
import { isSupportTicketAnsweredStatus } from "@/lib/support/support-ticket-form";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { MYPAGE_LIST_PAGE_DEFAULT } from "@/lib/mypage/mypage-list-cursor";
import {
  fetchMypageListJson,
  forgetMypageListCache,
  useMypageCursorList,
  type MypageCursorPage,
} from "@/lib/mypage/use-mypage-cursor-list";
import { Sam } from "@/lib/ui/sam-component-classes";

/** 내 문의 목록 캐시 키 접두 (S63) */
export const SUPPORT_HISTORY_CACHE_PREFIX = "me:support:cases:";

/**
 * `GET /api/support/cases` 고객 「내 문의」 요청 주소 — 첫 페이지 20건.
 * 접수형 문의(Owner 2026-11-10): 종료된 문의는 목록에서 사라진다 → 진행 중만.
 */
export function supportHistoryActiveUrl(cursor: string | null): string {
  const qs = new URLSearchParams({ audience: "MEMBER", status: "active", limit: String(MYPAGE_LIST_PAGE_DEFAULT) });
  if (cursor) qs.set("cursor", cursor);
  return `/api/support/cases?${qs.toString()}`;
}

/** DEF-16: re-read after the Support sheet closes so status reflects the visit. */
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

/**
 * 행 60px — 1줄: 「분야 · 세부」(말줄임) + 오른쪽 상태 / 2줄: 접수 번호 · 시각.
 * 숫자 뱃지는 고객센터 FAB 아이콘에만(Owner 2026-11-10) — 목록 안에는 숫자를 그리지 않는다.
 */
function SupportCaseHistoryRow({ c }: { c: SupportCaseRow }) {
  const { safeT } = useI18n();
  // DEF-08: labels from SSOT (status label module + category registry), never raw enums.
  const statusMeta = supportCaseStatusLabelMeta(c.status);
  const statusLabel = safeT(statusMeta.key);
  // 분야·세부 이름 = 어드민 「문의 유형 관리」 이름 우선, 없으면 코드 기본 이름
  const labels = useSupportCategoryLabels();
  const categoryLabel = labels.categoryLabel(c.audience, c.category);
  const issueLabel = labels.issueLabel(c.audience, c.category, c.issue_type);
  const answered = isSupportTicketAnsweredStatus(c.status);
  return (
    <li>
      <button
        type="button"
        className="grid h-[60px] w-full grid-cols-[minmax(0,1fr)_auto] grid-rows-[22px_18px] content-center gap-x-2 px-4 text-left transition active:bg-sam-surface-muted"
        data-support-history-row={c.id}
        onClick={() => {
          deliverSupportOpen({ caseId: c.id, source: "history" });
        }}
      >
        <span className="truncate text-[14px] font-semibold text-sam-fg">
          {/* Never `subject` — it is an internal "CATEGORY · surface" token (B5). */}
          {[categoryLabel, issueLabel].filter(Boolean).join(" · ")}
        </span>
        <span
          className={`row-span-2 self-center rounded-ui-rect px-2 py-0.5 text-[11px] font-bold ${
            answered ? "bg-sam-primary-soft text-sam-primary" : "bg-sam-warning-soft text-sam-fg"
          }`}
          data-support-history-answered={answered ? "1" : "0"}
        >
          {statusLabel}
        </span>
        <span className="col-start-1 truncate text-[12px] text-sam-muted">
          {[c.public_case_no, c.created_at ? formatMypageDate(c.created_at, { style: "datetime" }) : ""]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
    </li>
  );
}

/**
 * 내 문의 목록 — **사장님 고객센터와 공유**(`OwnerCustomerCenterView`).
 * 회원 = 커서 더 보기, 사장님 = 그 매장 문의. 둘 다 진행 중 문의만(서버가 종료 문의를 돌려주지 않음).
 */
export function SupportCasesHistoryList({
  audience,
  storeId,
}: {
  audience: "MEMBER" | "OWNER";
  storeId?: string | null;
}) {
  if (audience === "MEMBER") return <MemberSupportCasesList />;
  return <SupportCasesFlatList audience={audience} storeId={storeId} />;
}

function ListHint() {
  const { safeT } = useI18n();
  return <p className="px-1 text-[12px] text-sam-muted">{safeT("support_ticket_list_hint")}</p>;
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
    return <p className="px-4 py-6 text-sm text-sam-muted">{safeT("common_loading")}</p>;
  }
  if (error) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-sam-danger">{supportErrorLabel(safeT, error)}</p>
        <button type="button" className="mt-2 text-sm underline" onClick={() => void load()}>
          {safeT("common_retry")}
        </button>
      </div>
    );
  }
  if (cases.length === 0) {
    return <p className="px-4 py-6 text-sm text-sam-muted">{safeT("support_history_empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-sam-border" data-support-cases-history="1">
        {cases.map((c) => (
          <SupportCaseHistoryRow key={c.id} c={c} />
        ))}
      </ul>
      <ListHint />
    </div>
  );
}

type CasesPageJson = {
  ok?: boolean;
  cases?: SupportCaseRow[];
  nextCursor?: string | null;
};

/** 고객 「내 문의」 — 진행 중 문의 + 커서 더 보기 (상태 탭 없음: 종료 문의는 사라진다) */
function MemberSupportCasesList() {
  const { safeT } = useI18n();

  const fetchPage = useCallback(async (cursor: string | null): Promise<MypageCursorPage<SupportCaseRow>> => {
    const json = await fetchMypageListJson<CasesPageJson>(supportHistoryActiveUrl(cursor));
    if (!json.ok) throw new Error("support_cases_not_ok");
    return {
      items: Array.isArray(json.cases) ? json.cases : [],
      next_cursor: typeof json.nextCursor === "string" && json.nextCursor ? json.nextCursor : null,
    };
  }, []);

  const list = useMypageCursorList<SupportCaseRow>({
    cacheKey: `${SUPPORT_HISTORY_CACHE_PREFIX}active`,
    fetchPage,
    getId: (c) => c.id,
  });

  const { reload } = list;
  const reloadOnClose = useCallback(() => {
    // 확인했어요(종료)·추가 문의로 상태가 바뀌었을 수 있다 — 첫 페이지부터 다시
    forgetMypageListCache(SUPPORT_HISTORY_CACHE_PREFIX);
    void reload();
  }, [reload]);
  useOnSupportModalClosed(reloadOnClose);

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
    body = (
      <MyStateView
        kind="empty"
        template="list"
        empty={{
          title: safeT("support_history_empty"),
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
    <div className="flex flex-col gap-3" data-support-history-list="active">
      {body}
      <ListHint />
    </div>
  );
}
