import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { buildPlatformPopupPresentationWinner } from "@/lib/platform-popup/build-presentation-winner";
import { extractPlatformEventBenefitContent } from "@/lib/platform-popup/event-benefit-authority";
import { assertNotImpressionFromResolver } from "@/lib/platform-popup/events";
import { loadPlatformPopupCandidates } from "@/lib/platform-popup/load-popup-candidates";
import {
  isPlatformPopupAdvertisingSurface,
  resolveDibaySurface,
} from "@/lib/platform-popup/resolve-dibay-surface";
import { resolvePopupAd, type ResolvePopupAdWinner } from "@/lib/platform-popup/resolve-popup-ad";
import type { PlatformPopupPresentationWinner } from "@/lib/platform-popup/popup-presentation-types";
import { resolveFirstPresentablePopupCandidate } from "@/lib/platform-popup/resolve-first-presentable";
import { loadSessionCoordinatedEventIds } from "@/lib/platform-promotion-lifecycle/load-content-visits";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform-popup/resolve
 * Returns 0|1 winner + presentation payload. Must not emit impression.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const impressionGate = assertNotImpressionFromResolver("impression", "api_eligibility");
  if (impressionGate.ok) {
    // intentional no-op — prove API must never write impression
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, winner: null, reason: "service_unavailable" });
  }

  const url = new URL(req.url);
  const pathname = url.searchParams.get("pathname") ?? "/";
  const sessionKey = url.searchParams.get("sessionKey") ?? null;
  const anonymousDeviceKey = url.searchParams.get("deviceKey") ?? null;
  const generation = url.searchParams.get("generation") ?? null;
  /** 재감사 E-7: 이 앱 실행 동안 닫은·이동한 캠페인 — 후보에서 빼고 다음 순위를 고른다 (최대 50) */
  const exclude = new Set(
    String(url.searchParams.get("exclude") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 50)
  );

  const userId = await getOptionalAuthenticatedUserId();

  const surface = resolveDibaySurface(pathname);
  if (!isPlatformPopupAdvertisingSurface(surface)) {
    return NextResponse.json({
      ok: true,
      winner: null,
      reason: "surface_excluded",
      surface,
      generation,
      impression: false,
    });
  }

  const loadedCandidates = await loadPlatformPopupCandidates(sb, {
    userId,
    anonymousDeviceKey: userId ? null : anonymousDeviceKey,
  });
  const candidates = exclude.size ? loadedCandidates.filter((c) => !exclude.has(c.id)) : loadedCandidates;

  const coordinatedEventIds = await loadSessionCoordinatedEventIds(sb, {
    sessionKey,
    userId,
    anonymousDeviceKey: userId ? null : anonymousDeviceKey,
  });

  /**
   * 광고 최종 점검 P2: 1위가 표시 단계에서 무효(혜택 내용 없음·소재 주소 없음 등)면 그 캠페인만 빼고
   * 다음 순위를 고른다 — 예전에는 `winner: null` 로 끝나 같은 영역의 다른 팝업까지 나오지 않았다.
   */
  const now = new Date();
  const picked = await resolveFirstPresentablePopupCandidate<
    ResolvePopupAdWinner,
    PlatformPopupPresentationWinner
  >({
    candidates,
    select: (remaining) => {
      const result = resolvePopupAd({
        pathname,
        now,
        sessionKey,
        resolvedSurface: surface,
        candidates: remaining,
        coordinatedEventIds,
      });
      if (!result.ok) return { kind: "error", error: result.error };
      if (!result.winner) return { kind: "none", reason: result.reason ?? null };
      return { kind: "winner", campaignId: result.winner.campaignId, winner: result.winner };
    },
    present: async (winner, candidate) => {
      const creative = candidate.creative;
      if (!creative) return { ok: false, reason: "winner_creative_missing" };

      let eventBenefit = null;
      if (winner.presentationType === "benefit_dialog") {
        const eventId =
          candidate.ctaType === "event_detail" ? String(candidate.ctaTarget ?? "").trim() : "";
        if (!eventId) return { ok: false, reason: "benefit_content_required" };
        const { data: eventRow } = await sb
          .from("platform_events")
          .select("sections")
          .eq("id", eventId)
          .maybeSingle();
        eventBenefit = extractPlatformEventBenefitContent(eventRow?.sections ?? null);
        if (!eventBenefit) return { ok: false, reason: "benefit_content_required" };
      }

      const presentation = buildPlatformPopupPresentationWinner(
        winner,
        candidate,
        {
          assetUrl: creative.assetUrl ?? null,
          assetPath: creative.assetPath ?? null,
          altText: creative.altText ?? null,
        },
        {
          suppressionMode: candidate.suppressionMode,
          suppressionDurationSeconds: candidate.suppressionDurationSeconds,
          timezone: candidate.timezone,
          ctaLabel: candidate.ctaLabel ?? null,
          title: candidate.title ?? null,
          body: candidate.body ?? null,
          frequencyMode: candidate.frequencyMode,
        },
        eventBenefit
      );
      if (!presentation) return { ok: false, reason: "presentation_invalid" };
      return { ok: true, value: presentation };
    },
  });

  if (picked.kind === "error") {
    return NextResponse.json({ ok: false, error: picked.error, impression: false }, { status: 500 });
  }

  if (picked.kind === "none") {
    return NextResponse.json({
      ok: true,
      winner: null,
      reason: picked.reason,
      surface,
      generation,
      impression: false,
    });
  }

  const presentation = picked.value;

  return NextResponse.json({
    ok: true,
    winner: presentation,
    reason: null,
    surface,
    generation,
    impression: false,
  });
}
