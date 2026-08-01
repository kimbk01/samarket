import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePushEnvironment } from "@/lib/push/push-environment";

const read = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("notification device delivery authority", () => {
  it("resolves Production, Preview, and Development without cross-environment fallback", () => {
    expect(
      resolvePushEnvironment({
        VERCEL_ENV: "production",
        NODE_ENV: "production",
      })
    ).toBe("production");
    expect(
      resolvePushEnvironment({
        VERCEL_ENV: "preview",
        NODE_ENV: "production",
      })
    ).toBe("preview");
    expect(
      resolvePushEnvironment({
        VERCEL_ENV: undefined,
        NODE_ENV: "development",
      })
    ).toBe("development");
  });

  it("adds environment and event/device idempotency at the database boundary", () => {
    const migration = read(
      "supabase/migrations/20261012130000_notification_device_delivery_authority.sql"
    );
    expect(migration).toContain(
      "UNIQUE (push_provider, push_token, environment)"
    );
    expect(migration).toContain("notification_events\n  ADD COLUMN IF NOT EXISTS origin_device_id");
    expect(migration).toContain(
      "notification_deliveries_event_device_uidx"
    );
    expect(migration).toContain(
      "ON public.notification_deliveries (notification_event_id, device_id)"
    );
  });

  it("scopes registration, logout, and target loading to one environment", () => {
    const register = read("app/api/me/devices/register/route.ts");
    const deactivate = read("app/api/me/devices/deactivate/route.ts");
    const loader = read("lib/push/dispatch/load-active-push-targets.ts");
    for (const [path, source] of [
      ["register", register],
      ["deactivate", deactivate],
      ["loader", loader],
    ] as const) {
      expect(source, path).toContain('eq("environment", environment)');
    }
  });

  it("rotates stale tokens only within the same push_provider on one device", () => {
    const rpc = read("supabase/migrations/20261015140000_register_user_device_rpc.sql");
    // Same device_id may hold apns + voip_apns; VoIP re-register must not kill alert APNs.
    expect(rpc).toContain("push_provider = v_provider");
    expect(rpc).toContain("device_id = v_device_id");
    expect(rpc).toContain("push_token IS DISTINCT FROM btrim(p_push_token)");
  });

  it("registers devices via atomic RPC without physical DELETE", () => {
    const register = read("app/api/me/devices/register/route.ts");
    const rpc = read("supabase/migrations/20261015140000_register_user_device_rpc.sql");
    expect(register).toContain("callRegisterUserDeviceRpc");
    expect(register).toContain("assertRegisterUserDeviceRpcAuthority");
    expect(register).not.toMatch(/\.from\(\s*["']user_devices["']\s*\)\s*\.delete\s*\(/);
    expect(rpc).toContain("pg_advisory_xact_lock");
    expect(rpc).toContain("ON CONFLICT (push_provider, push_token, environment)");
    expect(rpc).toContain("auth.role()") ;
    expect(rpc).toContain("service_role");
    expect(rpc).not.toMatch(/\bDELETE\s+FROM\s+public\.user_devices\b/i);
  });

  it("dispatch filter keeps apns and voip_apns for the same device_id", () => {
    const filter = read("lib/push/dispatch/filter-user-device-push-targets.ts");
    expect(filter).toContain("providerDeviceKey");
    expect(filter).toContain("apns and voip_apns");
  });

  it("reserves durable device deliveries before provider send", () => {
    const dispatch = read(
      "lib/push/dispatch/dispatch-push-for-user.ts"
    );
    const reserveAt = dispatch.indexOf(
      "const deliveryId = await insertNotificationDelivery"
    );
    const sendAt = dispatch.indexOf(
      "const result = await sendToTarget",
      reserveAt
    );
    expect(reserveAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(reserveAt);
    expect(dispatch).toContain('reason: "duplicate_delivery"');
    expect(dispatch).toContain('fcmMode: "multi_device_fcm"');
  });
});
