/**
 * Owner writers — ownership via getStoreIfOwner (never trust client storeId alone).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  canOwnerTransitionEventPromoRequest,
  isOwnerEditableEventPromoRequest,
  isOwnerSubmitEligibleEventPromoRequest,
} from "@/lib/platform-event-owner-requests/lifecycle";
import {
  mapPlatformEventOwnerRequestDbRow,
  PLATFORM_EVENT_OWNER_REQUEST_TABLE,
  type PlatformEventOwnerRequestDbRow,
} from "@/lib/platform-event-owner-requests/map-row";
import type {
  PlatformEventOwnerDestinationType,
  PlatformEventOwnerRequestRow,
  PlatformEventOwnerRequestedChannels,
} from "@/lib/platform-event-owner-requests/types";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";

export type OwnerEventPromoDraftPatch = {
  title?: string;
  subtitle?: string | null;
  heroImageUrl?: string | null;
  heroImagePath?: string | null;
  body?: string | null;
  benefitTitle?: string | null;
  benefitBody?: string | null;
  requestedStartsAt?: string | null;
  requestedEndsAt?: string | null;
  destinationType?: PlatformEventOwnerDestinationType;
  destinationTarget?: string;
  requestedChannels?: Partial<PlatformEventOwnerRequestedChannels>;
};

async function loadOwnedRequest(
  sb: SupabaseClient,
  input: { requestId: string; ownerUserId: string }
): Promise<
  | { ok: true; row: PlatformEventOwnerRequestRow; raw: PlatformEventOwnerRequestDbRow }
  | { ok: false; error: string; httpStatus: number }
> {
  const { data, error } = await sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  if (!data) return { ok: false, error: "not_found", httpStatus: 404 };
  const raw = data as PlatformEventOwnerRequestDbRow;
  if (String(raw.owner_user_id) !== input.ownerUserId) {
    return { ok: false, error: "forbidden", httpStatus: 403 };
  }
  return { ok: true, row: mapPlatformEventOwnerRequestDbRow(raw), raw };
}

export async function createOwnerEventPromoDraft(
  sb: SupabaseClient,
  input: { ownerUserId: string; storeId: string; title?: string }
): Promise<
  | { ok: true; request: PlatformEventOwnerRequestRow }
  | { ok: false; error: string; httpStatus: number }
> {
  const owned = await getStoreIfOwner(sb, input.ownerUserId, input.storeId);
  if (!owned.ok) return { ok: false, error: owned.error, httpStatus: owned.status };

  const { data, error } = await sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .insert({
      owner_user_id: input.ownerUserId,
      store_id: owned.store.id,
      request_status: "draft",
      title: (input.title ?? "").trim() || "Untitled promotion",
      destination_type: "store",
      destination_target: owned.store.id,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  const request = mapPlatformEventOwnerRequestDbRow(data as PlatformEventOwnerRequestDbRow);
  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: input.ownerUserId,
    target_type: "platform_event_owner_request",
    target_id: request.id,
    action: "platform_event_owner_request.create_draft",
    after_json: { storeId: request.storeId },
  });
  return { ok: true, request };
}

export async function updateOwnerEventPromoDraft(
  sb: SupabaseClient,
  input: { ownerUserId: string; requestId: string; patch: OwnerEventPromoDraftPatch }
): Promise<
  | { ok: true; request: PlatformEventOwnerRequestRow }
  | { ok: false; error: string; httpStatus: number }
> {
  const loaded = await loadOwnedRequest(sb, input);
  if (!loaded.ok) return loaded;
  if (!isOwnerEditableEventPromoRequest(loaded.row.requestStatus)) {
    return { ok: false, error: "not_editable", httpStatus: 409 };
  }

  // Re-verify store ownership on every write.
  const owned = await getStoreIfOwner(sb, input.ownerUserId, loaded.row.storeId);
  if (!owned.ok) return { ok: false, error: owned.error, httpStatus: owned.status };

  const p = input.patch;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (p.title != null) update.title = p.title.trim();
  if (p.subtitle !== undefined) update.subtitle = p.subtitle?.trim() || null;
  if (p.heroImageUrl !== undefined) update.hero_image_url = p.heroImageUrl;
  if (p.heroImagePath !== undefined) update.hero_image_path = p.heroImagePath;
  if (p.body !== undefined) update.body = p.body?.trim() || null;
  if (p.benefitTitle !== undefined) update.benefit_title = p.benefitTitle?.trim() || null;
  if (p.benefitBody !== undefined) update.benefit_body = p.benefitBody?.trim() || null;
  if (p.requestedStartsAt !== undefined) update.requested_starts_at = p.requestedStartsAt;
  if (p.requestedEndsAt !== undefined) update.requested_ends_at = p.requestedEndsAt;
  if (p.destinationType != null) update.destination_type = p.destinationType;
  if (p.destinationTarget != null) update.destination_target = p.destinationTarget.trim();
  if (p.requestedChannels) {
    if (p.requestedChannels.popup != null) update.requested_popup = p.requestedChannels.popup;
    if (p.requestedChannels.banner != null) update.requested_banner = p.requestedChannels.banner;
    if (p.requestedChannels.push != null) update.requested_push = p.requestedChannels.push;
    if (p.requestedChannels.bell != null) update.requested_bell = p.requestedChannels.bell;
  }

  const { data, error } = await sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .update(update)
    .eq("id", input.requestId)
    .eq("owner_user_id", input.ownerUserId)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  return { ok: true, request: mapPlatformEventOwnerRequestDbRow(data as PlatformEventOwnerRequestDbRow) };
}

export async function submitOwnerEventPromoRequest(
  sb: SupabaseClient,
  input: { ownerUserId: string; requestId: string }
): Promise<
  | { ok: true; request: PlatformEventOwnerRequestRow }
  | { ok: false; error: string; httpStatus: number }
> {
  const loaded = await loadOwnedRequest(sb, input);
  if (!loaded.ok) return loaded;
  if (!isOwnerSubmitEligibleEventPromoRequest(loaded.row.requestStatus)) {
    return { ok: false, error: "not_submittable", httpStatus: 409 };
  }
  if (!canOwnerTransitionEventPromoRequest(loaded.row.requestStatus, "submitted")) {
    return { ok: false, error: "transition_denied", httpStatus: 409 };
  }
  if (!loaded.row.title.trim()) {
    return { ok: false, error: "title_required", httpStatus: 400 };
  }

  const owned = await getStoreIfOwner(sb, input.ownerUserId, loaded.row.storeId);
  if (!owned.ok) return { ok: false, error: owned.error, httpStatus: owned.status };

  const { data, error } = await sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .update({
      request_status: "submitted",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.requestId)
    .eq("owner_user_id", input.ownerUserId)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  const request = mapPlatformEventOwnerRequestDbRow(data as PlatformEventOwnerRequestDbRow);
  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: input.ownerUserId,
    target_type: "platform_event_owner_request",
    target_id: request.id,
    action: "platform_event_owner_request.submit",
    after_json: { status: request.requestStatus },
  });
  return { ok: true, request };
}

export async function cancelOwnerEventPromoRequest(
  sb: SupabaseClient,
  input: { ownerUserId: string; requestId: string }
): Promise<
  | { ok: true; request: PlatformEventOwnerRequestRow }
  | { ok: false; error: string; httpStatus: number }
> {
  const loaded = await loadOwnedRequest(sb, input);
  if (!loaded.ok) return loaded;
  if (!canOwnerTransitionEventPromoRequest(loaded.row.requestStatus, "cancelled")) {
    return { ok: false, error: "transition_denied", httpStatus: 409 };
  }
  const { data, error } = await sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .update({
      request_status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.requestId)
    .eq("owner_user_id", input.ownerUserId)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  return { ok: true, request: mapPlatformEventOwnerRequestDbRow(data as PlatformEventOwnerRequestDbRow) };
}

export async function listOwnerEventPromoRequests(
  sb: SupabaseClient,
  input: { ownerUserId: string; storeId?: string | null }
): Promise<PlatformEventOwnerRequestRow[]> {
  let q = sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .select("*")
    .eq("owner_user_id", input.ownerUserId)
    .order("updated_at", { ascending: false });
  if (input.storeId) q = q.eq("store_id", input.storeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as PlatformEventOwnerRequestDbRow[]).map(mapPlatformEventOwnerRequestDbRow);
}

export async function getOwnerEventPromoRequest(
  sb: SupabaseClient,
  input: { ownerUserId: string; requestId: string }
): Promise<
  | { ok: true; request: PlatformEventOwnerRequestRow }
  | { ok: false; error: string; httpStatus: number }
> {
  const loaded = await loadOwnedRequest(sb, input);
  if (!loaded.ok) return loaded;
  return { ok: true, request: loaded.row };
}
