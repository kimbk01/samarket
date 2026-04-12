import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { ingestClientMessengerEvents } from "@/lib/community-messenger/monitoring/server-store";
import type { MessengerMonitoringEvent } from "@/lib/community-messenger/monitoring/types";

const MAX_BATCH = 64;

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:monitoring-events:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "모니터링 전송이 너무 빠릅니다.",
    code: "community_messenger_monitoring_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const raw = body as { events?: unknown };
  if (!Array.isArray(raw.events)) {
    return NextResponse.json({ ok: false, error: "events_required" }, { status: 400 });
  }
  const events = raw.events.slice(0, MAX_BATCH).filter(isClientEvent) as MessengerMonitoringEvent[];
  ingestClientMessengerEvents(events);
  return NextResponse.json({ ok: true, accepted: events.length });
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
