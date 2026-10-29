/**
 * 피드 배너 수정 (감사 AD-10 · Owner J-8) — 기존 `feed_ad_campaigns` · `feed_ad_creatives` 원장을 그대로 고친다.
 * - 관리자 직접 등록(`ADMIN_DIRECT`): 이름 · 우선순위 · 기간 · 목적지 · 소재.
 * - 회원 신청(`MEMBER_REQUESTED`, 유료): 소재만. 기간은 보상 연장 경로(`adminCompensateExtendFeedAdCampaign`)로만 바꾼다.
 * - 종료(`ended`)된 캠페인은 고치지 않는다 (게시 이력 보존). `active` 라도 종료 시각이 지났으면 종료로 본다 (N-01).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeFeedAdDestination } from "@/lib/ads/feed-ad-destination";
import type { FeedAdCampaignView, FeedAdDestinationType } from "@/lib/ads/feed-ad-placement";
import { feedAdCampaignEndedByWindow } from "@/lib/ads/feed-ad-pool-capacity";

export type FeedAdCampaignPatchInput = {
  name?: string;
  priority?: number;
  startAt?: string | null;
  endAt?: string | null;
  destinationType?: FeedAdDestinationType | "none";
  destinationId?: string;
  destinationUrl?: string;
  slides?: Array<{ sortOrder: number; imageUrl?: string; altText?: string; headline?: string }>;
};

export type FeedAdCampaignPatchPlan =
  | { ok: false; error: string; status: number }
  | {
      ok: true;
      campaign: Record<string, unknown>;
      slides: Array<{ sort_order: number; image_url: string; alt_text: string; headline: string; is_active: boolean }>;
    };

const CAMPAIGN_FIELDS = ["name", "priority", "startAt", "endAt", "destinationType", "destinationId", "destinationUrl"] as const;

/** 수정 가능 범위·값 검증 (DB 없이) — 테스트 대상 */
export function planFeedAdCampaignPatch(
  before: Pick<FeedAdCampaignView, "status" | "source"> & { endAt?: string | null },
  input: FeedAdCampaignPatchInput,
  nowMs: number = Date.now()
): FeedAdCampaignPatchPlan {
  if (before.status === "ended") return { ok: false, error: "campaign_ended", status: 409 };
  // N-01/E-11 — `active` 인데 종료 시각이 이미 지난 캠페인은 종료로 본다 (화면 「종료」와 같은 규칙 · DB 상태는 고치지 않음).
  if (before.status === "active" && feedAdCampaignEndedByWindow(before.endAt, nowMs)) {
    return { ok: false, error: "campaign_ended", status: 409 };
  }
  const touchesCampaign = CAMPAIGN_FIELDS.some((k) => input[k] !== undefined);
  if (before.source === "MEMBER_REQUESTED" && touchesCampaign) {
    return { ok: false, error: "member_requested_creative_only", status: 400 };
  }

  const campaign: Record<string, unknown> = {};
  if (input.name !== undefined) campaign.name = input.name.trim() || "Untitled";
  if (input.priority !== undefined) {
    if (!Number.isFinite(input.priority)) return { ok: false, error: "invalid_priority", status: 400 };
    campaign.priority = Math.trunc(input.priority);
  }
  if (input.startAt !== undefined) campaign.start_at = input.startAt || null;
  if (input.endAt !== undefined) campaign.end_at = input.endAt || null;
  const startMs = typeof campaign.start_at === "string" ? Date.parse(campaign.start_at) : NaN;
  const endMs = typeof campaign.end_at === "string" ? Date.parse(campaign.end_at) : NaN;
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs) {
    return { ok: false, error: "invalid_period", status: 400 };
  }
  if (input.destinationType !== undefined || input.destinationId !== undefined || input.destinationUrl !== undefined) {
    const destEmpty =
      !String(input.destinationId ?? "").trim() &&
      !String(input.destinationUrl ?? "").trim() &&
      (!input.destinationType || input.destinationType === "internal_page" || input.destinationType === "none");
    const dest = normalizeFeedAdDestination({
      destinationType: destEmpty ? "none" : (input.destinationType ?? "internal_page"),
      destinationId: input.destinationId,
      destinationUrl: input.destinationUrl,
    });
    if (!dest.ok) return { ok: false, error: dest.error, status: 400 };
    campaign.destination_type = dest.value.destinationType;
    campaign.destination_id = dest.value.destinationId;
    campaign.destination_url = dest.value.destinationUrl;
  }

  const slides = (input.slides ?? [])
    .filter((s) => Number.isFinite(s.sortOrder) && s.sortOrder >= 1 && s.sortOrder <= 3)
    .map((s) => ({
      sort_order: Math.trunc(s.sortOrder),
      image_url: (s.imageUrl ?? "").trim(),
      alt_text: (s.altText ?? "").trim(),
      headline: (s.headline ?? "").trim(),
      is_active: Boolean((s.imageUrl ?? "").trim()),
    }));
  return { ok: true, campaign, slides };
}

/** 계획 적용 — 캠페인은 상태가 그대로일 때만(동시 종료 방지), 소재는 sort_order 단위로 갱신·추가 (행 삭제 없음) */
export async function applyFeedAdCampaignPatch(
  sb: SupabaseClient,
  campaignId: string,
  beforeStatus: string,
  plan: Extract<FeedAdCampaignPatchPlan, { ok: true }>
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await sb
    .from("feed_ad_campaigns")
    .update({ ...plan.campaign, updated_at: nowIso })
    .eq("id", campaignId)
    .eq("status", beforeStatus)
    .select("id");
  if (error) return { ok: false, error: error.message, status: 500 };
  if ((updated ?? []).length === 0) return { ok: false, error: "status_changed", status: 409 };

  if (plan.slides.length === 0) return { ok: true };
  const { data: existing, error: exErr } = await sb
    .from("feed_ad_creatives")
    .select("id, sort_order")
    .eq("campaign_id", campaignId);
  if (exErr) return { ok: false, error: exErr.message, status: 500 };
  const bySort = new Map((existing ?? []).map((r) => [Number((r as { sort_order?: number }).sort_order), String((r as { id?: string }).id)]));
  for (const s of plan.slides) {
    const id = bySort.get(s.sort_order);
    if (id) {
      const { error: uErr } = await sb.from("feed_ad_creatives").update({ ...s, updated_at: nowIso }).eq("id", id);
      if (uErr) return { ok: false, error: uErr.message, status: 500 };
    } else if (s.image_url) {
      const { error: iErr } = await sb.from("feed_ad_creatives").insert({ ...s, campaign_id: campaignId });
      if (iErr) return { ok: false, error: iErr.message, status: 500 };
    }
  }
  return { ok: true };
}
