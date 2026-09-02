/**
 * CUT 4 — Admin list/detail/event summary loader (service_role).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePlatformPopupCreativePublicUrl } from "@/lib/platform-popup/resolve-popup-creative-url";
import type {
  PlatformPopupApprovalStatus,
  PlatformPopupCampaignStatus,
  PlatformPopupCtaType,
  PlatformPopupEventType,
  PlatformPopupSuppressionMode,
  PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";

export type PlatformPopupAdminListItem = {
  id: string;
  name: string;
  status: PlatformPopupCampaignStatus;
  approvalStatus: PlatformPopupApprovalStatus;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  suppressionMode: PlatformPopupSuppressionMode;
  suppressionDurationSeconds: number | null;
  ctaType: PlatformPopupCtaType;
  ctaTarget: string;
  externalUrl: string | null;
  surfaces: PlatformPopupTargetSurface[];
  ownerStoreId: string | null;
  ownerRequestId: string | null;
  updatedAt: string;
  creativeThumbUrl: string | null;
};

export type PlatformPopupAdminDetail = PlatformPopupAdminListItem & {
  createdAt: string;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  creative: {
    id: string;
    status: string;
    aspectW: number;
    aspectH: number;
    assetPath: string;
    assetUrl: string | null;
    imageUrl: string;
    altText: string | null;
  } | null;
  eventSummary: Record<PlatformPopupEventType, number>;
  derived: {
    ctr: number | null;
    dismissRate: number | null;
    suppressRate: number | null;
    landingSuccessRate: number | null;
    spendRoas: "N/A";
  };
};

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  approval_status: string;
  priority: number;
  start_at: string | null;
  end_at: string | null;
  timezone: string;
  suppression_mode: string;
  suppression_duration_seconds: number | null;
  cta_type: string;
  cta_target: string;
  external_url: string | null;
  owner_store_id: string | null;
  owner_request_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

function emptyEventSummary(): Record<PlatformPopupEventType, number> {
  return {
    eligible: 0,
    impression: 0,
    click: 0,
    dismiss: 0,
    suppress: 0,
    landing_success: 0,
    landing_failure: 0,
  };
}

function rate(num: number, den: number): number | null {
  if (!(den > 0)) return null;
  return num / den;
}

function mapListItem(
  row: CampaignRow,
  surfaces: PlatformPopupTargetSurface[],
  thumb: string | null
): PlatformPopupAdminListItem {
  return {
    id: row.id,
    name: row.name,
    status: row.status as PlatformPopupCampaignStatus,
    approvalStatus: row.approval_status as PlatformPopupApprovalStatus,
    priority: row.priority,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    suppressionMode: row.suppression_mode as PlatformPopupSuppressionMode,
    suppressionDurationSeconds: row.suppression_duration_seconds,
    ctaType: row.cta_type as PlatformPopupCtaType,
    ctaTarget: row.cta_target ?? "",
    externalUrl: row.external_url,
    surfaces,
    ownerStoreId: row.owner_store_id,
    ownerRequestId: row.owner_request_id,
    updatedAt: row.updated_at,
    creativeThumbUrl: thumb,
  };
}

export async function listPlatformPopupAdminCampaigns(
  sb: SupabaseClient,
  input?: { status?: string | null; limit?: number }
): Promise<{ ok: true; items: PlatformPopupAdminListItem[] } | { ok: false; error: string }> {
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 200);
  let q = sb
    .from("platform_popup_campaigns")
    .select(
      "id, name, status, approval_status, priority, start_at, end_at, timezone, suppression_mode, suppression_duration_seconds, cta_type, cta_target, external_url, owner_store_id, owner_request_id, created_by, approved_by, approved_at, created_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (input?.status) {
    q = q.eq("status", input.status);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as CampaignRow[];
  if (!rows.length) return { ok: true, items: [] };

  const ids = rows.map((r) => r.id);
  const [{ data: surfaceRows }, { data: creativeRows }] = await Promise.all([
    sb.from("platform_popup_campaign_surfaces").select("campaign_id, surface").in("campaign_id", ids),
    sb
      .from("platform_popup_creatives")
      .select("campaign_id, asset_path, asset_url, status")
      .in("campaign_id", ids)
      .eq("status", "ready"),
  ]);

  const surfacesBy = new Map<string, PlatformPopupTargetSurface[]>();
  for (const s of surfaceRows ?? []) {
    const cid = String((s as { campaign_id: string }).campaign_id);
    const list = surfacesBy.get(cid) ?? [];
    list.push((s as { surface: PlatformPopupTargetSurface }).surface);
    surfacesBy.set(cid, list);
  }

  const thumbBy = new Map<string, string>();
  for (const c of creativeRows ?? []) {
    const row = c as { campaign_id: string; asset_path: string; asset_url: string | null };
    const url = resolvePlatformPopupCreativePublicUrl({
      assetUrl: row.asset_url,
      assetPath: row.asset_path,
    });
    if (url) thumbBy.set(row.campaign_id, url);
  }

  return {
    ok: true,
    items: rows.map((r) => mapListItem(r, surfacesBy.get(r.id) ?? [], thumbBy.get(r.id) ?? null)),
  };
}

export async function loadPlatformPopupAdminCampaignDetail(
  sb: SupabaseClient,
  campaignId: string
): Promise<{ ok: true; campaign: PlatformPopupAdminDetail } | { ok: false; error: string; httpStatus?: number }> {
  const id = campaignId.trim();
  if (!id) return { ok: false, error: "missing_id", httpStatus: 400 };

  const { data, error } = await sb
    .from("platform_popup_campaigns")
    .select(
      "id, name, status, approval_status, priority, start_at, end_at, timezone, suppression_mode, suppression_duration_seconds, cta_type, cta_target, external_url, owner_store_id, owner_request_id, created_by, approved_by, approved_at, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  if (!data) return { ok: false, error: "not_found", httpStatus: 404 };

  const row = data as CampaignRow;
  const [{ data: surfaceRows }, { data: creativeRow }, { data: eventRows }] = await Promise.all([
    sb.from("platform_popup_campaign_surfaces").select("surface").eq("campaign_id", id),
    sb
      .from("platform_popup_creatives")
      .select("id, status, aspect_w, aspect_h, asset_path, asset_url, alt_text")
      .eq("campaign_id", id)
      .eq("status", "ready")
      .maybeSingle(),
    sb.from("platform_popup_campaign_events").select("event_type").eq("campaign_id", id),
  ]);

  const surfaces = (surfaceRows ?? []).map(
    (s) => (s as { surface: PlatformPopupTargetSurface }).surface
  );
  const summary = emptyEventSummary();
  for (const e of eventRows ?? []) {
    const t = String((e as { event_type: string }).event_type) as PlatformPopupEventType;
    if (t in summary) summary[t] += 1;
  }

  let creative: PlatformPopupAdminDetail["creative"] = null;
  let thumb: string | null = null;
  if (creativeRow) {
    const c = creativeRow as {
      id: string;
      status: string;
      aspect_w: number;
      aspect_h: number;
      asset_path: string;
      asset_url: string | null;
      alt_text: string | null;
    };
    const imageUrl = resolvePlatformPopupCreativePublicUrl({
      assetUrl: c.asset_url,
      assetPath: c.asset_path,
    });
    thumb = imageUrl || null;
    creative = {
      id: c.id,
      status: c.status,
      aspectW: c.aspect_w,
      aspectH: c.aspect_h,
      assetPath: c.asset_path,
      assetUrl: c.asset_url,
      imageUrl,
      altText: c.alt_text,
    };
  }

  const list = mapListItem(row, surfaces, thumb);
  return {
    ok: true,
    campaign: {
      ...list,
      createdAt: row.created_at,
      createdBy: row.created_by,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      creative,
      eventSummary: summary,
      derived: {
        ctr: rate(summary.click, summary.impression),
        dismissRate: rate(summary.dismiss, summary.impression),
        suppressRate: rate(summary.suppress, summary.impression),
        landingSuccessRate: rate(
          summary.landing_success,
          summary.landing_success + summary.landing_failure
        ),
        spendRoas: "N/A",
      },
    },
  };
}
