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
  const data = await resolveHomePostsGetData(req);
  const userId = await getOptionalAuthenticatedUserId();
  return NextResponse.json(data, { headers: responseHeaders(Boolean(userId)) });
}
