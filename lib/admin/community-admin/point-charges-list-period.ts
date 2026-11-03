/**
 * 충전 신청 목록(커뮤니티·거래 공용 화면) 기간 → `/api/admin/point-charges` 의 `from`/`to` (PHT 날짜, C-3 · H-10).
 * 서버(`parseAdminRequestPeriod`)는 날짜(`from`/`to`)만 읽으므로, 옛 프리셋 딥링크(`?period=7d`)도 날짜로 바꿔 보낸다 —
 * 필터 바에 「최근 7일」이 보이는데 목록·합계는 전체 기간으로 나오는 일이 없게. 클라이언트·서버 공용 순수 함수.
 */
import {
  communityAdminListPeriodParams,
  parseCommunityAdminPeriod,
} from "@/lib/admin/community-admin/community-admin-period";

export function pointChargesListPeriodDates(
  input: { legacyPeriod?: string | null; from?: string | null; to?: string | null },
  now: Date = new Date()
): { from: string | null; to: string | null } {
  const p = communityAdminListPeriodParams({ period: input.legacyPeriod, from: input.from, to: input.to }, now);
  if (p.period === "custom") return { from: p.from ?? null, to: p.to ?? null };
  if (p.period === "all") return { from: null, to: null };
  const r = parseCommunityAdminPeriod({ period: p.period }, { now });
  return r.ok ? { from: r.fromDate, to: r.toDate } : { from: null, to: null };
}
