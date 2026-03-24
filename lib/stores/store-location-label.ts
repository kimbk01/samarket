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

/** 복사용: 상세 주소( district / address_line* 중복 제거 ) */
export function formatStoreDetailAddressLine(parts: {
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
}): string {
  const a1 = typeof parts.address_line1 === "string" ? parts.address_line1.trim() : "";
  const a2 = typeof parts.address_line2 === "string" ? parts.address_line2.trim() : "";
  const d = typeof parts.district === "string" ? parts.district.trim() : "";
  const chunks: string[] = [];
  if (d && d !== a1) chunks.push(d);
  if (a1) chunks.push(a1);
  if (a2) chunks.push(a2);
  if (chunks.length === 0 && d) chunks.push(d);
  return chunks.join(", ");
}
