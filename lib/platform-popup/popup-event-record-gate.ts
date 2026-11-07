/**
 * D-12 (재감사 3차 2026-11-07): 팝업·PTR 기록 API 는 노출될 수 있는 캠페인의 기록만 저장한다.
 * - 상태: active · scheduled · paused(정지 직후 늦게 도착한 기록 허용)
 * - PTR(`ptr_reveal`) 은 허용 목록(`audience_mode = allowlist`)에 그 회원이 있어야 한다 — 노출 판정(`resolve-popup-ad`)과 같은 함수
 * 아니면 API 는 200 + 저장 안 함(`skipped`) — 앱 화면에 영향이 없게 한다.
 */
import { isPlatformPopupPtrRevealPresentation } from "@/lib/platform-popup/presentation-contract";
import { isPtrRevealAudienceAllowed } from "@/lib/platform-popup/ptr-reveal-audience";

export const PLATFORM_POPUP_EVENT_RECORDABLE_STATUSES: ReadonlySet<string> = new Set(["active", "scheduled", "paused"]);

export type PlatformPopupEventGateCampaign = {
  status?: string | null;
  presentation_type?: string | null;
  audience_mode?: string | null;
  audience_user_ids?: string[] | null;
};

export type PlatformPopupEventGateResult =
  | { ok: true }
  | { ok: false; reason: "campaign_not_found" | "campaign_not_live" | "ptr_audience_excluded" };

export function decidePlatformPopupEventRecordable(
  campaign: PlatformPopupEventGateCampaign | null | undefined,
  viewerUserId: string | null
): PlatformPopupEventGateResult {
  if (!campaign) return { ok: false, reason: "campaign_not_found" };
  const status = String(campaign.status ?? "").trim().toLowerCase();
  if (!PLATFORM_POPUP_EVENT_RECORDABLE_STATUSES.has(status)) return { ok: false, reason: "campaign_not_live" };
  if (
    isPlatformPopupPtrRevealPresentation(campaign.presentation_type) &&
    !isPtrRevealAudienceAllowed({
      audienceMode: campaign.audience_mode,
      audienceUserIds: campaign.audience_user_ids,
      viewerUserId,
    })
  ) {
    return { ok: false, reason: "ptr_audience_excluded" };
  }
  return { ok: true };
}
