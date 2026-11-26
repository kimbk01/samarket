/**
 * 홈 정보 띠(환율·날씨) 순수 함수 — 슈퍼앱 개편 설계 §3① (Owner 「제안대로 승인」 2026-11-26).
 * 라우트(`/api/exchange-rates`·`/api/weather`)와 화면(`HomeInfoStrip`)이 함께 쓴다.
 */
import type { MessageKey } from "@/lib/i18n/message-key";

/** 좌표가 없을 때(비로그인·대표 주소 좌표 없음) — 마닐라 */
export const WEATHER_DEFAULT_COORD = { lat: 14.6, lng: 120.98 } as const;

/** 좌표 → 소수 둘째 자리 (범위 밖·숫자 아님 = null) — 외부로 보내는 좌표는 이 값만 (D2) */
export function roundWeatherCoord(raw: string | number | null | undefined, limit: number): number | null {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return Math.round(n * 100) / 100;
}

/** Frankfurter 시계열 응답 `rates` → 날짜순 [날짜, 값] */
export function pickKrwSeries(rates: unknown): { date: string; krw: number }[] {
  if (!rates || typeof rates !== "object") return [];
  return Object.entries(rates as Record<string, { KRW?: unknown } | null>)
    .filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && typeof v?.KRW === "number" && v.KRW > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({ date, krw: v!.KRW as number }));
}

/** Frankfurter 시계열 응답 `rates` → 마지막 두 영업일 */
export function pickLatestTwoKrw(rates: unknown): { date: string; krw: number; prevKrw: number | null } | null {
  const rows = pickKrwSeries(rates).map((r) => [r.date, { KRW: r.krw }] as const);
  const last = rows[rows.length - 1];
  if (!last) return null;
  const prev = rows[rows.length - 2];
  return { date: last[0], krw: last[1]!.KRW as number, prevKrw: prev ? (prev[1]!.KRW as number) : null };
}

/** 전일 대비 % (소수 둘째 자리) — 전일 값 없으면 null */
export function krwChangePercent(krw: number, prevKrw: number | null | undefined): number | null {
  if (!prevKrw || prevKrw <= 0 || !Number.isFinite(krw)) return null;
  return Math.round(((krw - prevKrw) / prevKrw) * 10000) / 100;
}

/** 환율 계산 — 소수점 이하 반올림 (₱→₩ 원 단위, ₩→₱ 센타보 2자리) */
export function convertPhpKrw(amount: number, krwPerPhp: number, dir: "php_to_krw" | "krw_to_php"): number {
  if (!Number.isFinite(amount) || !Number.isFinite(krwPerPhp) || krwPerPhp <= 0) return 0;
  return dir === "php_to_krw" ? Math.round(amount * krwPerPhp) : Math.round((amount / krwPerPhp) * 100) / 100;
}

/** WMO 날씨 코드 → 아이콘·문구 키 */
export type HomeWeatherKind = "clear" | "cloudy" | "fog" | "rain" | "storm";
export function weatherKindFromWmo(code: number): HomeWeatherKind {
  if (code <= 1) return "clear";
  if (code <= 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm";
  return "rain";
}
export const HOME_WEATHER_LABEL_KEYS: Readonly<Record<HomeWeatherKind, MessageKey>> = {
  clear: "home_info_weather_clear",
  cloudy: "home_info_weather_cloudy",
  fog: "home_info_weather_fog",
  rain: "home_info_weather_rain",
  storm: "home_info_weather_storm",
};

/** 태블릿 환율 꺾은선 — 값 배열 → SVG 선·채움 경로 (폭 w, 높이 h, 위아래 여백 pad) */
export function rateSparklinePaths(
  values: number[],
  w: number,
  h: number,
  pad = 3
): { line: string; area: string; last: { x: number; y: number } } | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: Math.round(((i / (values.length - 1)) * (w - pad * 2) + pad) * 10) / 10,
    y: Math.round((h - pad - ((v - min) / span) * (h - pad * 2)) * 10) / 10,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return { line, area: `${line} L${last.x} ${h} L${first.x} ${h} Z`, last };
}
