import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("apple-common-completion-contract", () => {
  it("Apple exchange success path calls syncCommonClientSessionAfterAuth once", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/native/start-native-apple-login.client.ts"),
      "utf8",
    );
    expect(src).toMatch(/syncCommonClientSessionAfterAuth/);
    expect(src).toMatch(/native_exchange_session_unavailable/);
    // Must not dual-call navigation façade from Apple adapter
    expect(src).not.toMatch(/runCommonAuthClientCompletion\(/);
    expect(src).not.toMatch(/await finishClientAuthLogin/);
    expect(src).not.toMatch(/finishClientAuthLogin\(/);
  });

  it("Google/Kakao exchange helper stays on syncClientSessionAfterNativeExchange", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/native/post-native-exchange.client.ts"),
      "utf8",
    );
    expect(src).toMatch(/syncClientSessionAfterNativeExchange/);
    expect(src).not.toMatch(/syncCommonClientSessionAfterAuth/);
    expect(src).not.toMatch(/start-native-apple/);
  });

  it("forbids reintroducing Apple prime-only completion without common sync", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/native/start-native-apple-login.client.ts"),
      "utf8",
    );
    const syncIdx = src.indexOf("syncCommonClientSessionAfterAuth");
    const returnOkIdx = src.lastIndexOf("return json;");
    expect(syncIdx).toBeGreaterThan(0);
    expect(returnOkIdx).toBeGreaterThan(syncIdx);
  });
});
