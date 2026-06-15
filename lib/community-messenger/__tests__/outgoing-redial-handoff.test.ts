import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const suspendPrimedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/community-messenger/call-permission", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/call-permission")>();
  return {
    ...actual,
    suspendPrimedCommunityMessengerDeviceStreamIdleRelease: suspendPrimedMock,
  };
});

describe("outgoing-redial-handoff", () => {
  beforeEach(() => {
    sessionStorage.clear();
    suspendPrimedMock.mockClear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("tracks handoff in sessionStorage and suspends idle release", async () => {
    const { beginOutgoingRedialHandoff, isOutgoingRedialHandoffActive, endOutgoingRedialHandoff } =
      await import("@/lib/community-messenger/outgoing-redial-handoff");
    expect(isOutgoingRedialHandoffActive()).toBe(false);
    beginOutgoingRedialHandoff();
    expect(isOutgoingRedialHandoffActive()).toBe(true);
    expect(suspendPrimedMock).toHaveBeenCalled();
    endOutgoingRedialHandoff();
    expect(isOutgoingRedialHandoffActive()).toBe(false);
  });
});
