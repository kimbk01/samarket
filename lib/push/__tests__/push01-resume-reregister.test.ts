import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIBAY_PUSH_TOKEN_ROTATED_EVENT,
  PUSH_RESUME_REREGISTER_MIN_INTERVAL_MS,
} from "@/components/push/NativePushRegistration";

const src = readFileSync(join(process.cwd(), "components/push/NativePushRegistration.tsx"), "utf8");

describe("PUSH-01 web — re-register current token after resume / native rotation", () => {
  it("resume re-register is throttled to 6h; rotation event is immediate", () => {
    expect(PUSH_RESUME_REREGISTER_MIN_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
    expect(DIBAY_PUSH_TOKEN_ROTATED_EVENT).toBe("dibay:push-token-rotated");
    expect(src).toMatch(
      /reason === "resume" &&\s+Date\.now\(\) - lastRegisterSuccessAtRef\.current < PUSH_RESUME_REREGISTER_MIN_INTERVAL_MS/
    );
    expect(src).toMatch(/document\.visibilityState === "visible"\) reRegisterCurrentUser\("resume"\)/);
    expect(src).toMatch(/window\.addEventListener\(DIBAY_PUSH_TOKEN_ROTATED_EVENT, onTokenRotated\)/);
  });

  it("only the signed-in session user is re-registered, never while a register is in flight", () => {
    expect(src).toMatch(/const uid = sessionUserIdRef\.current;\s+if \(!uid \|\| registerInFlightRef\.current\) return;/);
  });

  it("listeners are removed on phase change / unmount (logout stops re-register)", () => {
    expect(src).toMatch(/document\.removeEventListener\("visibilitychange", onVisibility\)/);
    expect(src).toMatch(/window\.removeEventListener\(DIBAY_PUSH_TOKEN_ROTATED_EVENT, onTokenRotated\)/);
  });
});
