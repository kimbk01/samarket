import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, parseJsonBody } from "@/lib/http/api-route";
import {
  buildDeviceRegisterTokenEvidence,
  describeThrownForDeviceRegisterAudit,
  logDeviceRegisterAudit,
} from "@/lib/push/device-register/device-register-audit-log";
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

  const requestTs = new Date().toISOString();
  const now = requestTs;
  const environment = resolvePushEnvironment();
  const tokenEvidence = buildDeviceRegisterTokenEvidence(pushToken);
  const auditBase = {
    request_ts: requestTs,
    auth_user_id: auth.userId,
    device_id: deviceId,
    provider: pushProvider,
    platform,
    environment,
    ...tokenEvidence,
  };

  try {
    logDeviceRegisterAudit({ stage: "request", ...auditBase });

    const { error: otherUserDeactivateErr } = await svc
      .from("user_devices")
      .update({ is_active: false, updated_at: now })
      .eq("device_id", deviceId)
      .eq("environment", environment)
      .neq("user_id", auth.userId);
    logDeviceRegisterAudit({
      stage: "other_user_deactivate",
      ...auditBase,
      other_user_deactivate_err: otherUserDeactivateErr?.message ?? null,
      other_user_deactivate_code: otherUserDeactivateErr?.code ?? null,
    });

    // Same physical device may hold apns + voip_apns concurrently.
    // Token rotation must deactivate only within the same push_provider —
    // never kill alert APNs when VoIP re-registers (and vice versa).
    const { error: oldTokenDeactivateErr } = await svc
      .from("user_devices")
      .update({ is_active: false, updated_at: now })
      .eq("user_id", auth.userId)
      .eq("device_id", deviceId)
      .eq("push_provider", pushProvider)
      .eq("environment", environment)
      .neq("push_token", pushToken);
    logDeviceRegisterAudit({
      stage: "old_token_deactivate",
      ...auditBase,
      old_token_deactivate_err: oldTokenDeactivateErr?.message ?? null,
      old_token_deactivate_code: oldTokenDeactivateErr?.code ?? null,
    });

    logDeviceRegisterAudit({ stage: "token_wipe_start", ...auditBase });
    const { error: wipeErr } = await svc
      .from("user_devices")
      .delete()
      .eq("push_provider", pushProvider)
      .eq("push_token", pushToken)
      .eq("environment", environment);
    const wipeFatal = Boolean(wipeErr && !wipeErr.message?.includes("does not exist"));
    logDeviceRegisterAudit({
      stage: "token_wipe_result",
      ...auditBase,
      wipe_ok: !wipeFatal,
      wipe_err: wipeErr?.message ?? null,
      wipe_code: wipeErr?.code ?? null,
    });
    if (wipeFatal) {
      logDeviceRegisterAudit({
        stage: "response",
        ...auditBase,
        http_status: 500,
        response_category: "query_failed",
        wipe_ok: false,
        wipe_err: wipeErr?.message ?? null,
        wipe_code: wipeErr?.code ?? null,
      });
      return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
    }

    logDeviceRegisterAudit({ stage: "active_count_start", ...auditBase });
    const { count, error: countErr } = await svc
      .from("user_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.userId)
      .eq("is_active", true)
      .eq("environment", environment);
    logDeviceRegisterAudit({
      stage: "active_count_result",
      ...auditBase,
      count_ok: !countErr,
      active_count: count ?? null,
      count_err: countErr?.message ?? null,
      count_code: countErr?.code ?? null,
    });

    if (countErr) {
      if (countErr.message?.includes("does not exist") || countErr.code === "42P01") {
        logDeviceRegisterAudit({
          stage: "response",
          ...auditBase,
          http_status: 503,
          response_category: "table_missing",
          count_ok: false,
          count_err: countErr.message ?? null,
          count_code: countErr.code ?? null,
        });
        return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
      }
      logDeviceRegisterAudit({
        stage: "response",
        ...auditBase,
        http_status: 500,
        response_category: "query_failed",
        count_ok: false,
        count_err: countErr.message ?? null,
        count_code: countErr.code ?? null,
      });
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
    logDeviceRegisterAudit({
      stage: "activate_policy",
      ...auditBase,
      activate_row: activateRow,
    });

    logDeviceRegisterAudit({
      stage: "upsert_start",
      ...auditBase,
      activate_row: activateRow,
    });
    // Keep select("id") identical to pre-audit behavior — read shape must not change outcomes.
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
      logDeviceRegisterAudit({
        stage: "upsert_result",
        ...auditBase,
        activate_row: activateRow,
        upsert_ok: false,
        upsert_err: upsertErr.message ?? null,
        upsert_code: upsertErr.code ?? null,
      });
      if (upsertErr.message?.includes("does not exist") || upsertErr.code === "42P01") {
        logDeviceRegisterAudit({
          stage: "response",
          ...auditBase,
          activate_row: activateRow,
          http_status: 503,
          response_category: "table_missing",
          upsert_ok: false,
          upsert_err: upsertErr.message ?? null,
          upsert_code: upsertErr.code ?? null,
        });
        return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
      }
      console.error("[devices/register]", upsertErr.message);
      logDeviceRegisterAudit({
        stage: "response",
        ...auditBase,
        activate_row: activateRow,
        http_status: 500,
        response_category: "save_failed",
        upsert_ok: false,
        upsert_err: upsertErr.message ?? null,
        upsert_code: upsertErr.code ?? null,
      });
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }

    logDeviceRegisterAudit({
      stage: "upsert_result",
      ...auditBase,
      activate_row: activateRow,
      upsert_ok: true,
      row_id: upserted?.id ?? null,
      is_active: activateRow,
      last_seen_at: now,
      upsert_err: null,
      upsert_code: null,
    });
    logDeviceRegisterAudit({
      stage: "response",
      ...auditBase,
      activate_row: activateRow,
      row_id: upserted?.id ?? null,
      is_active: activateRow,
      last_seen_at: now,
      http_status: 200,
      response_category: "ok",
      upsert_ok: true,
    });

    return NextResponse.json({
      ok: true,
      device_row_id: upserted?.id ?? null,
      environment,
    });
  } catch (err) {
    // Log then rethrow — preserve prior uncaught failure behavior (e.g. ETIMEDOUT).
    const thrown = describeThrownForDeviceRegisterAudit(err);
    logDeviceRegisterAudit({
      stage: "thrown",
      ...auditBase,
      http_status: 500,
      response_category: thrown.is_etimedout ? "etimedout" : "uncaught_exception",
      ...thrown,
    });
    logDeviceRegisterAudit({
      stage: "response",
      ...auditBase,
      http_status: 500,
      response_category: thrown.is_etimedout ? "etimedout" : "uncaught_exception",
      ...thrown,
    });
    throw err;
  }
}
