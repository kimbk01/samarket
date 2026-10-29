import { NextResponse } from "next/server";
import { resolveStoreDetailViewerGate } from "@/lib/stores/delivery-viewer-gate";

/**
 * v4 API-14 — 매장 상세 계열 고객 API 의 비로그인 서버 게이트 응답 (묶음4 R-1 `menus` 와 같은 판정).
 * 401 = 클라 캐시(`store-delivery-api-client`)가 저장하지 않는다. 본문 필드는 빈 값으로만 채운다.
 */
export function storeDetailLoginRequiredResponse(emptyBody: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "login_required",
      ...emptyBody,
      meta: { viewer_gate: "login_required" as const },
    },
    { status: 401, headers: { "Cache-Control": "private, no-store" } }
  );
}

export function isStoreDetailViewerBlocked(viewerUserId: string | null | undefined): boolean {
  return resolveStoreDetailViewerGate(viewerUserId) !== "ok";
}
