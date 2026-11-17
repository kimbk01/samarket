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
import { loadPlatformPopupEntryPolicyCached } from "@/lib/platform-popup/entry-policy-server";
import {
  loadPlatformPopupExpiringCoupons,
  loadPlatformPopupListStores,
} from "@/lib/platform-popup/entry-queue-enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PV-5: 보는 사람마다 다른 결과(숨김·회원) — 공유 캐시·브라우저 캐시 금지 */
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

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
    return NextResponse.json({ ok: true, winner: null, reason: "service_unavailable" }, { headers: NO_STORE });
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
    }, { headers: NO_STORE });
  }

  /**
   * 진입 감사 PO-8·PO-4 (2026-11-17): 어드민 전체 스위치 — 꺼짐이면 0, 가로 화면 금지면 가로 요청에 0.
   * 재감사: 후보를 읽기 전에 판단(꺼짐·가로 금지에 후보 조회 0회).
   */
  const policy = await loadPlatformPopupEntryPolicyCached();
  if (!policy.enabled || (url.searchParams.get("landscape") === "1" && !policy.allowLandscape)) {
    return NextResponse.json(
      {
        ok: true,
        winner: null,
        queue: [],
        reason: policy.enabled ? "policy_landscape_off" : "policy_disabled",
        surface,
        generation,
        impression: false,
      },
      { headers: NO_STORE }
    );
  }

  const loadedCandidates = await loadPlatformPopupCandidates(sb, {
    userId,
    anonymousDeviceKey: userId ? null : anonymousDeviceKey,
    sessionKey,
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
  const pickNext = (remainingCandidates: typeof candidates) =>
    resolveFirstPresentablePopupCandidate<ResolvePopupAdWinner, PlatformPopupPresentationWinner>({
      candidates: remainingCandidates,
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

        // 진입 감사 PO-3: 목록 시트·쿠폰 카드는 실제 데이터를 채우고, 비면 이 팝업을 빼고 다음 순위로
        if (winner.presentationType === "list_sheet") {
          const listStores = await loadPlatformPopupListStores(sb, candidate.listStoreIds ?? null);
          if (!listStores.length) return { ok: false, reason: "list_stores_empty" };
          return { ok: true, value: { ...presentation, listStores, listEndsAt: candidate.endAt ? new Date(candidate.endAt).toISOString() : null } };
        }
        if (winner.presentationType === "coupon_card") {
          const coupons = await loadPlatformPopupExpiringCoupons(sb, userId, now);
          if (!coupons.length) return { ok: false, reason: "coupons_empty" };
          return { ok: true, value: { ...presentation, coupons } };
        }
        return { ok: true, value: presentation };
      },
    });

  /** 진입 감사 PO-2: 한 번 진입에 순서대로 보일 팝업 목록(최대 `policy.maxPerEntry`) — 필수가 먼저 */
  const queue: PlatformPopupPresentationWinner[] = [];
  let remainingCandidates = candidates;
  let lastReason: string | null = null;
  for (let i = 0; i < policy.maxPerEntry; i++) {
    const picked = await pickNext(remainingCandidates);
    if (picked.kind === "error") {
      if (queue.length === 0) {
        return NextResponse.json(
          { ok: false, error: picked.error, impression: false },
          { status: 500, headers: NO_STORE }
        );
      }
      break;
    }
    if (picked.kind === "none") {
      lastReason = picked.reason;
      break;
    }
    queue.push(picked.value);
    const takenId = picked.value.campaignId;
    // 재감사: 이번 고르기에서 건너뛴 후보(목록·쿠폰 비었음 등)는 다음 칸에서 다시 검사하지 않는다(조회 반복 제거)
    const dropped = new Set([takenId, ...picked.skippedCampaignIds]);
    remainingCandidates = remainingCandidates.filter((c) => !dropped.has(c.id));
  }

  if (queue.length === 0) {
    return NextResponse.json({
      ok: true,
      winner: null,
      queue: [],
      reason: lastReason,
      surface,
      generation,
      impression: false,
    }, { headers: NO_STORE });
  }

  return NextResponse.json({
    ok: true,
    /** 이전 앱 번들 호환 — 대기열 첫 번째 */
    winner: queue[0],
    queue,
    // 재감사: 앱이 화면을 가로로 돌렸을 때도 같은 설정을 쓴다
    allowLandscape: policy.allowLandscape,
    reason: null,
    surface,
    generation,
    impression: false,
  }, { headers: NO_STORE });
}
