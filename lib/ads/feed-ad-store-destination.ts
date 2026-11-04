/**
 * DS-2 (2026-11-04): 피드 배너 매장 목적지 = **slug** 저장 (매장 화면은 `/stores/:slug` 로만 열린다 — id 면 「찾을 수 없음」).
 * 팝업 `ownerPopupCtaTargetWithStoreSlug`(owner-request-writer.ts) 와 같은 방식: uuid 로 들어오면 그 매장 slug 로 바꾼다.
 * 차이: 피드 배너는 없는 매장·slug 없는 매장을 **거부**한다(목적지 필수 · C-1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FeedAdStoreDestinationResult =
  | { ok: true; slug: string }
  | { ok: false; error: "store_not_found" | "store_lookup_failed" };

export async function resolveFeedAdStoreDestination(
  sb: SupabaseClient,
  idOrSlug: string
): Promise<FeedAdStoreDestinationResult> {
  const v = String(idOrSlug ?? "").trim();
  if (!v) return { ok: false, error: "store_not_found" };
  const bySlug = await sb.from("stores").select("slug").eq("slug", v).maybeSingle();
  if (bySlug.error) return { ok: false, error: "store_lookup_failed" };
  const slugHit = String((bySlug.data as { slug?: string | null } | null)?.slug ?? "").trim();
  if (slugHit) return { ok: true, slug: slugHit };
  if (!UUID_RE.test(v)) return { ok: false, error: "store_not_found" };
  const byId = await sb.from("stores").select("slug").eq("id", v).maybeSingle();
  if (byId.error) return { ok: false, error: "store_lookup_failed" };
  const slug = String((byId.data as { slug?: string | null } | null)?.slug ?? "").trim();
  return slug ? { ok: true, slug } : { ok: false, error: "store_not_found" };
}

/** 저장 직전 행(`destination_type`·`destination_id`)이 매장이면 slug 로 바꾼다. 매장이 아니면 그대로. */
export async function withFeedAdStoreSlug<T extends { destination_type?: unknown; destination_id?: unknown }>(
  sb: SupabaseClient,
  row: T
): Promise<{ ok: true; row: T } | { ok: false; error: string }> {
  if (String(row.destination_type ?? "") !== "store") return { ok: true, row };
  const r = await resolveFeedAdStoreDestination(sb, String(row.destination_id ?? ""));
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, row: { ...row, destination_id: r.slug } };
}
