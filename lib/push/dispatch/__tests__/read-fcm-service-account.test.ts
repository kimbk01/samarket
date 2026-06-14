import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fcmConfigSource,
  isFcmConfigured,
  parseFcmServiceAccount,
  readFcmServiceAccountJsonRaw,
  resetFcmServiceAccountCacheForTests,
} from "@/lib/push/dispatch/read-fcm-service-account";

const SAMPLE = {
  type: "service_account",
  project_id: "dibay-test",
  client_email: "fcm@test.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
};

describe("read-fcm-service-account", () => {
  beforeEach(() => {
    resetFcmServiceAccountCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetFcmServiceAccountCacheForTests();
  });

  it("prefers split Vercel env and normalizes escaped private key newlines", () => {
    vi.stubEnv("FCM_PROJECT_ID", "split-project");
    vi.stubEnv("FCM_CLIENT_EMAIL", "split@test.iam.gserviceaccount.com");
    vi.stubEnv("FCM_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n");
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", JSON.stringify(SAMPLE));
    expect(fcmConfigSource()).toBe("split_env");
    expect(isFcmConfigured()).toBe(true);
    expect(parseFcmServiceAccount()).not.toBeNull();
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
