import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { loadPlatformPopupCandidates } from "@/lib/platform-popup/load-popup-candidates";
import { buildPtrRevealAdPayload, type PtrRevealAd } from "@/lib/platform-popup/ptr-reveal-payload";
import {
  isPlatformPopupAdvertisingSurface,
  resolveDibaySurface,
} from "@/lib/platform-popup/resolve-dibay-surface";
import { resolveFirstPresentablePopupCandidate } from "@/lib/platform-popup/resolve-first-presentable";
import {
  selectPlatformPopupEligibleWinner,
  type PlatformPopupCandidate,
  type PlatformPopupEligibleSelection,
} from "@/lib/platform-popup/resolve-popup-ad";
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
  /**
   * 팝업 재감사 E-7 과 같은 장치: 앱이 이 실행 동안 보류 중인 띠 캠페인(같은 화면 close_only 재노출 보류·
   * 숨김 기록 실패) — 후보에서 빼고 다음 순위를 고른다 (최대 50). 예전에는 보류된 1위가 계속 내려와
   * 앱이 버리면서 다른 띠까지 나오지 않았다.
   */
  const exclude = new Set(
    String(url.searchParams.get("exclude") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 50)
  );

  const surface = resolveDibaySurface(pathname);
  if (!isPlatformPopupAdvertisingSurface(surface)) {
    return NextResponse.json(
      { ok: true, ad: null, reason: "surface_excluded", surface, impression: false },
      { headers: NO_STORE }
    );
  }

  const userId = await getOptionalAuthenticatedUserId();
  const actor = { userId, anonymousDeviceKey: userId ? null : anonymousDeviceKey };

  const [loadedCandidates, coordinatedEventIds] = await Promise.all([
    loadPlatformPopupCandidates(sb, { ...actor, sessionKey, presentationScope: "ptr_reveal" }),
    loadSessionCoordinatedEventIds(sb, { sessionKey, ...actor }),
  ]);
  const candidates = exclude.size ? loadedCandidates.filter((c) => !exclude.has(c.id)) : loadedCandidates;

  // 1위 띠 페이로드가 무효(휴대폰 띠 없음 등)면 그 캠페인만 빼고 다음 순위 (팝업 resolve 와 같은 루프)
  const now = new Date();
  const picked = await resolveFirstPresentablePopupCandidate<
    Extract<PlatformPopupEligibleSelection, { winner: PlatformPopupCandidate }>,
    PtrRevealAd
  >({
    candidates,
    select: (remaining) => {
      const selected = selectPlatformPopupEligibleWinner(
        {
          pathname,
          now,
          sessionKey,
          resolvedSurface: surface,
          candidates: remaining,
          coordinatedEventIds,
          viewerUserId: userId,
        },
        "ptr_reveal"
      );
      if (!selected.winner) return { kind: "none", reason: selected.reason };
      return { kind: "winner", campaignId: selected.winner.id, winner: selected };
    },
    present: async (selected, candidate) => {
      const ad = buildPtrRevealAdPayload(candidate, { href: selected.href, surface: selected.surface });
      return ad ? { ok: true, value: ad } : { ok: false, reason: "ptr_band_missing" };
    },
  });

  if (picked.kind !== "presented") {
    return NextResponse.json(
      { ok: true, ad: null, reason: picked.kind === "none" ? picked.reason : picked.error, surface, impression: false },
      { headers: NO_STORE }
    );
  }

  return NextResponse.json(
    { ok: true, ad: picked.value, reason: null, surface, impression: false },
    { headers: NO_STORE }
  );
}
