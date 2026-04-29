import { getLocationLabel, getLocationLabelIfValid } from "@/lib/products/form-options";

/**
 * PH 스타일 구역 줄(`joinAreaLine`) — 쉼표로 이어진 마지막 토큰을 **시·상위 행정**으로 본다.
 * 예: `Payatas, Quezon City` → `Quezon City`
 */
function cityTokenFromPhAreaLine(areaLine: string): string | null {
  const t = areaLine.trim();
  if (!t) return null;
  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1] ?? null;
}

/**
 * 거래 희망 장소 `display_line`(`buildPhFriendlyAddress` · newline 구분)을 목록용으로 축약:
 * **건물·상호(첫 줄)** + **시(마지막 줄에서 추출)** 만 `상호 · 시` 형태.
 * 도로만 있고 상호가 없는 2줄은 시만 표시한다.
 */
export function formatTradeMeetSpotLineForList(displayLine: string): string | null {
  const raw = displayLine.trim();
  if (!raw) return null;

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const lastLine = lines[lines.length - 1];
  const city = cityTokenFromPhAreaLine(lastLine);
  if (!city) return null;

  if (lines.length >= 3) {
    const establishment = lines[0];
    return establishment ? `${establishment} · ${city}` : city;
  }

  if (lines.length === 2) {
    const first = lines[0];
    const streetLike = /^\d/.test(first);
    if (streetLike) return city;
    return first ? `${first} · ${city}` : city;
  }

  return city;
}

/** 물품 글 `posts.region`·`posts.city`(앱 지역 ID) → 목록·상세와 동일 한 줄 라벨 */
export function formatPostListingLocationLine(
  region: string | null | undefined,
  city: string | null | undefined
): string | null {
  const r = (region ?? "").trim();
  const c = (city ?? "").trim();
  if (!r && !c) return null;
  if (r && c) {
    const v = getLocationLabelIfValid(r, c);
    if (v) return v;
    const loose = getLocationLabel(r, c).trim();
    if (loose) return loose;
  }
  if (r) {
    const one = getLocationLabel(r, c).trim();
    return one || r;
  }
  return null;
}

/**
 * 목록·상세 공통: 거래 희망 장소(`meta.trade_meet_spot.display_line`)가 있으면 우선,
 * 없으면 `formatPostListingLocationLine(region, city)`.
 */
export function resolveTradePostListingLocationLine(
  meta: Record<string, unknown> | null | undefined,
  region: string | null | undefined,
  city: string | null | undefined
): string | null {
  const raw =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>).trade_meet_spot
      : undefined;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const spot = raw as Record<string, unknown>;
    const line =
      (typeof spot.display_line === "string" && spot.display_line.trim()) ||
      (typeof spot.displayLine === "string" && spot.displayLine.trim()) ||
      "";
    if (line) {
      const short = formatTradeMeetSpotLineForList(line);
      return short ?? line;
    }
  }
  return formatPostListingLocationLine(region, city);
}
