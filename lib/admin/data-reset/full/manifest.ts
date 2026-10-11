/**
 * Full data reset manifest — the classification of every public table that the database plan
 * builder (public.data_reset_full_build_plan) consumes. Generated from
 * docs/data-reset/p1_classification_matrix.csv by scripts/data-reset-generate-manifest.py.
 * The builder refuses to plan when a public table is missing here (schema drift is fail-closed).
 */

import manifestJson from "./manifest.json";

export type FullResetTableClass = "DELETE" | "KEEP" | "LEGAL_HOLD" | "COND" | "UNRESOLVED" | "SPLIT";

export type FullResetManifest = {
  version: string;
  source: string;
  tables: Record<
    string,
    { class: FullResetTableClass; split?: string; holdAll?: boolean; wholesale?: boolean; followParents?: boolean }
  >;
  softRefs: Array<{ from: string; col: string; to: string[]; toCol?: string }>;
  pathColumns: Array<{ table: string; col: string; bucket: string }>;
  ownerInclude: string[];
  ownerExclude: string[];
};

export const FULL_RESET_MANIFEST = manifestJson as FullResetManifest;

export function fullResetManifestStats(m: FullResetManifest = FULL_RESET_MANIFEST) {
  const byClass: Record<string, number> = {};
  for (const t of Object.values(m.tables)) byClass[t.class] = (byClass[t.class] ?? 0) + 1;
  return { version: m.version, tables: Object.keys(m.tables).length, byClass };
}
