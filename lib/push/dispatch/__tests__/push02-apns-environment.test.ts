import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** host → [status, reason] scripted APNs answers; records every connected host. */
const answers = new Map<string, [number, string]>();
const hosts: string[] = [];

vi.mock("node:http2", () => {
  const connect = (url: string) => {
    const host = url.replace("https://", "");
    hosts.push(host);
    const client = new EventEmitter() as EventEmitter & { request: () => unknown; close: () => void };
    client.close = () => undefined;
    client.request = () => {
      const req = new EventEmitter() as EventEmitter & {
        setEncoding: () => void;
        write: () => void;
        end: () => void;
      };
      req.setEncoding = () => undefined;
      req.write = () => undefined;
      req.end = () => {
        const [status, reason] = answers.get(host) ?? [200, ""];
        queueMicrotask(() => {
          req.emit("response", { ":status": status });
          if (status !== 200) req.emit("data", JSON.stringify({ reason }));
          req.emit("end");
        });
      };
      return req;
    };
    return client;
  };
  return { default: { connect }, connect };
});

const PROD = "api.push.apple.com";
const SANDBOX = "api.sandbox.push.apple.com";

describe("PUSH-02 per-token APNs environment (alert)", () => {
  beforeEach(() => {
    answers.clear();
    hosts.length = 0;
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    process.env.APNS_KEY_P8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.APNS_KEY_ID = "KEYID";
    process.env.APNS_TEAM_ID = "TEAMID";
    process.env.APNS_BUNDLE_ID = "com.dibay.app";
    process.env.APNS_PRODUCTION = "1";
  });

  const send = async (apnsEnvironment?: "sandbox" | "production" | null) => {
    const { sendApnsAlertImpl } = await import("@/lib/push/dispatch/apns-sender-impl");
    return sendApnsAlertImpl({ deviceToken: "tok", title: "t", body: "b", data: {}, apnsEnvironment });
  };

  it("unknown device env → server default host (legacy behaviour), env reported", async () => {
    const r = await send(null);
    expect(hosts).toEqual([PROD]);
    expect(r.status).toBe("sent");
    expect(r.provider_response).toMatchObject({ apns_environment: "production" });
  });

  it("device env wins over the server default", async () => {
    const r = await send("sandbox");
    expect(hosts).toEqual([SANDBOX]);
    expect(r.provider_response).toMatchObject({ apns_environment: "sandbox" });
  });

  it("400 BadDeviceToken → one retry on the other host; success reports the proven env", async () => {
    answers.set(PROD, [400, "BadDeviceToken"]);
    const r = await send(null);
    expect(hosts).toEqual([PROD, SANDBOX]);
    expect(r.status).toBe("sent");
    expect(r.provider_response).toMatchObject({
      apns_environment: "sandbox",
      apns_environment_tried: ["production", "sandbox"],
    });
  });

  it("BadDeviceToken on both hosts → still a bad token (dispatcher deactivates as before)", async () => {
    answers.set(PROD, [400, "BadDeviceToken"]);
    answers.set(SANDBOX, [400, "BadDeviceToken"]);
    const r = await send(null);
    expect(hosts).toEqual([PROD, SANDBOX]);
    expect(r.status).toBe("failed");
    expect(r.provider_response).toMatchObject({ bad_device_token: true });
  });

  it.each([
    [410, "Unregistered"],
    [400, "DeviceTokenNotForTopic"],
    [400, "BadTopic"],
  ])("%i %s is not an environment error → no second host", async (status, reason) => {
    answers.set(PROD, [status, reason]);
    const r = await send(null);
    expect(hosts).toEqual([PROD]);
    expect(r.status).toBe("failed");
  });

});

/** docs/audit/call-voip-apns-environment-design-2026-11-25.md — VoIP: device env host, one send, no retry. */
describe("VoIP APNs environment (call push)", () => {
  beforeEach(() => {
    answers.clear();
    hosts.length = 0;
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    process.env.APNS_KEY_P8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.APNS_KEY_ID = "KEYID";
    process.env.APNS_TEAM_ID = "TEAMID";
    process.env.APNS_BUNDLE_ID = "com.dibay.app";
    process.env.APNS_PRODUCTION = "1";
  });

  const sendVoip = async (
    apnsEnvironment: "sandbox" | "production" | null | undefined,
    callPushKind = "incoming_call",
  ) => {
    const { sendVoipApnsImpl } = await import("@/lib/push/dispatch/apns-sender-impl");
    return sendVoipApnsImpl({ deviceToken: "tok", data: {}, callPushKind, apnsEnvironment });
  };

  it.each([null, undefined])("unknown env (%s) → server default host, unchanged from before", async (env) => {
    const r = await sendVoip(env);
    expect(hosts).toEqual([PROD]);
    expect(r.status).toBe("sent");
    expect(r.provider_response?.apns_environment).toBe("production");
  });

  it("sandbox device (development-signed install) → sandbox host once", async () => {
    const r = await sendVoip("sandbox");
    expect(hosts).toEqual([SANDBOX]);
    expect(r.status).toBe("sent");
    expect(r.provider_response?.apns_environment).toBe("sandbox");
  });

  it("production device → production host once", async () => {
    await sendVoip("production");
    expect(hosts).toEqual([PROD]);
  });

  it("cancel push goes to the same host as the ring", async () => {
    await sendVoip("sandbox", "incoming_call");
    await sendVoip("sandbox", "call_canceled");
    expect(hosts).toEqual([SANDBOX, SANDBOX]);
  });

  it("BadDeviceToken is never retried on the other host (no extra request)", async () => {
    answers.set(SANDBOX, [400, "BadDeviceToken"]);
    const r = await sendVoip("sandbox");
    expect(hosts).toEqual([SANDBOX]);
    expect(r.status).toBe("failed");
  });
});

describe("PUSH-02 target loading / persistence helpers", () => {
  it("carries apns_environment onto apns and voip_apns targets, not fcm", async () => {
    const { filterUserDevicePushTargets } = await import("@/lib/push/dispatch/filter-user-device-push-targets");
    const targets = filterUserDevicePushTargets([
      { id: "a", platform: "ios", device_id: "d1", push_token: "t1", push_provider: "apns", apns_environment: "sandbox" },
      { id: "v", platform: "ios", device_id: "d1", push_token: "t2", push_provider: "voip_apns", apns_environment: "production" },
      { id: "l", platform: "ios", device_id: "d2", push_token: "t3", push_provider: "apns" },
      { id: "f", platform: "android", device_id: "d3", push_token: "t4", push_provider: "fcm" },
    ]);
    expect(targets.find((t) => t.id === "a")?.apns_environment).toBe("sandbox");
    expect(targets.find((t) => t.id === "v")?.apns_environment).toBe("production");
    expect(targets.find((t) => t.id === "l")?.apns_environment).toBeNull();
    expect(targets.find((t) => t.id === "f")).not.toHaveProperty("apns_environment");
  });

  it("voip_apns without its own env takes the same device's alert-token env (in-memory, first row)", async () => {
    const { filterUserDevicePushTargets } = await import("@/lib/push/dispatch/filter-user-device-push-targets");
    const targets = filterUserDevicePushTargets([
      { id: "v1", platform: "ios", device_id: "d1", push_token: "vt1", push_provider: "voip_apns" },
      { id: "a1", platform: "ios", device_id: "d1", push_token: "at1", push_provider: "apns", apns_environment: "sandbox" },
      { id: "a1old", platform: "ios", device_id: "d1", push_token: "at0", push_provider: "apns", apns_environment: "production" },
      { id: "v2", platform: "ios", device_id: "d2", push_token: "vt2", push_provider: "voip_apns" },
      { id: "a2", platform: "ios", device_id: "d2", push_token: "at2", push_provider: "apns" },
      { id: "v3", platform: "ios", device_id: "d3", push_token: "vt3", push_provider: "voip_apns" },
    ]);
    expect(targets.find((t) => t.id === "v1")?.apns_environment).toBe("sandbox");
    expect(targets.find((t) => t.id === "v2")?.apns_environment).toBeNull();
    expect(targets.find((t) => t.id === "v3")?.apns_environment).toBeNull();
  });

  it("normalizes reported values", async () => {
    const { normalizeApnsEnvironment } = await import("@/lib/push/dispatch/apns-environment");
    expect(normalizeApnsEnvironment("development")).toBe("sandbox");
    expect(normalizeApnsEnvironment("Production")).toBe("production");
    expect(normalizeApnsEnvironment("other")).toBeNull();
  });

  it("remember is best-effort (column missing → no throw)", async () => {
    const { rememberDeviceApnsEnvironment } = await import("@/lib/push/dispatch/apns-environment");
    const update = vi.fn(() => ({ eq: async () => ({ error: { message: 'column "apns_environment" does not exist' } }) }));
    const svc = { from: () => ({ update }) };
    await expect(rememberDeviceApnsEnvironment(svc as never, "row", "sandbox")).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({ apns_environment: "sandbox" });
  });

  it("legacy select fallback when the column is not migrated", async () => {
    const { loadActivePushTargets } = await import("@/lib/push/dispatch/load-active-push-targets");
    const selects: string[] = [];
    const chain = (cols: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["eq", "order"]) q[m] = () => q;
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve(
          cols.includes("apns_environment")
            ? { data: null, error: { message: "column user_devices.apns_environment does not exist" } }
            : { data: [{ id: "a", platform: "ios", device_id: "d", push_token: "t", push_provider: "apns", environment: "production" }], error: null }
        );
      return q;
    };
    const svc = {
      from: (table: string) => ({
        select: (cols: string) => {
          selects.push(`${table}:${cols}`);
          return table === "user_devices" ? chain(cols) : { eq: async () => ({ data: [], error: null }) };
        },
      }),
    };
    const targets = await loadActivePushTargets(svc as never, "u", { environment: "production" });
    expect(selects.filter((s) => s.startsWith("user_devices")).length).toBe(2);
    expect(targets).toHaveLength(1);
    expect(targets[0].apns_environment).toBeNull();
  });
});
