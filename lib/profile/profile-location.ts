/**
 * profiles.region_code / region_name ↔ 앱 `REGIONS` (LocationSelector) 동기화·표시.
 * - 신규: region_code = `regionId|cityId`
 * - 구형: region_code = regionId만, region_name = "지역 · 동네" (parseLocationLabelToIds)
 */

import {
  REGIONS,
  getLocationLabelIfValid,
  parseLocationLabelToIds,
} from "@/lib/products/form-options";

function isValidRegionCity(regionId: string, cityId: string): boolean {
  const r = REGIONS.find((x) => x.id === regionId);
  return !!r?.cities.some((c) => c.id === cityId);
}

/** 편집 폼 초기값 — regionId·cityId (빈 문자 허용) */
export function decodeProfileAppLocationPair(
  region_code: string | null | undefined,
  region_name: string | null | undefined
): { regionId: string; cityId: string } {
  const rc = (region_code ?? "").trim();
  const rn = (region_name ?? "").trim();

  if (rc.includes("|")) {
    const [a, b] = rc.split("|", 2).map((s) => s.trim());
    if (a && b && isValidRegionCity(a, b)) return { regionId: a, cityId: b };
  }

  const fromLabel = parseLocationLabelToIds(rn);
  if (fromLabel && isValidRegionCity(fromLabel.regionId, fromLabel.cityId)) {
    return { regionId: fromLabel.regionId, cityId: fromLabel.cityId };
  }

  // 구형: user-address 동기화 등에서 region_code 에 regionId 만 있던 경우
  if (rc && !rc.includes("|")) {
    const r = REGIONS.find((x) => x.id === rc);
    if (r) {
      if (fromLabel && fromLabel.regionId === rc && isValidRegionCity(fromLabel.regionId, fromLabel.cityId)) {
        return { regionId: fromLabel.regionId, cityId: fromLabel.cityId };
      }
      return { regionId: rc, cityId: "" };
    }
  }

  return { regionId: "", cityId: "" };
}

/** DB 저장용 region_code */
export function encodeProfileAppLocationStorage(regionId: string, cityId: string): string | null {
  const r = regionId.trim();
  const c = cityId.trim();
  if (!r && !c) return null;
  if (r && c) return `${r}|${c}`;
  return r || null;
}

/** DB 저장용 region_name — 목록·장바구니와 동일 한 줄 */
export function buildProfileRegionNameForStorage(regionId: string, cityId: string): string | null {
  const r = regionId.trim();
  const c = cityId.trim();
  if (!r) return null;
  if (c && isValidRegionCity(r, c)) {
    return getLocationLabelIfValid(r, c);
  }
  const region = REGIONS.find((x) => x.id === r);
  return region?.name ?? null;
}

/** 카드·목록 표시 — 구 데이터도 최대한 동일 문구로 */
export function resolveProfileLocationDisplayLine(p: {
  region_code?: string | null;
  region_name?: string | null;
  full_address?: string | null;
}): string {
  const fa = (p.full_address ?? "").trim();
  if (fa) {
    const first = fa.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean)[0];
    return (first ?? fa).slice(0, 200);
  }
  const { regionId, cityId } = decodeProfileAppLocationPair(p.region_code, p.region_name);
  if (regionId && cityId && isValidRegionCity(regionId, cityId)) {
    const lbl = getLocationLabelIfValid(regionId, cityId);
    if (lbl) return lbl;
  }
  if (regionId && !cityId) {
    const region = REGIONS.find((x) => x.id === regionId);
    if (region) return region.name;
  }
  const rn = (p.region_name ?? "").trim();
  const rc = (p.region_code ?? "").trim();
  return rn || rc || "";
}

export function isProfileLocationComplete(p: {
  region_code?: string | null;
  region_name?: string | null;
  full_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  const fa = (p.full_address ?? "").trim();
  if (
    fa &&
    typeof p.latitude === "number" &&
    typeof p.longitude === "number" &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude)
  ) {
    return true;
  }
  const { regionId, cityId } = decodeProfileAppLocationPair(p.region_code, p.region_name);
  return Boolean(regionId && cityId && isValidRegionCity(regionId, cityId));
}

/** profiles region · address_* · 지도 주소 표시용 */
export type ProfileLocationAddressDisplayInput = {
  region_code?: string | null;
  region_name?: string | null;
  address_street_line?: string | null;
  address_detail?: string | null;
  full_address?: string | null;
};

/**
 * 동네 한 줄 + 지번·동호를 한 줄로 (truncate 카드·StatMini용).
 */
export function resolveProfileLocationAddressOneLine(p: ProfileLocationAddressDisplayInput): string {
  const base = resolveProfileLocationDisplayLine(p).trim();
  const street = (p.address_street_line ?? "").trim();
  const det = (p.address_detail ?? "").trim();
  const tail = [street, det].filter(Boolean).join(" · ");
  if (base && tail) return `${base} · ${tail}`;
  return base || tail;
}

/** 1~2행 — 첫 줄: 동네, 둘째 줄: 지번·동·호 */
export function resolveProfileLocationAddressLines(p: ProfileLocationAddressDisplayInput): string[] {
  const lines: string[] = [];
  const base = resolveProfileLocationDisplayLine(p).trim();
  if (base) lines.push(base);
  const street = (p.address_street_line ?? "").trim();
  const det = (p.address_detail ?? "").trim();
  const sub = [street, det].filter(Boolean).join(" · ");
  if (sub) lines.push(sub);
  return lines;
}
