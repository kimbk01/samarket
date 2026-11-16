import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  admitAuthFailureWrite,
  AUTH_FAILURE_WRITES_PER_CLIENT_HOUR,
  AUTH_FAILURE_WRITES_PER_MINUTE,
  resetAuthFailureStoreForTests,
} from "@/lib/telemetry/auth-failure-store.server";

describe("admitAuthFailureWrite 남용 제한", () => {
  afterEach(() => resetAuthFailureStoreForTests());

  it("IP 당 시간당 상한", () => {
    const t = 1_000_000;
    for (let i = 0; i < AUTH_FAILURE_WRITES_PER_CLIENT_HOUR; i += 1) {
      expect(admitAuthFailureWrite("1.2.3.4", t + i * 61_000)).toBe(true);
    }
    expect(admitAuthFailureWrite("1.2.3.4", t + 30 * 61_000)).toBe(false);
    expect(admitAuthFailureWrite("1.2.3.4", t + 3_600_000 + 1)).toBe(true);
  });

  it("인스턴스 분당 상한", () => {
    const t = 5_000_000;
    for (let i = 0; i < AUTH_FAILURE_WRITES_PER_MINUTE; i += 1) {
      expect(admitAuthFailureWrite(`ip-${i}`, t)).toBe(true);
    }
    expect(admitAuthFailureWrite("ip-x", t)).toBe(false);
    expect(admitAuthFailureWrite("ip-x", t + 60_000)).toBe(true);
  });
});
