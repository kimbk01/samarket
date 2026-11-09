import { NextResponse } from "next/server";
import { loadDeliveryLaunchSettingsCached } from "@/lib/delivery/launch/delivery-launch-settings.server";
import { toDeliveryLaunchPublicState } from "@/lib/delivery/launch/delivery-launch-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 배달 오픈 상태 공개 조회 (인증 불필요) — 정식 운영 / 매장 모집, 모집 배너·팝업 문구·이미지, 무료 진행 여부.
 * 서버 60초 캐시(어드민 저장 시 태그 무효화). 전환이 바로 보이도록 HTTP 공개 캐시는 쓰지 않는다.
 */
export async function GET() {
  const settings = await loadDeliveryLaunchSettingsCached();
  return NextResponse.json(
    { ok: true as const, state: toDeliveryLaunchPublicState(settings) },
    { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
  );
}
