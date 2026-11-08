import {
  ENTRY_TELEMETRY_LOG_TAG,
  ENTRY_TELEMETRY_MAX_BODY_BYTES,
  sanitizeEntryTelemetryEvent,
} from "@/lib/telemetry/entry-telemetry-contract";
import { admitEntryTelemetryRun } from "@/lib/telemetry/entry-telemetry-run-limiter";
import { persistEntryFailureIfNeeded } from "@/lib/telemetry/entry-failure-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * C8 — 앱 진입·복귀 계측 수집 (docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4).
 *
 * - 인증 0 (proxy 회원 게이트 제외 경로: `isNonMemberMutationPath`).
 * - 모든 이벤트: 계약 필드만 정규화해 Vercel 로그 1줄 `[dibay-entry] {...}`. IP·User-Agent·쿠키는 기록하지 않는다.
 * - 실패·해제 없음·새로고침 회복 이벤트만 `public.app_entry_failures` 에 보존 (Pro 로그 보존 1일 대비, 30일 보존).
 * - 응답은 항상 204 — 송신 쪽(sendBeacon)은 응답을 보지 않고, 실패가 앱 동작에 영향을 주지 않는다.
 */

function noContent(): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > ENTRY_TELEMETRY_MAX_BODY_BYTES) return noContent();
    const text = await req.text();
    if (!text || text.length > ENTRY_TELEMETRY_MAX_BODY_BYTES) return noContent();

    const event = sanitizeEntryTelemetryEvent(JSON.parse(text));
    if (!event) return noContent();
    if (!admitEntryTelemetryRun(event.run)) return noContent();

    const meta = {
      deploymentId: (process.env.VERCEL_DEPLOYMENT_ID ?? "").trim() || null,
      serverSha: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null,
    };
    console.info(
      `${ENTRY_TELEMETRY_LOG_TAG} ${JSON.stringify({
        ...event,
        dpl: meta.deploymentId,
        serverSha: meta.serverSha,
        region: (process.env.VERCEL_REGION ?? "").trim() || null,
      })}`
    );
    // 남용 제한 키 — 첫 번째 전달 IP. 메모리 키로만 쓰고 저장·로그하지 않는다 (D2).
    const clientKey = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
    await persistEntryFailureIfNeeded(event, meta, Date.now(), clientKey);
  } catch {
    /* 잘못된 본문 — 기록하지 않음 */
  }
  return noContent();
}
