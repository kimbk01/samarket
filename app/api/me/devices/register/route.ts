import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, parseJsonBody } from "@/lib/http/api-route";
import { shouldActivateFcmDeviceRegister } from "@/lib/push/device-register/should-activate-fcm-device-register";
import { resolvePushEnvironment } from "@/lib/push/push-environment";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DEVICES_PER_USER = 20;
const MAX_TOKEN_LEN = 4096;
const MAX_DEVICE_ID_LEN = 128;

const PLATFORM_SET = new Set(["android", "ios", "web"]);
const PROVIDER_SET = new Set(["fcm", "apns", "voip_apns", "web_push"]);

type RegisterBody = {
  user_id?: unknown;
  platform?: unknown;
  device_id?: unknown;
  push_token?: unknown;
  push_provider?: unknown;
  app_version?: unknown;
};

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `me:devices:register:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "기기 등록 요청이 너무 빠릅니다.",
    code: "device_register_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<RegisterBody>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const bodyUserId =
    typeof body.user_id === "string" && body.user_id.trim() ? body.user_id.trim() : "";
  if (bodyUserId && bodyUserId !== auth.userId) {
    console.warn("[devices/register] user_id_mismatch", { bodyUserId, authUserId: auth.userId });
    return NextResponse.json({ ok: false, error: "user_id_mismatch" }, { status: 403 });
  }

  const platformRaw = typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "";
  const platform = PLATFORM_SET.has(platformRaw) ? platformRaw : "web";
  const deviceId =
    typeof body.device_id === "string" && body.device_id.trim()
      ? body.device_id.trim().slice(0, MAX_DEVICE_ID_LEN)
      : "";
  const pushToken =
    typeof body.push_token === "string" && body.push_token.trim()
      ? body.push_token.trim().slice(0, MAX_TOKEN_LEN)
      : "";
  const providerRaw = typeof body.push_provider === "string" ? body.push_provider.trim().toLowerCase() : "";
  const pushProvider = PROVIDER_SET.has(providerRaw) ? providerRaw : "fcm";
  const appVersion =
    typeof body.app_version === "string" && body.app_version.trim()
      ? body.app_version.trim().slice(0, 64)
      : null;

  if (!deviceId || !pushToken) {
    return NextResponse.json({ ok: false, error: "invalid_device" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const now = new Date().toISOString();
  const environment = resolvePushEnvironment();

  await svc
    .from("user_devices")
    .update({ is_active: false, updated_at: now })
    .eq("device_id", deviceId)
    .eq("environment", environment)
    .neq("user_id", auth.userId);

  // Same physical device may hold apns + voip_apns concurrently.
  // Token rotation must deactivate only within the same push_provider —
  // never kill alert APNs when VoIP re-registers (and vice versa).
  await svc
    .from("user_devices")
    .update({ is_active: false, updated_at: now })
    .eq("user_id", auth.userId)
    .eq("device_id", deviceId)
    .eq("push_provider", pushProvider)
    .eq("environment", environment)
    .neq("push_token", pushToken);

  const { error: wipeErr } = await svc
    .from("user_devices")
    .delete()
    .eq("push_provider", pushProvider)
    .eq("push_token", pushToken)
    .eq("environment", environment);
  if (wipeErr && !wipeErr.message?.includes("does not exist")) {
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const { count, error: countErr } = await svc
    .from("user_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId)
    .eq("is_active", true)
    .eq("environment", environment);

  if (countErr) {
    if (countErr.message?.includes("does not exist") || countErr.code === "42P01") {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const n = count ?? 0;
  if (n >= MAX_DEVICES_PER_USER) {
    const { data: oldest } = await svc
      .from("user_devices")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("environment", environment)
      .order("last_seen_at", { ascending: true })
      .limit(1);
    if (oldest?.length) {
      await svc.from("user_devices").delete().eq("id", oldest[0].id);
    }
  }

  const { data: fcmPeers } =
    pushProvider === "fcm"
      ? await svc
          .from("user_devices")
          .select("device_id, last_seen_at")
          .eq("user_id", auth.userId)
          .eq("push_provider", "fcm")
          .eq("environment", environment)
      : { data: [] as { device_id: string; last_seen_at: string }[] };

  const activateRow = shouldActivateFcmDeviceRegister(deviceId, pushProvider, fcmPeers ?? []);

  const { data: upserted, error: upsertErr } = await svc
    .from("user_devices")
    .upsert(
      {
        user_id: auth.userId,
        platform,
        device_id: deviceId,
        push_token: pushToken,
        push_provider: pushProvider,
        environment,
        app_version: appVersion,
        is_active: activateRow,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "push_provider,push_token,environment" }
    )
    .select("id")
    .maybeSingle();

  if (upsertErr) {
    if (upsertErr.message?.includes("does not exist") || upsertErr.code === "42P01") {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[devices/register]", upsertErr.message);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    device_row_id: upserted?.id ?? null,
    environment,
  });
}
