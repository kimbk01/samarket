import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { buildPlatformPopupPresentationWinner } from "@/lib/platform-popup/build-presentation-winner";
import { assertNotImpressionFromResolver } from "@/lib/platform-popup/events";
import { loadPlatformPopupCandidates } from "@/lib/platform-popup/load-popup-candidates";
import {
  isPlatformPopupAdvertisingSurface,
  resolveDibaySurface,
} from "@/lib/platform-popup/resolve-dibay-surface";
import { resolvePopupAd } from "@/lib/platform-popup/resolve-popup-ad";
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

  const candidates = await loadPlatformPopupCandidates(sb, {
    userId,
    anonymousDeviceKey: userId ? null : anonymousDeviceKey,
  });

  const result = resolvePopupAd({
    pathname,
    now: new Date(),
    sessionKey,
    resolvedSurface: surface,
    candidates,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, impression: false }, { status: 500 });
  }

  if (!result.winner) {
    return NextResponse.json({
      ok: true,
      winner: null,
      reason: result.reason ?? null,
      surface,
      generation,
      impression: false,
    });
  }

  const candidate = candidates.find((c) => c.id === result.winner!.campaignId);
  if (!candidate?.creative) {
    return NextResponse.json({
      ok: true,
      winner: null,
      reason: "winner_creative_missing",
      surface,
      generation,
      impression: false,
    });
  }

  const creative = candidate.creative;
  const presentation = buildPlatformPopupPresentationWinner(
    result.winner,
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
      ctaLabel: null,
    }
  );

  if (!presentation) {
    return NextResponse.json({
      ok: true,
      winner: null,
      reason: "presentation_invalid",
      surface,
      generation,
      impression: false,
    });
  }

  return NextResponse.json({
    ok: true,
    winner: presentation,
    reason: result.reason ?? null,
    surface,
    generation,
    impression: false,
  });
}
