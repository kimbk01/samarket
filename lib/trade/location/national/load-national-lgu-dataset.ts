/**
 * Load vendored PSGC Trade National LGU projection (server/test only).
 * Do not import this module from client bundles.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  TradeLocalAreaLguMapRow,
  TradeNationalLgu,
  TradeNationalLguAlias,
  TradeNationalLguAliasKind,
  TradeNationalLguType,
} from "@/lib/trade/location/national/types";
import { normalizeTradeNationalLguName } from "@/lib/trade/location/national/normalize-lgu-name";

const DATA_DIR = join(process.cwd(), "data/trade-national-lgu");

type ProjectionFile = {
  dataset_version: string;
  lgu: Array<{
    canonical_id: string;
    lgu_type: TradeNationalLguType;
    display_name: string;
    region_code: string;
    region_name: string;
    province_code: string | null;
    province_name: string | null;
    is_active: boolean;
    dataset_version: string;
    superseded_by: string | null;
  }>;
};

type AliasFile = {
  dataset_version: string;
  aliases: Array<{
    alias: string;
    alias_raw: string;
    canonical_id: string;
    kind: TradeNationalLguAliasKind;
  }>;
};

type LocalMapFile = {
  dataset_version: string;
  rows: Array<{
    region_id: string;
    city_id: string;
    legacy_lgu_alias: string;
    canonical_id: string;
  }>;
};

let cached: {
  datasetVersion: string;
  lgus: TradeNationalLgu[];
  byId: Map<string, TradeNationalLgu>;
  aliases: TradeNationalLguAlias[];
  aliasIndex: Map<string, TradeNationalLguAlias[]>;
  localAreaMap: TradeLocalAreaLguMapRow[];
} | null = null;

function mapLgu(row: ProjectionFile["lgu"][number]): TradeNationalLgu {
  return {
    canonicalId: row.canonical_id,
    lguType: row.lgu_type,
    displayName: row.display_name,
    regionCode: row.region_code,
    regionName: row.region_name,
    provinceCode: row.province_code,
    provinceName: row.province_name,
    isActive: row.is_active,
    datasetVersion: row.dataset_version,
    supersededBy: row.superseded_by,
  };
}

export function loadTradeNationalLguDataset() {
  if (cached) return cached;

  const projection = JSON.parse(
    readFileSync(join(DATA_DIR, "lgu-projection.json"), "utf8")
  ) as ProjectionFile;
  const aliasFile = JSON.parse(
    readFileSync(join(DATA_DIR, "legacy-alias-map.json"), "utf8")
  ) as AliasFile;
  const localFile = JSON.parse(
    readFileSync(join(DATA_DIR, "local-area-map.json"), "utf8")
  ) as LocalMapFile;

  const lgus = projection.lgu.filter((r) => r.is_active).map(mapLgu);
  const byId = new Map(lgus.map((l) => [l.canonicalId, l]));
  const aliases: TradeNationalLguAlias[] = aliasFile.aliases.map((a) => ({
    alias: a.alias,
    aliasRaw: a.alias_raw,
    canonicalId: a.canonical_id,
    kind: a.kind,
  }));
  const aliasIndex = new Map<string, TradeNationalLguAlias[]>();
  for (const a of aliases) {
    const list = aliasIndex.get(a.alias) ?? [];
    list.push(a);
    aliasIndex.set(a.alias, list);
  }
  const localAreaMap: TradeLocalAreaLguMapRow[] = localFile.rows.map((r) => ({
    regionId: r.region_id,
    cityId: r.city_id,
    legacyLguAlias: r.legacy_lgu_alias,
    canonicalId: r.canonical_id,
  }));

  cached = {
    datasetVersion: projection.dataset_version,
    lgus,
    byId,
    aliases,
    aliasIndex,
    localAreaMap,
  };
  return cached;
}

export function getTradeNationalLguById(
  canonicalId: string | null | undefined
): TradeNationalLgu | null {
  const id = (canonicalId ?? "").trim();
  if (!id) return null;
  return loadTradeNationalLguDataset().byId.get(id) ?? null;
}

export function listTradeNationalLgus(): TradeNationalLgu[] {
  return loadTradeNationalLguDataset().lgus.slice();
}

export function resolveLegacyTradeLguAliasToCanonical(
  legacyAlias: string | null | undefined
): TradeNationalLgu | null {
  const a = normalizeTradeNationalLguName(legacyAlias);
  if (!a) return null;
  const hits = (loadTradeNationalLguDataset().aliasIndex.get(a) ?? []).filter(
    (x) => x.kind === "legacy_product"
  );
  if (hits.length !== 1) return null;
  return getTradeNationalLguById(hits[0]!.canonicalId);
}

export function resolveLocalAreaToTradeNationalLgu(
  regionId: string | null | undefined,
  cityId: string | null | undefined
): TradeNationalLgu | null {
  const rid = (regionId ?? "").trim();
  const cid = (cityId ?? "").trim();
  if (!rid || !cid) return null;
  const row = loadTradeNationalLguDataset().localAreaMap.find(
    (r) => r.regionId === rid && r.cityId === cid
  );
  if (!row) return null;
  return getTradeNationalLguById(row.canonicalId);
}
