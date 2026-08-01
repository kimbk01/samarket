import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, parseJsonBody } from "@/lib/http/api-route";
import {
  buildDeviceRegisterTokenEvidence,
  describeThrownForDeviceRegisterAudit,
  logDeviceRegisterAudit,
} from "@/lib/push/device-register/device-register-audit-log";
import {
  assertRegisterUserDeviceRpcAuthority,
  callRegisterUserDeviceRpc,
} from "@/lib/push/device-register/register-user-device-rpc";
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

  // Never trust body user_id as register authority — session user wins.
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

    const rpcResult = await callRegisterUserDeviceRpc(svc, {
      authUserId: auth.userId,
      deviceId,
      platform,
      pushToken,
      pushProvider,
      environment,
      appVersion,
      activateRow,
      maxDevices: MAX_DEVICES_PER_USER,
    });

    if (!rpcResult.ok) {
      logDeviceRegisterAudit({
        stage: "upsert_result",
        ...auditBase,
        activate_row: activateRow,
        upsert_ok: false,
        upsert_err: rpcResult.db_message ?? rpcResult.error,
        upsert_code: rpcResult.db_code ?? null,
      });
      if (rpcResult.error === "rpc_missing" || rpcResult.error === "table_missing") {
        logDeviceRegisterAudit({
          stage: "response",
          ...auditBase,
          activate_row: activateRow,
          http_status: 503,
          response_category: "rpc_missing",
        });
        return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
      }
      console.error("[devices/register]", rpcResult.error, rpcResult.db_code, rpcResult.db_message);
      logDeviceRegisterAudit({
        stage: "response",
        ...auditBase,
        activate_row: activateRow,
        http_status: 500,
        response_category: "save_failed",
        upsert_ok: false,
        upsert_err: rpcResult.db_message ?? rpcResult.error,
        upsert_code: rpcResult.db_code ?? null,
      });
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }

    const authority = assertRegisterUserDeviceRpcAuthority(rpcResult, {
      authUserId: auth.userId,
      deviceId,
      environment,
      activateRow,
    });
    if (!authority.ok) {
      console.error("[devices/register] authority_mismatch", authority.error, {
        authUserId: auth.userId,
        resultUserId: rpcResult.user_id,
        resultActive: rpcResult.is_active,
      });
      logDeviceRegisterAudit({
        stage: "response",
        ...auditBase,
        activate_row: activateRow,
        http_status: 500,
        response_category: authority.error,
        row_id: rpcResult.device_row_id,
        is_active: rpcResult.is_active,
        last_seen_at: rpcResult.last_seen_at,
      });
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }

    logDeviceRegisterAudit({
      stage: "upsert_result",
      ...auditBase,
      activate_row: activateRow,
      upsert_ok: true,
      row_id: rpcResult.device_row_id,
      is_active: rpcResult.is_active,
      last_seen_at: rpcResult.last_seen_at,
      upsert_err: null,
      upsert_code: null,
    });
    logDeviceRegisterAudit({
      stage: "response",
      ...auditBase,
      activate_row: activateRow,
      row_id: rpcResult.device_row_id,
      is_active: rpcResult.is_active,
      last_seen_at: rpcResult.last_seen_at,
      http_status: 200,
      response_category: "ok",
      upsert_ok: true,
    });

    return NextResponse.json({
      ok: true,
      device_row_id: rpcResult.device_row_id,
      environment: rpcResult.environment,
      is_active: rpcResult.is_active,
      last_seen_at: rpcResult.last_seen_at,
    });
  } catch (err) {
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
