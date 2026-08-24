/**
 * CATEGORY browse scope policy — DB load/save (product recovery).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoresBrowseScopePolicyRow } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import {
  buildBrowsePrimaryScopeKey,
  buildBrowseSubScopeKey,
  parseBrowseScopeKey,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";

export type StoresBrowseScopePolicyDbRow = {
  scope_key: string;
  primary_slug: string;
  sub_slug: string | null;
  enabled: boolean;
  display_title_ko: string | null;
  display_title_en: string | null;
  ad_enabled: string;
  coupon_enabled: string;
  max_insertion: number | null;
  interval_every_n: number | null;
  presentation_mode: string;
  schedule_start: string | null;
  schedule_end: string | null;
  product_config?: Record<string, unknown> | null;
};

function isMissingTable(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || m.includes("does not exist");
}

function mapTriState(raw: string): boolean | "inherit" {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return "inherit";
}

export function mapBrowseScopeDbRow(row: StoresBrowseScopePolicyDbRow): StoresBrowseScopePolicyRow {
  return {
    scopeKey: row.scope_key,
    primarySlug: row.primary_slug,
    subSlug: row.sub_slug,
    enabled: row.enabled,
    displayTitleKo: row.display_title_ko,
    displayTitleEn: row.display_title_en,
    adEnabled: mapTriState(row.ad_enabled),
    couponEnabled: mapTriState(row.coupon_enabled),
    maxInsertion: row.max_insertion,
    intervalEveryN: row.interval_every_n,
    presentationMode:
      row.presentation_mode === "inherit"
        ? "inherit"
        : (row.presentation_mode as "card_benefit_integrated" | "hidden"),
    scheduleStart: row.schedule_start,
    scheduleEnd: row.schedule_end,
    productConfig: (row.product_config ?? null) as StoresBrowseScopePolicyRow["productConfig"],
  };
}

export async function listBrowseScopePolicyRows(
  sb: SupabaseClient
): Promise<StoresBrowseScopePolicyDbRow[]> {
  const { data, error } = await sb
    .from("store_browse_scope_policy")
    .select(
      "scope_key, primary_slug, sub_slug, enabled, display_title_ko, display_title_en, ad_enabled, coupon_enabled, max_insertion, interval_every_n, presentation_mode, schedule_start, schedule_end, product_config"
    );
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as StoresBrowseScopePolicyDbRow[];
}

export async function getBrowseScopePolicyRevision(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb.rpc("ensure_store_browse_scope_policy_revision");
  if (error) {
    if (isMissingTable(error)) return 0;
    throw new Error(error.message);
  }
  const revision = Number(data);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

export type BrowseScopePolicyWriteInput = {
  scopeKey: string;
  primarySlug: string;
  subSlug?: string | null;
  enabled: boolean;
  displayTitleKo?: string | null;
  displayTitleEn?: string | null;
  adEnabled: "inherit" | "true" | "false";
  couponEnabled: "inherit" | "true" | "false";
  maxInsertion?: number | null;
  intervalEveryN?: number | null;
  presentationMode: "inherit" | "card_benefit_integrated" | "hidden";
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  productConfig?: Record<string, unknown> | null;
};

export async function saveBrowseScopePolicyWithCas(
  sb: SupabaseClient,
  rows: readonly BrowseScopePolicyWriteInput[],
  actorUserId: string,
  expectedRevision: number
): Promise<
  | { ok: true; revision: number }
  | { ok: false; error: string; currentRevision?: number }
> {
  const payload = rows.map((r) => ({
    scopeKey: r.scopeKey,
    primarySlug: r.primarySlug,
    subSlug: r.subSlug ?? "",
    enabled: r.enabled,
    displayTitleKo: r.displayTitleKo ?? "",
    displayTitleEn: r.displayTitleEn ?? "",
    adEnabled: r.adEnabled,
    couponEnabled: r.couponEnabled,
    maxInsertion: r.maxInsertion == null ? null : r.maxInsertion,
    intervalEveryN: r.intervalEveryN == null ? null : r.intervalEveryN,
    presentationMode: r.presentationMode,
    scheduleStart: r.scheduleStart ?? null,
    scheduleEnd: r.scheduleEnd ?? null,
    productConfig: r.productConfig ?? {},
  }));

  const { data, error } = await sb.rpc("save_store_browse_scope_policy_cas", {
    p_expected_revision: expectedRevision,
    p_rows: payload,
    p_actor_id: actorUserId,
  });

  if (error) {
    if (isMissingTable(error)) return { ok: false, error: "table_missing" };
    throw new Error(error.message);
  }

  const result = data as {
    ok?: boolean;
    error?: string;
    revision?: number;
    current_revision?: number;
  };

  if (!result?.ok) {
    if (result?.error === "stale_revision") {
      return {
        ok: false,
        error: "stale_revision",
        currentRevision: Number(result.current_revision ?? -1),
      };
    }
    return { ok: false, error: String(result?.error ?? "save_failed") };
  }

  return { ok: true, revision: Number(result.revision) };
}

export function browseScopeRowForPrimary(primarySlug: string): BrowseScopePolicyWriteInput {
  const slug = primarySlug.trim().toLowerCase();
  return {
    scopeKey: buildBrowsePrimaryScopeKey(slug),
    primarySlug: slug,
    subSlug: null,
    enabled: true,
    adEnabled: "false",
    couponEnabled: "false",
    maxInsertion: null,
    intervalEveryN: 8,
    presentationMode: "card_benefit_integrated",
  };
}

export function browseScopeRowForSub(primarySlug: string, subSlug: string): BrowseScopePolicyWriteInput {
  const pk = primarySlug.trim().toLowerCase();
  const sk = subSlug.trim().toLowerCase();
  return {
    scopeKey: buildBrowseSubScopeKey(pk, sk),
    primarySlug: pk,
    subSlug: sk,
    enabled: true,
    adEnabled: "inherit",
    couponEnabled: "inherit",
    maxInsertion: null,
    intervalEveryN: null,
    presentationMode: "inherit",
  };
}

export function findBrowseScopeRow(
  rows: readonly StoresBrowseScopePolicyDbRow[],
  scopeKey: string
): StoresBrowseScopePolicyDbRow | undefined {
  return rows.find((r) => r.scope_key === scopeKey);
}

export function scopeKeyParts(scopeKey: string) {
  return parseBrowseScopeKey(scopeKey);
}
