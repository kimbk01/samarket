import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AckBody = {
  receivedAt?: number;
  deviceId?: string;
  screenInteractive?: boolean;
  keyguardLocked?: boolean;
  deviceIdleMode?: boolean;
  notificationPermission?: boolean;
  channelImportance?: number;
  fsiAllowed?: boolean;
  dozeDelayMs?: number;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const { sessionId } = await params;
  const callId = sessionId.trim();
  if (!callId) {
    return NextResponse.json({ ok: false, error: "missing_session_id" }, { status: 400 });
  }

  let body: AckBody = {};
  try {
    body = (await req.json()) as AckBody;
  } catch {
    body = {};
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }

  const { data: sessionRow } = await svc
    .from("community_messenger_call_sessions")
    .select("status, initiator_user_id, recipient_user_id")
    .eq("id", callId)
    .maybeSingle();
  const sessionStatus =
    sessionRow &&
    typeof sessionRow === "object" &&
    ((sessionRow as { initiator_user_id?: string | null }).initiator_user_id === auth.userId ||
      (sessionRow as { recipient_user_id?: string | null }).recipient_user_id === auth.userId)
      ? String((sessionRow as { status?: string | null }).status ?? "").trim() || null
      : null;

  const { data: latest, error: loadError } = await svc
    .from("notification_deliveries")
    .select("id, provider_response")
    .eq("user_id", auth.userId)
    .eq("target_type", "call_session")
    .eq("target_id", callId)
    .eq("event_type", "call_ringing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ ok: false, error: loadError.message }, { status: 500 });
  }

  if (!latest?.id) {
    console.warn("[DIBAY_CALL_PUSH] push_ack_without_delivery", { callId, userId: auth.userId });
    return NextResponse.json({ ok: true, matched: false, sessionStatus });
  }

  const existing =
    latest.provider_response && typeof latest.provider_response === "object"
      ? (latest.provider_response as Record<string, unknown>)
      : {};
  const ack = {
    receivedAt: typeof body.receivedAt === "number" ? body.receivedAt : Date.now(),
    deviceId: typeof body.deviceId === "string" ? body.deviceId : null,
    screenInteractive: Boolean(body.screenInteractive),
    keyguardLocked: Boolean(body.keyguardLocked),
    deviceIdleMode: Boolean(body.deviceIdleMode),
    notificationPermission: Boolean(body.notificationPermission),
    channelImportance: typeof body.channelImportance === "number" ? body.channelImportance : null,
    fsiAllowed: Boolean(body.fsiAllowed),
    dozeDelayMs: typeof body.dozeDelayMs === "number" ? body.dozeDelayMs : null,
  };

  const { error: updateError } = await svc
    .from("notification_deliveries")
    .update({
      provider_response: {
        ...existing,
        nativeAck: ack,
        nativeAckReceivedAt: new Date().toISOString(),
      },
    })
    .eq("id", latest.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matched: true, sessionStatus });
}
