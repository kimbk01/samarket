/**
 * CUT 5 — Owner / Admin loaders for platform_popup_owner_requests + packages.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPlatformPopupCtaType,
  isPlatformPopupSuppressionMode,
  isPlatformPopupTargetSurface,
} from "@/lib/platform-popup/admin-campaign-authority";
import { PLATFORM_POPUP_DEFAULT_TIMEZONE } from "@/lib/platform-popup/types";
import type { PlatformPopupTargetSurface } from "@/lib/platform-popup/types";
import {
  isPlatformPopupOwnerPaymentStatus,
  isPlatformPopupOwnerRequestStatus,
  type PlatformPopupAdPackageRow,
  type PlatformPopupOwnerPaymentStatus,
  type PlatformPopupOwnerRequestRow,
  type PlatformPopupOwnerRequestStatus,
} from "@/lib/platform-popup/owner-request-types";

export const PLATFORM_POPUP_OWNER_REQUEST_TABLE = "platform_popup_owner_requests" as const;
export const PLATFORM_POPUP_AD_PACKAGE_TABLE = "platform_popup_ad_packages" as const;

const REQUEST_SELECT = [
  "id",
  "owner_user_id",
  "store_id",
  "request_status",
  "payment_status",
  "package_id",
  "price_minor",
  "currency",
  "requested_surfaces",
  "requested_start_at",
  "requested_end_at",
  "timezone",
  "cta_type",
  "cta_target",
  "external_url",
  "suppression_mode",
  "suppression_duration_seconds",
  "creative_asset_path",
  "creative_asset_url",
  "creative_alt_text",
  "revision_reason",
  "rejection_reason",
  "admin_campaign_id",
  "submit_idempotency_key",
  "created_at",
  "updated_at",
  "submitted_at",
  "reviewed_at",
].join(", ");

function mapSurfaces(raw: unknown): PlatformPopupTargetSurface[] {
  if (!Array.isArray(raw)) return [];
  const out: PlatformPopupTargetSurface[] = [];
  for (const s of raw) {
    const v = String(s ?? "").trim().toUpperCase();
    if (isPlatformPopupTargetSurface(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

export function mapPlatformPopupOwnerRequestRow(
  raw: Record<string, unknown> | null
): PlatformPopupOwnerRequestRow | null {
  if (!raw?.id) return null;
  const requestStatus = String(raw.request_status ?? "");
  const paymentStatus = String(raw.payment_status ?? "");
  if (!isPlatformPopupOwnerRequestStatus(requestStatus)) return null;
  if (!isPlatformPopupOwnerPaymentStatus(paymentStatus)) return null;
  const ctaType = String(raw.cta_type ?? "store");
  const suppressionMode = String(raw.suppression_mode ?? "TODAY").toUpperCase();
  if (!isPlatformPopupCtaType(ctaType)) return null;
  if (!isPlatformPopupSuppressionMode(suppressionMode)) return null;

  return {
    id: String(raw.id),
    ownerUserId: String(raw.owner_user_id ?? ""),
    storeId: String(raw.store_id ?? ""),
    requestStatus: requestStatus as PlatformPopupOwnerRequestStatus,
    paymentStatus: paymentStatus as PlatformPopupOwnerPaymentStatus,
    packageId: raw.package_id == null ? null : String(raw.package_id),
    priceMinor: raw.price_minor == null ? null : Math.trunc(Number(raw.price_minor)),
    currency: "BUSINESS_CASH",
    requestedSurfaces: mapSurfaces(raw.requested_surfaces),
    requestedStartAt: raw.requested_start_at == null ? null : String(raw.requested_start_at),
    requestedEndAt: raw.requested_end_at == null ? null : String(raw.requested_end_at),
    timezone: String(raw.timezone ?? PLATFORM_POPUP_DEFAULT_TIMEZONE),
    ctaType,
    ctaTarget: String(raw.cta_target ?? ""),
    externalUrl: raw.external_url == null ? null : String(raw.external_url),
    suppressionMode,
    suppressionDurationSeconds:
      raw.suppression_duration_seconds == null
        ? null
        : Math.trunc(Number(raw.suppression_duration_seconds)),
    creativeAssetPath: raw.creative_asset_path == null ? null : String(raw.creative_asset_path),
    creativeAssetUrl: raw.creative_asset_url == null ? null : String(raw.creative_asset_url),
    creativeAltText: raw.creative_alt_text == null ? null : String(raw.creative_alt_text),
    revisionReason: raw.revision_reason == null ? null : String(raw.revision_reason),
    rejectionReason: raw.rejection_reason == null ? null : String(raw.rejection_reason),
    adminCampaignId: raw.admin_campaign_id == null ? null : String(raw.admin_campaign_id),
    submitIdempotencyKey:
      raw.submit_idempotency_key == null ? null : String(raw.submit_idempotency_key),
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
    submittedAt: raw.submitted_at == null ? null : String(raw.submitted_at),
    reviewedAt: raw.reviewed_at == null ? null : String(raw.reviewed_at),
  };
}

export function mapPlatformPopupAdPackageRow(
  raw: Record<string, unknown> | null
): PlatformPopupAdPackageRow | null {
  if (!raw?.id) return null;
  const priceMinor = Math.trunc(Number(raw.price_minor) || 0);
  if (!(priceMinor > 0)) return null;
  return {
    id: String(raw.id),
    code: String(raw.code ?? ""),
    name: String(raw.name ?? ""),
    currency: "BUSINESS_CASH",
    priceMinor,
    durationDays: Math.max(1, Math.trunc(Number(raw.duration_days) || 7)),
    isActive: raw.is_active !== false,
    sortOrder: Math.trunc(Number(raw.sort_order) || 0),
  };
}

export async function listActivePlatformPopupAdPackages(
  sb: SupabaseClient
): Promise<PlatformPopupAdPackageRow[]> {
  const { data, error } = await sb
    .from(PLATFORM_POPUP_AD_PACKAGE_TABLE)
    .select("id, code, name, currency, price_minor, duration_days, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return (data as Record<string, unknown>[])
    .map((r) => mapPlatformPopupAdPackageRow(r))
    .filter((r): r is PlatformPopupAdPackageRow => r != null);
}

export async function loadPlatformPopupAdPackage(
  sb: SupabaseClient,
  packageId: string
): Promise<PlatformPopupAdPackageRow | null> {
  const id = packageId.trim();
  if (!id) return null;
  const { data, error } = await sb
    .from(PLATFORM_POPUP_AD_PACKAGE_TABLE)
    .select("id, code, name, currency, price_minor, duration_days, is_active, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapPlatformPopupAdPackageRow(data as Record<string, unknown>);
}

export async function loadPlatformPopupOwnerRequest(
  sb: SupabaseClient,
  requestId: string
): Promise<PlatformPopupOwnerRequestRow | null> {
  const id = requestId.trim();
  if (!id) return null;
  const { data, error } = await sb
    .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
    .select(REQUEST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapPlatformPopupOwnerRequestRow(data as unknown as Record<string, unknown>);
}

export async function listPlatformPopupOwnerRequestsForOwner(
  sb: SupabaseClient,
  input: { ownerUserId: string; storeId?: string | null; limit?: number }
): Promise<PlatformPopupOwnerRequestRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  let q = sb
    .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
    .select(REQUEST_SELECT)
    .eq("owner_user_id", input.ownerUserId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (input.storeId?.trim()) q = q.eq("store_id", input.storeId.trim());
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[])
    .map((r) => mapPlatformPopupOwnerRequestRow(r))
    .filter((r): r is PlatformPopupOwnerRequestRow => r != null);
}

export async function listPlatformPopupOwnerRequestsForAdmin(
  sb: SupabaseClient,
  filters: {
    status?: PlatformPopupOwnerRequestStatus | "open" | "all";
    storeId?: string;
    limit?: number;
  } = {}
): Promise<{ items: PlatformPopupOwnerRequestRow[]; error?: string }> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 300);
  let q = sb
    .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
    .select(REQUEST_SELECT)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (filters.storeId?.trim()) q = q.eq("store_id", filters.storeId.trim());
  if (filters.status === "open") {
    q = q.in("request_status", ["submitted", "under_review", "revision_required"]);
  } else if (filters.status && filters.status !== "all") {
    q = q.eq("request_status", filters.status);
  }
  const { data, error } = await q;
  if (error) return { items: [], error: error.message };
  const items = (data ?? [])
    .map((r) => mapPlatformPopupOwnerRequestRow(r as unknown as Record<string, unknown>))
    .filter((r): r is PlatformPopupOwnerRequestRow => r != null);
  return { items };
}
