"use client";

/**
 * 탭 선택을 주소(`?tab=`)에서 읽는다 — `AdminTabs` 를 비제어형(주소 동기화)으로 쓸 때 패널 선택용.
 * 탭을 바꾸면 `adminSyncTabResetParams()` 로 이전 탭의 목록 조건(page·size·status·q·기간·정렬·추가 키)을 지운다
 * — 다른 탭 목록에 조건이 새어 들어가지 않게.
 * `useSearchParams` 를 쓰므로 페이지에서 `<Suspense>` 안에 렌더한다.
 */

import { useSearchParams } from "next/navigation";
import { resolveAdminTabValue } from "@/components/admin/ui/AdminTabs";
import { ADMIN_LIST_QUERY_RESERVED_KEYS } from "@/lib/admin/list-query/admin-list-query";

export function useAdminUrlTab<T extends string>(tabIds: readonly T[] | readonly { id: T }[], defaultValue?: T): T {
  const sp = useSearchParams();
  const items = (tabIds as readonly (T | { id: T })[]).map((x) => ({ id: typeof x === "string" ? x : x.id, label: "" }));
  return resolveAdminTabValue(sp?.get("tab"), items, defaultValue) as T;
}

/** 탭 전환 시 지울 목록 조건 키 — 공통 키 + 화면별 추가 키. */
export function adminSyncTabResetParams(extras: readonly string[] = []): string[] {
  return [...ADMIN_LIST_QUERY_RESERVED_KEYS, ...extras];
}
