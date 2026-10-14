import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { loadPlatformPopupCandidates } from "@/lib/platform-popup/load-popup-candidates";
import { buildPtrRevealAdPayload } from "@/lib/platform-popup/ptr-reveal-payload";
import {
  isPlatformPopupAdvertisingSurface,
  resolveDibaySurface,
} from "@/lib/platform-popup/resolve-dibay-surface";
import { selectPlatformPopupEligibleWinner } from "@/lib/platform-popup/resolve-popup-ad";
import { loadSessionCoordinatedEventIds } from "@/lib/platform-promotion-lifecycle/load-content-visits";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/platform-popup/ptr-reveal — 당겨서 새로고침 띠 광고 0|1.
 * 팝업 resolve 와 분리된 범위(`ptr_reveal`) — 팝업 캠페인을 반환하지 않는다. 노출(impression)을 기록하지 않는다.
 * 메신저·통화·결제·주문 핵심 화면은 표면 판정에서 제외(`resolveDibaySurface`).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, ad: null, reason: "service_unavailable" }, { headers: NO_STORE });
  }

  const url = new URL(req.url);
  const pathname = url.searchParams.get("pathname") ?? "/";
  const sessionKey = url.searchParams.get("sessionKey") ?? null;
  const anonymousDeviceKey = url.searchParams.get("deviceKey") ?? null;

  const surface = resolveDibaySurface(pathname);
  if (!isPlatformPopupAdvertisingSurface(surface)) {
    return NextResponse.json(
      { ok: true, ad: null, reason: "surface_excluded", surface, impression: false },
      { headers: NO_STORE }
    );
  }

  const userId = await getOptionalAuthenticatedUserId();
  const actor = { userId, anonymousDeviceKey: userId ? null : anonymousDeviceKey };

  const [candidates, coordinatedEventIds] = await Promise.all([
    loadPlatformPopupCandidates(sb, { ...actor, presentationScope: "ptr_reveal" }),
    loadSessionCoordinatedEventIds(sb, { sessionKey, ...actor }),
  ]);

  const selected = selectPlatformPopupEligibleWinner(
    {
      pathname,
      now: new Date(),
      sessionKey,
      resolvedSurface: surface,
      candidates,
      coordinatedEventIds,
    },
    "ptr_reveal"
  );

  if (!selected.winner) {
    return NextResponse.json(
      { ok: true, ad: null, reason: selected.reason, surface, impression: false },
      { headers: NO_STORE }
    );
  }

  const ad = buildPtrRevealAdPayload(selected.winner, {
    href: selected.href,
    surface: selected.surface,
  });
  return NextResponse.json(
    { ok: true, ad, reason: ad ? null : "ptr_band_missing", surface, impression: false },
    { headers: NO_STORE }
  );
}
