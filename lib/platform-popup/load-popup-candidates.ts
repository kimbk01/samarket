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
  suppression_mode: string | null;
  suppression_duration_seconds: number | null;
  presentation_type: string | null;
  frequency_mode: string | null;
  cta_label: string | null;
  title: string | null;
  body: string | null;
};

type CreativeRow = {
  id: string;
  campaign_id: string;
  status: string;
  aspect_w: number;
  aspect_h: number;
  asset_path: string;
  asset_url: string | null;
  alt_text: string | null;
  creative_mode: string | null;
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

type ImpressionRow = {
  campaign_id: string;
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
      "id, status, approval_status, priority, start_at, end_at, timezone, cta_type, cta_target, external_url, cta_label, title, body, suppression_mode, suppression_duration_seconds, presentation_type, frequency_mode"
    )
    .in("status", ["scheduled", "active"])
    .eq("approval_status", "approved")
    .order("priority", { ascending: false });

  if (error || !campaigns?.length) return [];

  const ids = (campaigns as CampaignRow[]).map((c) => c.id);

  const [{ data: creatives }, { data: surfaces }, suppressions, lastImpressions] =
    await Promise.all([
      sb
        .from("platform_popup_creatives")
        .select(
          "id, campaign_id, status, aspect_w, aspect_h, asset_path, asset_url, alt_text, creative_mode"
        )
        .in("campaign_id", ids)
        .eq("status", "ready"),
      sb
        .from("platform_popup_campaign_surfaces")
        .select("campaign_id, surface")
        .in("campaign_id", ids),
      loadSuppressions(sb, ids, input),
      loadLastImpressions(sb, ids, input),
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
      presentationType: c.presentation_type,
      frequencyMode: c.frequency_mode,
      creative: cr
        ? {
            id: cr.id,
            status: cr.status as "draft" | "ready" | "rejected",
            aspectW: cr.aspect_w,
            aspectH: cr.aspect_h,
            creativeMode: cr.creative_mode,
            assetPath: cr.asset_path,
            assetUrl: cr.asset_url,
            altText: cr.alt_text,
          }
        : null,
      ctaType: c.cta_type as PlatformPopupCtaType,
      ctaTarget: c.cta_target,
      externalUrl: c.external_url,
      ctaLabel: c.cta_label,
      title: c.title,
      body: c.body,
      suppressionMode: c.suppression_mode,
      suppressionDurationSeconds: c.suppression_duration_seconds,
      ctaLookup: { exists: true, visible: true, authorized: true },
      suppressions: suppressByCampaign.get(c.id) ?? [],
      lastImpressionAt: lastImpressions.get(c.id) ?? null,
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

/** Latest impression per campaign for this actor — rotation authority. */
async function loadLastImpressions(
  sb: SupabaseClient,
  campaignIds: string[],
  input: { userId?: string | null; anonymousDeviceKey?: string | null }
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!campaignIds.length) return out;
  if (!input.userId && !input.anonymousDeviceKey) return out;

  let q = sb
    .from("platform_popup_campaign_events")
    .select("campaign_id, created_at")
    .in("campaign_id", campaignIds)
    .eq("event_type", "impression")
    .order("created_at", { ascending: false })
    .limit(Math.min(campaignIds.length * 3, 200));

  if (input.userId) {
    q = q.eq("user_id", input.userId);
  } else if (input.anonymousDeviceKey) {
    q = q.eq("anonymous_device_key", input.anonymousDeviceKey);
  }

  const { data } = await q;
  for (const row of (data ?? []) as ImpressionRow[]) {
    if (!out.has(row.campaign_id)) out.set(row.campaign_id, row.created_at);
  }
  return out;
}
