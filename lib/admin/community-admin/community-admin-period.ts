/**
 * 커뮤니티 Admin 조회 API 공통 — 기간(Asia/Manila 달력) · 페이지네이션 파서 (설계 §D-1).
 * 저장·질의는 UTC `[fromIso, toIso)`, 날짜 경계만 마닐라 자정. 클라이언트·서버 공용 (순수 함수).
 *
 * period: today | 7d | 30d | custom(from,to = YYYY-MM-DD, 마닐라 날짜, 둘 다 포함) | all(기간 없음)
 */
import { manilaDateKey, manilaTodayRangeUtc } from "@/lib/admin/metrics/manila-period";

export const COMMUNITY_ADMIN_PERIODS = ["today", "7d", "30d", "custom", "all"] as const;
export type CommunityAdminPeriod = (typeof COMMUNITY_ADMIN_PERIODS)[number];

/** 직접 지정 기간 최대 일수 (통계 RPC 와 같은 한도) */
export const COMMUNITY_ADMIN_MAX_RANGE_DAYS = 400;

export const COMMUNITY_ADMIN_PAGE_DEFAULT = 50;
export const COMMUNITY_ADMIN_PAGE_MAX = 100;

const DAY_MS = 86_400_000;
const MANILA_OFFSET_MS = 8 * 3_600_000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export type CommunityAdminPeriodRange = {
  period: CommunityAdminPeriod;
  /** UTC 포함 시작 (all = null) */
  fromIso: string | null;
  /** UTC 미포함 끝 (all = null) */
  toIso: string | null;
  /** 마닐라 날짜 (포함) — 화면 표시·CSV 용 */
  fromDate: string | null;
  toDate: string | null;
};

export type CommunityAdminPeriodParse =
  | ({ ok: true } & CommunityAdminPeriodRange)
  | { ok: false; error: "invalid_period" | "invalid_date" | "range_reversed" | "range_too_long" };

/** "YYYY-MM-DD"(마닐라) → 그날 마닐라 00:00 의 UTC ms. 형식·달력 오류는 null. */
export function manilaDayStartMs(ymd: string): number | null {
  const m = YMD.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return utc - MANILA_OFFSET_MS;
}

function rangeOf(period: CommunityAdminPeriod, fromMs: number, toMs: number): CommunityAdminPeriodRange {
  return {
    period,
    fromIso: new Date(fromMs).toISOString(),
    toIso: new Date(toMs).toISOString(),
    fromDate: manilaDateKey(new Date(fromMs).toISOString()),
    toDate: manilaDateKey(new Date(toMs - 1).toISOString()),
  };
}

/**
 * 기간 파서. `period` 가 비어 있으면 `defaultPeriod` (목록 = all, 통계 = 7d).
 * custom 에서 from/to 중 하나만 오면 그 하루로 본다.
 */
export function parseCommunityAdminPeriod(
  input: { period?: string | null; from?: string | null; to?: string | null },
  opts: { defaultPeriod?: CommunityAdminPeriod; now?: Date } = {}
): CommunityAdminPeriodParse {
  const now = opts.now ?? new Date();
  const raw = String(input.period ?? "").trim().toLowerCase();
  const hasCustomDates = Boolean(String(input.from ?? "").trim() || String(input.to ?? "").trim());
  const period = (raw || (hasCustomDates ? "custom" : opts.defaultPeriod ?? "all")) as CommunityAdminPeriod;
  if (!(COMMUNITY_ADMIN_PERIODS as readonly string[]).includes(period)) return { ok: false, error: "invalid_period" };

  if (period === "all") return { ok: true, period, fromIso: null, toIso: null, fromDate: null, toDate: null };

  const today = manilaTodayRangeUtc(now);
  const todayStart = Date.parse(today.fromIso);
  const todayEnd = Date.parse(today.toIso);
  if (period === "today") return { ok: true, ...rangeOf(period, todayStart, todayEnd) };
  if (period === "7d") return { ok: true, ...rangeOf(period, todayStart - 6 * DAY_MS, todayEnd) };
  if (period === "30d") return { ok: true, ...rangeOf(period, todayStart - 29 * DAY_MS, todayEnd) };

  const fromRaw = String(input.from ?? "").trim() || String(input.to ?? "").trim();
  const toRaw = String(input.to ?? "").trim() || fromRaw;
  if (!fromRaw) return { ok: false, error: "invalid_date" };
  const fromMs = manilaDayStartMs(fromRaw);
  const toStart = manilaDayStartMs(toRaw);
  if (fromMs == null || toStart == null) return { ok: false, error: "invalid_date" };
  if (toStart < fromMs) return { ok: false, error: "range_reversed" };
  const toMs = toStart + DAY_MS;
  if ((toMs - fromMs) / DAY_MS > COMMUNITY_ADMIN_MAX_RANGE_DAYS) return { ok: false, error: "range_too_long" };
  return { ok: true, ...rangeOf("custom", fromMs, toMs) };
}

/** URLSearchParams 편의 */
export function parseCommunityAdminPeriodFromSearch(
  sp: URLSearchParams,
  opts: { defaultPeriod?: CommunityAdminPeriod; now?: Date } = {}
): CommunityAdminPeriodParse {
  return parseCommunityAdminPeriod({ period: sp.get("period"), from: sp.get("from"), to: sp.get("to") }, opts);
}

/** limit ≤ 100, offset ≥ 0 */
export function parseCommunityAdminPage(sp: URLSearchParams): { limit: number; offset: number } {
  const l = Math.floor(Number(sp.get("limit")));
  const o = Math.floor(Number(sp.get("offset")));
  return {
    limit: Number.isFinite(l) && l > 0 ? Math.min(l, COMMUNITY_ADMIN_PAGE_MAX) : COMMUNITY_ADMIN_PAGE_DEFAULT,
    offset: Number.isFinite(o) && o > 0 ? o : 0,
  };
}

/** [fromIso, toIso) 안의 마닐라 날짜 키 목록 (일별 추이 빈 날 채움용) */
export function manilaDateKeysInRange(fromIso: string, toIso: string): string[] {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
  const out: string[] = [];
  for (let t = from; t < to && out.length <= COMMUNITY_ADMIN_MAX_RANGE_DAYS; t += DAY_MS) {
    const k = manilaDateKey(new Date(t).toISOString());
    if (k && out[out.length - 1] !== k) out.push(k);
  }
  return out;
}

/** UUID 형식만 통과 (필터 파라미터 주입 방지) */
export function communityAdminUuidOrNull(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}
