import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  finalizeCommunityMessengerCallTerminalExit,
  navigateBackFromCommunityMessengerCall,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { CALL_ENGINE_STORE_KEYS } from "@/lib/community-messenger/call-engine/call-engine-store";

const RETURN_PATH_KEY = CALL_ENGINE_STORE_KEYS.returnPath;

function stubBrowserStorage(): Map<string, string> {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { pathname: "/community-messenger/calls/session-1", search: "" },
    dispatchEvent: vi.fn(),
  });
  vi.stubGlobal("sessionStorage", {
    setItem: (k: string, v: string) => storage.set(k, v),
    getItem: (k: string) => storage.get(k) ?? null,
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  });
  return storage;
}

describe("incoming-call terminal navigation", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = stubBrowserStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("navigateBackFromCommunityMessengerCall replaces to stored returnPath", () => {
    storage.set(RETURN_PATH_KEY, "/community-messenger/rooms/room-a");
    const router = { replace: vi.fn() };
    navigateBackFromCommunityMessengerCall(router, "room-fallback");
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/room-a");
    expect(storage.has(RETURN_PATH_KEY)).toBe(false);
  });

  it("navigateBackFromCommunityMessengerCall falls back to room when returnPath absent", () => {
    const router = { replace: vi.fn() };
    navigateBackFromCommunityMessengerCall(router, "room-b");
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/room-b");
  });

  it("navigateBackFromCommunityMessengerCall falls back to chats when returnPath and room absent", () => {
    const router = { replace: vi.fn() };
    navigateBackFromCommunityMessengerCall(router, null);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger?section=chats");
  });

  it("navigateBackFromCommunityMessengerCall preserves call_logs origin via returnPath", () => {
    storage.set(RETURN_PATH_KEY, "/community-messenger?section=call_logs");
    const router = { replace: vi.fn() };
    navigateBackFromCommunityMessengerCall(router, "room-c");
    expect(router.replace).toHaveBeenCalledWith("/community-messenger?section=call_logs");
  });

  it("navigateBackFromCommunityMessengerCall rejects malicious returnPath and uses room fallback", () => {
    storage.set(RETURN_PATH_KEY, "//evil.example/phish");
    const router = { replace: vi.fn() };
    navigateBackFromCommunityMessengerCall(router, "room-d");
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/room-d");
  });

  it("navigateBackFromCommunityMessengerCall rejects call route returnPath and uses chats fallback", () => {
    storage.set(RETURN_PATH_KEY, "/community-messenger/calls/tmp_abc");
    const router = { replace: vi.fn() };
    navigateBackFromCommunityMessengerCall(router, null);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger?section=chats");
  });

  it("finalizeCommunityMessengerCallTerminalExit navigates via origin return after cleanup", () => {
    storage.set(RETURN_PATH_KEY, "/community-messenger/rooms/room-terminal");
    const router = { replace: vi.fn() };
    finalizeCommunityMessengerCallTerminalExit(router, "session-1", "test", "room-fallback");
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/room-terminal");
  });

  it("finalizeCommunityMessengerCallTerminalExit uses roomIdFallback when returnPath absent", () => {
    const router = { replace: vi.fn() };
    finalizeCommunityMessengerCallTerminalExit(router, "session-2", "test", "room-e");
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/room-e");
  });
});
