/**
 * Admin review + approve adapter.
 * APPROVE → Platform Event (draft) link. Never Push send. Never auto Distribution ON.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  canAdminTransitionEventPromoRequest,
  nextStatusForEventPromoAdminAction,
} from "@/lib/platform-event-owner-requests/lifecycle";
import {
  mapPlatformEventOwnerRequestDbRow,
  PLATFORM_EVENT_OWNER_REQUEST_TABLE,
  type PlatformEventOwnerRequestDbRow,
} from "@/lib/platform-event-owner-requests/map-row";
import type {
  PlatformEventOwnerAdminAction,
  PlatformEventOwnerRequestRow,
} from "@/lib/platform-event-owner-requests/types";
import type { PlatformEventSection } from "@/lib/platform-events/types";
import { normalizePlatformEventSections } from "@/lib/platform-events/sections";

function buildSectionsFromRequest(row: PlatformEventOwnerRequestRow): PlatformEventSection[] {
  const sections: PlatformEventSection[] = [];
  if (row.body?.trim()) sections.push({ type: "text", body: row.body.trim() });
  if (row.benefitTitle?.trim()) {
    sections.push({
      type: "benefit",
      title: row.benefitTitle.trim(),
      body: row.benefitBody?.trim() || undefined,
    });
  }
  return normalizePlatformEventSections(sections);
}

function ctaFromRequest(row: PlatformEventOwnerRequestRow): {
  ctaType: string;
  ctaTarget: string;
  ctaExternalUrl: string | null;
} {
  if (row.destinationType === "external_url") {
    return {
      ctaType: "external_url",
      ctaTarget: "",
      ctaExternalUrl: row.destinationTarget || null,
    };
  }
  if (row.destinationType === "product") {
    return { ctaType: "internal_page", ctaTarget: row.destinationTarget || "/", ctaExternalUrl: null };
  }
  if (row.destinationType === "internal_page") {
    return {
      ctaType: "internal_page",
      ctaTarget: row.destinationTarget.startsWith("/") ? row.destinationTarget : "/",
      ctaExternalUrl: null,
    };
  }
  // store
  return {
    ctaType: "store",
    ctaTarget: row.destinationTarget || row.storeId,
    ctaExternalUrl: null,
  };
}

export type ApproveEventPromoResult = {
  ok: true;
  request: PlatformEventOwnerRequestRow;
  platformEventId: string;
  replay: boolean;
  /** Admin must still configure Distribution + explicit Push send. */
  pushDispatchCount: 0;
  distributionConfigured: false;
  eventStatus: "draft";
};

export async function adminApproveOwnerEventPromoRequest(
  sb: SupabaseClient,
  input: { adminUserId: string; requestId: string }
): Promise<ApproveEventPromoResult | { ok: false; error: string; httpStatus: number }> {
  const { data, error } = await sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  if (!data) return { ok: false, error: "not_found", httpStatus: 404 };
  const raw = data as PlatformEventOwnerRequestDbRow;
  const request = mapPlatformEventOwnerRequestDbRow(raw);

  // Idempotent approve: already linked Event.
  if (request.requestStatus === "approved" && request.platformEventId) {
    return {
      ok: true,
      request,
      platformEventId: request.platformEventId,
      replay: true,
      pushDispatchCount: 0,
      distributionConfigured: false,
      eventStatus: "draft",
    };
  }

  if (!canAdminTransitionEventPromoRequest(request.requestStatus, "approved")) {
    return { ok: false, error: "transition_denied", httpStatus: 409 };
  }

  const idemKey = `approve:${request.id}`;
  let platformEventId = request.platformEventId;

  if (!platformEventId) {
    const sections = buildSectionsFromRequest(request);
    const cta = ctaFromRequest(request);
    const { data: eventRow, error: eventErr } = await sb
      .from("platform_events")
      .insert({
        title: request.title.trim() || "Promotion",
        subtitle: request.subtitle,
        hero_image_url: request.heroImageUrl,
        hero_image_path: request.heroImagePath,
        sections,
        status: "draft",
        starts_at: request.requestedStartsAt,
        ends_at: request.requestedEndsAt,
        timezone: request.timezone,
        cta_label: "자세히 보기",
        cta_type: cta.ctaType,
        cta_target: cta.ctaTarget,
        cta_external_url: cta.ctaExternalUrl,
        source_owner_request_id: request.id,
        source_store_id: request.storeId,
        created_by: input.adminUserId,
        updated_by: input.adminUserId,
      })
      .select("id")
      .single();

    if (eventErr) {
      // Unique conflict / race: try reload request
      if (eventErr.code === "23505") {
        const reloaded = await sb
          .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
          .select("*")
          .eq("id", request.id)
          .maybeSingle();
        const again = reloaded.data
          ? mapPlatformEventOwnerRequestDbRow(reloaded.data as PlatformEventOwnerRequestDbRow)
          : null;
        if (again?.platformEventId) {
          return {
            ok: true,
            request: again,
            platformEventId: again.platformEventId,
            replay: true,
            pushDispatchCount: 0,
            distributionConfigured: false,
            eventStatus: "draft",
          };
        }
      }
      return { ok: false, error: eventErr.message, httpStatus: 500 };
    }
    platformEventId = String(eventRow.id);
  }

  const { data: updated, error: upErr } = await sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .update({
      request_status: "approved",
      platform_event_id: platformEventId,
      approve_idempotency_key: idemKey,
      reviewed_at: new Date().toISOString(),
      reviewed_by: input.adminUserId,
      updated_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", request.id)
    .select("*")
    .single();

  if (upErr) {
    return {
      ok: false,
      error: upErr.message,
      httpStatus: 500,
    };
  }

  const next = mapPlatformEventOwnerRequestDbRow(updated as PlatformEventOwnerRequestDbRow);
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.adminUserId,
    target_type: "platform_event_owner_request",
    target_id: next.id,
    action: "platform_event_owner_request.approve",
    after_json: {
      platformEventId,
      eventStatus: "draft",
      pushDispatchCount: 0,
      requestedChannels: next.requestedChannels,
    },
  });

  return {
    ok: true,
    request: next,
    platformEventId,
    replay: false,
    pushDispatchCount: 0,
    distributionConfigured: false,
    eventStatus: "draft",
  };
}

export async function adminActOnOwnerEventPromoRequest(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    requestId: string;
    action: PlatformEventOwnerAdminAction;
    reason?: string | null;
  }
): Promise<
  | { ok: true; request: PlatformEventOwnerRequestRow }
  | ApproveEventPromoResult
  | { ok: false; error: string; httpStatus: number }
> {
  if (input.action === "approve") {
    return adminApproveOwnerEventPromoRequest(sb, {
      adminUserId: input.adminUserId,
      requestId: input.requestId,
    });
  }

  const { data, error } = await sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  if (!data) return { ok: false, error: "not_found", httpStatus: 404 };
  const request = mapPlatformEventOwnerRequestDbRow(data as PlatformEventOwnerRequestDbRow);
  const nextStatus = nextStatusForEventPromoAdminAction(input.action);
  if (!canAdminTransitionEventPromoRequest(request.requestStatus, nextStatus)) {
    return { ok: false, error: "transition_denied", httpStatus: 409 };
  }

  if (input.action === "reject") {
    const reason = String(input.reason ?? "").trim();
    if (!reason) return { ok: false, error: "rejection_reason_required", httpStatus: 400 };
  }

  const patch: Record<string, unknown> = {
    request_status: nextStatus,
    reviewed_at: new Date().toISOString(),
    reviewed_by: input.adminUserId,
    updated_at: new Date().toISOString(),
  };
  if (input.action === "reject") {
    patch.rejection_reason = String(input.reason).trim();
    patch.revision_reason = null;
  }
  if (input.action === "revision_required") {
    patch.revision_reason = String(input.reason ?? "").trim() || "revision_required";
    patch.rejection_reason = null;
  }

  const { data: updated, error: upErr } = await sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .update(patch)
    .eq("id", input.requestId)
    .select("*")
    .single();
  if (upErr) return { ok: false, error: upErr.message, httpStatus: 500 };

  const next = mapPlatformEventOwnerRequestDbRow(updated as PlatformEventOwnerRequestDbRow);
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.adminUserId,
    target_type: "platform_event_owner_request",
    target_id: next.id,
    action: `platform_event_owner_request.${input.action}`,
    after_json: { status: next.requestStatus, reason: input.reason ?? null },
  });
  return { ok: true, request: next };
}

export async function listAdminOwnerEventPromoRequests(
  sb: SupabaseClient,
  input?: { status?: string | null }
): Promise<PlatformEventOwnerRequestRow[]> {
  let q = sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .select("*")
    .order("submitted_at", { ascending: false, nullsFirst: false });
  if (input?.status) q = q.eq("request_status", input.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as PlatformEventOwnerRequestDbRow[]).map(mapPlatformEventOwnerRequestDbRow);
}

export async function getAdminOwnerEventPromoRequest(
  sb: SupabaseClient,
  requestId: string
): Promise<PlatformEventOwnerRequestRow | null> {
  const { data, error } = await sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapPlatformEventOwnerRequestDbRow(data as PlatformEventOwnerRequestDbRow);
}
