import { after, NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, jsonErrorWithRequest, jsonOkWithRequest } from "@/lib/http/api-route";
import type { MessengerMonitoringEvent } from "@/lib/community-messenger/monitoring/types";
import {
  buildMonitoringRollupRows,
  normalizeMonitoringRollupPlatform,
  type MonitoringRollupDroppedInput,
  type MonitoringRollupRow,
} from "@/lib/community-messenger/monitoring/monitoring-rollup";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 64;
const MAX_DROPPED_ROWS = 65;

/**
 * U1 (Owner 「U1 승인」 2026-11-08): 클라이언트는 탭당 5분 1회 + 페이지 이탈 1회만 보낸다.
 * 사용자당 5분 12회 = 여러 탭·기기 여유. 이전 상한(분당 60회)은 2026-11-08 폭주(분당 약 225회)를 막지 못했다.
 */
const RATE_LIMIT = { limit: 12, windowMs: 5 * 60_000 } as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:monitoring-events:${getRateLimitKey(req, auth.userId)}`,
    limit: RATE_LIMIT.limit,
    windowMs: RATE_LIMIT.windowMs,
    message: "모니터링 전송이 너무 빠릅니다.",
    code: "community_messenger_monitoring_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErrorWithRequest(req, "invalid_json", 400);
  }
  const raw = body as { events?: unknown; dropped?: unknown; platform?: unknown };
  if (!Array.isArray(raw.events)) {
    return jsonErrorWithRequest(req, "events_required", 400);
  }
  const events = raw.events.slice(0, MAX_BATCH).filter(isClientEvent) as MessengerMonitoringEvent[];
  const dropped = Array.isArray(raw.dropped)
    ? (raw.dropped.slice(0, MAX_DROPPED_ROWS) as MonitoringRollupDroppedInput[])
    : [];

  // 관리자 메신저 성능 화면(인스턴스 메모리 표본) — 기존 동작 그대로
  const { ingestClientMessengerEvents } = await import("@/lib/community-messenger/monitoring/server-store-record");
  ingestClientMessengerEvents(events);

  // DB 시간 단위 집계 — 응답 뒤에 1회. 실패해도 응답·메신저 기능에 영향 없음.
  const rows = buildMonitoringRollupRows(events, dropped);
  if (rows.length > 0) {
    const platform = normalizeMonitoringRollupPlatform(raw.platform);
    after(() => persistMonitoringRollup(platform, rows));
  }
  return jsonOkWithRequest(req, { accepted: events.length });
}

async function persistMonitoringRollup(platform: string, rows: MonitoringRollupRow[]): Promise<void> {
  try {
    const sb = resolveServiceSupabaseForApi();
    if (!sb) return;
    const { error } = await sb.rpc("cm_monitoring_rollup_add", { p_platform: platform, p_rows: rows });
    if (error) {
      console.warn("[cm-monitoring-rollup] rpc_failed", { code: error.code ?? null, message: error.message });
    }
  } catch (e) {
    console.warn("[cm-monitoring-rollup] rpc_threw", { message: e instanceof Error ? e.message : String(e) });
  }
}

function isClientEvent(x: unknown): x is MessengerMonitoringEvent {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.ts === "number" &&
    typeof o.category === "string" &&
    typeof o.metric === "string" &&
    o.source === "client"
  );
}
