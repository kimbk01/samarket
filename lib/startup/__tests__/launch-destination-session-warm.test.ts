// @vitest-environment jsdom
/** 재감사 2026-11-26 §9 B2 — 로그인 필요 시작 목적지면 세션 확인을 목적지 결정 순간 1회 시작. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAuthSessionNoStore = vi.fn(() => Promise.resolve(new Response("{}")));
vi.mock("@/lib/auth/fetch-auth-session-client", () => ({ fetchAuthSessionNoStore }));

beforeEach(async () => {
  fetchAuthSessionNoStore.mockClear();
  const m = await import("@/lib/startup/launch-destination-session-warm");
  m.__resetLaunchDestinationSessionWarmForTests();
});

describe("warmSessionForLaunchDestination", () => {
  it("채팅방 목적지 = 공용 세션 조회 1회 · 같은 문서에서 다시 불러도 1회", async () => {
    const { warmSessionForLaunchDestination } = await import("@/lib/startup/launch-destination-session-warm");
    expect(warmSessionForLaunchDestination("/community-messenger/rooms/abc?x=1", "lifecycle_restore")).toBe(true);
    expect(warmSessionForLaunchDestination("/community-messenger/rooms/abc", "lifecycle_restore")).toBe(false);
    expect(fetchAuthSessionNoStore).toHaveBeenCalledTimes(1);
    expect(fetchAuthSessionNoStore).toHaveBeenCalledWith("launch_destination_warm:lifecycle_restore");
  });

  it("공개 화면·목적지 없음 = 무동작", async () => {
    const { warmSessionForLaunchDestination } = await import("@/lib/startup/launch-destination-session-warm");
    expect(warmSessionForLaunchDestination("/philife", "lifecycle_restore")).toBe(false);
    expect(warmSessionForLaunchDestination(null, "launch_push")).toBe(false);
    expect(fetchAuthSessionNoStore).not.toHaveBeenCalled();
  });
});
