"use client";

/**
 * Admin 목록 조회 조건을 주소(쿼리 문자열)에 보존하는 훅 (설계 v4 §7 「필터 바」).
 *
 * 규칙:
 * - 상태·정렬·페이지 크기·도메인 추가 키 → 즉시 적용 (1쪽으로).
 * - 검색어·기간(q/from/to) → `draft` 에만 담고 「조회」/Enter(`submit`) 때 적용 (1쪽으로).
 * - `reset()` → 기본값으로 되돌리고 즉시 적용 (`tab` 등 관리하지 않는 키는 유지).
 * - `refresh()` → 같은 조건으로 다시 불러오기. 데이터 effect 는 `refreshKey` 에 의존시킨다.
 * - 주소 변경은 `router.replace(…, { scroll: false })` (뒤로가기 기록을 늘리지 않음).
 *
 * `useSearchParams` 를 쓰므로 페이지에서 `<Suspense>` 안에 렌더해야 한다 (Next App Router 규칙).
 * `config` 는 렌더마다 새 객체여도 되지만 내용은 고정해야 한다 (JSON 직렬화 값으로 비교).
 * 순수 파싱·직렬화: `admin-list-query.ts`.
 */

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  adminListQueryHref,
  adminListQueryToApiParams,
  applyAdminListQueryPatch,
  defaultAdminListQuery,
  parseAdminListQuery,
  type AdminListPageSize,
  type AdminListQueryConfig,
  type AdminListQueryPatch,
  type AdminListQueryState,
} from "@/lib/admin/list-query/admin-list-query";

export type AdminListQueryDraft = { q: string; from: string; to: string };

export type UseAdminListQueryResult<E extends string = string> = {
  /** 주소에 적용된 조건 (데이터 조회 기준). */
  query: AdminListQueryState<E>;
  /** 아직 적용 전인 검색어·기간 입력값. */
  draft: AdminListQueryDraft;
  setDraft: (patch: Partial<AdminListQueryDraft>) => void;
  /** 「조회」/Enter — draft 적용 + 1쪽. */
  submit: () => void;
  setStatus: (status: string) => void;
  setSort: (sort: string) => void;
  setSize: (size: AdminListPageSize) => void;
  setPage: (page: number) => void;
  setExtra: (key: E, value: string) => void;
  /** 「초기화」 — 기본값 + 즉시 적용. */
  reset: () => void;
  /** 같은 조건으로 다시 불러오기. */
  refresh: () => void;
  /** 조건 또는 refresh 가 바뀔 때마다 달라지는 키 — 조회 effect 의존값. */
  refreshKey: string;
  /** 서버 API 용 `limit`/`offset`/필터 쿼리 문자열. */
  apiQueryString: string;
  /** 상태·검색어·기간·정렬·추가 키 중 기본값과 다른 것이 있는지 (쪽·크기는 제외). */
  isFiltered: boolean;
};

function draftOf(state: { q: string; from: string; to: string }): AdminListQueryDraft {
  return { q: state.q, from: state.from, to: state.to };
}

export function useAdminListQuery<E extends string = string>(
  config: AdminListQueryConfig<E> = {}
): UseAdminListQueryResult<E> {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  const configKey = JSON.stringify(config);
  const stableConfig = useMemo<AdminListQueryConfig<E>>(
    () => JSON.parse(configKey) as AdminListQueryConfig<E>,
    [configKey]
  );

  const query = useMemo(
    () => parseAdminListQuery<E>(new URLSearchParams(search), stableConfig),
    [search, stableConfig]
  );

  // 주소의 q/from/to 가 바뀌면(뒤로가기·초기화 등) draft 를 다시 맞춘다 — 렌더 중 동기화 패턴.
  const appliedDraftKey = `${query.q}\u0000${query.from}\u0000${query.to}`;
  const [draftState, setDraftState] = useState<{ key: string; draft: AdminListQueryDraft }>(() => ({
    key: appliedDraftKey,
    draft: draftOf(query),
  }));
  let draft = draftState.draft;
  if (draftState.key !== appliedDraftKey) {
    draft = draftOf(query);
    setDraftState({ key: appliedDraftKey, draft });
  }

  const [nonce, setNonce] = useState(0);

  const commit = useCallback(
    (next: AdminListQueryState<E>) => {
      const href = adminListQueryHref(pathname, search, next, stableConfig);
      const current = search ? `${pathname}?${search}` : pathname;
      if (href === current) {
        // 같은 주소 — router 는 다시 그리지 않으므로 강제로 다시 불러온다.
        setNonce((n) => n + 1);
        return;
      }
      router.replace(href, { scroll: false });
    },
    [pathname, router, search, stableConfig]
  );

  const patch = useCallback(
    (p: AdminListQueryPatch<E>) => commit(applyAdminListQueryPatch(query, p)),
    [commit, query]
  );

  const setDraft = useCallback(
    (p: Partial<AdminListQueryDraft>) =>
      setDraftState((prev) => ({ key: prev.key, draft: { ...prev.draft, ...p } })),
    []
  );

  const submit = useCallback(() => patch({ q: draft.q, from: draft.from, to: draft.to }), [draft, patch]);
  const setStatus = useCallback((status: string) => patch({ status }), [patch]);
  const setSort = useCallback((sort: string) => patch({ sort }), [patch]);
  const setSize = useCallback((size: AdminListPageSize) => patch({ size }), [patch]);
  const setPage = useCallback((page: number) => patch({ page }), [patch]);
  const setExtra = useCallback(
    (key: E, value: string) => patch({ extras: { [key]: value } as Partial<Record<E, string>> }),
    [patch]
  );
  const reset = useCallback(() => {
    const def = defaultAdminListQuery(stableConfig);
    setDraftState({ key: `${def.q}\u0000${def.from}\u0000${def.to}`, draft: draftOf(def) });
    commit(def);
  }, [commit, stableConfig]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const apiQueryString = useMemo(
    () => adminListQueryToApiParams(query, stableConfig).toString(),
    [query, stableConfig]
  );
  const isFiltered = useMemo(() => {
    const def = defaultAdminListQuery(stableConfig);
    const pick = (s: AdminListQueryState<E>) =>
      JSON.stringify([s.status, s.q, s.from, s.to, s.sort, s.extras]);
    return pick(def) !== pick(query);
  }, [query, stableConfig]);

  return {
    query,
    draft,
    setDraft,
    submit,
    setStatus,
    setSort,
    setSize,
    setPage,
    setExtra,
    reset,
    refresh,
    refreshKey: `${apiQueryString}#${nonce}`,
    apiQueryString,
    isFiltered,
  };
}
