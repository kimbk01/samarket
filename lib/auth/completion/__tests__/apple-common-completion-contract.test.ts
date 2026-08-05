import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("apple-common-completion-contract", () => {
  it("Slice 6-3: Apple exchange helper does not own Client Sync", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/native/start-native-apple-login.client.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/syncCommonClientSessionAfterAuth/);
    expect(src).not.toMatch(/syncClientSessionAfterNativeExchange/);
    expect(src).toMatch(/syncFromNativeExchangeCookies:\s*true/);
    // Must not dual-call navigation façade from Apple adapter
    expect(src).not.toMatch(/runCommonAuthClientCompletion\(/);
    expect(src).not.toMatch(/await finishClientAuthLogin/);
    expect(src).not.toMatch(/finishClientAuthLogin\(/);
  });

  it("Slice 6-3: Google/Kakao exchange helper does not own Client Sync", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/native/post-native-exchange.client.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/syncClientSessionAfterNativeExchange/);
    expect(src).not.toMatch(/syncCommonClientSessionAfterAuth/);
    expect(src).not.toMatch(/start-native-apple/);
  });

  it("Slice 6-3: Completion owns sync + sync failure blocks navigation", () => {
    const finish = readFileSync(
      join(process.cwd(), "lib/auth/finish-client-auth-login.client.ts"),
      "utf8",
    );
    const completion = readFileSync(
      join(process.cwd(), "lib/auth/completion/run-common-auth-client-completion.client.ts"),
      "utf8",
    );
    expect(finish).toMatch(/syncFromNativeExchangeCookies/);
    expect(finish).toMatch(/CommonClientSessionSyncError/);
    expect(completion).toMatch(/syncCommonClientSessionAfterAuth/);
    expect(completion).toMatch(/client_session_sync_failed/);
    const syncFailIdx = completion.indexOf('reason: "client_session_sync_failed"');
    const navIdx = completion.indexOf("navigation_committed");
    expect(syncFailIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(syncFailIdx);
  });
});
