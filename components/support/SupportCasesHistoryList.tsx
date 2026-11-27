"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyListPager } from "@/components/mypage/ds/MyListPager";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { SupportCaseRowButton } from "@/components/support/SupportCaseRow";
import { SupportGenericHubInquireGate } from "@/components/support/SupportGenericHubInquireGate";
import { deliverSupportOpen } from "@/lib/support/deliver-support-open";
import type { SupportCaseRow } from "@/lib/support/support-case-types";
import { subscribeSupportModalState, getSupportModalState } from "@/lib/support/support-modal-controller";
import { supportErrorLabel } from "@/lib/support/support-display-labels";
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

export type SupportHistoryScope = { audience: "MEMBER" | "OWNER"; storeId?: string | null };

/**
 * `GET /api/support/cases` 고객 「내 문의」 요청 주소 — 한 페이지 20건 · 커서 더 보기.
 * 접수형 문의(Owner 2026-11-10): 진행 중 문의만(종료 문의는 답변을 확인하면 사라진다).
 * 최종 감사 U-5: 회원·사장님(그 매장) 같은 주소 모양 — 사장님은 `audience=OWNER&storeId=`.
 */
export function supportHistoryActiveUrl(cursor: string | null, scope: SupportHistoryScope = { audience: "MEMBER" }): string {
  const qs = new URLSearchParams({ audience: scope.audience, status: "active", limit: String(MYPAGE_LIST_PAGE_DEFAULT) });
  if (scope.audience === "OWNER" && scope.storeId) qs.set("storeId", scope.storeId);
  if (cursor) qs.set("cursor", cursor);
  return `/api/support/cases?${qs.toString()}`;
}

/** 목록 캐시 키 — 회원 `…active` (예전 키 유지) · 사장님 `…owner:<storeId>` */
export function supportHistoryCacheKey(scope: SupportHistoryScope): string | null {
  if (scope.audience === "MEMBER") return `${SUPPORT_HISTORY_CACHE_PREFIX}active`;
  const storeId = String(scope.storeId ?? "").trim();
  return storeId ? `${SUPPORT_HISTORY_CACHE_PREFIX}owner:${storeId}` : null;
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
 * 내 문의 목록 — 회원 「내 문의」와 **사장님 고객센터**(`OwnerCustomerCenterView`)가 같은 구현 (최종 감사 U-5).
 * 로딩 = 스켈레톤 · 오류 = 같은 오류 화면(44px 다시 시도) · 빈 목록 · 더 보기 모두 같다.
 * 빈 목록만 다르다: 회원 = 안내 + 「문의하기」, 사장님 = 안내만(목록 위 「문의하기」 1개 — Owner 「아래 것 빼기」 2026-11-27).
 */
export function SupportCasesHistoryList({
  audience,
  storeId,
}: {
  audience: "MEMBER" | "OWNER";
  storeId?: string | null;
}) {
  const { safeT } = useI18n();
  const owner = audience === "OWNER";
  const ownerStoreId = owner ? String(storeId ?? "").trim() || null : null;
  const cacheKey = supportHistoryCacheKey({ audience, storeId: ownerStoreId });

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<MypageCursorPage<SupportCaseRow>> => {
      const json = await fetchMypageListJson<CasesPageJson>(
        supportHistoryActiveUrl(cursor, { audience, storeId: ownerStoreId })
      );
      if (!json.ok) throw new Error("support_cases_not_ok");
      return {
        items: Array.isArray(json.cases) ? json.cases : [],
        next_cursor: typeof json.nextCursor === "string" && json.nextCursor ? json.nextCursor : null,
      };
    },
    [audience, ownerStoreId]
  );

  const list = useMypageCursorList<SupportCaseRow>({
    cacheKey,
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

  const openCase = useCallback((caseId: string) => {
    deliverSupportOpen({ caseId, source: "history" });
  }, []);

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
    body = owner ? (
      <p className="px-4 py-6 text-center text-sm text-sam-muted" data-support-cases-history-empty="1">
        {safeT("support_history_empty")}
      </p>
    ) : (
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
            <li key={c.id}>
              <SupportCaseRowButton c={c} surface="page" onOpen={openCase} />
            </li>
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
    <div className="flex flex-col gap-3" data-support-history-list="active" data-support-history-audience={audience}>
      {body}
      <p className="px-1 text-[12px] text-sam-muted">{safeT("support_ticket_list_hint")}</p>
    </div>
  );
}

type CasesPageJson = {
  ok?: boolean;
  cases?: SupportCaseRow[];
  nextCursor?: string | null;
};
