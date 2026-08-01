import { describe, expect, it } from "vitest";
import {
  assertRegisterUserDeviceRpcAuthority,
  parseRegisterUserDeviceRpcResult,
} from "@/lib/push/device-register/register-user-device-rpc";

describe("register_user_device RPC result contract", () => {
  it("parses success payload with authority fields", () => {
    const parsed = parseRegisterUserDeviceRpcResult({
      ok: true,
      device_row_id: "11111111-1111-1111-1111-111111111111",
      user_id: "22222222-2222-2222-2222-222222222222",
      device_id: "d58f6506-8ddd-4515-bbd9-742383edc745",
      is_active: true,
      last_seen_at: "2026-08-01T21:00:00.000Z",
      environment: "production",
      push_provider: "fcm",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.device_row_id).toContain("11111111");
    expect(parsed.is_active).toBe(true);
  });

  it("rejects missing last_seen_at", () => {
    const parsed = parseRegisterUserDeviceRpcResult({
      ok: true,
      device_row_id: "11111111-1111-1111-1111-111111111111",
      user_id: "22222222-2222-2222-2222-222222222222",
      device_id: "d58f6506-8ddd-4515-bbd9-742383edc745",
      is_active: true,
      environment: "production",
      push_provider: "fcm",
    });
    expect(parsed).toEqual({ ok: false, error: "register_result_invalid" });
  });

  it("asserts session user matches RPC user and active flag", () => {
    const ok = assertRegisterUserDeviceRpcAuthority(
      {
        ok: true,
        device_row_id: "11111111-1111-1111-1111-111111111111",
        user_id: "22222222-2222-2222-2222-222222222222",
        device_id: "d58f6506-8ddd-4515-bbd9-742383edc745",
        is_active: true,
        last_seen_at: "2026-08-01T21:00:00.000Z",
        environment: "production",
        push_provider: "fcm",
      },
      {
        authUserId: "22222222-2222-2222-2222-222222222222",
        deviceId: "d58f6506-8ddd-4515-bbd9-742383edc745",
        environment: "production",
        activateRow: true,
      },
    );
    expect(ok).toEqual({ ok: true });

    const badUser = assertRegisterUserDeviceRpcAuthority(
      {
        ok: true,
        device_row_id: "11111111-1111-1111-1111-111111111111",
        user_id: "33333333-3333-3333-3333-333333333333",
        device_id: "d58f6506-8ddd-4515-bbd9-742383edc745",
        is_active: true,
        last_seen_at: "2026-08-01T21:00:00.000Z",
        environment: "production",
        push_provider: "fcm",
      },
      {
        authUserId: "22222222-2222-2222-2222-222222222222",
        deviceId: "d58f6506-8ddd-4515-bbd9-742383edc745",
        environment: "production",
        activateRow: true,
      },
    );
    expect(badUser).toEqual({ ok: false, error: "register_user_mismatch" });
  });
});
