/**
 * Member Control Center domain-tab helpers.
 * CONTRACT: server page only; error ≠ 0; no invented columns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAdminMemberListPage } from "@/lib/admin-users/admin-member-list-query";
import type { OverviewMetric } from "@/lib/admin-users/member-overview-aggregates";

export type { OverviewMetric };

type CountResult = PromiseLike<{ count: number | null; error: { message?: string } | null }>;
type LatestResult = PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message?: string } | null }>;

export function parseAdminMemberDomainPage(searchParams: URLSearchParams): {
  page: number;
  pageSize: number;
  from: number;
  to: number;
} {
  return parseAdminMemberListPage(searchParams.get("page"), searchParams.get("pageSize"));
}

export function previewText(raw: string | null | undefined, max = 120): string {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function maxIso(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const value of values) {
    const next = String(value ?? "").trim();
    if (next && (!best || next > best)) best = next;
  }
  return best;
}

export async function asCount(q: CountResult): Promise<OverviewMetric<number>> {
  const { count, error } = await q;
  if (error) return { ok: false, error: error.message ?? "count_failed" };
  return { ok: true, value: count ?? 0 };
}

export async function asLatest(q: LatestResult, column: string): Promise<OverviewMetric<string | null>> {
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message ?? "latest_failed" };
  const row = data?.[0];
  const value = row ? String(row[column] ?? "").trim() : "";
  return { ok: true, value: value || null };
}

export function isMissingRelation(message: string | undefined, table: string): boolean {
  const text = String(message ?? "").toLowerCase();
  return text.includes(table.toLowerCase()) && (text.includes("does not exist") || text.includes("schema cache"));
}

export async function loadTitlesById(
  sb: SupabaseClient,
  table: string,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await sb.from(table).select("id, title").in("id", chunk);
    if (error) break;
    for (const row of data ?? []) {
      const rec = row as { id?: string; title?: string | null };
      const id = String(rec.id ?? "").trim();
      if (id) map.set(id, String(rec.title ?? "").trim());
    }
  }
  return map;
}
