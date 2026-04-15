import { NextRequest, NextResponse } from "next/server";
import { resolveHomePostsGetData } from "@/lib/posts/home-posts-route-core";

export const dynamic = "force-dynamic";

function responseHeaders(authenticated: boolean): HeadersInit {
  return {
    "Cache-Control": authenticated
      ? "private, max-age=15, stale-while-revalidate=45"
      : "public, max-age=30, stale-while-revalidate=90",
    Vary: "Cookie",
  };
}

export async function GET(req: NextRequest) {
  const { getOptionalAuthenticatedUserId } = await import("@/lib/auth/api-session");
  /** 한 요청에서 favorites·Cache-Control 이 동일 세션을 쓰도록 선확정 — `resolveHomePostsGetData` 끝에서 세션을 다시 열지 않음 */
  const viewerUserId = await getOptionalAuthenticatedUserId();
  const data = await resolveHomePostsGetData(req, { precomputedViewerUserId: viewerUserId });
  return NextResponse.json(data, { headers: responseHeaders(Boolean(viewerUserId)) });
}
