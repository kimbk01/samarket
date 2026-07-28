import { describe, expect, it } from "vitest";
import { createChatThreadScrollEngine } from "@/lib/chat-thread-scroll/engine";
import { resolveMessengerRoomEntryScrollPlan } from "@/lib/community-messenger/room/messenger-room-entry-intent";
import { resolveMessengerRoomEntryScrollPaintReady } from "@/lib/community-messenger/room/messenger-room-entry-scroll-ready";

/**
 * Proves the legacy paint-then-correct failure mode and the new single-initial contract.
 */
describe("chat room initial anchor contract (legacy-class)", () => {
  it("composer height must not block paint-ready (no paint-then-correct gate)", () => {
    const vp = {
      clientHeight: 400,
      querySelectorAll: () => [{}, {}],
    } as unknown as HTMLElement;
    expect(
      resolveMessengerRoomEntryScrollPaintReady({
        viewport: vp,
        messageCount: 2,
        composerHeightSynced: true,
      })
    ).toBe(true);
    expect(
      resolveMessengerRoomEntryScrollPaintReady({
        viewport: vp,
        messageCount: 2,
        composerHeightSynced: false,
      })
    ).toBe(true);
  });

  it("entry plan: always latest bottom (unread/persist ignored)", () => {
    expect(
      resolveMessengerRoomEntryScrollPlan({
        intent: "default",
        hasPersisted: false,
        unreadCount: 3,
        lastReadMessageId: "m-read",
      })
    ).toEqual({
      reason: "initial_load",
      clearPersist: true,
      forceBottom: true,
      anchorMessageId: null,
    });
    expect(
      resolveMessengerRoomEntryScrollPlan({ intent: "push", hasPersisted: true }).forceBottom
    ).toBe(true);
    expect(
      resolveMessengerRoomEntryScrollPlan({
        intent: "default",
        hasPersisted: true,
        unreadCount: 0,
      }).reason
    ).toBe("initial_load");
  });

  it("engine: initial bottom once — layout resize after settle does not re-enter", () => {
    let scrollTop = 0;
    const vp = {
      clientHeight: 400,
      get scrollHeight() {
        return 1200;
      },
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(v: number) {
        scrollTop = v;
      },
      querySelectorAll: () => [{}, {}, {}],
    } as unknown as HTMLElement;
    const ctx = { viewport: vp, messageCount: 3, virtualizer: null };
    const engine = createChatThreadScrollEngine();

    engine.notifyEntry({ forceBottom: true });
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    expect(engine.tryCompleteEntry(ctx)).toBe(true);
    expect(engine.getPhase()).toBe("settled");
    expect(scrollTop).toBe(1200);

    /** second "entry" attempt must be no-op once settled */
    expect(engine.tryCompleteEntry(ctx)).toBe(false);

    scrollTop = 900;
    engine.syncStickFromViewport(ctx);
    engine.notifyLayoutResize(ctx);
    expect(engine.getPhase()).toBe("settled");
  });

  it("phase1 must not import legacy ScrollAnchorController", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/community-messenger/room/use-messenger-room-client-phase1.ts"),
      "utf8"
    );
    expect(src).toContain("useChatThreadScroll");
    expect(src).not.toContain("useMessengerRoomScrollAnchorController");
    expect(src).not.toContain("useMessengerRoomReaderScrollBottom");
  });
});
