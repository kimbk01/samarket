import {
  AUTH_FAILURE_TELEMETRY_LOG_TAG,
  AUTH_FAILURE_TELEMETRY_MAX_BODY_BYTES,
  sanitizeAuthFailureTelemetryEvent,
} from "@/lib/telemetry/auth-failure-telemetry-contract";
import { persistAuthLoginFailure } from "@/lib/telemetry/auth-failure-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 로그인 실패·취소 수집 (docs/audit/auth-login-failure-server-record-design-2026-11-16.md).
 *
 * - 인증 0 (로그인 전 기록 · proxy 회원 게이트 제외 경로 `/api/telemetry/`).
 * - 계약 필드만 정규화해 Vercel 로그 1줄 `[dibay-auth-failure] {...}` + `public.auth_login_failures` 30일.
 *   IP·User-Agent·쿠키는 기록하지 않는다.
 * - 응답은 항상 204 — 송신 쪽(sendBeacon)은 응답을 보지 않고, 실패가 로그인 동작에 영향을 주지 않는다.
 */

function noContent(): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > AUTH_FAILURE_TELEMETRY_MAX_BODY_BYTES) return noContent();
    const text = await req.text();
    if (!text || text.length > AUTH_FAILURE_TELEMETRY_MAX_BODY_BYTES) return noContent();

    const event = sanitizeAuthFailureTelemetryEvent(JSON.parse(text));
    if (!event) return noContent();

    const meta = {
      deploymentId: (process.env.VERCEL_DEPLOYMENT_ID ?? "").trim() || null,
      serverSha: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null,
    };
    console.info(`${AUTH_FAILURE_TELEMETRY_LOG_TAG} ${JSON.stringify({ ...event, ...meta })}`);
    // 남용 제한 키 — 첫 번째 전달 IP. 메모리 키로만 쓰고 저장·로그하지 않는다.
    const clientKey = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
    await persistAuthLoginFailure(event, meta, Date.now(), clientKey);
  } catch {
    /* 잘못된 본문 — 기록하지 않음 */
  }
  return noContent();
}
