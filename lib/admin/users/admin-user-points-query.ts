/**
 * 관리자 회원 상세 · 포인트 섹션 조회 주소 (C-2 · Owner 2026-11-03 「내역은 페이지 이동과 날짜가 명확해야」).
 * `/api/admin/users/[id]/points` 의 쪽 이동(offset) 파라미터를 한 곳에서 만든다. 클라이언트·서버 공용 순수 함수.
 *
 * - 쪽 상태는 섹션 내부 상태로 둔다 (회원 상세의 다른 섹션 — 거래·운영 패널 — 과 같은 규칙, 주소 키 없음).
 * - section 없음: 잔액·기간 합계·내역 1쪽·충전 신청 1쪽 (기간·필터가 바뀔 때)
 * - section=history: 내역 그 쪽만 · section=charges: 충전 신청 그 쪽만
 */
import { manilaDateKey } from "@/lib/admin/metrics/manila-period";
import type { StoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

/** 한 쪽 크기 — 회원 포인트 내역·충전 신청 쪽 크기(20)와 같다. */
export const ADMIN_USER_POINTS_PAGE_SIZE = 20;

export type AdminUserPointsPeriodQuery = { period: StoreCommissionPeriod; fromDay: string; toDay: string };

export type AdminUserPointsQueryInput = {
  section: "all" | "history" | "charges";
  filter: string;
  periodQ: AdminUserPointsPeriodQuery;
  /** 1부터 */
  historyPage?: number;
  /** 1부터 */
  chargePage?: number;
  size?: number;
};

const pageOf = (n: number | undefined) => Math.max(1, Math.trunc(Number(n ?? 1)) || 1);

/** 쪽 번호(1부터) → offset. */
export function adminUserPointsOffset(page: number | undefined, size: number = ADMIN_USER_POINTS_PAGE_SIZE): number {
  return (pageOf(page) - 1) * size;
}

export function buildAdminUserPointsQuery(input: AdminUserPointsQueryInput): URLSearchParams {
  const size = Math.max(1, Math.trunc(Number(input.size ?? ADMIN_USER_POINTS_PAGE_SIZE)) || ADMIN_USER_POINTS_PAGE_SIZE);
  const qs = new URLSearchParams();
  if (input.section !== "all") qs.set("section", input.section);
  qs.set("period", input.periodQ.period);
  if (input.periodQ.period === "custom") {
    if (input.periodQ.fromDay) qs.set("from", input.periodQ.fromDay);
    if (input.periodQ.toDay) qs.set("to", input.periodQ.toDay);
  }
  if (input.section !== "charges") {
    qs.set("filter", input.filter);
    qs.set("histOffset", String(adminUserPointsOffset(input.historyPage, size)));
    qs.set("histLimit", String(size));
  }
  if (input.section !== "history") {
    qs.set("chargeOffset", String(adminUserPointsOffset(input.chargePage, size)));
    qs.set("chargeLimit", String(size));
  }
  return qs;
}

/**
 * 기간 합계가 계산된 실제 날짜 (PHT, 포함 범위) — 「이번 달」 같은 프리셋도 날짜로 보여 준다.
 * 서버가 돌려준 UTC 경계 `[fromIso, toIso)` 기준. 둘 다 없으면 「전체 기간」.
 */
export function adminUserPointsPeriodRangeLabel(
  range: { fromIso: string | null; toIso: string | null } | null | undefined,
  ko: boolean
): string | null {
  if (!range) return null;
  const from = manilaDateKey(range.fromIso);
  const toMs = Date.parse(String(range.toIso ?? ""));
  const to = Number.isFinite(toMs) ? manilaDateKey(new Date(toMs - 1).toISOString()) : null;
  if (!from && !to) return tx(ko, "admin_users_all_time");
  return `${from ?? "…"} ~ ${to ?? "…"} (PHT)`;
}
