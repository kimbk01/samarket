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
  /**
   * R4 (2026-11-09): 수신 화면 표시 결과. 없으면 "received"(기존 수신 확인 — 구 앱 호환).
   * presented = 벨·수신 화면을 띄움 / suppressed = 띄우지 않고 끝냄(+reason).
   */
  stage?: string;
  reason?: string;
  platform?: string;
  /** 실제 수신 채널(통화 종류별) 중요도 — 기존 channelImportance 는 쓰지 않는 예전 채널 값 */
  mediaChannelImportance?: number;
  surface?: string;
};

const PRESENTATION_STAGES = new Set(["presented", "suppressed"]);

function trimmedField(raw: unknown, max = 80): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v ? v.slice(0, max) : null;
}

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

  /**
   * R3 (2026-11-09): 수신 확인은 **보낸 기기의 발송 행**에 기록한다.
   * 이전에는 사용자의 가장 최근 발송 행 1개에 기록해, 기기 2대 이상이면 다른 기기 행을 덮어썼다(운영 30일 22건).
   * 요청 `deviceId` = `user_devices.device_id` (한 기기에 행 여러 개 가능) → 그 행들의 발송 중 최신.
   * 일치 행이 없을 때만 기존 방식(최근 발송 행) + `deviceMatched: false` 기록.
   */
  const ackDeviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  let deviceRowIds: string[] = [];
  if (ackDeviceId) {
    const { data: deviceRows, error: deviceError } = await svc
      .from("user_devices")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("device_id", ackDeviceId);
    if (deviceError) {
      return NextResponse.json({ ok: false, error: deviceError.message }, { status: 500 });
    }
    deviceRowIds = ((deviceRows ?? []) as Array<{ id?: string | null }>)
      .map((r) => (typeof r.id === "string" ? r.id : ""))
      .filter(Boolean);
  }

  const loadLatestRinging = async (rowIds: string[] | null) => {
    let q = svc
      .from("notification_deliveries")
      .select("id, provider_response")
      .eq("user_id", auth.userId)
      .eq("target_type", "call_session")
      .eq("target_id", callId)
      .eq("event_type", "call_ringing");
    if (rowIds) q = q.in("device_id", rowIds);
    return q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  };

  let deviceMatched = false;
  let latest: { id?: string | null; provider_response?: unknown } | null = null;
  if (deviceRowIds.length > 0) {
    const byDevice = await loadLatestRinging(deviceRowIds);
    if (byDevice.error) {
      return NextResponse.json({ ok: false, error: byDevice.error.message }, { status: 500 });
    }
    if (byDevice.data?.id) {
      latest = byDevice.data;
      deviceMatched = true;
    }
  }
  if (!latest) {
    const anyRow = await loadLatestRinging(null);
    if (anyRow.error) {
      return NextResponse.json({ ok: false, error: anyRow.error.message }, { status: 500 });
    }
    latest = anyRow.data ?? null;
  }

  if (!latest?.id) {
    console.warn("[DIBAY_CALL_PUSH] push_ack_without_delivery", { callId, userId: auth.userId });
    return NextResponse.json({ ok: true, matched: false, sessionStatus });
  }

  const existing =
    latest.provider_response && typeof latest.provider_response === "object"
      ? (latest.provider_response as Record<string, unknown>)
      : {};

  const stage = trimmedField(body.stage, 20);
  if (stage && PRESENTATION_STAGES.has(stage)) {
    /** 표시 결과는 nativePresentation 에만 — 기존 수신 확인(nativeAck) 값은 건드리지 않는다. */
    const presentation = {
      stage,
      reason: trimmedField(body.reason),
      surface: trimmedField(body.surface, 40),
      platform: trimmedField(body.platform, 20),
      deviceId: typeof body.deviceId === "string" ? body.deviceId : null,
      deviceMatched,
      receivedAt: typeof body.receivedAt === "number" ? body.receivedAt : null,
      screenInteractive: typeof body.screenInteractive === "boolean" ? body.screenInteractive : null,
      keyguardLocked: typeof body.keyguardLocked === "boolean" ? body.keyguardLocked : null,
      mediaChannelImportance:
        typeof body.mediaChannelImportance === "number" ? body.mediaChannelImportance : null,
      at: new Date().toISOString(),
    };
    const { error: presentationError } = await svc
      .from("notification_deliveries")
      .update({ provider_response: { ...existing, nativePresentation: presentation } })
      .eq("id", latest.id);
    if (presentationError) {
      return NextResponse.json({ ok: false, error: presentationError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, matched: true, sessionStatus });
  }

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
    mediaChannelImportance:
      typeof body.mediaChannelImportance === "number" ? body.mediaChannelImportance : null,
  };

  const { error: updateError } = await svc
    .from("notification_deliveries")
    .update({
      provider_response: {
        ...existing,
        nativeAck: { ...ack, deviceMatched },
        nativeAckReceivedAt: new Date().toISOString(),
      },
    })
    .eq("id", latest.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matched: true, sessionStatus });
}
