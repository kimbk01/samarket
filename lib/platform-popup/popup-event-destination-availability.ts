/**
 * EVT-03 — a promotion popup whose CTA lands on a platform event is shown only while that
 * event exists, is public (published) and is running (started, not ended).
 *
 * Self-contained on purpose: reads `platform_events` directly (id/status/window only) so the
 * popup resolver does not depend on Event CMS loaders. Fail-closed: query error → unavailable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";
import {
  normalizePlatformPopupCta,
  platformPopupCtaEventId,
  platformPopupInternalPathEntity,
  type PlatformPopupCtaInput,
  type PlatformPopupCtaTargetLookup,
} from "@/lib/platform-popup/cta";

export type PopupEventAvailabilityRow = {
  id: string;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

/** 엔티티 CTA 종류 — 광고 감사 G-7: 이 셋도 노출 전에 존재·공개를 확인한다 (계약 §7 fail-closed) */
export type PopupEntityCtaKind = "trade_listing" | "community_post" | "store";

/** 엔티티 CTA 의 대상 키 — `${kind}:${target}` (store 는 slug, 나머지는 id) */
export function popupEntityCtaKey(kind: PopupEntityCtaKind, target: string): string {
  const t = target.trim();
  // id(UUID)는 대소문자 무시, 매장 slug 는 저장된 그대로 비교
  return `${kind}:${kind === "store" ? t : t.toLowerCase()}`;
}

export function popupCtaInputEntityKey(input: PlatformPopupCtaInput): string | null {
  const normalized = normalizePlatformPopupCta(input);
  if (!normalized.ok) return null;
  const { ctaType, ctaTarget } = normalized.value;
  if (ctaType === "trade_listing" || ctaType === "community_post" || ctaType === "store") {
    return popupEntityCtaKey(ctaType, ctaTarget);
  }
  // DS-5b: 내부 경로가 글·매장 상세면 같은 대상 확인
  const pathEntity = platformPopupInternalPathEntity(normalized.value);
  if (pathEntity) return popupEntityCtaKey(pathEntity.kind, pathEntity.target);
  return null;
}

/** 거래 글 공개 = 목록 함수 `trade_list_page` 의 공개 조건과 같음 (판매완료 글은 상세가 열리므로 공개) */
export function isPopupTradeListingPublic(row: {
  trade_category_id?: unknown;
  status?: unknown;
  moderation_state?: unknown;
  owner_state?: unknown;
  is_deleted?: unknown;
}): boolean {
  if (!String(row.trade_category_id ?? "").trim()) return false;
  if (String(row.status ?? "") === "hidden") return false;
  if (String(row.moderation_state ?? "visible") !== "visible") return false;
  if (String(row.owner_state ?? "none") !== "none") return false;
  return row.is_deleted !== true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure: event row → CTA lookup. Only `published` counts as public (draft / unpublished / archived do not). */
export function popupEventLookupFromRow(
  row: PopupEventAvailabilityRow | null | undefined,
  nowMs: number
): PlatformPopupCtaTargetLookup {
  if (!row) return { exists: false, visible: false };
  const status = String(row.status ?? "").trim().toLowerCase();
  const startMs = row.starts_at ? Date.parse(row.starts_at) : NaN;
  const endMs = row.ends_at ? Date.parse(row.ends_at) : NaN;
  const notStarted = Number.isFinite(startMs) && startMs > nowMs;
  const ended = Number.isFinite(endMs) && endMs < nowMs;
  return {
    exists: true,
    visible: status === "published" && !notStarted,
    expired: ended,
    authorized: true,
  };
}

/** Event id a raw popup CTA lands on (event_detail or internal `/events/:id`). */
export function popupCtaInputEventId(input: PlatformPopupCtaInput): string | null {
  const normalized = normalizePlatformPopupCta(input);
  return normalized.ok ? platformPopupCtaEventId(normalized.value) : null;
}

/** Batch read — one query for all event-destination candidates. */
export async function loadPopupEventDestinationLookups(
  sb: SupabaseClient,
  eventIds: readonly string[],
  nowMs: number = Date.now()
): Promise<Map<string, PlatformPopupCtaTargetLookup>> {
  const out = new Map<string, PlatformPopupCtaTargetLookup>();
  const unique = [...new Set(eventIds.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return out;

  const queryable = unique.filter((id) => UUID_RE.test(id));
  const rowsById = new Map<string, PopupEventAvailabilityRow>();
  let failed = false;
  if (queryable.length) {
    const { data, error } = await sb
      .from("platform_events")
      .select("id, status, starts_at, ends_at")
      .in("id", queryable);
    if (error) failed = true;
    for (const row of (data ?? []) as PopupEventAvailabilityRow[]) {
      rowsById.set(String(row.id).toLowerCase(), row);
    }
  }

  for (const id of unique) {
    if (failed) {
      out.set(id, { exists: false, visible: false });
      continue;
    }
    out.set(id, popupEventLookupFromRow(rowsById.get(id.toLowerCase()) ?? null, nowMs));
  }
  return out;
}

/**
 * G-7 — 거래 글·커뮤니티 글·매장 CTA 대상의 존재·공개를 종류별 1회 조회로 확인.
 * 매장 = 배너와 같은 자격(approved · is_visible). 조회 오류 → 그 종류 전부 열 수 없음(fail-closed).
 */
export async function loadPopupEntityDestinationLookups(
  sb: SupabaseClient,
  keys: readonly string[]
): Promise<Map<string, PlatformPopupCtaTargetLookup>> {
  const out = new Map<string, PlatformPopupCtaTargetLookup>();
  const unique = [...new Set(keys)];
  if (!unique.length) return out;
  const targetsOf = (kind: PopupEntityCtaKind) =>
    unique.filter((k) => k.startsWith(`${kind}:`)).map((k) => k.slice(kind.length + 1));
  const tradeIds = targetsOf("trade_listing").filter((id) => UUID_RE.test(id));
  const communityIds = targetsOf("community_post").filter((id) => UUID_RE.test(id));
  const storeSlugs = targetsOf("store");

  const [trade, community, stores] = await Promise.all([
    tradeIds.length
      ? sb
          .from("posts")
          .select("id, trade_category_id, status, moderation_state, owner_state, is_deleted")
          .in("id", tradeIds)
      : Promise.resolve({ data: [], error: null }),
    communityIds.length
      ? sb.from("community_posts").select("id, status, is_hidden, is_deleted").in("id", communityIds)
      : Promise.resolve({ data: [], error: null }),
    storeSlugs.length
      ? sb.from("stores").select("slug, approval_status, is_visible").in("slug", storeSlugs)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const visibleTrade = new Map<string, boolean>();
  for (const row of (trade.data ?? []) as Record<string, unknown>[]) {
    visibleTrade.set(String(row.id ?? "").toLowerCase(), isPopupTradeListingPublic(row));
  }
  const visibleCommunity = new Map<string, boolean>();
  for (const row of (community.data ?? []) as Record<string, unknown>[]) {
    visibleCommunity.set(
      String(row.id ?? "").toLowerCase(),
      isCommunityPostPubliclyVisible(row as { status?: string | null; is_hidden?: boolean | null; is_deleted?: boolean | null })
    );
  }
  const visibleStore = new Map<string, boolean>();
  for (const row of (stores.data ?? []) as Record<string, unknown>[]) {
    visibleStore.set(
      String(row.slug ?? "").trim(),
      row.approval_status === "approved" && row.is_visible === true
    );
  }

  const fill = (
    kind: PopupEntityCtaKind,
    failed: boolean,
    visible: Map<string, boolean>
  ) => {
    for (const target of targetsOf(kind)) {
      const key = popupEntityCtaKey(kind, target);
      if (failed) {
        out.set(key, { exists: false, visible: false });
        continue;
      }
      const v = visible.get(target);
      out.set(key, v === undefined ? { exists: false, visible: false } : { exists: true, visible: v, authorized: true });
    }
  };
  fill("trade_listing", Boolean(trade.error), visibleTrade);
  fill("community_post", Boolean(community.error), visibleCommunity);
  fill("store", Boolean(stores.error), visibleStore);
  return out;
}

/** Candidate CTA → lookup used by `validatePlatformPopupCta` in the resolver. */
export function resolvePopupCandidateCtaLookup(
  input: PlatformPopupCtaInput,
  eventLookups: ReadonlyMap<string, PlatformPopupCtaTargetLookup>,
  entityLookups: ReadonlyMap<string, PlatformPopupCtaTargetLookup>
): PlatformPopupCtaTargetLookup {
  const eventId = popupCtaInputEventId(input);
  if (eventId) return eventLookups.get(eventId) ?? { exists: false, visible: false };
  const entityKey = popupCtaInputEntityKey(input);
  if (entityKey) return entityLookups.get(entityKey) ?? { exists: false, visible: false };
  // 경로·외부 주소 CTA 는 `assertPlatformPopupCtaTargetAvailable` 이 lookup 을 보지 않는다
  return { exists: true, visible: true, authorized: true };
}
