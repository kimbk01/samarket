/**
 * Trade National LGU — types (PSGC City/Municipality).
 * Separate from local Area taxonomy (`regions-data.ts`).
 */

/** 한국 시/군/구(`KR:` + 5자리, 한국 주소 지원 2단계 2026-11-10) — 필리핀 PSGC 와 같은 표(trade_national_lgu)에 둔다 */
export type TradeNationalLguType = "city" | "municipality" | "kr_sigungu";

export type TradeNationalLgu = {
  canonicalId: string;
  lguType: TradeNationalLguType;
  displayName: string;
  regionCode: string;
  regionName: string;
  provinceCode: string | null;
  provinceName: string | null;
  isActive: boolean;
  datasetVersion: string;
  supersededBy: string | null;
};

export type TradeNationalLguAliasKind =
  | "legacy_product"
  | "provider_display"
  | "display_name"
  | "old_name";

export type TradeNationalLguAlias = {
  alias: string;
  aliasRaw: string;
  canonicalId: string;
  kind: TradeNationalLguAliasKind;
};

export type TradeLocalAreaLguMapRow = {
  regionId: string;
  cityId: string;
  legacyLguAlias: string;
  canonicalId: string;
};

export type NationalLguCandidate = {
  canonicalId: string;
  displayName: string;
  regionName: string;
  provinceName: string | null;
  lguType: TradeNationalLguType;
};

export type NationalLguResolution =
  | { status: "resolved"; canonicalId: string; lgu: TradeNationalLgu }
  | { status: "ambiguous"; candidates: NationalLguCandidate[] }
  | { status: "unresolved" };
