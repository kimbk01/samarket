import { NextResponse } from "next/server";
import { loadDeliveryLaunchSettingsCached } from "@/lib/delivery/launch/delivery-launch-settings.server";
import { toDeliveryLaunchPublicState } from "@/lib/delivery/launch/delivery-launch-contract";
import { isDeliveryLaunchViewerBypass } from "@/lib/delivery/launch/delivery-launch-settings.server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 배달 오픈 상태 공개 조회 (인증 불필요) — 정식 운영 / 매장 모집, 모집 배너 문구·이미지, 무료 진행 여부.
 * 서버 60초 캐시(어드민 저장 시 태그 무효화). 전환이 바로 보이도록 HTTP 공개 캐시는 쓰지 않는다.
 * `viewerBypass` = 어드민이 지정한 매장 확인 허용 계정(매장 모집 중에만 판정).
 */
export async function GET() {
  const [settings, viewerId] = await Promise.all([loadDeliveryLaunchSettingsCached(), getRouteUserId()]);
  const state = toDeliveryLaunchPublicState(settings);
  // 매장 확인 허용 계정 판정은 매장 모집 중일 때만 (보는 사람 전용 응답 — 공용 캐시 금지)
  if (state.mode === "recruiting" && viewerId) {
    const sb = tryGetSupabaseForStores();
    if (sb) state.viewerBypass = await isDeliveryLaunchViewerBypass(sb, viewerId);
  }
  return NextResponse.json(
    { ok: true as const, state },
    { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
  );
}
