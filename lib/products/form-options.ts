/**
 * 4단계: 상품 등록 폼 옵션 (mock 카테고리/지역/컨디션)
 */

import { REGIONS } from "./regions-data";

export { REGIONS };

import type { MessageKey } from "@/lib/i18n/messages";
import type { ProductCondition } from "@/lib/types/product-form";

export const PRODUCT_CONDITION_OPTIONS: {
  value: ProductCondition;
  labelKey: MessageKey;
}[] = [
  { value: "new", labelKey: "product_condition_new" },
  { value: "like_new", labelKey: "product_condition_like_new" },
  { value: "good", labelKey: "product_condition_good" },
  { value: "fair", labelKey: "product_condition_fair" },
];

/** @deprecated use `PRODUCT_CONDITION_OPTIONS` + `t(labelKey)` */
export const CONDITIONS = PRODUCT_CONDITION_OPTIONS;

export function getLocationLabel(regionId: string, cityId: string): string {
  const region = REGIONS.find((r) => r.id === regionId);
  if (!region) return regionId || "";
  const city = region.cities.find((c) => c.id === cityId);
  return city ? `${region.name} · ${city.name}` : region.name;
}

/** 등록된 region·city ID 쌍일 때만 라벨 반환 (ZIP 자동선택과 동일한 문구) */
export function getLocationLabelIfValid(regionId: string, cityId: string): string | null {
  const region = REGIONS.find((r) => r.id === regionId);
  const city = region?.cities.find((c) => c.id === cityId);
  if (!region || !city) return null;
  return `${region.name} · ${city.name}`;
}

/**
 * `getLocationLabelIfValid`와 동일한 한 줄 라벨(예: "Metro Manila · Makati")을 파싱해 ID 반환.
 * 관리자·장바구니 등 저장 문자열 복원용.
 */
export function parseLocationLabelToIds(labelLine: string): { regionId: string; cityId: string } | null {
  const line = labelLine.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (!line) return null;
  const idx = line.indexOf("·");
  if (idx < 0) return null;
  const rName = line.slice(0, idx).trim();
  const cName = line.slice(idx + 1).trim();
  if (!rName || !cName) return null;
  for (const r of REGIONS) {
    if (r.name.trim() !== rName) continue;
    for (const c of r.cities) {
      if (c.name.trim() === cName) return { regionId: r.id, cityId: c.id };
    }
  }
  return null;
}
