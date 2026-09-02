/**
 * CUT 2 — server load of eligible campaign candidates for resolvePopupAd.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";
import type {
  PlatformPopupApprovalStatus,
  PlatformPopupCampaignStatus,
  PlatformPopupCtaType,
  PlatformPopupSuppressionMode,
  PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";
import type { PlatformPopupSuppressionRecord } from "@/lib/platform-popup/suppression";

type CampaignRow = {
  id: string;
  status: string;
  approval_status: string;
  priority: number;
  start_at: string | null;
  end_at: string | null;
  timezone: string | null;
  cta_type: string;
  cta_target: string | null;
  external_url: string | null;
};

type CreativeRow = {
  id: string;
  campaign_id: string;
  status: string;
  aspect_w: number;
  aspect_h: number;
};

type SurfaceRow = {
  campaign_id: string;
  surface: string;
};

type SuppressionRow = {
  campaign_id: string;
  mode: string;
  session_key: string | null;
  suppress_until: string | null;
  campaign_revision: string | null;
  timezone: string | null;
  created_at: string;
};

export async function loadPlatformPopupCandidates(
  sb: SupabaseClient,
  input: {
    userId?: string | null;
    anonymousDeviceKey?: string | null;
  }
): Promise<PlatformPopupCandidate[]> {
  const { data: campaigns, error } = await sb
    .from("platform_popup_campaigns")
    .select(
      "id, status, approval_status, priority, start_at, end_at, timezone, cta_type, cta_target, external_url"
    )
    .in("status", ["scheduled", "active"])
    .eq("approval_status", "approved")
    .order("priority", { ascending: false });

  if (error || !campaigns?.length) return [];

  const ids = (campaigns as CampaignRow[]).map((c) => c.id);

  const [{ data: creatives }, { data: surfaces }, suppressions] = await Promise.all([
    sb
      .from("platform_popup_creatives")
      .select("id, campaign_id, status, aspect_w, aspect_h")
      .in("campaign_id", ids)
      .eq("status", "ready"),
    sb
      .from("platform_popup_campaign_surfaces")
      .select("campaign_id, surface")
      .in("campaign_id", ids),
    loadSuppressions(sb, ids, input),
  ]);

  const creativeByCampaign = new Map<string, CreativeRow>();
  for (const row of (creatives ?? []) as CreativeRow[]) {
    if (!creativeByCampaign.has(row.campaign_id)) creativeByCampaign.set(row.campaign_id, row);
  }

  const surfacesByCampaign = new Map<string, PlatformPopupTargetSurface[]>();
  for (const row of (surfaces ?? []) as SurfaceRow[]) {
    const list = surfacesByCampaign.get(row.campaign_id) ?? [];
    list.push(row.surface as PlatformPopupTargetSurface);
    surfacesByCampaign.set(row.campaign_id, list);
  }

  const suppressByCampaign = new Map<string, PlatformPopupSuppressionRecord[]>();
  for (const row of suppressions) {
    const list = suppressByCampaign.get(row.campaign_id) ?? [];
    list.push({
      mode: row.mode as PlatformPopupSuppressionMode,
      sessionKey: row.session_key,
      suppressUntil: row.suppress_until,
      campaignRevision: row.campaign_revision,
      timezone: row.timezone,
      createdAt: row.created_at,
    });
    suppressByCampaign.set(row.campaign_id, list);
  }

  return (campaigns as CampaignRow[]).map((c) => {
    const cr = creativeByCampaign.get(c.id) ?? null;
    return {
      id: c.id,
      status: c.status as PlatformPopupCampaignStatus,
      approvalStatus: c.approval_status as PlatformPopupApprovalStatus,
      priority: c.priority,
      startAt: c.start_at,
      endAt: c.end_at,
      timezone: c.timezone,
      surfaces: surfacesByCampaign.get(c.id) ?? [],
      creative: cr
        ? {
            id: cr.id,
            status: cr.status as "draft" | "ready" | "rejected",
            aspectW: cr.aspect_w,
            aspectH: cr.aspect_h,
          }
        : null,
      ctaType: c.cta_type as PlatformPopupCtaType,
      ctaTarget: c.cta_target,
      externalUrl: c.external_url,
      ctaLookup: { exists: true, visible: true, authorized: true },
      suppressions: suppressByCampaign.get(c.id) ?? [],
    };
  });
}

async function loadSuppressions(
  sb: SupabaseClient,
  campaignIds: string[],
  input: { userId?: string | null; anonymousDeviceKey?: string | null }
): Promise<SuppressionRow[]> {
  if (!campaignIds.length) return [];
  let q = sb
    .from("platform_popup_user_suppressions")
    .select(
      "campaign_id, mode, session_key, suppress_until, campaign_revision, timezone, created_at"
    )
    .in("campaign_id", campaignIds);

  if (input.userId) {
    q = q.eq("user_id", input.userId);
  } else if (input.anonymousDeviceKey) {
    q = q.eq("anonymous_device_key", input.anonymousDeviceKey);
  } else {
    return [];
  }

  const { data } = await q;
  return (data ?? []) as SuppressionRow[];
}
