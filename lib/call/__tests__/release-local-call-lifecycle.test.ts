import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/call/active-call-session", () => ({
  getActiveCallSessionCallId: vi.fn(() => null),
  hardClearActiveCallSession: vi.fn(async () => {}),
  readActiveCallSessionSnapshot: vi.fn(() => null),
}));

vi.mock("@/lib/call/call-action-lock", () => ({
  releaseCallActionLock: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-engine/call-engine-locks", () => ({
  clearCallEngineLocks: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-orchestrator", () => ({
  logDibayCall: vi.fn(),
}));

import {
  getActiveCallSessionCallId,
  hardClearActiveCallSession,
} from "@/lib/call/active-call-session";
import { releaseCallActionLock } from "@/lib/call/call-action-lock";
import { clearCallEngineLocks } from "@/lib/community-messenger/call-engine/call-engine-locks";
import { releaseLocalCallLifecycleForTerminal } from "@/lib/call/release-local-call-lifecycle";

describe("releaseLocalCallLifecycleForTerminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("releases lock, engine locks, and active session for callId", async () => {
    await releaseLocalCallLifecycleForTerminal("call-1", "caller_end");
    expect(releaseCallActionLock).toHaveBeenCalledWith("caller_end");
    expect(clearCallEngineLocks).toHaveBeenCalledWith("call-1");
    expect(hardClearActiveCallSession).toHaveBeenCalledWith("call-1", "caller_end");
  });

  it("falls back to active call id when callId omitted", async () => {
    vi.mocked(getActiveCallSessionCallId).mockReturnValue("call-active");
    await releaseLocalCallLifecycleForTerminal(null, "terminal");
    expect(clearCallEngineLocks).toHaveBeenCalledWith("call-active");
    expect(hardClearActiveCallSession).toHaveBeenCalledWith("call-active", "terminal");
  });
});
