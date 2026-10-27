/**
 * 거래 D (Owner 2026-10-28) — 거래 반경 선택지 SSOT.
 * - 값은 어드민 「지역 정책」(`AppSettings.tradeRadiusOptionsKm`, `admin_settings.app_settings_bundle_v1`)에서 정한다. 초깃값 10·20·40km.
 * - 「전체」(반경 없음)는 항상 함께 보인다(목록에는 넣지 않는다).
 * - 서버(`/api/philife/posts`)가 목록 응답에 `radiusOptionsKm` 를 실어 보내고, 📍 시트는 마지막으로 받은 값으로 그린다
 *   (화면과 서버가 같은 값을 쓴다). 받기 전에는 초깃값.
 * - 옛 주소(`radius=5`·`32`·`64`…)는 목록 값 중 가장 가까운 값으로 읽는다(열림 유지).
 * - 「주변」 64km(`TRADE_BROWSE_NEARBY_TIER_RADIUS_KM`, 목록 계약 §2)는 이 목록과 별개다.
 */
export const DEFAULT_TRADE_RADIUS_OPTIONS_KM: readonly number[] = [10, 20, 40];

const MIN_KM = 1;
const MAX_KM = 500;
const MAX_OPTIONS = 6;

/** 잘못된 값은 버리고 오름차순·중복 제거. 남는 것이 없으면 초깃값 */
export function normalizeTradeRadiusOptionsKm(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TRADE_RADIUS_OPTIONS_KM];
  const out = [
    ...new Set(
      raw
        .map((v) => (typeof v === "number" ? v : Number(String(v ?? "").trim())))
        .filter((n) => Number.isFinite(n))
        .map((n) => Math.round(n))
        .filter((n) => n >= MIN_KM && n <= MAX_KM)
    ),
  ]
    .sort((a, b) => a - b)
    .slice(0, MAX_OPTIONS);
  return out.length > 0 ? out : [...DEFAULT_TRADE_RADIUS_OPTIONS_KM];
}

/** 기본 반경 — 목록에 있는 값만, 아니면 null(「전체」) */
export function normalizeTradeDefaultRadiusKm(raw: unknown, options: readonly number[]): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  const km = Math.round(n);
  return options.includes(km) ? km : null;
}

/** 목록 값 중 가장 가까운 값(같은 거리면 작은 값) */
export function snapTradeRadiusKm(km: number, options: readonly number[]): number {
  const list = options.length > 0 ? options : DEFAULT_TRADE_RADIUS_OPTIONS_KM;
  let best = list[0]!;
  for (const o of list) {
    if (Math.abs(o - km) < Math.abs(best - km)) best = o;
  }
  return best;
}

let clientOptions: number[] = [...DEFAULT_TRADE_RADIUS_OPTIONS_KM];
const listeners = new Set<() => void>();

/** 목록 응답의 `radiusOptionsKm` 를 받으면 호출 — 값이 바뀔 때만 알린다 */
export function setTradeRadiusOptionsKmFromServer(raw: unknown): void {
  const next = normalizeTradeRadiusOptionsKm(raw);
  if (next.length === clientOptions.length && next.every((v, i) => v === clientOptions[i])) return;
  clientOptions = next;
  for (const l of listeners) l();
}

export function getTradeRadiusOptionsKm(): number[] {
  return clientOptions;
}

/** 구독 — React 훅은 클라이언트 전용 파일(`trade-radius-options-client.ts`)에 둔다(이 파일은 서버도 읽는다) */
export function subscribeTradeRadiusOptionsKm(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
