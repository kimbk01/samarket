import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { parseJsonBody } from "@/lib/http/api-route";
import { deactivateBoundDeviceByTokenProof } from "@/lib/push/dispatch/deactivate-bound-device-by-token-proof";
import { deactivateAllUserDevicesForLogout } from "@/lib/push/dispatch/deactivate-failed-token";
import { resolvePushEnvironment } from "@/lib/push/push-environment";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeactivateBody = {
  device_id?: unknown;
  push_token?: unknown;
  push_provider?: unknown;
  /** 동일 physical device_id의 모든 user row 비활성 (계정 전환) — authenticated only */
  scope?: unknown;
};

export async function POST(req: NextRequest) {
  const userId = await getOptionalAuthenticatedUserId();
  const parsed = await parseJsonBody<DeactivateBody>(req);
  const body = parsed.ok ? parsed.value : {};

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
  const pushToken = typeof body.push_token === "string" ? body.push_token.trim() : "";
  const pushProvider =
    typeof body.push_provider === "string" ? body.push_provider.trim().toLowerCase() : "";
  const scope = typeof body.scope === "string" ? body.scope.trim() : "";
  const now = new Date().toISOString();
  const environment = resolvePushEnvironment();

  if (!userId) {
    // Session already missing — only device_id + push_token proof may unbind this install.
    if (scope === "device_all_users") {
      return NextResponse.json(
        { ok: false, error: "unauthenticated", code: "scope_requires_auth" },
        { status: 401 },
      );
    }
    if (!deviceId || !pushToken) {
      return NextResponse.json(
        { ok: false, error: "unauthenticated", code: "device_unbind_proof_required" },
        { status: 401 },
      );
    }
    try {
      const result = await deactivateBoundDeviceByTokenProof(svc, {
        deviceId,
        pushToken,
        pushProvider: pushProvider || "fcm",
        environment,
      });
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error, code: "device_unbind_proof_rejected" },
          { status: 403 },
        );
      }
      return NextResponse.json({ ok: true, mode: "token_proof", deactivated: result.deactivated });
    } catch (error) {
      console.warn("[devices/deactivate] token_proof_failed", {
        deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ ok: false, error: "deactivate_failed" }, { status: 500 });
    }
  }

  if (scope === "device_all_users" && deviceId) {
    await svc
      .from("user_devices")
      .update({ is_active: false, updated_at: now })
      .eq("device_id", deviceId)
      .eq("environment", environment);
  } else if (pushToken && pushProvider) {
    await svc
      .from("user_devices")
      .update({ is_active: false, updated_at: now })
      .eq("user_id", userId)
      .eq("push_provider", pushProvider)
      .eq("push_token", pushToken)
      .eq("environment", environment);
  } else if (pushProvider) {
    await svc
      .from("user_devices")
      .update({ is_active: false, updated_at: now })
      .eq("user_id", userId)
      .eq("push_provider", pushProvider)
      .eq("environment", environment);
  } else {
    await deactivateAllUserDevicesForLogout(svc, userId, deviceId || null, environment);
  }

  // Belt: if caller also sent token proof, ensure that exact binding is inactive
  // even when user_id scoping used a different path (token rotation races).
  if (deviceId && pushToken) {
    try {
      await deactivateBoundDeviceByTokenProof(svc, {
        deviceId,
        pushToken,
        pushProvider: pushProvider || "fcm",
        environment,
      });
    } catch {
      /* authenticated path already ran primary deactivate */
    }
  }

  return NextResponse.json({ ok: true, mode: "authenticated" });
}
