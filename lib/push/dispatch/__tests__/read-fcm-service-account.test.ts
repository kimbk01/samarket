import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fcmConfigSource,
  isFcmConfigured,
  parseFcmServiceAccount,
  readFcmServiceAccountJsonRaw,
  resetFcmServiceAccountCacheForTests,
} from "@/lib/push/dispatch/read-fcm-service-account";

const SAMPLE = {
  type: "service_account",
  client_email: "fcm@test.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
};

describe("read-fcm-service-account", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetFcmServiceAccountCacheForTests();
  });

  it("reads FCM_SERVICE_ACCOUNT_JSON_BASE64", () => {
    const encoded = Buffer.from(JSON.stringify(SAMPLE), "utf8").toString("base64");
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON_BASE64", encoded);
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", "");
    expect(readFcmServiceAccountJsonRaw()).toContain("client_email");
    expect(fcmConfigSource()).toBe("base64_env");
    expect(isFcmConfigured()).toBe(true);
    expect(parseFcmServiceAccount()).not.toBeNull();
  });

  it("reads plain FCM_SERVICE_ACCOUNT_JSON", () => {
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", JSON.stringify(SAMPLE));
    expect(fcmConfigSource()).toBe("json_env");
    expect(isFcmConfigured()).toBe(true);
  });

  it("returns none when env missing", () => {
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", "");
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON_BASE64", "");
    expect(fcmConfigSource()).toBe("none");
    expect(isFcmConfigured()).toBe(false);
  });
});
