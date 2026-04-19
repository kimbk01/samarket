import { NextRequest } from "next/server";
import {
  resolveHomePostsGetData,
  type ResolveHomePostsServerDiagnostics,
} from "@/lib/posts/home-posts-route-core";
import { getOrCreateRequestId, jsonWithRequestIdHeader } from "@/lib/http/api-route";
import { SAMARKET_REQUEST_ID_HEADER } from "@/lib/http/request-id";

export const runtime = "nodejs";
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
  const homeDiag = req.nextUrl.searchParams.get("home_diag") === "1";
  const diagnostics: ResolveHomePostsServerDiagnostics | undefined = homeDiag
    ? {
        startedAt: 0,
        resolveHomePostsStartMs: 0,
        dbQueryStartMs: 0,
        dbQueryEndMs: 0,
        relatedFetchStartMs: 0,
        relatedFetchEndMs: 0,
        transformStartMs: 0,
        transformEndMs: 0,
        serializeStartMs: 0,
        serializeEndMs: 0,
        responseStartMs: 0,
        responseEndMs: 0,
      }
    : undefined;
  const data = await resolveHomePostsGetData(req, {
    precomputedViewerUserId: viewerUserId,
    diagnostics,
  });
  if (homeDiag && diagnostics) {
    const relMs = () =>
      Math.max(
        0,
        Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - diagnostics.startedAt)
      );
    diagnostics.serializeStartMs = relMs();
    const body = JSON.stringify(data);
    diagnostics.serializeEndMs = relMs();
    diagnostics.responseStartMs = relMs();
    const headers = new Headers(responseHeaders(Boolean(viewerUserId)));
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set(SAMARKET_REQUEST_ID_HEADER, getOrCreateRequestId(req));
    headers.set("x-samarket-resolve-home-posts-start-ms", String(diagnostics.resolveHomePostsStartMs));
    headers.set("x-samarket-db-query-start-ms", String(diagnostics.dbQueryStartMs));
    headers.set("x-samarket-db-query-end-ms", String(diagnostics.dbQueryEndMs));
    headers.set("x-samarket-related-fetch-start-ms", String(diagnostics.relatedFetchStartMs));
    headers.set("x-samarket-related-fetch-end-ms", String(diagnostics.relatedFetchEndMs));
    headers.set("x-samarket-transform-start-ms", String(diagnostics.transformStartMs));
    headers.set("x-samarket-transform-end-ms", String(diagnostics.transformEndMs));
    headers.set("x-samarket-serialize-start-ms", String(diagnostics.serializeStartMs));
    headers.set("x-samarket-serialize-end-ms", String(diagnostics.serializeEndMs));
    headers.set("x-samarket-response-start-ms", String(diagnostics.responseStartMs));
    diagnostics.responseEndMs = relMs();
    headers.set("x-samarket-response-end-ms", String(diagnostics.responseEndMs));
    return new Response(body, { status: 200, headers });
  }
  return jsonWithRequestIdHeader(req, data, { headers: responseHeaders(Boolean(viewerUserId)) });
}
