/**
 * 4단계: 상품 등록 폼 옵션 (mock 카테고리/지역/컨디션)
 */

import { REGIONS } from "./regions-data";

export { REGIONS };

export const CATEGORIES = [
  "디지털기기",
  "생활가전",
  "가구/인테리어",
  "유아동",
  "생활/주방",
  "여성잡화",
  "남성패션",
  "스포츠/레저",
  "게임/취미",
  "기타중고",
] as const;

export const CONDITIONS = [
  { value: "new" as const, label: "새 상품" },
  { value: "like_new" as const, label: "거의 새 것" },
  { value: "good" as const, label: "좋음" },
  { value: "fair" as const, label: "보통" },
];

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
