import { REGIONS } from "@/lib/products/form-options";

function regionRowFromStored(regionRaw: string) {
  const r = regionRaw.trim();
  if (!r) return null;
  return REGIONS.find((x) => x.id === r) ?? REGIONS.find((x) => x.name === r) ?? null;
}

function cityRowFromStored(regionRow: (typeof REGIONS)[number], cityRaw: string) {
  const c = cityRaw.trim();
  if (!c) return null;
  return (
    regionRow.cities.find((x) => x.id === c) ?? regionRow.cities.find((x) => x.name === c) ?? null
  );
}

/**
 * DB `stores.region` / `stores.city` — **ID(`manila`·`m1`) 또는 과거 저장분 표시명** 모두 해석.
 */
export function resolveStoreRegionCityLabels(parts: {
  city?: string | null;
  region?: string | null;
}): { regionLabel: string | null; neighborhoodLabel: string | null } {
  const rRaw = typeof parts.region === "string" ? parts.region.trim() : "";
  const cRaw = typeof parts.city === "string" ? parts.city.trim() : "";
  if (!rRaw && !cRaw) return { regionLabel: null, neighborhoodLabel: null };

  const regionRow = regionRowFromStored(rRaw);
  if (!regionRow) {
    return { regionLabel: rRaw || null, neighborhoodLabel: cRaw || null };
  }
  const cityRow = cRaw ? cityRowFromStored(regionRow, cRaw) : null;
  return {
    regionLabel: regionRow.name,
    neighborhoodLabel: cityRow?.name ?? (cRaw || null),
  };
}

/**
 * 매장 **지역·동네** 한 줄 — 카탈로그에 있는 쌍일 때만 (목록·필터와 동일한 엄격도).
 * 저장은 ID 기준(`LocationSelector`); 구데이터는 표시명도 허용.
 */
export function formatStoreLocationLine(parts: {
  district?: string | null;
  city?: string | null;
  region?: string | null;
}): string | null {
  const rRaw = typeof parts.region === "string" ? parts.region.trim() : "";
  const cRaw = typeof parts.city === "string" ? parts.city.trim() : "";
  if (!rRaw || !cRaw) return null;
  const regionRow = regionRowFromStored(rRaw);
  if (!regionRow) return null;
  const cityRow = cityRowFromStored(regionRow, cRaw);
  if (!cityRow) return null;
  return `${regionRow.name} · ${cityRow.name}`;
}

function cleanAddressText(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** 비교용 정규화 — 표기는 건드리지 않고, 중복 판별에만 사용한다. */
function normAddrDedupKey(s: string): string {
  return cleanAddressText(s)
    .toLowerCase()
    .replace(/[.,，·]/g, " ")
    .replace(/\bstr\.?\b/g, " street ")
    .replace(/\bst\.?\b/g, " street ")
    .replace(/\bstreet\b/g, " street ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStreetLike(s: string): boolean {
  const t = cleanAddressText(s);
  if (!t) return false;
  return (
    /\b(st\.?|street|ave\.?|avenue|rd\.?|road|blvd|drive|dr\.?|lane|ln\.?)\b/i.test(t) ||
    /^\d+\s+\S+/.test(t)
  );
}

function isShortDetailLike(s: string, locationKeys: Set<string>): boolean {
  const t = cleanAddressText(s);
  const k = normAddrDedupKey(t);
  if (!t || !k || locationKeys.has(k)) return false;
  if (isStreetLike(t) || /[,，]/.test(t)) return false;
  if (/^\d{1,6}[a-zA-Z]?$/.test(t)) return true;
  return t.length <= 18 && /^[a-zA-Z0-9가-힣\s#./-]+$/.test(t);
}

function splitAddressFragments(raw: string | null | undefined): string[] {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return [];
  const rows = t
    .replace(/\r\n?/g, "\n")
    .split(/[\n|;／]+/)
    .map((x) => cleanAddressText(x))
    .filter(Boolean);

  const out: string[] = [];
  for (const row of rows) {
    const commaParts = row
      .split(/[,，]+/)
      .map((x) => cleanAddressText(x))
      .filter(Boolean);
    const last = commaParts[commaParts.length - 1] ?? "";
    if (commaParts.length >= 3 || (commaParts.length >= 2 && /^\d{1,6}[a-zA-Z]?$/.test(last))) {
      out.push(...commaParts);
      continue;
    }
    out.push(row);
  }

  return out.flatMap((x) =>
    x
      .split(/\s+(?=\d+\s+\S+\s+(?:st\.?|street|ave\.?|avenue|rd\.?|road)\b)/i)
      .map((p) => cleanAddressText(p))
      .filter(Boolean)
  );
}

function removeDetailToken(segment: string, detail: string): string {
  const s = cleanAddressText(segment);
  const d = cleanAddressText(detail);
  if (!s || !d) return s;
  if (normAddrDedupKey(s) === normAddrDedupKey(d)) return "";
  const escaped = d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleanAddressText(s.replace(new RegExp(String.raw`(^|[\s,，])${escaped}(?=$|[\s,，])`, "gi"), " "));
}

function keyContains(a: string, b: string): boolean {
  const ka = normAddrDedupKey(a);
  const kb = normAddrDedupKey(b);
  return !!ka && !!kb && (ka === kb || ka.includes(kb) || kb.includes(ka));
}

function displayAddressScore(s: string): number {
  let score = cleanAddressText(s).length;
  if (/\bstreet\b/i.test(s)) score += 20;
  if (/\bst\.?\b/i.test(s)) score -= 5;
  return score;
}

/**
 * 주소 조각에서 동일·포함 관계인 조각은 한 번만 남긴다.
 * 예: `718 Paterno St` + `718 Paterno Street` 는 긴 표기만 유지.
 */
export function dedupeAddressSegmentList(segments: string[]): string[] {
  const out: string[] = [];
  for (const raw of segments) {
    const seg = cleanAddressText(raw);
    if (!seg) continue;
    const existingIdx = out.findIndex((x) => keyContains(x, seg));
    if (existingIdx < 0) {
      out.push(seg);
      continue;
    }
    if (displayAddressScore(seg) > displayAddressScore(out[existingIdx]!)) {
      out[existingIdx] = seg;
    }
  }
  return out;
}

function locationKeySet(parts: {
  region?: string | null;
  city?: string | null;
  district?: string | null;
}): Set<string> {
  return new Set(
    [parts.region, parts.city, parts.district]
      .flatMap((x) => splitAddressFragments(x))
      .map((x) => normAddrDedupKey(x))
      .filter(Boolean)
  );
}

export type StoreAddressDisplayParts = {
  /** 유닛·층·호 (앞, 굵게) */
  detail: string;
  /** 구글 가로·건물·번지 */
  streetBody: string;
  /** 카탈로그 지역 · 동네 */
  locationLine: string | null;
};

function buildStoreAddressDisplay(parts: {
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
}): { detail: string; body: string; full: string } {
  const locKeys = locationKeySet(parts);
  const line1 = splitAddressFragments(parts.address_line1);
  const line2 = splitAddressFragments(parts.address_line2);
  const district = splitAddressFragments(parts.district);
  const all = [...line1, ...line2, ...district];

  const detail =
    [...line2].reverse().find((x) => isShortDetailLike(x, locKeys)) ??
    (line2.length === 1 && isShortDetailLike(line2[0]!, locKeys) ? line2[0]! : "");

  const bodyCandidates = all
    .map((x) => (detail ? removeDetailToken(x, detail) : cleanAddressText(x)))
    .filter((x) => x && (!detail || normAddrDedupKey(x) !== normAddrDedupKey(detail)))
    .filter((x) => !isShortDetailLike(x, locKeys) || isStreetLike(x));
  const body = dedupeAddressSegmentList(bodyCandidates).join(" ").replace(/\s+/g, " ").trim();
  const full = [detail, body].filter(Boolean).join(", ");
  return { detail, body, full };
}

/**
 * 필리핀 표시 주소 — 모든 저장 필드를 다시 분해해 `상세, 가로/동네` 한 줄로 만든다.
 * `address_line2` 가 전체 주소를 품은 오저장도 이 경로에서 새로 조립한다.
 */
export function formatPhDetailThenStreetFromParts(parts: {
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
}): string {
  return buildStoreAddressDisplay(parts).full;
}

/** 복사용·픽업 상세 — `formatPhDetailThenStreetFromParts` 별칭 */
export function formatStoreDetailAddressLine(parts: {
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
}): string {
  return formatPhDetailThenStreetFromParts(parts);
}

/** 매장 정보 화면의 가로 주소 한 줄. */
export function formatStoreAddressStreetDisplay(parts: {
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
}): string {
  return buildStoreAddressDisplay(parts).body;
}

export function formatStoreAddressDetailOnly(address_line2?: string | null): string {
  const fragments = splitAddressFragments(address_line2);
  return [...fragments].reverse().find((x) => isShortDetailLike(x, new Set())) ?? "";
}

/** DB `address_line2` — 동·호·랜드마크 등 신청·주소록과 동일한 세부 표시 */
export function formatStoreAddressDetailForDisplay(address_line2?: string | null): string {
  const raw = typeof address_line2 === "string" ? address_line2.trim() : "";
  if (!raw) return "";
  const short = formatStoreAddressDetailOnly(address_line2);
  const full = raw
    .replace(/\r\n?/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  if (full && short && full.length > short.length && full.toLowerCase().includes(short.toLowerCase())) {
    return full;
  }
  return short || full;
}

function locationCatalogLineRedundantWithDetail(loc: string, detailJoined: string): boolean {
  const nd = normAddrDedupKey(detailJoined);
  if (!nd) return false;
  return loc
    .split("·")
    .map((x) => normAddrDedupKey(x))
    .filter(Boolean)
    .every((p) => nd.includes(p));
}

/** 필리핀 표시 — 주소록·매장 신청과 동일: `세부, 가로` (지역·동네는 `locationLine` 분리). */
export function resolveStoreAddressDisplayParts(parts: {
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
}): StoreAddressDisplayParts {
  return {
    detail: formatStoreAddressDetailForDisplay(parts.address_line2),
    streetBody: formatStoreAddressStreetDisplay(parts),
    locationLine: formatStoreLocationLine(parts),
  };
}

/** 픽업·매장 안내용 — 상세이 있으면 앞에, 없으면 가로/지역만 한 줄. */
export function formatStorePickupAddressLines(parts: {
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
}): string[] {
  const loc = formatStoreLocationLine(parts);
  const detail = buildStoreAddressDisplay(parts).full;
  if (!loc) return detail ? [detail] : [];
  if (!detail) return [loc];
  if (locationCatalogLineRedundantWithDetail(loc, detail)) return [detail];
  return [`${detail}, ${loc}`];
}
