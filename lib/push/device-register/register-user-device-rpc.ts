import type { SupabaseClient } from "@supabase/supabase-js";

export type RegisterUserDeviceRpcInput = {
  authUserId: string;
  deviceId: string;
  platform: string;
  pushToken: string;
  pushProvider: string;
  environment: string;
  appVersion: string | null;
  activateRow: boolean;
  maxDevices?: number;
};

export type RegisterUserDeviceRpcOk = {
  ok: true;
  device_row_id: string;
  user_id: string;
  device_id: string;
  is_active: boolean;
  last_seen_at: string;
  environment: string;
  push_provider: string;
};

export type RegisterUserDeviceRpcErr = {
  ok: false;
  error: string;
  db_code?: string;
  db_message?: string;
};

export type RegisterUserDeviceRpcResult = RegisterUserDeviceRpcOk | RegisterUserDeviceRpcErr;

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

export function parseRegisterUserDeviceRpcResult(raw: unknown): RegisterUserDeviceRpcResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "register_failed" };
  }
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) {
    return {
      ok: false,
      error: asTrimmedString(o.error) ?? "register_failed",
      db_code: asTrimmedString(o.db_code) ?? undefined,
      db_message: asTrimmedString(o.db_message) ?? undefined,
    };
  }
  const deviceRowId = asTrimmedString(o.device_row_id);
  const userId = asTrimmedString(o.user_id);
  const deviceId = asTrimmedString(o.device_id);
  const lastSeen = asTrimmedString(o.last_seen_at);
  const environment = asTrimmedString(o.environment);
  const pushProvider = asTrimmedString(o.push_provider);
  if (
    !deviceRowId ||
    !userId ||
    !deviceId ||
    !lastSeen ||
    !environment ||
    !pushProvider ||
    typeof o.is_active !== "boolean"
  ) {
    return { ok: false, error: "register_result_invalid" };
  }
  return {
    ok: true,
    device_row_id: deviceRowId,
    user_id: userId,
    device_id: deviceId,
    is_active: o.is_active,
    last_seen_at: lastSeen,
    environment,
    push_provider: pushProvider,
  };
}

/** Verify RPC result matches the server-authenticated register intent. */
export function assertRegisterUserDeviceRpcAuthority(
  result: RegisterUserDeviceRpcOk,
  expected: { authUserId: string; deviceId: string; environment: string; activateRow: boolean },
): { ok: true } | { ok: false; error: string } {
  if (result.user_id !== expected.authUserId) {
    return { ok: false, error: "register_user_mismatch" };
  }
  if (result.device_id !== expected.deviceId) {
    return { ok: false, error: "register_device_mismatch" };
  }
  if (result.environment !== expected.environment) {
    return { ok: false, error: "register_environment_mismatch" };
  }
  if (result.is_active !== expected.activateRow) {
    return { ok: false, error: "register_active_mismatch" };
  }
  if (!result.last_seen_at) {
    return { ok: false, error: "register_last_seen_missing" };
  }
  return { ok: true };
}

export async function callRegisterUserDeviceRpc(
  svc: SupabaseClient,
  input: RegisterUserDeviceRpcInput,
): Promise<RegisterUserDeviceRpcResult> {
  const { data, error } = await svc.rpc("register_user_device", {
    p_auth_user_id: input.authUserId,
    p_device_id: input.deviceId,
    p_platform: input.platform,
    p_push_token: input.pushToken,
    p_push_provider: input.pushProvider,
    p_environment: input.environment,
    p_app_version: input.appVersion,
    p_activate_row: input.activateRow,
    p_max_devices: input.maxDevices ?? 20,
  });

  if (error) {
    return {
      ok: false,
      error: error.message?.includes("does not exist") || error.code === "42883"
        ? "rpc_missing"
        : "register_failed",
      db_code: error.code ?? undefined,
      db_message: error.message ?? undefined,
    };
  }
  return parseRegisterUserDeviceRpcResult(data);
}
