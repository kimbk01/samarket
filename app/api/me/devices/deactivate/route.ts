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
  /**
   * 계정 전환 — authenticated only.
   * `device_other_users`: 이 기기의 **다른 계정** row 만 비활성 (현재 세션 회원 row 유지).
   * `device_all_users`: 이 기기의 모든 계정 row 비활성 (이력 호환).
   */
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
    if (scope === "device_all_users" || scope === "device_other_users") {
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

  if (scope === "device_other_users" && deviceId) {
    // P2-11: 계정 전환 시 이전 계정의 이 기기 푸시 바인딩만 끊는다 — 새로 로그인한 회원의 row 는 건드리지 않는다.
    // 다른 계정 row 를 끄려면 이 물리 기기의 소유 증명(device_id + 현재 push_token 바인딩)이 필요하다.
    let deviceOwnershipProven = false;
    if (pushToken) {
      const { data: ownRow } = await svc
        .from("user_devices")
        .select("id")
        .eq("device_id", deviceId)
        .eq("push_token", pushToken)
        .eq("environment", environment)
        .limit(1)
        .maybeSingle();
      deviceOwnershipProven = Boolean(ownRow);
    }
    if (!deviceOwnershipProven) {
      return NextResponse.json({ ok: true, mode: "authenticated", deactivated_other_users: false });
    }
    await svc
      .from("user_devices")
      .update({ is_active: false, updated_at: now })
      .eq("device_id", deviceId)
      .eq("environment", environment)
      .neq("user_id", userId);
    return NextResponse.json({ ok: true, mode: "authenticated", deactivated_other_users: true });
  }

  if (scope === "device_all_users" && deviceId) {
    // SEC-07: 다른 계정 행까지 끄는 것은 "계정 전환"용이다. 이 물리 기기의 소유 증명
    // (device_id + 현재 push_token 바인딩 존재)이 있을 때만 전체 계정 행을 비활성화한다.
    // 증명이 없으면 호출자 본인 행만 비활성화한다 (임의 device_id 로 타 계정 푸시 차단 금지).
    let deviceOwnershipProven = false;
    if (pushToken) {
      const { data: ownRow } = await svc
        .from("user_devices")
        .select("id")
        .eq("device_id", deviceId)
        .eq("push_token", pushToken)
        .eq("environment", environment)
        .limit(1)
        .maybeSingle();
      deviceOwnershipProven = Boolean(ownRow);
    }
    if (deviceOwnershipProven) {
      await svc
        .from("user_devices")
        .update({ is_active: false, updated_at: now })
        .eq("device_id", deviceId)
        .eq("environment", environment);
    } else {
      await svc
        .from("user_devices")
        .update({ is_active: false, updated_at: now })
        .eq("user_id", userId)
        .eq("device_id", deviceId)
        .eq("environment", environment);
    }
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
