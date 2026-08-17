/**
 * Composition FILTER → Marketplace SEARCH/CATEGORY query extras.
 * Authority: Field Library surfaces.filter + resolved composition (active fields only).
 *
 * DO NOT: invent range/weak widgets; client-filter page-1 rows; new search endpoints.
 * P2 location/q/price/sort stay in `lib/trade/marketplace/query-contract.ts`.
 * CUT B sell-intent defaults: `lib/trade/marketplace/sell-intent-list-ssot.ts`.
 */
import {
  applySellIntentListDefaults,
  planSellIntentListClause,
} from "@/lib/trade/marketplace/sell-intent-list-ssot";
import { getTradeFieldDefinition } from "./field-library";
import { getTradeOptionCatalog } from "./option-catalogs";
import { compositionFieldsForSurface } from "./resolve-composition";
import { metaKeysForCompositionFieldId } from "./filter-persist-meta-by-composition";
import type { ResolvedTradeComposition, ResolvedTradeCompositionField } from "./types";

export type CompositionFilterSelection = Record<string, string>;

export type CompositionFilterClause = {
  fieldId: string;
  op: "eq" | "ilike" | "exclude_eq" | "or_eq";
  columns: string[];
  values: string[];
};

const FILTER_PARAM_RE = /^filters\[([a-z][a-z0-9_]*)\]$/i;
const TOKEN_MAX = 64;

/** P2 already owns these; do not re-expose as composition attribute filters. */
const SHELL_SKIP = new Set([
  "images",
  "title",
  "description",
  "price",
  "location",
  "is_free_share",
  "is_price_offer",
  "trade_meet_spot",
]);

function escapeIlikeNeedle(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function isCompositionAttributeFilterField(
  field: ResolvedTradeCompositionField
): boolean {
  if (SHELL_SKIP.has(field.id)) return false;
  const surf = field.definition.surfaces.filter;
  if (surf === false || surf == null) return false;
  if (surf === "range" || surf === "weak") return false;
  if (field.definition.widget !== "select") return false;
  if (!field.definition.optionCatalogId) return false;
  return true;
}

export function resolveCompositionAttributeFilterFields(
  composition: ResolvedTradeComposition
): ResolvedTradeCompositionField[] {
  return compositionFieldsForSurface(composition, "filter").filter(isCompositionAttributeFilterField);
}

export function parseCompositionFilterSearchParams(
  searchParams: URLSearchParams
): CompositionFilterSelection {
  const out: CompositionFilterSelection = {};
  for (const [key, raw] of searchParams.entries()) {
    const m = FILTER_PARAM_RE.exec(key);
    if (!m) continue;
    const fieldId = m[1];
    if (!fieldId || !getTradeFieldDefinition(fieldId)) continue;
    const value = raw.trim().slice(0, TOKEN_MAX);
    if (!value) continue;
    out[fieldId] = value;
  }
  return out;
}

export function appendCompositionFilterSearchParams(
  params: URLSearchParams,
  selection: CompositionFilterSelection | null | undefined
): void {
  for (const key of [...params.keys()]) {
    if (FILTER_PARAM_RE.test(key)) params.delete(key);
  }
  if (!selection) return;
  const ids = Object.keys(selection).sort();
  for (const id of ids) {
    const value = selection[id]?.trim();
    if (!value) continue;
    params.set(`filters[${id}]`, value.slice(0, TOKEN_MAX));
  }
}

export function compositionFilterCacheSegment(selection: CompositionFilterSelection | null | undefined): string {
  if (!selection) return "cf:";
  const parts = Object.keys(selection)
    .sort()
    .map((id) => `${id}=${selection[id] ?? ""}`);
  return `cf:${parts.join("&")}`;
}

export function sanitizeCompositionFilterSelection(
  raw: CompositionFilterSelection,
  composition: ResolvedTradeComposition
): CompositionFilterSelection {
  const allowed = resolveCompositionAttributeFilterFields(composition);
  const out: CompositionFilterSelection = {};
  for (const field of allowed) {
    const value = raw[field.id]?.trim();
    if (!value) continue;
    const catalogId = field.definition.optionCatalogId;
    if (!catalogId) continue;
    const hit = getTradeOptionCatalog(catalogId).some((entry) => entry.value === value);
    if (!hit) continue;
    out[field.id] = value;
  }
  return out;
}

/** URL-absent sell-intent fields default to sell/hire so LIST UI and server match. */
export function withSellIntentListDefaults(
  selection: CompositionFilterSelection,
  composition: ResolvedTradeComposition | null | undefined
): CompositionFilterSelection {
  if (!composition) return { ...selection };
  const allowed = resolveCompositionAttributeFilterFields(composition).map((field) => field.id);
  return applySellIntentListDefaults(selection, allowed);
}

export function buildCompositionFilterClauses(
  selection: CompositionFilterSelection,
  composition: ResolvedTradeComposition
): CompositionFilterClause[] {
  const sanitized = sanitizeCompositionFilterSelection(selection, composition);
  const fields = resolveCompositionAttributeFilterFields(composition);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const clauses: CompositionFilterClause[] = [];
  for (const [fieldId, value] of Object.entries(sanitized)) {
    const field = byId.get(fieldId);
    if (!field) continue;
    const catalogId = field.definition.optionCatalogId;
    if (!catalogId) continue;
    const entry = getTradeOptionCatalog(catalogId).find((row) => row.value === value);
    if (!entry) continue;
    const sellIntent = planSellIntentListClause(fieldId, entry.value);
    if (sellIntent) {
      clauses.push({
        fieldId,
        op: sellIntent.op,
        columns: sellIntent.columns,
        values: sellIntent.values,
      });
      continue;
    }
    const storage = field.definition.storage;
    if (storage.kind === "combined_meta") {
      const needles = [...new Set([entry.value, entry.labelKo, entry.labelEn].map((s) => s.trim()).filter(Boolean))];
      clauses.push({
        fieldId,
        op: "ilike",
        columns: [`meta->>${storage.writeKey}`],
        values: needles,
      });
      continue;
    }
    const keys = metaKeysForCompositionFieldId(fieldId);
    if (keys.length === 0) continue;
    clauses.push({
      fieldId,
      op: "eq",
      columns: keys.map((key) => `meta->>${key}`),
      values: [entry.value],
    });
  }
  return clauses;
}

type PostgrestFilterQ = {
  eq: (column: string, value: string) => PostgrestFilterQ;
  ilike: (column: string, pattern: string) => PostgrestFilterQ;
  or: (filters: string) => PostgrestFilterQ;
};

export function applyCompositionFilterClausesToPostgrest<T extends PostgrestFilterQ>(
  query: T,
  clauses: CompositionFilterClause[] | null | undefined
): T {
  if (!clauses?.length) return query;
  let q = query;
  for (const clause of clauses) {
    if (clause.op === "exclude_eq") {
      if (clause.columns.length === 0 || clause.values.length === 0) continue;
      const n = Math.min(clause.columns.length, clause.values.length);
      for (let i = 0; i < n; i++) {
        const column = clause.columns[i];
        const value = clause.values[i];
        if (!column || !value) continue;
        q = q.or(`${column}.is.null,${column}.neq.${value}`) as T;
      }
      continue;
    }
    if (clause.op === "or_eq") {
      if (clause.columns.length === 0 || clause.values.length === 0) continue;
      const n = Math.min(clause.columns.length, clause.values.length);
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const column = clause.columns[i];
        const value = clause.values[i];
        if (!column || !value) continue;
        parts.push(`${column}.eq.${value}`);
      }
      if (parts.length === 0) continue;
      q = q.or(parts.join(",")) as T;
      continue;
    }
    if (clause.op === "eq") {
      const value = clause.values[0];
      if (!value || clause.columns.length === 0) continue;
      if (clause.columns.length === 1) {
        q = q.eq(clause.columns[0], value) as T;
        continue;
      }
      q = q.or(clause.columns.map((column) => `${column}.eq.${value}`).join(",")) as T;
      continue;
    }
    const column = clause.columns[0];
    if (!column || clause.values.length === 0) continue;
    if (clause.values.length === 1) {
      q = q.ilike(column, `%${escapeIlikeNeedle(clause.values[0])}%`) as T;
      continue;
    }
    q = q.or(
      clause.values.map((value) => `${column}.ilike.%${escapeIlikeNeedle(value)}%`).join(",")
    ) as T;
  }
  return q;
}
