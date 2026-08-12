/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  armNotificationDestinationEnterSession,
  consumeNotificationDestinationEnterSession,
  NOTIF_DEST_ENTER_UP_CLASS,
  applyNotificationDestinationEnterOnSurface,
} from "@/lib/notifications/notification-destination-enter-session";

describe("notification destination enter session", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("arms before push and consumes only on matching destination path", () => {
    armNotificationDestinationEnterSession("/notifications");
    expect(consumeNotificationDestinationEnterSession("/market")).toBeNull();
    armNotificationDestinationEnterSession("/notifications");
    const session = consumeNotificationDestinationEnterSession("/notifications");
    expect(session?.toPath).toBe("/notifications");
    expect(consumeNotificationDestinationEnterSession("/notifications")).toBeNull();
  });

  it("matches nested customer-center detail paths", () => {
    armNotificationDestinationEnterSession("/mypage/customer-center/notice/abc");
    const session = consumeNotificationDestinationEnterSession(
      "/mypage/customer-center/notice/abc"
    );
    expect(session?.toPath).toBe("/mypage/customer-center/notice/abc");
  });

  it("applies bottom-up class on push surface", () => {
    const el = document.createElement("div");
    applyNotificationDestinationEnterOnSurface(el);
    expect(el.classList.contains(NOTIF_DEST_ENTER_UP_CLASS)).toBe(true);
  });
});
