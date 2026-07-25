import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { markMissedCallsRead } from "@/lib/notifications/pipeline/notify-read-service";
import {
  domainBadgeReadMutationAckFields,
  issueDomainBadgeAuthorityForAck,
} from "@/lib/notifications/pipeline/domain-badge-read-ack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let body: { roomId?: string; callSessionId?: string; scope?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const scope = String(body.scope ?? "").trim();
  if (scope === "call_logs") {
    const cleared = await markMissedCallsRead(sb, userId, { scope: "call_logs" });
    const domain = await issueDomainBadgeAuthorityForAck(sb, userId);
    return NextResponse.json({
      ok: true,
      cleared,
      ...domainBadgeReadMutationAckFields(domain),
    });
  }

  const roomId = String(body.roomId ?? "").trim();
  const callSessionId = String(body.callSessionId ?? "").trim();
  if (!roomId && !callSessionId) {
    return NextResponse.json({ ok: false, error: "room_or_call_required" }, { status: 400 });
  }

  const cleared = await markMissedCallsRead(sb, userId, {
    roomId: roomId || undefined,
    callSessionId: callSessionId || undefined,
  });
  /** P3-a: Generation Owner — one Domain rebuild on ACK. */
  const domain = await issueDomainBadgeAuthorityForAck(sb, userId);
  return NextResponse.json({
    ok: true,
    cleared,
    ...domainBadgeReadMutationAckFields(domain),
  });
}
